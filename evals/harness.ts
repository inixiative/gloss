import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { readClaudeSnippet } from '../src/index';

const REPO_ROOT = resolve(import.meta.dir, '..');

const CLI_PATH = join(REPO_ROOT, 'src/cli.ts');
const SHIM_NAME = 'gloss';
const CLAUDE_BINARY = 'claude';
const CLAUDE_TIMEOUT_MS = 600_000;
const CLAUDE_MAX_BUFFER = 64 * 1024 * 1024;
const CLAUDE_MAX_TURNS = '25';
const CLAUDE_ALLOWED_TOOLS = 'Bash,Read,Edit,Write,Grep,Glob';
const NESTED_SESSION_ENV = ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT'];

const GIT_CONFIG: [string, string][] = [
  ['user.name', 'Gloss Evals'],
  ['user.email', 'evals@gloss.test'],
  ['commit.gpgsign', 'false'],
  ['tag.gpgsign', 'false'],
  ['diff.renames', 'true'],
];

const DIFF_ADDED_PATH = /^\+\+\+ b\/(.+)$/;
const DIFF_REMOVED_PATH = /^--- a\/(.+)$/;
const DIFF_ADDED_LINE = /^\+(?!\+\+)/;
const WHY_COMMENT = /^\s*\/\/\s*why:\s*(.*)$/;
const LEADING_WORD = /[a-z]+/;

const NARRATION_VERBS = [
  'create',
  'loop',
  'call',
  'return',
  'set',
  'get',
  'make',
  'add',
  'use',
  'iterate',
  'build',
  'define',
  'initialize',
  'declare',
];

export type SandboxFiles = Record<string, string>;

export type Sandbox = {
  runDir: string;
  root: string;
  binDir: string;
  transcriptPath: string;
  stderrPath: string;
};

export type ToolCall = {
  name: string;
  input: Record<string, unknown>;
};

export type Transcript = {
  toolCalls: ToolCall[];
  finalText: string;
  exitCode: number;
  stderr: string;
};

export type GradeContext = {
  sandbox: string;
  toolCalls: ToolCall[];
  finalText: string;
  diff: string;
  readFile: (relPath: string) => string | undefined;
};

export type Grade = {
  pass: boolean;
  notes: string[];
};

export type Scenario = {
  name: string;
  files: SandboxFiles;
  task: string;
  grade: (context: GradeContext) => Grade;
};

export type ScenarioRun = {
  scenario: string;
  grade: Grade;
  sandbox: Sandbox;
  transcript: Transcript;
};

export const packageJsonFor = (name: string): string =>
  `${JSON.stringify(
    {
      name,
      private: true,
      type: 'module',
      scripts: { check: 'gloss check', lint: 'gloss lint' },
    },
    null,
    2,
  )}\n`;

const git = (root: string, args: string[]): string =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

const claudeVersion = (): string | undefined => {
  const probe = spawnSync(CLAUDE_BINARY, ['--version'], { encoding: 'utf8' });
  if (probe.error || probe.status !== 0) return undefined;
  return (probe.stdout ?? '').trim();
};

export const requireClaudeBinary = (): string => {
  const version = claudeVersion();
  if (version === undefined) {
    throw new Error(
      `'${CLAUDE_BINARY}' is not runnable on PATH; these evals drive headless Claude Code and cannot run without it`,
    );
  }
  return version;
};

const writeSandboxFiles = (root: string, files: SandboxFiles): void => {
  for (const [relPath, contents] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
};

const installGlossShim = (binDir: string): void => {
  mkdirSync(binDir, { recursive: true });
  const shimPath = join(binDir, SHIM_NAME);
  writeFileSync(shimPath, `#!/bin/sh\nexec bun ${JSON.stringify(CLI_PATH)} "$@"\n`, 'utf8');
  chmodSync(shimPath, 0o755);
};

export const createSandbox = (scenarioName: string, files: SandboxFiles): Sandbox => {
  const runDir = mkdtempSync(join(tmpdir(), `gloss-eval-${scenarioName}-`));
  const root = join(runDir, 'repo');
  const binDir = join(runDir, 'bin');

  mkdirSync(root, { recursive: true });
  git(root, ['init', '-q', '-b', 'main']);
  for (const [key, value] of GIT_CONFIG) git(root, ['config', key, value]);

  writeSandboxFiles(root, { ...files, 'CLAUDE.md': `${readClaudeSnippet()}\n` });
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', 'baseline']);
  installGlossShim(binDir);

  return {
    runDir,
    root,
    binDir,
    transcriptPath: join(runDir, 'transcript.jsonl'),
    stderrPath: join(runDir, 'stderr.log'),
  };
};

export const destroySandbox = (sandbox: Sandbox): void => {
  rmSync(sandbox.runDir, { recursive: true, force: true });
};

const childEnv = (binDir: string): Record<string, string | undefined> => {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PATH: `${binDir}${delimiter}${process.env.PATH ?? ''}`,
  };
  for (const key of NESTED_SESSION_ENV) delete env[key];
  return env;
};

const parseJsonLine = (line: string): unknown => {
  try {
    return JSON.parse(line);
  } catch {
    return undefined;
  }
};

const asRecord = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

const contentBlocks = (event: Record<string, unknown>): Record<string, unknown>[] => {
  const content = asRecord(event.message)?.content;
  if (!Array.isArray(content)) return [];
  return content.flatMap((block) => {
    const record = asRecord(block);
    return record ? [record] : [];
  });
};

export const parseTranscript = (stdout: string): { toolCalls: ToolCall[]; finalText: string } => {
  const toolCalls: ToolCall[] = [];
  const assistantText: string[] = [];
  let resultText: string | undefined;

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;

    const event = asRecord(parseJsonLine(trimmed));
    if (!event) continue;

    if (event.type === 'result') {
      resultText = asString(event.result) ?? resultText;
      continue;
    }
    if (event.type !== 'assistant') continue;

    for (const block of contentBlocks(event)) {
      if (block.type === 'tool_use') {
        toolCalls.push({ name: asString(block.name) ?? '', input: asRecord(block.input) ?? {} });
        continue;
      }
      const text = asString(block.text);
      if (block.type === 'text' && text !== undefined) assistantText.push(text);
    }
  }

  return { toolCalls, finalText: resultText ?? assistantText.join('\n') };
};

export const runClaude = (sandbox: Sandbox, task: string, model: string): Transcript => {
  const result = spawnSync(
    CLAUDE_BINARY,
    [
      '-p',
      task,
      '--output-format',
      'stream-json',
      '--verbose',
      '--model',
      model,
      '--max-turns',
      CLAUDE_MAX_TURNS,
      '--allowedTools',
      CLAUDE_ALLOWED_TOOLS,
    ],
    {
      cwd: sandbox.root,
      env: childEnv(sandbox.binDir),
      encoding: 'utf8',
      timeout: CLAUDE_TIMEOUT_MS,
      maxBuffer: CLAUDE_MAX_BUFFER,
    },
  );

  const stdout = result.stdout ?? '';
  const stderr = [result.stderr ?? '', result.error?.message ?? ''].join('\n').trim();
  writeFileSync(sandbox.transcriptPath, stdout, 'utf8');
  writeFileSync(sandbox.stderrPath, stderr, 'utf8');

  return { ...parseTranscript(stdout), exitCode: result.status ?? -1, stderr };
};

export const gitDiff = (root: string): string => {
  git(root, ['add', '-A', '-N']);
  return git(root, ['diff', 'HEAD']);
};

export const readSandboxFile = (root: string, relPath: string): string | undefined => {
  const absolute = join(root, relPath);
  return existsSync(absolute) ? readFileSync(absolute, 'utf8') : undefined;
};

export const changedPaths = (diff: string): string[] => {
  const paths = new Set<string>();
  for (const line of diff.split('\n')) {
    const added = DIFF_ADDED_PATH.exec(line);
    if (added) paths.add(added[1]);
    const removed = DIFF_REMOVED_PATH.exec(line);
    if (removed) paths.add(removed[1]);
  }
  return [...paths].sort();
};

export const addedLines = (diff: string): string[] =>
  diff
    .split('\n')
    .filter((line) => DIFF_ADDED_LINE.test(line))
    .map((line) => line.slice(1));

export const whyTexts = (lines: string[]): string[] =>
  lines.flatMap((line) => {
    const match = WHY_COMMENT.exec(line);
    return match ? [match[1].trim()] : [];
  });

export const isNarration = (text: string): boolean => {
  const leading = LEADING_WORD.exec(text.toLowerCase())?.[0] ?? '';
  return leading !== '' && NARRATION_VERBS.some((verb) => leading.startsWith(verb));
};

export const bashCommands = (toolCalls: ToolCall[]): string[] =>
  toolCalls
    .filter((call) => call.name === 'Bash')
    .flatMap((call) => {
      const command = asString(call.input.command);
      return command === undefined ? [] : [command];
    });

export const toolCallText = (toolCalls: ToolCall[]): string =>
  toolCalls.map((call) => `${call.name} ${JSON.stringify(call.input)}`).join('\n');

const tail = (text: string, lines: number): string =>
  text.trim().split('\n').slice(-lines).join(' | ');

export const runScenario = (scenario: Scenario, model: string): ScenarioRun => {
  const sandbox = createSandbox(scenario.name, scenario.files);
  const transcript = runClaude(sandbox, scenario.task, model);
  const diff = gitDiff(sandbox.root);
  const grade = scenario.grade({
    sandbox: sandbox.root,
    toolCalls: transcript.toolCalls,
    finalText: transcript.finalText,
    diff,
    readFile: (relPath) => readSandboxFile(sandbox.root, relPath),
  });

  const notes =
    transcript.exitCode === 0
      ? grade.notes
      : [...grade.notes, `claude exited ${transcript.exitCode}: ${tail(transcript.stderr, 3)}`];

  return { scenario: scenario.name, grade: { pass: grade.pass, notes }, sandbox, transcript };
};
