import type { ADR, Exception } from '../repo/schemas.js';
import type { ExtractedPatterns } from './patternExtractor.js';
import { allMatches } from './patternExtractor.js';

export enum Verdict {
  PASS = 'PASS',
  VIOLATION = 'VIOLATION',
  EXEMPTED = 'EXEMPTED',
  AMBIGUOUS = 'AMBIGUOUS',
}

type Constraint = ADR['constraints'][number];

export interface RoutedResult {
  verdict: Verdict;
  adr: ADR;
  constraint: Constraint;
  matchedSignal: string;
  lineNumber: number;
  lineText: string;
  reason: string;
  exception?: Exception;
}

/** Minimal glob support: '**' -> any path depth, '*' -> any single segment. */
function globMatch(pattern: string, filePath: string): boolean {
  const normPath = filePath.replace(/\\/g, '/').replace(/^\.\//, '');
  const normPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');

  const escaped = normPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*');
    
  return new RegExp(`^${escaped}$`).test(normPath);
}

/** Checks if an ADR's scope applies to the current file path */
function isPathInScope(filePath: string, adr: ADR): boolean {
  const scopePaths = (adr as any).scope?.paths ?? (adr as any).paths;
  if (!scopePaths || scopePaths.length === 0) return true;
  return scopePaths.some((p: string) => globMatch(p, filePath));
}

/** Word-boundary aware pattern matching to avoid false substring hits */
function matchesPattern(signal: string, pattern: string): boolean {
  if (!pattern) return false;
  if (pattern === '*') return true;
  
  const cleanSignal = signal.toLowerCase();
  const cleanPattern = pattern.toLowerCase();

  // Direct substring match for dot-notated method calls (e.g., "console.log")
  if (cleanPattern.includes('.') && cleanSignal.includes(cleanPattern)) {
    return true;
  }

  // Exact token/word-boundary check for raw identifiers (e.g., "var", "eval")
  const regex = new RegExp(`\\b${cleanPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
  return regex.test(signal);
}

function matchesAny(signal: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(signal, p));
}

/** Flexibly matches signal tokens against ADR subjects (e.g., "console" -> "logging") */
function matchesSubject(subject: string, signal: string): boolean {
  if (!subject) return false;
  if (subject === '*') return true;
  
  const sub = subject.toLowerCase();
  const sig = signal.toLowerCase();

  const subjectKeywords = sub.split(/[-_\s]+/);
  const signalParts = sig.split(/(?=[A-Z])|[.\s_-]+/).filter(Boolean);

  return signalParts.some((part) => 
    subjectKeywords.some((kw) => kw.includes(part) || part.includes(kw))
  );
}

function findException(filePath: string, decisionId: string, exceptions: Exception[]): Exception | undefined {
  return exceptions.find(
    (exc) => exc.decision_id === decisionId && exc.scope.paths.some((p) => globMatch(p, filePath))
  );
}

export function route(
  filePath: string,
  patterns: ExtractedPatterns,
  adrs: ADR[],
  exceptions: Exception[] = []
): RoutedResult[] {
  const results: RoutedResult[] = [];

  for (const match of allMatches(patterns)) {
    const { signal } = match;

    for (const adr of adrs) {
      if (!isPathInScope(filePath, adr)) continue;

      for (const constraint of adr.constraints) {
        const constraintAny = constraint as any;
        const prohibited = [
          ...(constraint.prohibited_for ?? []),
          ...(constraintAny.pattern ? [constraintAny.pattern] : []),
        ];
        const allowed = [
          ...(constraint.allowed_for ?? []),
          ...(constraint.must_use ? [constraint.must_use] : []),
        ];

        if (matchesAny(signal, prohibited)) {
          const exception = findException(filePath, adr.id, exceptions);
          if (exception) {
            results.push({
              verdict: Verdict.EXEMPTED,
              adr,
              constraint,
              matchedSignal: signal,
              lineNumber: match.lineNumber,
              lineText: match.lineText,
              exception,
              reason: `'${signal}' matches prohibited rule in ${adr.id}, but is covered by exception ${exception.id}: ${exception.reason}`,
            });
          } else {
            results.push({
              verdict: Verdict.VIOLATION,
              adr,
              constraint,
              matchedSignal: signal,
              lineNumber: match.lineNumber,
              lineText: match.lineText,
              reason: `'${signal}' violates ${adr.id}: "${adr.decision.statement}" (prohibited under '${constraint.subject}').`,
            });
          }
        } else if (matchesAny(signal, allowed)) {
          results.push({
            verdict: Verdict.PASS,
            adr,
            constraint,
            matchedSignal: signal,
            lineNumber: match.lineNumber,
            lineText: match.lineText,
            reason: `'${signal}' complies with ${adr.id} ('${constraint.subject}').`,
          });
        } else if (match.kind === 'call' && matchesSubject(constraint.subject, signal)) {
          const exception = findException(filePath, adr.id, exceptions);
          if (exception) {
            results.push({
              verdict: Verdict.EXEMPTED,
              adr,
              constraint,
              matchedSignal: signal,
              lineNumber: match.lineNumber,
              lineText: match.lineText,
              exception,
              reason: `'${signal}' relates to '${constraint.subject}' under ${adr.id}, but is covered by approved exception ${exception.id}: ${exception.reason}`,
            });
          } else {
            results.push({
              verdict: Verdict.AMBIGUOUS,
              adr,
              constraint,
              matchedSignal: signal,
              lineNumber: match.lineNumber,
              lineText: match.lineText,
              reason: `'${signal}' relates to '${constraint.subject}' under ${adr.id} but isn't explicitly allowed or prohibited.`,
            });
          }
        }
      }
    }
  }

  return results;
}