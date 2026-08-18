import { join } from 'node:path';
import { pathPatch, rangePatch } from './git';
import { glossPathFor } from './glossFile';
import { mirrorSectionRange, readTextFile } from './staleness';

const NO_HISTORY = 'no history\n';

const orNoHistory = (patch: string): string => (patch.trim() === '' ? NO_HISTORY : patch);

export const sectionHistory = (
  repoRoot: string,
  sourceRelPath: string,
  symbol?: string,
): string => {
  const mirrorRelPath = glossPathFor(sourceRelPath);
  if (symbol === undefined) return orNoHistory(pathPatch(repoRoot, mirrorRelPath));

  const markdown = readTextFile(join(repoRoot, mirrorRelPath));
  if (markdown === undefined) return NO_HISTORY;

  const range = mirrorSectionRange(markdown, symbol);
  if (!range) return NO_HISTORY;

  return orNoHistory(rangePatch(repoRoot, mirrorRelPath, range.start, range.end));
};
