/**
 * Pattern Extractor (MVP)
 * ------------------------
 * Regex-based detection of imports and function/method calls in added
 * lines. Handles JS/TS-style imports (import ... from 'x', require('x'))
 * since the real codebase is TypeScript, not Python.
 *
 * Upgrade path (only if time remains): swap this for a real TS AST parser
 * (e.g. the TypeScript compiler API) instead of regex matching.
 */

import { AddedLine } from './diffReader.js';

export type MatchKind = 'import' | 'call';

export interface Match {
  signal: string;
  lineNumber: number;
  lineText: string;
  kind: MatchKind;
}

export interface ExtractedPatterns {
  imports: Match[];
  calls: Match[];
}

const IMPORT_FROM_RE = /from\s+['"]([^'"]+)['"]/;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/;
const CALL_RE = /\b([\w.]+)\s*\(/g;

export function extractPatterns(lines: AddedLine[]): ExtractedPatterns {
  const imports: Match[] = [];
  const calls: Match[] = [];

  for (const { lineNumber, text } of lines) {
    const trimmed = text.trim();

    const fromMatch = IMPORT_FROM_RE.exec(text);
    const requireMatch = REQUIRE_RE.exec(text);
    const importSignal = fromMatch?.[1] ?? requireMatch?.[1];
    if (importSignal) {
      imports.push({ signal: importSignal, lineNumber, lineText: trimmed, kind: 'import' });
    }

    // Reset regex state per line since CALL_RE has the global flag
    const callRe = new RegExp(CALL_RE.source, 'g');
    let callMatch: RegExpExecArray | null;
    while ((callMatch = callRe.exec(text)) !== null) {
      calls.push({ signal: callMatch[1], lineNumber, lineText: trimmed, kind: 'call' });
    }
  }

  return { imports, calls };
}

export function allMatches(patterns: ExtractedPatterns): Match[] {
  return [...patterns.imports, ...patterns.calls];
}
