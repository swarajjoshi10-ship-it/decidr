/**
 * Explainability Interface
 * --------------------------
 * `decidr explain <file>` — for a given file, shows every violation as a
 * readable trace: the exact offending line, the ADR rule that was broken,
 * the full architectural rationale behind that rule, and a concrete fix.
 */

import { DecidrRepo } from '../repo/index.js';
import type { ADR } from '../repo/schemas.js';
import { getWorkingDiff, getDiff, FileDiff } from './diffReader.js';
import { extractPatterns } from './patternExtractor.js';
import { route, Verdict } from './verdictRouter.js';

type Constraint = ADR['constraints'][number];

function remediationTip(constraint: Constraint): string {
  if (constraint.must_use) return `Use \`${constraint.must_use}\` instead.`;
  if (constraint.allowed_for && constraint.allowed_for.length > 0) {
    return `Use one of the approved patterns instead: ${constraint.allowed_for.join(', ')}.`;
  }
  return `Review this against the ADR's constraints and adjust accordingly.`;
}

function findFileDiff(fileDiffs: FileDiff[], targetPath: string): FileDiff | undefined {
  return fileDiffs.find(
    (fd) => fd.path === targetPath || fd.path.endsWith('/' + targetPath) || fd.path.endsWith(targetPath)
  );
}

export async function explainFile(targetPath: string, working: boolean, base: string, head: string): Promise<number> {
  const repo = new DecidrRepo();
  const adrs = await repo.getActiveDecisions();
  const exceptions = await repo.getActiveExceptions();

  const fileDiffs = working ? getWorkingDiff() : getDiff(base, head);
  const targetDiff = findFileDiff(fileDiffs, targetPath);

  if (!targetDiff) {
    console.log(`No changes found for '${targetPath}' in the current diff.`);
    return 0;
  }

  const patterns = extractPatterns(targetDiff.addedLines);
  const results = route(targetDiff.path, patterns, adrs, exceptions).filter((r) => r.verdict === Verdict.VIOLATION);

  if (results.length === 0) {
    console.log(`No violations found in ${targetDiff.path}.`);
    return 0;
  }

  for (const result of results) {
    console.log('='.repeat(64));
    console.log(`File:      ${targetDiff.path}:${result.lineNumber}`);
    console.log(`Line:      ${result.lineText}`);
    console.log(`Rule:      ${result.adr.id} — "${result.adr.decision.statement}"`);
    console.log('Rationale:');
    for (const point of result.adr.decision.rationale) {
      console.log(`  - ${point}`);
    }
    console.log(`Fix:       ${remediationTip(result.constraint)}`);
  }
  console.log('='.repeat(64));

  return 1;
}
