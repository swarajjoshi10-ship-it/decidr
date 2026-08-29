#!/usr/bin/env node
/**
 * CLI entry point for Person 2's commands: `decidr check` and `decidr explain`.
 * Pipeline: load ADRs + exceptions (via Person 1's DecidrRepo) -> read diff ->
 * extract patterns -> route to verdict -> report.
 */

import { DecidrRepo, appeal } from '../repo/index.js';
import { getDiff, getWorkingDiff } from './diffReader.js';
import { extractPatterns } from './patternExtractor.js';
import { route, Verdict } from './verdictRouter.js';
import { explainFile } from './explain.js';

export async function runCheck(base: string, head: string, working: boolean): Promise<number> {
  const repo = new DecidrRepo();
  const adrs = await repo.getActiveDecisions();
  const exceptions = await repo.getActiveExceptions();

  if (adrs.length === 0) {
    console.log('No active ADRs found — nothing to check against.');
    return 0;
  }

  const fileDiffs = working ? getWorkingDiff() : getDiff(base, head);

  let violations = 0;
  let exempted = 0;

  for (const fileDiff of fileDiffs) {
    const patterns = extractPatterns(fileDiff.addedLines);
    const results = route(fileDiff.path, patterns, adrs, exceptions);

    for (const result of results) {
      if (result.verdict === Verdict.PASS) continue;

      if (result.verdict === Verdict.AMBIGUOUS) {
        console.log(`❓ [AMBIGUOUS] ${fileDiff.path}:${result.lineNumber}`);
        console.log(`   ${result.reason}`);
        console.log(`   Escalating to AI Appeals Court...`);
        
        try {
          const appealResult = await appeal(result.lineText, result.adr, exceptions, []);
          
          if (appealResult.classification === 'allow') {
            console.log(`   ✅ [AI ALLOWED] Reasoning: ${appealResult.reasoning}`);
            if (appealResult.proposed_exception) {
              const pe = appealResult.proposed_exception as any;
              console.log(`   Staged proposed exception: ${pe.id || 'Pending'} (${pe.allowed_usage}) in ${pe.scope_paths.join(', ')}`);
            }
            exempted++;
          } else {
            console.log(`   ❌ [AI BLOCKED] Reasoning: ${appealResult.reasoning}`);
            violations++;
          }
        } catch (err: any) {
          console.log(`   ❌ [AI ERROR] Failed to appeal: ${err.message}. Blocked by default.`);
          violations++;
        }
      } else {
        const marker = result.verdict === Verdict.VIOLATION ? '❌' : '✅';
        console.log(`${marker} [${result.verdict}] ${fileDiff.path}:${result.lineNumber}`);
        console.log(`   ${result.reason}`);

        if (result.verdict === Verdict.VIOLATION) violations++;
        if (result.verdict === Verdict.EXEMPTED) exempted++;
      }
    }
  }

  console.log();
  console.log(
    `Checked ${fileDiffs.length} file(s): ${violations} violation(s), ${exempted} exempted case(s).`
  );

  return violations > 0 ? 1 : 0;
}

function getFlag(args: string[], name: string, fallback: string): string {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : fallback;
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(`--${name}`);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const base = getFlag(args, 'base', 'HEAD~1');
  const head = getFlag(args, 'head', 'HEAD');
  const working = hasFlag(args, 'working');

  if (command === 'check') {
    process.exit(await runCheck(base, head, working));
  } else if (command === 'explain') {
    const file = args[1];
    if (!file) {
      console.log('Usage: decidr explain <file> [--working]');
      process.exit(1);
    }
    process.exit(await explainFile(file, working, base, head));
  } else {
    console.log('Usage: decidr <check|explain> [options]');
  }
}

if (process.argv[1] && (process.argv[1].endsWith('analyzer/cli.js') || process.argv[1].endsWith('analyzer/cli.ts'))) {
  main();
}