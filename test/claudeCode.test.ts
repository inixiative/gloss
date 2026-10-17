import { afterEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CLAUDE_SETTINGS_FILE,
  claudeHookEntry,
  formatAdditionalContext,
  hasClaudeHooks,
  installClaudeHooks,
  runClaudeHook,
} from '../src/claudeCode';
import { commitFiles, createRepo, destroyRepo, writeFiles } from './tempRepo';

const SOURCE = 'src/cache.ts';
const MIRROR = '.gloss/src/cache.ts.md';
const MIRROR_TEXT = ['# src/cache.ts', '', '## cacheKey', '', 'Tenant-namespaced keys.', ''].join(
  '\n',
);

const roots: string[] = [];

const track = (root: string): string => {
  roots.push(root);
  return root;
};

const glossedRepo = (): string => {
  const repoRoot = track(realpathSync(createRepo()));
  commitFiles(
    repoRoot,
    { [SOURCE]: 'export const cacheKey = 1;\n', [MIRROR]: MIRROR_TEXT },
    'add cache',
    '2026-10-01T00:00:00Z',
  );
  return repoRoot;
};

const plainRoot = (): string => track(realpathSync(mkdtempSync(join(tmpdir(), 'gloss-claude-'))));

type HookOutput = {
  suppressOutput: boolean;
  hookSpecificOutput: { hookEventName: string; additionalContext: string };
};

const contextOf = (output: string | undefined): string | undefined => {
  if (output === undefined) return undefined;
  const parsed = JSON.parse(output) as HookOutput;
  expect(parsed.suppressOutput).toBe(true);
  expect(parsed.hookSpecificOutput.hookEventName).toBe('PostToolUse');
  return parsed.hookSpecificOutput.additionalContext;
};

const settingsOf = (root: string): unknown =>
  JSON.parse(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8'));

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) destroyRepo(root);
  }
});

describe('runClaudeHook read', () => {
  test('emits the margin of a glossed file as additionalContext', () => {
    const repoRoot = glossedRepo();
    const stdin = JSON.stringify({
      tool_name: 'Read',
      tool_input: { file_path: join(repoRoot, SOURCE) },
    });

    const context = contextOf(runClaudeHook('read', stdin, repoRoot));
    expect(context).toStartWith(`gloss for ${SOURCE}`);
    expect(context).toContain('Tenant-namespaced keys.');
  });

  test('emits nothing outside a glossed tree, for a file with no margin, or without a path', () => {
    const repoRoot = glossedRepo();

    expect(
      runClaudeHook('read', JSON.stringify({ tool_input: { file_path: '/etc/hosts' } }), '/'),
    ).toBeUndefined();
    expect(
      runClaudeHook(
        'read',
        JSON.stringify({ tool_input: { file_path: join(repoRoot, 'package.json') } }),
        repoRoot,
      ),
    ).toBeUndefined();
    expect(runClaudeHook('read', JSON.stringify({ tool_input: {} }), repoRoot)).toBeUndefined();
  });

  test('fails silently on input that is not JSON, reporting the error to the callback', () => {
    const errors: unknown[] = [];

    expect(runClaudeHook('read', 'not json', '/', (error) => errors.push(error))).toBeUndefined();
    expect(errors).toHaveLength(1);
  });
});

describe('runClaudeHook grep', () => {
  test('resolves the repo from the input cwd and the grep path', () => {
    const repoRoot = glossedRepo();
    const stdin = JSON.stringify({
      tool_name: 'Grep',
      cwd: repoRoot,
      tool_input: { pattern: 'cacheKey\\(', path: 'src' },
    });

    expect(contextOf(runClaudeHook('grep', stdin, '/'))).toContain(
      `${SOURCE} → cacheKey: Tenant-namespaced keys.`,
    );
  });

  test('falls back to the process cwd when the input carries none', () => {
    const repoRoot = glossedRepo();
    const stdin = JSON.stringify({ tool_input: { pattern: 'cacheKey' } });

    expect(contextOf(runClaudeHook('grep', stdin, join(repoRoot, 'src')))).toContain('cacheKey');
  });

  test('emits nothing for a pattern without a useful identifier', () => {
    const repoRoot = glossedRepo();
    const stdin = JSON.stringify({ cwd: repoRoot, tool_input: { pattern: 'foo|ba' } });

    expect(runClaudeHook('grep', stdin, repoRoot)).toBeUndefined();
  });
});

describe('formatAdditionalContext', () => {
  test('emits nothing for blank context and truncates past 8000 characters', () => {
    expect(formatAdditionalContext('  \n')).toBeUndefined();

    const context = contextOf(formatAdditionalContext('y'.repeat(9000))) ?? '';
    expect(context).toStartWith('y'.repeat(8000));
    expect(context).toEndWith('… (truncated; run the command above for the rest)');
  });
});

describe('installClaudeHooks', () => {
  test('creates .claude/settings.json with a Read and a Grep PostToolUse entry', () => {
    const root = plainRoot();

    expect(installClaudeHooks(root)).toBe('created');
    expect(settingsOf(root)).toEqual({
      hooks: {
        PostToolUse: [
          { matcher: 'Read', hooks: [claudeHookEntry('read')] },
          { matcher: 'Grep', hooks: [claudeHookEntry('grep')] },
        ],
      },
    });
    expect(hasClaudeHooks(root)).toBe(true);
  });

  test('merges into existing settings without touching other hooks or keys', () => {
    const root = plainRoot();
    const otherRead = { type: 'command', command: 'bun .claude/hooks/other.ts' };
    const guard = { matcher: 'Bash', hooks: [{ type: 'command', command: 'bun guard.ts' }] };
    writeFiles(root, {
      [CLAUDE_SETTINGS_FILE]: JSON.stringify({
        permissions: { allow: ['Bash(ls)'] },
        hooks: {
          PreToolUse: [guard],
          PostToolUse: [{ matcher: 'Read', hooks: [otherRead] }],
        },
      }),
    });

    expect(installClaudeHooks(root)).toBe('updated');
    expect(settingsOf(root)).toEqual({
      permissions: { allow: ['Bash(ls)'] },
      hooks: {
        PreToolUse: [guard],
        PostToolUse: [
          { matcher: 'Read', hooks: [otherRead, claudeHookEntry('read')] },
          { matcher: 'Grep', hooks: [claudeHookEntry('grep')] },
        ],
      },
    });
  });

  test('adds nothing when the entries are present, however they were spelled', () => {
    const root = plainRoot();
    const settings = {
      hooks: {
        PostToolUse: [
          {
            matcher: 'Read|Grep',
            hooks: [
              { type: 'command', command: 'node_modules/.bin/gloss hook read' },
              { type: 'command', command: 'bunx gloss  hook grep' },
            ],
          },
        ],
      },
    };
    const text = JSON.stringify(settings);
    writeFiles(root, { [CLAUDE_SETTINGS_FILE]: text });

    expect(installClaudeHooks(root)).toBe('present');
    expect(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8')).toBe(text);
  });

  test('counts an entry only under a matcher that covers its tool', () => {
    const root = plainRoot();
    const readUnderBash = { type: 'command', command: 'bunx gloss hook read' };
    const grepEverywhere = { type: 'command', command: 'bunx gloss hook grep' };
    writeFiles(root, {
      [CLAUDE_SETTINGS_FILE]: JSON.stringify({
        hooks: {
          PostToolUse: [
            { matcher: 'Bash', hooks: [readUnderBash] },
            { matcher: '*', hooks: [grepEverywhere] },
          ],
        },
      }),
    });

    expect(hasClaudeHooks(root)).toBe(false);
    expect(installClaudeHooks(root)).toBe('updated');
    expect(settingsOf(root)).toEqual({
      hooks: {
        PostToolUse: [
          { matcher: 'Bash', hooks: [readUnderBash] },
          { matcher: '*', hooks: [grepEverywhere] },
          { matcher: 'Read', hooks: [claudeHookEntry('read')] },
        ],
      },
    });
  });

  test('the command runs the installed bin and stays silent without one', () => {
    const root = glossedRepo();
    const run = (event: 'read' | 'grep', input: Record<string, unknown>) =>
      Bun.spawnSync(['sh', '-c', claudeHookEntry(event).command], {
        cwd: root,
        env: { ...process.env, CLAUDE_PROJECT_DIR: root },
        stdin: Buffer.from(JSON.stringify(input)),
        stdout: 'pipe',
        stderr: 'pipe',
      });
    const readInput = { tool_input: { file_path: join(root, SOURCE) } };

    const missing = run('read', readInput);
    expect(missing.exitCode).toBe(0);
    expect(missing.stdout.toString()).toBe('');
    expect(missing.stderr.toString()).toBe('');

    const bin = join(root, 'node_modules/.bin/gloss');
    writeFiles(root, {
      'node_modules/.bin/gloss': `#!/bin/sh\nexec bun ${join(import.meta.dir, '../src/cli.ts')} "$@"\n`,
    });
    chmodSync(bin, 0o755);
    const installed = run('read', readInput);
    expect(installed.exitCode).toBe(0);
    expect(contextOf(installed.stdout.toString().trim())).toContain('Tenant-namespaced keys.');
  });

  test('adds only the missing entry when one is present', () => {
    const root = plainRoot();
    installClaudeHooks(root);
    const settings = settingsOf(root) as { hooks: { PostToolUse: unknown[] } };
    settings.hooks.PostToolUse.pop();
    writeFiles(root, { [CLAUDE_SETTINGS_FILE]: JSON.stringify(settings) });

    expect(installClaudeHooks(root)).toBe('updated');
    expect(installClaudeHooks(root)).toBe('present');
    expect(
      (settingsOf(root) as { hooks: { PostToolUse: unknown[] } }).hooks.PostToolUse,
    ).toHaveLength(2);
  });

  test('leaves settings it cannot merge untouched', () => {
    for (const text of ['{ not json', '[]', '{"hooks": []}', '{"hooks": {"PostToolUse": {}}}']) {
      const root = plainRoot();
      writeFiles(root, { [CLAUDE_SETTINGS_FILE]: text });

      expect(installClaudeHooks(root)).toBe('unmergeable');
      expect(readFileSync(join(root, CLAUDE_SETTINGS_FILE), 'utf8')).toBe(text);
      expect(hasClaudeHooks(root)).toBe(false);
    }
  });
});
