import { afterEach, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findRepoRoot,
  isEntryPath,
  runCheck,
  runCommand,
  runFix,
  runHarvest,
  runHistory,
  runHook,
  runLint,
  runRead,
  runSetup,
  USAGE_EXIT_CODE,
} from '../src/cli';
import { commitAll, createRepo, destroyRepo, git, writeFiles } from './tempRepo';

const SOURCE = 'src/mod.ts';
const MIRROR = '.gloss/src/mod.ts.md';

const DIRTY_SOURCE = [
  'export function compute(total: number) {',
  '  // doubles the total',
  '  return total * 2;',
  '}',
  '',
].join('\n');

const RENAMED_SOURCE = ['// gloss', 'export const beta = () => 1;', ''].join('\n');

const STALE_MIRROR = ['# src/mod.ts', '', '## alpha', '', 'Alpha note.', ''].join('\n');

const GLOSSED_SOURCE = ['// gloss', 'export const alpha = () => 1;', ''].join('\n');

const roots: string[] = [];

const repo = (): string => {
  const root = createRepo();
  roots.push(root);
  return root;
};

const plainRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-cli-'));
  roots.push(root);
  return root;
};

const collector = (): { lines: string[]; log: (line: string) => void } => {
  const lines: string[] = [];
  return { lines, log: (line) => lines.push(line) };
};

const read = (root: string, relPath: string): string => readFileSync(join(root, relPath), 'utf8');

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) destroyRepo(root);
  }
});

describe('findRepoRoot', () => {
  test('walks up to the nearest ancestor with a .git directory', () => {
    const root = repo();
    writeFiles(root, { 'src/nested/keep.ts': 'export const keep = 1;\n' });

    expect(findRepoRoot(join(root, 'src/nested'))).toBe(root);
  });

  test('falls back to the given directory outside a repository', () => {
    const root = plainRoot();

    expect(findRepoRoot(root)).toBe(root);
  });
});

describe('runLint', () => {
  test('reports every violation and exits 1', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE });
    const { lines, log } = collector();

    expect(runLint(root, [], log)).toBe(1);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toStartWith(`${SOURCE}:2 forbiddenComment `);
  });

  test('reports clean and exits 0 once the comment is harvested', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE });
    runHarvest(root, [], false, () => {});
    const { lines, log } = collector();

    expect(runLint(root, [], log)).toBe(0);
    expect(lines).toEqual(['clean']);
  });

  test('honours a path scope', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE, 'other/dirty.ts': DIRTY_SOURCE });

    expect(runLint(root, ['other'], () => {})).toBe(1);
    expect(runLint(root, ['src/nowhere'], () => {})).toBe(0);
  });
});

describe('check, fix, check', () => {
  test('reaches clean through fix and prints the fix hint while dirty', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: RENAMED_SOURCE, [MIRROR]: STALE_MIRROR });
    const dirty = collector();

    expect(runCheck(root, [], dirty.log)).toBe(1);
    expect(dirty.lines.at(-1)).toBe('run: gloss fix');
    expect(dirty.lines.some((line) => line.includes('markerWithoutSection'))).toBe(true);

    const fixed = collector();
    expect(runFix(root, [], fixed.log)).toBe(0);
    expect(fixed.lines.some((line) => line.includes("renamed '## alpha' to '## beta'"))).toBe(true);

    const clean = collector();
    expect(runCheck(root, [], clean.log)).toBe(0);
    expect(clean.lines).toEqual(['clean']);
  });

  test('reports nothing to fix on a sound repo', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    const { lines, log } = collector();

    expect(runFix(root, [], log)).toBe(0);
    expect(lines).toEqual(['nothing to fix']);
  });
});

describe('runHarvest', () => {
  test('sweeps the comment out of the source and into the mirror', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE });
    const { lines, log } = collector();

    expect(runHarvest(root, [], false, log)).toBe(0);
    expect(lines).toEqual([`${SOURCE}: 1 moved`]);
    expect(read(root, SOURCE)).toContain('// gloss');
    expect(read(root, MIRROR)).toContain('doubles the total');
  });

  test('reports nothing to harvest when the tree is already clean', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    const { lines, log } = collector();

    expect(runHarvest(root, [], false, log)).toBe(0);
    expect(lines).toEqual(['nothing to harvest']);
  });

  test('--staged harvests only staged files and stages what it changed', () => {
    const root = repo();
    writeFiles(root, { 'README.md': '# repo\n' });
    commitAll(root, 'initial', '2026-01-01T12:00:00Z');
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE, 'src/unstaged.ts': DIRTY_SOURCE });
    git(root, ['add', '--', SOURCE]);
    const { lines, log } = collector();

    expect(runHarvest(root, [], true, log)).toBe(0);
    expect(lines).toEqual([`${SOURCE}: 1 moved`]);
    expect(read(root, 'src/unstaged.ts')).toContain('// doubles the total');
    expect(existsSync(join(root, '.gloss/src/unstaged.ts.md'))).toBe(false);

    const staged = git(root, ['diff', '--cached', '--name-only']).split('\n');
    expect(staged).toContain(MIRROR);
    expect(staged).toContain(SOURCE);
    expect(staged).toContain('.gloss/.gitignore');
  });

  test('--staged reports nothing to harvest with an empty index', () => {
    const root = repo();
    writeFiles(root, { 'README.md': '# repo\n' });
    commitAll(root, 'initial', '2026-01-01T12:00:00Z');
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE });
    const { lines, log } = collector();

    expect(runHarvest(root, [], true, log)).toBe(0);
    expect(lines).toEqual(['nothing to harvest']);
    expect(read(root, SOURCE)).toContain('// doubles the total');
  });
});

describe('runRead', () => {
  test('prints the section under a derived staleness header', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    commitAll(root, 'gloss', '2026-01-01T12:00:00Z');
    const { lines, log } = collector();

    expect(runRead(root, SOURCE, undefined, log)).toBe(0);
    const output = lines.join('\n');
    expect(output).toContain('## alpha');
    expect(output).toContain('written 2026-01-01');
    expect(output).toContain('Alpha note.');
  });

  test('says so when there is no gloss for the file', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE });
    const { lines, log } = collector();

    expect(runRead(root, SOURCE, 'alpha', log)).toBe(0);
    expect(lines).toEqual([`no gloss for ${SOURCE}`]);
  });
});

describe('runHistory', () => {
  test('prints no history in a repo without commits rather than throwing', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    const { lines, log } = collector();

    expect(runHistory(root, SOURCE, undefined, log)).toBe(0);
    expect(lines).toEqual(['no history']);
  });

  test('prints the patch that introduced a section', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    commitAll(root, 'gloss', '2026-01-01T12:00:00Z');
    const { lines, log } = collector();

    expect(runHistory(root, SOURCE, 'alpha', log)).toBe(0);
    expect(lines.join('\n')).toContain('Alpha note.');
  });
});

describe('runSetup', () => {
  test('creates the gloss readme and the CLAUDE.md block, grouped in the output', () => {
    const root = repo();
    const { lines, log } = collector();

    expect(runSetup(root, log)).toBe(0);
    expect(lines[0]).toBe('created:');
    expect(lines).toContain('  .gloss/README.md');
    expect(lines).toContain('  CLAUDE.md');
    expect(lines).toContain('suggestions:');
    expect(read(root, 'CLAUDE.md')).toContain('<!-- gloss:begin -->');
  });

  test('is idempotent on a second run', () => {
    const root = repo();
    runSetup(root, () => {});
    const { lines, log } = collector();

    expect(runSetup(root, log)).toBe(0);
    expect(lines).toContain('skipped:');
    expect(lines).toContain('  .gloss/README.md');
  });

  test('--hooks adds the Claude Code hooks without asking', () => {
    const root = repo();
    const { lines, log } = collector();
    const asked: string[] = [];

    expect(runSetup(root, log, true, (question) => asked.push(question) > 0)).toBe(0);
    expect(asked).toEqual([]);
    expect(lines).toContain('  .claude/settings.json');
    expect(read(root, '.claude/settings.json')).toContain('bunx gloss hook read');
    expect(read(root, '.claude/settings.json')).toContain('bunx gloss hook grep');
  });

  test('--no-hooks leaves .claude alone and suggests the flag', () => {
    const root = repo();
    const { lines, log } = collector();

    expect(runSetup(root, log, false, () => true)).toBe(0);
    expect(existsSync(join(root, '.claude/settings.json'))).toBe(false);
    expect(lines.some((line) => line.includes('gloss setup --hooks'))).toBe(true);
  });

  test('asks when no flag is given, and acts on the answer', () => {
    const declined = repo();
    runSetup(
      declined,
      () => {},
      undefined,
      () => false,
    );
    expect(existsSync(join(declined, '.claude/settings.json'))).toBe(false);

    const accepted = repo();
    const asked: string[] = [];
    runSetup(
      accepted,
      () => {},
      undefined,
      (question) => asked.push(question) > 0,
    );
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('.claude/settings.json');
    expect(read(accepted, '.claude/settings.json')).toContain('bunx gloss hook read');
  });

  test('does not ask again once the hooks are installed', () => {
    const root = repo();
    runSetup(root, () => {}, true);
    const asked: string[] = [];
    const { lines, log } = collector();

    runSetup(root, log, undefined, (question) => asked.push(question) > 0);
    expect(asked).toEqual([]);
    expect(lines.some((line) => line.includes('gloss setup --hooks'))).toBe(false);
  });
});

describe('runHook', () => {
  test('logs the hook output for a glossed file and exits 0', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    const { lines, log } = collector();
    const stdin = JSON.stringify({ tool_input: { file_path: join(root, SOURCE) } });

    expect(runHook('read', root, log, () => stdin)).toBe(0);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('"hookEventName":"PostToolUse"');
    expect(lines[0]).toContain('Alpha note.');
  });

  test('stays silent and exits 0 when stdin cannot be read', () => {
    const { lines, log } = collector();

    expect(
      runHook('grep', '/', log, () => {
        throw new Error('closed');
      }),
    ).toBe(0);
    expect(lines).toEqual([]);
  });
});

describe('runCommand', () => {
  test('prints usage and exits 64 for an unknown command', () => {
    const root = repo();
    const { lines, log } = collector();

    expect(runCommand(['bogus'], root, log).code).toBe(USAGE_EXIT_CODE);
    expect(lines[0]).toStartWith('usage: gloss');
    for (const command of [
      'lint',
      'check',
      'fix',
      'harvest',
      'read',
      'history',
      'watch',
      'setup',
    ]) {
      expect(lines.some((line) => line.trimStart().startsWith(command))).toBe(true);
    }
  });

  test('prints usage with no command at all', () => {
    const root = repo();
    const { lines, log } = collector();

    expect(runCommand([], root, log).code).toBe(USAGE_EXIT_CODE);
    expect(lines[0]).toStartWith('usage: gloss');
  });

  test('prints usage for an unknown flag and for a read without a file', () => {
    const root = repo();

    expect(runCommand(['lint', '--nope'], root, () => {}).code).toBe(USAGE_EXIT_CODE);
    expect(runCommand(['read'], root, () => {}).code).toBe(USAGE_EXIT_CODE);
  });

  test('prints usage for a hook without a known event and for both hook flags at once', () => {
    const root = repo();

    expect(runCommand(['hook'], root, () => {}).code).toBe(USAGE_EXIT_CODE);
    expect(runCommand(['hook', 'write'], root, () => {}).code).toBe(USAGE_EXIT_CODE);
    expect(runCommand(['setup', '--hooks', '--no-hooks'], root, () => {}).code).toBe(
      USAGE_EXIT_CODE,
    );
  });

  test('dispatches setup --hooks and --no-hooks', () => {
    const withHooks = repo();
    const withoutHooks = repo();

    expect(runCommand(['setup', '--hooks'], withHooks, () => {}).code).toBe(0);
    expect(existsSync(join(withHooks, '.claude/settings.json'))).toBe(true);
    expect(runCommand(['setup', '--no-hooks'], withoutHooks, () => {}).code).toBe(0);
    expect(existsSync(join(withoutHooks, '.claude/settings.json'))).toBe(false);
  });

  test('runs a hook from stdin as the bin, ignoring a package.json that would break other commands', () => {
    const root = repo();
    writeFiles(root, {
      [SOURCE]: GLOSSED_SOURCE,
      [MIRROR]: STALE_MIRROR,
      'package.json': '{ "gloss": { "directives": [42] } }',
    });
    const result = Bun.spawnSync(['bun', join(import.meta.dir, '../src/cli.ts'), 'hook', 'read'], {
      cwd: root,
      stdin: Buffer.from(JSON.stringify({ tool_input: { file_path: join(root, SOURCE) } })),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr.toString()).toBe('');
    const output = JSON.parse(result.stdout.toString()) as {
      hookSpecificOutput: { additionalContext: string };
    };
    expect(output.hookSpecificOutput.additionalContext).toContain('Alpha note.');
  });

  test('dispatches lint against the repo root found from a nested cwd', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: DIRTY_SOURCE });
    const { lines, log } = collector();

    expect(runCommand(['lint'], join(root, 'src'), log).code).toBe(1);
    expect(lines[0]).toStartWith(`${SOURCE}:2 forbiddenComment `);
  });

  test('resolves a read path against the cwd, not the repo root', () => {
    const root = repo();
    writeFiles(root, { [SOURCE]: GLOSSED_SOURCE, [MIRROR]: STALE_MIRROR });
    const { lines, log } = collector();

    expect(runCommand(['read', 'mod.ts', 'alpha'], join(root, 'src'), log).code).toBe(0);
    expect(lines.join('\n')).toContain('Alpha note.');
  });

  test('watch returns a handle so the process stays alive', () => {
    const root = repo();
    const outcome = runCommand(['watch', '--debounce', '20'], root, () => {});

    expect(outcome.code).toBe(0);
    expect(outcome.watcher).toBeDefined();
    outcome.watcher?.close();
  });
});

describe('isEntryPath', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  const linkedCli = (): { cli: string; link: string } => {
    const dir = mkdtempSync(join(tmpdir(), 'gloss-bin-'));
    dirs.push(dir);
    const cli = join(dir, 'cli.js');
    const binDir = join(dir, '.bin');
    writeFileSync(cli, '', 'utf8');
    mkdirSync(binDir);
    const link = join(binDir, 'gloss');
    symlinkSync(cli, link);
    return { cli, link };
  };

  test('matches when the entry is the module itself', () => {
    const { cli } = linkedCli();

    expect(isEntryPath(cli, cli)).toBe(true);
  });

  // why: this is the whole bug — package managers invoke the bin through
  // why: node_modules/.bin/gloss, a symlink, so a resolve()-only comparison
  // why: never matched and every `bunx gloss` exited 0 having done nothing.
  test('matches when the entry is the bin symlink pointing at the module', () => {
    const { cli, link } = linkedCli();

    expect(isEntryPath(link, cli)).toBe(true);
  });

  test('does not match an unrelated path, and tolerates a missing one', () => {
    const { cli } = linkedCli();

    expect(isEntryPath(join(cli, '..', 'other.js'), cli)).toBe(false);
    expect(isEntryPath(undefined, cli)).toBe(false);
  });
});
