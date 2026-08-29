/**
 * Diff Reader
 * -----------
 * Wraps `git diff` and returns, per changed file, the newly added lines
 * with their real line numbers in the new file. Needed by `decidr explain`
 * to point at the exact offending line.
 */

import { execSync } from 'node:child_process';

export interface AddedLine {
  lineNumber: number;
  text: string;
}

export interface FileDiff {
  path: string;
  addedLines: AddedLine[];
}

const HUNK_HEADER_RE = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

function parseUnifiedDiff(diffText: string): FileDiff[] {
  const fileDiffs: FileDiff[] = [];
  let currentPath: string | null = null;
  let currentAdded: AddedLine[] = [];
  let newLineNo: number | null = null;

  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++ b/')) {
      if (currentPath !== null) {
        fileDiffs.push({ path: currentPath, addedLines: currentAdded });
      }
      currentPath = line.slice('+++ b/'.length);
      currentAdded = [];
      newLineNo = null;
    } else if (line.startsWith('+++ /dev/null')) {
      currentPath = null;
    } else if (line.startsWith('@@')) {
      const match = HUNK_HEADER_RE.exec(line);
      if (match) newLineNo = parseInt(match[1], 10);
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      if (newLineNo !== null) {
        currentAdded.push({ lineNumber: newLineNo, text: line.slice(1) });
        newLineNo++;
      }
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // removed line — doesn't affect new-file line numbering
    } else if (newLineNo !== null && !line.startsWith('\\')) {
      newLineNo++; // unchanged context line, if any appear
    }
  }

  if (currentPath !== null) {
    fileDiffs.push({ path: currentPath, addedLines: currentAdded });
  }

  return fileDiffs;
}

export function getDiff(baseRef = 'HEAD~1', headRef = 'HEAD'): FileDiff[] {
  try {
    const output = execSync(`git diff --unified=0 ${baseRef} ${headRef}`, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
    return parseUnifiedDiff(output);
  } catch (err: any) {
    console.warn(`\n⚠️  [Diff Warning] Git diff failed for range ${baseRef}..${headRef}.`);
    console.warn(`   This often happens if you are in a fresh checkout or single-commit repository where '${baseRef}' does not exist.`);
    console.warn(`   Please run with the '--working' flag to check uncommitted changes in the working tree instead.`);
    return [];
  }
}

export function getWorkingDiff(): FileDiff[] {
  const output = execSync(`git diff --unified=0 HEAD`, { encoding: 'utf-8' });
  return parseUnifiedDiff(output);
}
