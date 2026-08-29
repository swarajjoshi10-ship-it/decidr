import Groq from 'groq-sdk';
import fs from 'node:fs/promises';
import { existsSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DecidrRepo } from './index.js';
import { ADR, Exception } from './schemas.js';

let client: Groq | null = null;

function getGroqClient(): Groq {
  if (!client) {
    client = new Groq({ timeout: 30000 });
  }
  return client;
}

const CACHE_FILE = path.join(process.cwd(), '.decidr', 'appeals-cache.json');

const systemPrompt = `You are an architectural policy appeals assistant.
You will be given a coding rule and a code snippet that may or may not follow it.

When reasoning, consider the actual purpose and intent of the code, not just surface-level keyword matches to prohibited terms. A rule written to prevent one specific pattern (e.g. "don't use X as a job queue") should not automatically block a genuinely different, well-established use case (e.g. using X for distributed locking) just because it mentions the same technology. Judge based on whether the rule's stated rationale is actually being violated, not just whether the same tool/keyword appears.

Respond with ONLY valid JSON, no markdown fences, no extra text, matching exactly this shape:

{
  "classification": "allow" or "block",
  "confidence": number between 0 and 1, as a numeric decimal (e.g. 0.85) — never spell out numbers as words,
  "reasoning": "short string explaining why",
  "proposed_exception": null OR {
    "decision_id": "string",
    "scope_paths": ["string"],
    "allowed_usage": "string",
    "reason": "string",
    "expires": "YYYY-MM-DD" or null
  }
}

If classification is "allow", proposed_exception must NOT be null. It must contain a valid exception object detailing what specific usage is being allowed and on what file/directory scope, so that a human can approve it and save it to the exception list to prevent future AI roundtrips.
If classification is "block", proposed_exception must be null.
Do not include any text outside the JSON object.`;

function buildUserPrompt(codeSnippet: string, matchedRule: { id: string; statement: string; rationale: string[] }, existingExceptions: Exception[], history: string[]): string {
  const exceptionsText = existingExceptions && existingExceptions.length > 0
    ? existingExceptions.map(e => `- allowed in ${e.scope.paths.join(", ")}: ${e.reason}`).join("\n")
    : "None";

  const historyText = history && history.length > 0
    ? history.join("\n")
    : "No prior history for this decision.";

  return `
Rule ID: ${matchedRule.id}
Rule: ${matchedRule.statement}
Rationale: ${(matchedRule.rationale || []).join(", ")}

Code snippet:
${codeSnippet}

Existing exceptions for this rule:
${exceptionsText}

History:
${historyText}

Task: Determine whether this specific usage should be classified as a violation of ${matchedRule.id}, or whether it represents a legitimate, distinct use case that the rule didn't anticipate and may warrant a scoped exception.

Important: if you propose an exception, set "decision_id" to exactly "${matchedRule.id}" — do not invent a new ID.
`;
}

function getCacheKey(ruleId: string, codeSnippet: string): string {
  const normalized = (codeSnippet || '').trim().replace(/\r?\n/g, '\n');
  return crypto.createHash('sha256').update(`${ruleId}:${normalized}`).digest('hex');
}

function readCache(): Record<string, any> {
  try {
    if (existsSync(CACHE_FILE)) {
      const data = readFileSync(CACHE_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err: any) {
    console.warn(`Warning: Failed to read cache file: ${err.message}`);
  }
  return {};
}

function writeCache(cache: Record<string, any>): void {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!existsSync(dir)) {
      // Ensure the directory exists
      const fs = require('node:fs');
      fs.mkdirSync(dir, { recursive: true });
    }
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf8');
  } catch (err: any) {
    console.warn(`Warning: Failed to write cache file: ${err.message}`);
  }
}

async function callWithRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      console.log(`Attempt ${i + 1} failed: ${err.message}`);
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  throw new Error("Retry failed");
}

async function getValidAppeal(userPrompt: string, maxAttempts = 3): Promise<any> {
  const clientInstance = getGroqClient();
  for (let i = 0; i < maxAttempts; i++) {
    const response = await callWithRetry(() =>
      clientInstance.chat.completions.create({
        model: "openai/gpt-oss-120b",
        max_tokens: 600,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      })
    );
    const raw = response.choices[0].message.content;
    if (!raw) continue;
    try {
      return JSON.parse(raw);
    } catch (err: any) {
      console.log(`Parse attempt ${i + 1} failed (${err.message}), retrying...`);
    }
  }
  throw new Error("Failed to get valid JSON after multiple attempts");
}

export function adaptRule(rule: any): { id: string; statement: string; rationale: string[] } {
  if (!rule) {
    return { id: 'UNKNOWN', statement: '', rationale: [] };
  }
  
  const id = rule.id || rule.decision_id || rule.name || 'UNKNOWN';
  
  // Handle nested decision structure if it matches ADRSchema
  const decisionObj = rule.decision || {};
  const statement = rule.statement || decisionObj.statement || rule.rule || rule.description || rule.title || rule.content || '';
  
  let rationale = rule.rationale || decisionObj.rationale || rule.context || rule.reasons || [];
  if (typeof rationale === 'string') {
    rationale = [rationale];
  } else if (!Array.isArray(rationale)) {
    rationale = [];
  }
  
  return { id, statement, rationale };
}

export interface AppealResult {
  classification: 'allow' | 'block';
  confidence: number;
  reasoning: string;
  proposed_exception: null | {
    decision_id: string;
    scope_paths: string[];
    allowed_usage: string;
    reason: string;
    expires: string | null;
  };
}

async function loadADRHistory(ruleId: string): Promise<string[]> {
  const logPath = path.join(process.cwd(), '.decidr', 'history', 'events.jsonl');
  try {
    const content = await fs.readFile(logPath, 'utf-8');
    const lines = content.trim().split('\n');
    const history: string[] = [];

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.entity_id === ruleId && event.event_type === 'APPEAL_SUBMITTED') {
          const details = event.details || {};
          const classification = details.classification || 'unknown';
          const reason = details.reasoning || '';
          const snippet = details.codeSnippet ? details.codeSnippet.replace(/\r?\n/g, ' ') : '';
          const snippetTruncated = snippet.length > 50 ? snippet.slice(0, 47) + '...' : snippet;
          
          history.push(
            `[${event.timestamp || 'Prior'}] AI Court resolved ${classification} on "${snippetTruncated}" because: ${reason}`
          );
        }
      } catch {
        // Skip malformed JSON lines
      }
    }
    return history.slice(-5);
  } catch {
    return [];
  }
}

export async function appeal(
  codeSnippet: string,
  matchedRule: any,
  existingExceptions: Exception[] = [],
  history: string[] = []
): Promise<AppealResult> {
  const adaptedRule = adaptRule(matchedRule);
  const ruleId = adaptedRule.id;
  const key = getCacheKey(ruleId, codeSnippet);
  const cache = readCache();

  let result: AppealResult;

  if (cache[key]) {
    console.log(`[Cache Hit] Returning cached appeal response for ${ruleId}`);
    result = cache[key];
  } else {
    // Dynamic history loading if empty
    let finalHistory = history;
    if (!finalHistory || finalHistory.length === 0) {
      finalHistory = await loadADRHistory(ruleId);
    }

    if (process.env.DECIDR_OFFLINE === 'true') {
      console.log(`[Offline Mode] Active. Cache miss for ${ruleId}. Returning simulated safe fallback.`);
      const isMockBlock = codeSnippet.toLowerCase().includes('violation') || codeSnippet.toLowerCase().includes('forbidden');
      result = {
        classification: isMockBlock ? 'block' : 'allow',
        confidence: 0.99,
        reasoning: `Offline simulation mode active. Snippet keywords directed fallback to ${isMockBlock ? 'block' : 'allow'}.`,
        proposed_exception: isMockBlock ? null : {
          decision_id: ruleId,
          scope_paths: ["src/**"],
          allowed_usage: "offline_mock_exception",
          reason: "Offline demonstration fallback",
          expires: null
        }
      };
      cache[key] = result;
      writeCache(cache);
    } else {
      const userPrompt = buildUserPrompt(codeSnippet, adaptedRule, existingExceptions, finalHistory);
      try {
        result = await getValidAppeal(userPrompt);
        cache[key] = result;
        writeCache(cache);
      } catch (err: any) {
        console.error(`[Ambiguity Court] Groq API call failed: ${err.message}`);
        console.log(`[Ambiguity Court] Attempting grace fallback for ${ruleId}`);
        result = {
          classification: 'block',
          confidence: 0.5,
          reasoning: `Failed to contact AI Appeals Court: ${err.message}. Blocked by default for safety.`,
          proposed_exception: null
        };
      }
    }
  }

  // Programmatic recovery fallback for allowed classification with missing proposed_exception
  if (result.classification === 'allow' && !result.proposed_exception) {
    console.warn(`[Ambiguity Court] Warning: AI returned 'allow' but proposed_exception was empty. Synthesizing exception...`);
    result.proposed_exception = {
      decision_id: ruleId,
      scope_paths: ["src/**"],
      allowed_usage: "ai_allowed_fallback",
      reason: result.reasoning || "AI approved this usage as distinct/legitimate",
      expires: null
    };
  }

  // Log the event using the repo SDK so it is staged for human review (Person 4's flow)
  try {
    const repo = new DecidrRepo();
    await repo.logEvent({
      event_type: 'APPEAL_SUBMITTED',
      entity_id: ruleId,
      actor: 'AI_Appeals_Court',
      details: {
        codeSnippet,
        classification: result.classification,
        confidence: result.confidence,
        reasoning: result.reasoning,
        proposed_exception: result.proposed_exception
      }
    });
  } catch (err: any) {
    console.warn(`[Ambiguity Court] Warning: Failed to log history event: ${err.message}`);
  }

  return result;
}
