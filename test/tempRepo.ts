import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export type RepoFiles = Record<string, string>;

export const git = (repoRoot: string, args: string[], isoDate?: string): string =>
  execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env:
      isoDate === undefined
        ? process.env
        : { ...process.env, GIT_AUTHOR_DATE: isoDate, GIT_COMMITTER_DATE: isoDate },
  });

export const createRepo = (): string => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'gloss-git-'));
  git(repoRoot, ['init', '-q', '-b', 'main']);
  git(repoRoot, ['config', 'user.name', 'Gloss Test']);
  git(repoRoot, ['config', 'user.email', 'gloss@example.test']);
  git(repoRoot, ['config', 'commit.gpgsign', 'false']);
  git(repoRoot, ['config', 'tag.gpgsign', 'false']);
  git(repoRoot, ['config', 'diff.renames', 'true']);
  return repoRoot;
};

export const destroyRepo = (repoRoot: string): void => {
  rmSync(repoRoot, { recursive: true, force: true });
};

export const writeFiles = (repoRoot: string, files: RepoFiles): void => {
  for (const [relPath, content] of Object.entries(files)) {
    const absolutePath = join(repoRoot, relPath);
    mkdirSync(dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, content, 'utf8');
  }
};

export const commitAll = (repoRoot: string, message: string, isoDate: string): void => {
  git(repoRoot, ['add', '-A']);
  git(repoRoot, ['commit', '-q', '-m', message], isoDate);
};

export const commitFiles = (
  repoRoot: string,
  files: RepoFiles,
  message: string,
  isoDate: string,
): void => {
  writeFiles(repoRoot, files);
  commitAll(repoRoot, message, isoDate);
};

export const movePath = (repoRoot: string, from: string, to: string): void => {
  mkdirSync(dirname(join(repoRoot, to)), { recursive: true });
  git(repoRoot, ['mv', from, to]);
};

export const shallowCloneOf = (repoRoot: string): string => {
  const target = mkdtempSync(join(tmpdir(), 'gloss-shallow-'));
  const clone = join(target, 'clone');
  git(target, ['clone', '-q', '--depth', '1', `file://${repoRoot}`, clone]);
  return clone;
};
