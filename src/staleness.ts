import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type GitCommit,
  isAncestor,
  isShallowRepository,
  isTracked,
  movedRenameOnlyFrom,
  pathCommits,
  pathCommitsAcrossRenameOnly,
  rangeCommits,
} from './git';
import { glossPathFor } from './glossFile';
import { parseSource } from './resolver';
import type { Staleness } from './types';

export type LineRange = {
  start: number;
  end: number;
};

const HEADING = /^#(?!#)\s*(.*)$/;
const SECTION_HEADING = /^##(?!#)\s*(.*)$/;
const FENCE = /^\s*(?:```|~~~)/;

const NO_HISTORY: Staleness = { reliable: false, reason: 'noHistory' };
const UNTRACKED: Staleness = { reliable: false, reason: 'untracked' };
const SHALLOW_CLONE: Staleness = { reliable: false, reason: 'shallowClone' };

type BlockStart = {
  symbol?: string;
  line: number;
};

export const readTextFile = (absolutePath: string): string | undefined =>
  existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : undefined;

const blockStartsOf = (lines: string[]): BlockStart[] => {
  const starts: BlockStart[] = [];
  let inFence = false;

  lines.forEach((text, index) => {
    if (FENCE.test(text)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const section = SECTION_HEADING.exec(text);
    if (section) {
      starts.push({ symbol: section[1].trim(), line: index + 1 });
      return;
    }
    if (starts.length === 0 && HEADING.test(text)) starts.push({ line: index + 1 });
  });

  return starts;
};

const lastContentLine = (lines: string[], from: number, to: number): number => {
  for (let line = to; line > from; line -= 1) {
    if ((lines[line - 1] ?? '').trim() !== '') return line;
  }
  return from;
};

const rangesOf = (markdown: string): { preamble?: LineRange; sections: Map<string, LineRange> } => {
  const lines = markdown.split('\n');
  const starts = blockStartsOf(lines);
  const sections = new Map<string, LineRange>();
  let preamble: LineRange | undefined;

  starts.forEach((start, index) => {
    const boundary = (starts[index + 1]?.line ?? lines.length + 1) - 1;
    const range = { start: start.line, end: lastContentLine(lines, start.line, boundary) };
    if (start.symbol === undefined) preamble = range;
    else if (!sections.has(start.symbol)) sections.set(start.symbol, range);
  });

  if (preamble === undefined) {
    const boundary =
      (starts.find((start) => start.symbol !== undefined)?.line ?? lines.length + 1) - 1;
    const hasContent = lines.slice(0, boundary).some((line) => line.trim() !== '');
    if (hasContent) preamble = { start: 1, end: lastContentLine(lines, 1, boundary) };
  }

  return { preamble, sections };
};

const contentLineCount = (text: string): number => {
  const lines = text.split('\n');
  return lines[lines.length - 1] === '' ? lines.length - 1 : lines.length;
};

const clampToContent = (range: LineRange, text: string): LineRange | undefined => {
  const lineCount = contentLineCount(text);
  if (lineCount === 0) return undefined;

  const start = Math.min(range.start, lineCount);
  const end = Math.min(Math.max(range.end, start), lineCount);
  return { start, end };
};

export const mirrorSectionRange = (markdown: string, symbol: string): LineRange | undefined => {
  const range = rangesOf(markdown).sections.get(symbol);
  return range && clampToContent(range, markdown);
};

export const mirrorPreambleRange = (markdown: string): LineRange | undefined => {
  const range = rangesOf(markdown).preamble;
  return range && clampToContent(range, markdown);
};

const symbolRange = (
  sourceRelPath: string,
  sourceText: string,
  symbol: string,
): LineRange | undefined => {
  const entry = parseSource(sourceRelPath, sourceText).symbols.find(
    (candidate) => candidate.name === symbol,
  );
  if (!entry) return undefined;
  return clampToContent({ start: entry.startLine, end: entry.endLine }, sourceText);
};

const guardRepository = (
  repoRoot: string,
  sourceRelPath: string,
  mirrorRelPath: string,
): Staleness | undefined => {
  if (isShallowRepository(repoRoot)) return SHALLOW_CLONE;
  if (!isTracked(repoRoot, sourceRelPath) || !isTracked(repoRoot, mirrorRelPath)) return UNTRACKED;
  return undefined;
};

type HistorySide = {
  relPath: string;
  range?: LineRange;
  commits: GitCommit[];
};

const commitsBeforeRename = (
  repoRoot: string,
  side: HistorySide,
  launderSha: string,
  oldPath: string,
): GitCommit[] => {
  const remaining = side.commits.filter((commit) => commit.sha !== launderSha);
  if (remaining.length > 0) return remaining;

  const parent = `${launderSha}^`;
  return side.range
    ? rangeCommits(repoRoot, oldPath, side.range.start, side.range.end, parent)
    : pathCommits(repoRoot, oldPath, parent);
};

const hopPastLaundering = (
  repoRoot: string,
  mirror: HistorySide,
  source: HistorySide,
): { mirrorCommits: GitCommit[]; sourceCommits: GitCommit[] } => {
  const naive = { mirrorCommits: mirror.commits, sourceCommits: source.commits };
  const launderSha = mirror.commits[0].sha;
  if (launderSha !== source.commits[0].sha) return naive;

  const mirrorOldPath = movedRenameOnlyFrom(repoRoot, launderSha, mirror.relPath);
  const sourceOldPath = movedRenameOnlyFrom(repoRoot, launderSha, source.relPath);
  if (mirrorOldPath === undefined || sourceOldPath === undefined) return naive;

  const mirrorCommits = commitsBeforeRename(repoRoot, mirror, launderSha, mirrorOldPath);
  if (mirrorCommits.length === 0) return naive;

  return {
    mirrorCommits,
    sourceCommits: commitsBeforeRename(repoRoot, source, launderSha, sourceOldPath),
  };
};

const stalenessOf = (repoRoot: string, mirror: HistorySide, source: HistorySide): Staleness => {
  if (mirror.commits.length === 0 || source.commits.length === 0) return NO_HISTORY;

  const { mirrorCommits, sourceCommits } = hopPastLaundering(repoRoot, mirror, source);
  const written = mirrorCommits[0];
  const changes = sourceCommits.filter((commit) => !isAncestor(repoRoot, commit.sha, written.sha));

  return {
    reliable: true,
    writtenAt: written.date,
    sourceChangesSince: changes.length,
    ...(changes[0] ? { lastSourceChangeAt: changes[0].date } : {}),
  };
};

export const sectionStaleness = (
  repoRoot: string,
  sourceRelPath: string,
  symbol: string,
): Staleness => {
  const mirrorRelPath = glossPathFor(sourceRelPath);
  const guard = guardRepository(repoRoot, sourceRelPath, mirrorRelPath);
  if (guard) return guard;

  const markdown = readTextFile(join(repoRoot, mirrorRelPath));
  const sourceText = readTextFile(join(repoRoot, sourceRelPath));
  if (markdown === undefined || sourceText === undefined) return NO_HISTORY;

  const sectionRange = mirrorSectionRange(markdown, symbol);
  const sourceRange = symbolRange(sourceRelPath, sourceText, symbol);
  if (!sectionRange || !sourceRange) return NO_HISTORY;

  return stalenessOf(
    repoRoot,
    {
      relPath: mirrorRelPath,
      range: sectionRange,
      commits: rangeCommits(repoRoot, mirrorRelPath, sectionRange.start, sectionRange.end),
    },
    {
      relPath: sourceRelPath,
      range: sourceRange,
      commits: rangeCommits(repoRoot, sourceRelPath, sourceRange.start, sourceRange.end),
    },
  );
};

export const fileStaleness = (repoRoot: string, sourceRelPath: string): Staleness => {
  const mirrorRelPath = glossPathFor(sourceRelPath);
  const guard = guardRepository(repoRoot, sourceRelPath, mirrorRelPath);
  if (guard) return guard;

  const markdown = readTextFile(join(repoRoot, mirrorRelPath));
  if (markdown === undefined) return NO_HISTORY;

  const preambleRange = mirrorPreambleRange(markdown);
  if (!preambleRange) return NO_HISTORY;

  return stalenessOf(
    repoRoot,
    {
      relPath: mirrorRelPath,
      range: preambleRange,
      commits: rangeCommits(repoRoot, mirrorRelPath, preambleRange.start, preambleRange.end),
    },
    {
      relPath: sourceRelPath,
      commits: pathCommitsAcrossRenameOnly(repoRoot, sourceRelPath),
    },
  );
};
