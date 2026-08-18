import { execFileSync } from 'node:child_process';

export type GitCommit = {
  sha: string;
  date: string;
};

export type GitResult = {
  ok: boolean;
  stdout: string;
};

const COMMIT_FORMAT = '--format=%H%x09%cI';
const COMMIT_LINE = /^([0-9a-f]{7,40})\t(\S+)$/;
const RENAME_LINE = /^R(\d+)\t([^\t]+)\t([^\t]+)$/;
const PURE_RENAME_LINE = /^R100\t[^\t]+\t[^\t]+$/;
const MAX_BUFFER = 64 * 1024 * 1024;

const NEUTRAL_ARGS = ['--no-pager', '-c', 'log.showSignature=false', '-c', 'core.quotePath=false'];

export const runGit = (repoRoot: string, args: string[]): GitResult => {
  try {
    const stdout = execFileSync('git', [...NEUTRAL_ARGS, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: MAX_BUFFER,
    });
    return { ok: true, stdout };
  } catch {
    return { ok: false, stdout: '' };
  }
};

const parseCommitLines = (stdout: string): GitCommit[] =>
  stdout.split('\n').flatMap((line) => {
    const match = COMMIT_LINE.exec(line.trimEnd());
    return match ? [{ sha: match[1], date: match[2] }] : [];
  });

const statusLinesOf = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line !== '');

export const isShallowRepository = (repoRoot: string): boolean =>
  runGit(repoRoot, ['rev-parse', '--is-shallow-repository']).stdout.trim() === 'true';

export const isTracked = (repoRoot: string, relPath: string): boolean =>
  runGit(repoRoot, ['ls-files', '--error-unmatch', '--', relPath]).ok;

export const isAncestor = (repoRoot: string, candidate: string, descendant: string): boolean =>
  runGit(repoRoot, ['merge-base', '--is-ancestor', candidate, descendant]).ok;

export const rangeCommits = (
  repoRoot: string,
  relPath: string,
  start: number,
  end: number,
  until?: string,
): GitCommit[] => {
  const revisions = until === undefined ? [] : [until];
  const result = runGit(repoRoot, [
    'log',
    '-s',
    COMMIT_FORMAT,
    `-L${start},${end}:${relPath}`,
    ...revisions,
  ]);
  return result.ok ? parseCommitLines(result.stdout) : [];
};

export const rangePatch = (
  repoRoot: string,
  relPath: string,
  start: number,
  end: number,
): string => {
  const result = runGit(repoRoot, ['log', `-L${start},${end}:${relPath}`]);
  return result.ok ? result.stdout : '';
};

export const pathPatch = (repoRoot: string, relPath: string): string => {
  const result = runGit(repoRoot, ['log', '-p', '--follow', '--', relPath]);
  return result.ok ? result.stdout : '';
};

export const pathCommits = (repoRoot: string, relPath: string, until?: string): GitCommit[] => {
  const revisions = until === undefined ? [] : [until];
  const result = runGit(repoRoot, ['log', COMMIT_FORMAT, ...revisions, '--', relPath]);
  return result.ok ? parseCommitLines(result.stdout) : [];
};

export const renamedFromIn = (
  repoRoot: string,
  sha: string,
  relPath: string,
): string | undefined => {
  const result = runGit(repoRoot, ['show', '--name-status', '--format=', '-M', sha]);
  if (!result.ok) return undefined;

  for (const line of statusLinesOf(result.stdout)) {
    const match = RENAME_LINE.exec(line);
    if (match && match[3] === relPath) return match[2];
  }
  return undefined;
};

export const isRenameOnly = (
  repoRoot: string,
  sha: string,
  oldPath: string,
  newPath: string,
): boolean => {
  const result = runGit(repoRoot, [
    'show',
    '--name-status',
    '--format=',
    '-M',
    sha,
    '--',
    oldPath,
    newPath,
  ]);
  if (!result.ok) return false;

  const statuses = statusLinesOf(result.stdout);
  return statuses.length > 0 && statuses.every((line) => PURE_RENAME_LINE.test(line));
};

export const movedRenameOnlyFrom = (
  repoRoot: string,
  sha: string,
  relPath: string,
): string | undefined => {
  const oldPath = renamedFromIn(repoRoot, sha, relPath);
  if (oldPath === undefined) return undefined;
  return isRenameOnly(repoRoot, sha, oldPath, relPath) ? oldPath : undefined;
};

export const pathCommitsAcrossRenameOnly = (repoRoot: string, relPath: string): GitCommit[] => {
  const commits = pathCommits(repoRoot, relPath);
  const newest = commits[0];
  if (!newest) return commits;

  const oldPath = movedRenameOnlyFrom(repoRoot, newest.sha, relPath);
  if (oldPath === undefined) return commits;

  const earlier = pathCommits(repoRoot, oldPath, `${newest.sha}^`);
  return earlier.length === 0 ? commits : [...commits.slice(1), ...earlier];
};
