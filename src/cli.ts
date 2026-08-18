import { existsSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkRepo, normalizeRelPath } from './check';
import { fixRepo } from './fix';
import { runGit } from './git';
import { glossPathFor } from './glossFile';
import { harvestPaths } from './harvest';
import { sectionHistory } from './history';
import { lintPaths } from './lint';
import { renderGloss } from './read';
import { setup } from './setup';
import type { CheckViolation, LintViolation } from './types';
import { type WatchHandle, watchGloss } from './watch';

export const USAGE_EXIT_CODE = 64;

const GIT_DIR = '.git';
const GLOSS_IGNORE_FILE = '.gloss/.gitignore';
const CLEAN = 'clean';
const NOTHING_TO_FIX = 'nothing to fix';
const NOTHING_TO_HARVEST = 'nothing to harvest';
const FIX_HINT = 'run: gloss fix';
const STAGE_FAILED = 'could not stage the harvested files; stage them before committing';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const STAGED_FILES_ARGS = ['diff', '--cached', '--name-only', '--diff-filter=ACMR'];

const USAGE = [
  'usage: gloss <command> [paths]',
  '',
  '  lint [paths]                       flag comments that are not // why:, a dagger or a directive',
  '  check [paths]                      audit daggers against gloss sections in both directions',
  '  fix [paths]                        repair renamed symbols, moved mirrors and header paths',
  '  harvest [paths] [--staged]         sweep harvestable comments into the gloss, plant daggers',
  '  read <file> [symbol]               print the gloss with its derived staleness headers',
  '  history <file> [symbol]            print the changelog of a gloss file or one section',
  '  watch [paths] [--debounce <ms>]    harvest on save, debounced',
  '  setup                              create .gloss/ and install the CLAUDE.md block',
];

export type Logger = (line: string) => void;

export type CommandOutcome = {
  code: number;
  watcher?: WatchHandle;
};

const writeLine: Logger = (line) => {
  process.stdout.write(`${line}\n`);
};

export const findRepoRoot = (cwd: string): string => {
  const start = resolve(cwd);

  const walkUp = (directory: string): string | undefined => {
    if (existsSync(join(directory, GIT_DIR))) return directory;
    const parent = dirname(directory);
    return parent === directory ? undefined : walkUp(parent);
  };

  return walkUp(start) ?? start;
};

const repoRelative = (repoRoot: string, path: string): string =>
  normalizeRelPath(relative(repoRoot, isAbsolute(path) ? path : join(repoRoot, path)));

const scopeOf = (paths: string[]): string[] | undefined => (paths.length > 0 ? paths : undefined);

const lintLine = (violation: LintViolation): string =>
  `${violation.sourcePath}:${violation.line} ${violation.kind} ${violation.message}`;

const checkLine = (violation: CheckViolation): string => {
  const at = violation.line === undefined ? '' : `:${violation.line}`;
  return `${violation.sourcePath}${at} ${violation.kind} ${violation.message}`;
};

export const runLint = (repoRoot: string, paths: string[], log: Logger = writeLine): number => {
  const violations = lintPaths(repoRoot, scopeOf(paths));
  if (violations.length === 0) {
    log(CLEAN);
    return 0;
  }

  for (const violation of violations) log(lintLine(violation));
  return 1;
};

export const runCheck = (repoRoot: string, paths: string[], log: Logger = writeLine): number => {
  const violations = checkRepo(repoRoot, scopeOf(paths));
  if (violations.length === 0) {
    log(CLEAN);
    return 0;
  }

  for (const violation of violations) log(checkLine(violation));
  log(FIX_HINT);
  return 1;
};

export const runFix = (repoRoot: string, paths: string[], log: Logger = writeLine): number => {
  const actions = fixRepo(repoRoot, scopeOf(paths));
  if (actions.length === 0) {
    log(NOTHING_TO_FIX);
    return 0;
  }

  for (const action of actions) log(action.detail);
  return 0;
};

const stagedSourceFiles = (repoRoot: string): string[] =>
  runGit(repoRoot, STAGED_FILES_ARGS)
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '' && SOURCE_EXTENSIONS.has(extname(line)));

const stageHarvested = (repoRoot: string, files: string[], log: Logger): number => {
  const touched = [...new Set([...files, ...files.map(glossPathFor), GLOSS_IGNORE_FILE])].filter(
    (relPath) => existsSync(join(repoRoot, relPath)),
  );
  if (touched.length === 0 || runGit(repoRoot, ['add', '--', ...touched]).ok) return 0;

  log(STAGE_FAILED);
  return 1;
};

export const runHarvest = (
  repoRoot: string,
  paths: string[],
  staged: boolean,
  log: Logger = writeLine,
): number => {
  const targets = staged ? stagedSourceFiles(repoRoot) : paths;
  if (staged && targets.length === 0) {
    log(NOTHING_TO_HARVEST);
    return 0;
  }

  const harvested = harvestPaths(repoRoot, scopeOf(targets));
  if (harvested.length === 0) {
    log(NOTHING_TO_HARVEST);
    return 0;
  }

  for (const entry of harvested) log(`${entry.file}: ${entry.moved} moved`);
  if (!staged) return 0;

  return stageHarvested(
    repoRoot,
    harvested.map((entry) => entry.file),
    log,
  );
};

export const runRead = (
  repoRoot: string,
  file: string,
  symbol: string | undefined,
  log: Logger = writeLine,
): number => {
  log(renderGloss(repoRoot, repoRelative(repoRoot, file), symbol).trimEnd());
  return 0;
};

export const runHistory = (
  repoRoot: string,
  file: string,
  symbol: string | undefined,
  log: Logger = writeLine,
): number => {
  log(sectionHistory(repoRoot, repoRelative(repoRoot, file), symbol).trimEnd());
  return 0;
};

export const runWatch = (
  repoRoot: string,
  paths: string[],
  debounceMs: number | undefined,
  log: Logger = writeLine,
): WatchHandle =>
  watchGloss(repoRoot, {
    paths: scopeOf(paths),
    debounceMs,
    onHarvest: (file, moved) => log(`${file}: ${moved} moved`),
  });

const logGroup = (log: Logger, title: string, entries: string[]): void => {
  if (entries.length === 0) return;
  log(`${title}:`);
  for (const entry of entries) log(`  ${entry}`);
};

export const runSetup = (repoRoot: string, log: Logger = writeLine): number => {
  const report = setup(repoRoot);
  logGroup(log, 'created', report.created);
  logGroup(log, 'updated', report.updated);
  logGroup(log, 'skipped', report.skipped);
  logGroup(log, 'suggestions', report.suggestions);
  return 0;
};

export const runUsage = (log: Logger = writeLine): number => {
  for (const line of USAGE) log(line);
  return USAGE_EXIT_CODE;
};

type CommandLine = {
  command?: string;
  positionals: string[];
  staged: boolean;
  debounceMs?: number;
};

const parseCommandLine = (argv: string[]): CommandLine | undefined => {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        staged: { type: 'boolean', default: false },
        debounce: { type: 'string' },
      },
      allowPositionals: true,
    });
    const debounceMs = values.debounce === undefined ? undefined : Number(values.debounce);
    if (debounceMs !== undefined && !Number.isFinite(debounceMs)) return undefined;

    return {
      command: positionals[0],
      positionals: positionals.slice(1),
      staged: values.staged === true,
      debounceMs,
    };
  } catch {
    return undefined;
  }
};

export const runCommand = (
  argv: string[],
  cwd: string,
  log: Logger = writeLine,
): CommandOutcome => {
  const line = parseCommandLine(argv);
  if (!line) return { code: runUsage(log) };

  const repoRoot = findRepoRoot(cwd);
  const paths = line.positionals.map((path) => resolve(cwd, path));
  const [file] = paths;
  const symbol = line.positionals[1];

  switch (line.command) {
    case 'lint':
      return { code: runLint(repoRoot, paths, log) };
    case 'check':
      return { code: runCheck(repoRoot, paths, log) };
    case 'fix':
      return { code: runFix(repoRoot, paths, log) };
    case 'harvest':
      return { code: runHarvest(repoRoot, paths, line.staged, log) };
    case 'read':
      if (file === undefined) return { code: runUsage(log) };
      return { code: runRead(repoRoot, file, symbol, log) };
    case 'history':
      if (file === undefined) return { code: runUsage(log) };
      return { code: runHistory(repoRoot, file, symbol, log) };
    case 'watch':
      return { code: 0, watcher: runWatch(repoRoot, paths, line.debounceMs, log) };
    case 'setup':
      return { code: runSetup(repoRoot, log) };
    default:
      return { code: runUsage(log) };
  }
};

export const main = (argv: string[] = process.argv.slice(2), cwd: string = process.cwd()): void => {
  const { code, watcher } = runCommand(argv, cwd);
  if (watcher === undefined) process.exit(code);
};

const invokedAsBin = (): boolean => {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
};

if (invokedAsBin()) main();
