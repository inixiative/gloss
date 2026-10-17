import { existsSync, readFileSync, readSync, realpathSync } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { checkRepo, normalizeRelPath } from './check';
import {
  type ClaudeHookEvent,
  hasClaudeHooks,
  isClaudeHookEvent,
  runClaudeHook,
} from './claudeCode';
import { loadRepoDirectives } from './config';
import { fixRepo } from './fix';
import { runGit } from './git';
import { glossPathFor } from './glossFile';
import { harvestPaths } from './harvest';
import { sectionHistory } from './history';
import { lintPaths } from './lint';
import { renderGloss } from './read';
import { claudeBlockDiff, setup } from './setup';
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
  '  lint [paths]                       flag comments that belong in the gloss',
  '  check [paths]                      audit daggers against gloss sections in both directions',
  '  fix [paths]                        repair renamed symbols, moved mirrors and header paths',
  '  harvest [paths] [--staged]         sweep harvestable comments into the gloss, plant daggers',
  '  read <file> [symbol]               print the gloss with its derived staleness headers',
  '  history <file> [symbol]            print the changelog of a gloss file or one section',
  '  watch [paths] [--debounce <ms>]    harvest on save, debounced',
  '  setup [--hooks | --no-hooks] [--update-block]',
  '                                     create .gloss/, install the CLAUDE.md block, offer the Claude Code hooks',
  '  hook <read|grep>                   Claude Code PostToolUse hook: gloss context for a Read or Grep',
];

const HOOKS_QUESTION =
  'Add the gloss Read/Grep hooks to .claude/settings.json so agents see the margin as they read?';
const BLOCK_QUESTION = 'Replace the customised gloss block in CLAUDE.md with the shipped snippet?';
const BLOCK_DIFF_TITLE =
  'CLAUDE.md gloss block differs from the shipped snippet (- yours, + shipped):';
const HOOK_DEBUG_ENV = 'GLOSS_HOOK_DEBUG';

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

export type Confirm = (question: string, defaultYes: boolean) => boolean;

const isInteractive = (): boolean => process.stdin.isTTY === true && process.stdout.isTTY === true;

const promptYesNo: Confirm = (question, defaultYes) => {
  if (!isInteractive()) return false;
  process.stdout.write(`${question} ${defaultYes ? '[Y/n]' : '[y/N]'} `);
  try {
    const buffer = Buffer.alloc(256);
    const bytes = readSync(0, buffer, 0, buffer.length, null);
    if (bytes === 0) return false;
    const answer = buffer.toString('utf8', 0, bytes).trim().toLowerCase();
    return answer === '' ? defaultYes : answer.startsWith('y');
  } catch {
    return false;
  }
};

export type SetupFlags = {
  hooks?: boolean;
  updateBlock?: boolean;
};

export const runSetup = (
  repoRoot: string,
  log: Logger = writeLine,
  flags: SetupFlags = {},
  confirm: Confirm = promptYesNo,
): number => {
  const blockDiff = claudeBlockDiff(repoRoot);
  if (blockDiff.length > 0) {
    log(BLOCK_DIFF_TITLE);
    for (const line of blockDiff) log(`  ${line}`);
  }
  const updateBlock =
    flags.updateBlock === true || (blockDiff.length > 0 && confirm(BLOCK_QUESTION, false));

  const { hooks } = flags;
  const accepted =
    hooks === undefined && !hasClaudeHooks(repoRoot) && confirm(HOOKS_QUESTION, true);
  const claudeHooks = hooks ?? (accepted ? true : undefined);
  const report = setup(repoRoot, { claudeHooks, updateBlock });
  logGroup(log, 'created', report.created);
  logGroup(log, 'updated', report.updated);
  logGroup(log, 'skipped', report.skipped);
  logGroup(log, 'suggestions', report.suggestions);
  return 0;
};

const readStdin = (): string => (process.stdin.isTTY === true ? '' : readFileSync(0, 'utf8'));

const reportHookError = (error: unknown): void => {
  if (process.env[HOOK_DEBUG_ENV]) process.stderr.write(`${String(error)}\n`);
};

export const runHook = (
  event: ClaudeHookEvent,
  cwd: string,
  log: Logger = writeLine,
  stdin: () => string = readStdin,
): number => {
  let input: string;
  try {
    input = stdin();
  } catch (error) {
    reportHookError(error);
    return 0;
  }
  const output = runClaudeHook(event, input, cwd, reportHookError);
  if (output !== undefined) log(output);
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
  hooks?: boolean;
  updateBlock: boolean;
};

const parseCommandLine = (argv: string[]): CommandLine | undefined => {
  try {
    const { values, positionals } = parseArgs({
      args: argv,
      options: {
        staged: { type: 'boolean', default: false },
        debounce: { type: 'string' },
        hooks: { type: 'boolean' },
        'no-hooks': { type: 'boolean' },
        'update-block': { type: 'boolean', default: false },
      },
      allowPositionals: true,
    });
    const debounceMs = values.debounce === undefined ? undefined : Number(values.debounce);
    if (debounceMs !== undefined && !Number.isFinite(debounceMs)) return undefined;
    if (values.hooks === true && values['no-hooks'] === true) return undefined;
    const hooks = values.hooks === true ? true : values['no-hooks'] === true ? false : undefined;

    return {
      command: positionals[0],
      positionals: positionals.slice(1),
      staged: values.staged === true,
      debounceMs,
      hooks,
      updateBlock: values['update-block'] === true,
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

  // why: the hook runs on every agent Read/Grep; it must not depend on git or throw on a bad package.json.
  if (line.command === 'hook') {
    const [event] = line.positionals;
    if (!isClaudeHookEvent(event)) return { code: runUsage(log) };
    return { code: runHook(event, cwd, log) };
  }

  const repoRoot = findRepoRoot(cwd);
  loadRepoDirectives(repoRoot);
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
      return {
        code: runSetup(repoRoot, log, { hooks: line.hooks, updateBlock: line.updateBlock }),
      };
    default:
      return { code: runUsage(log) };
  }
};

export const main = (argv: string[] = process.argv.slice(2), cwd: string = process.cwd()): void => {
  const { code, watcher } = runCommand(argv, cwd);
  if (watcher === undefined) process.exit(code);
};

// why: package managers link the bin as node_modules/.bin/gloss -> dist/cli.js, and
// why: resolve() does not follow symlinks — comparing it to import.meta.url made every
// why: `bunx gloss` / `.bin/gloss` run a silent no-op that still exited 0.
export const isEntryPath = (entry: string | undefined, selfPath: string): boolean => {
  if (entry === undefined) return false;
  const real = (path: string): string => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  return real(entry) === real(selfPath);
};

const invokedAsBin = (): boolean => isEntryPath(process.argv[1], fileURLToPath(import.meta.url));

if (invokedAsBin()) main();
