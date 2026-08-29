/**
 * Verdict Logic Router
 * ---------------------
 * Matches extracted code patterns against each ADR's constraints.
 *
 *   PASS       -> signal matches must_use or an allowed_for pattern
 *   VIOLATION  -> signal matches a prohibited_for or pattern constraint, no exception covers it
 *   EXEMPTED   -> signal matches a prohibited pattern, but an active exception covers this path
 *   AMBIGUOUS  -> signal touches the constraint's subject but isn't explicitly allowed/prohibited
 */

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

function matchesAny(signal: string, patterns: string[]): boolean {
  const s = signal.toLowerCase();
  return patterns.some((p) => !!p && s.includes(p.toLowerCase()));
}

/**
 * Whole-keyword match: checks if constraint subject covers the given signal.
 * Supports '*' as a universal wildcard.
 */
function matchesSubject(subject: string, signal: string): boolean {
  if (!subject) return false;
  if (subject === '*') return true;
  const subjectKeywords = new Set(subject.toLowerCase().split(/[-_\s]+/));
  const signalParts = signal.split(/(?=[A-Z])|[.\s_-]+/).map((part) => part.toLowerCase());
  return signalParts.some((part) => subjectKeywords.has(part));
}

/** Minimal glob support: '**' -> any path depth, '*' -> any single segment. */
function globMatch(pattern: string, filePath: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^/]*')
    .replace(/§DOUBLESTAR§/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
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
              reason: `'${signal}' would violate ${adr.id}, but is covered by approved exception ${exception.id}: ${exception.reason}`,
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

  return results;
}