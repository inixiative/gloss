import { afterAll, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkRepo } from '../src/check';
import { fixRepo } from '../src/fix';

const roots: string[] = [];

const makeRepo = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-fix-'));
  roots.push(root);
  for (const [relPath, contents] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return root;
};

const readRepoFile = (root: string, relPath: string): string =>
  readFileSync(join(root, relPath), 'utf8');

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('renameSection', () => {
  test('one stranded section and one bare marker re-pair', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const renamedWidget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## widget\n\nThe widget note.\n',
    });

    expect(checkRepo(root)).toHaveLength(2);

    const actions = fixRepo(root);

    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('renameSection');
    expect(actions[0].detail).toContain('## widget');
    expect(actions[0].detail).toContain('## renamedWidget');
    expect(actions[0].detail).toContain('src/widget.ts:1');

    const mirror = readRepoFile(root, '.gloss/src/widget.ts.md');

    expect(mirror).toContain('## renamedWidget');
    expect(mirror).not.toContain('## widget');
    expect(mirror).toContain('The widget note.');
    expect(checkRepo(root)).toEqual([]);
  });

  test('two bare markers and two stranded sections are too ambiguous to touch', () => {
    const mirror = '# src/widget.ts\n\n## alpha\n\nA note.\n\n## beta\n\nB note.\n';
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const one = 1;\n\n// gloss\nexport const two = 2;\n',
      '.gloss/src/widget.ts.md': mirror,
    });

    expect(fixRepo(root)).toEqual([]);
    expect(readRepoFile(root, '.gloss/src/widget.ts.md')).toBe(mirror);
    expect(checkRepo(root)).toHaveLength(4);
  });

  test('a stranded section alone is left for a human', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## widget\n\nnote\n\n## gone\n\nold note\n',
    });

    expect(fixRepo(root)).toEqual([]);
  });
});

describe('moveGlossFile', () => {
  test('a git mv without the paired mirror move is healed', () => {
    const root = makeRepo({
      'src/new/widget.ts':
        '// gloss\nexport const alpha = 1;\n\n// gloss\nexport const beta = 2;\n',
      '.gloss/src/old/widget.ts.md':
        '# src/old/widget.ts\n\n## alpha\n\nAlpha note.\n\n## beta\n\nBeta note.\n',
    });

    const actions = fixRepo(root);

    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('moveGlossFile');
    expect(actions[0].detail).toContain('.gloss/src/old/widget.ts.md');
    expect(actions[0].detail).toContain('.gloss/src/new/widget.ts.md');
    expect(existsSync(join(root, '.gloss/src/old/widget.ts.md'))).toBe(false);

    const mirror = readRepoFile(root, '.gloss/src/new/widget.ts.md');

    expect(mirror.startsWith('# src/new/widget.ts\n')).toBe(true);
    expect(mirror).toContain('Alpha note.');
    expect(mirror).toContain('Beta note.');
    expect(checkRepo(root)).toEqual([]);
  });

  test('two candidate sources with the same marker set are a tie', () => {
    const root = makeRepo({
      'src/a.ts': '// gloss\nexport const alpha = 1;\n',
      'src/b.ts': '// gloss\nexport const alpha = 1;\n',
      '.gloss/src/old.ts.md': '# src/old.ts\n\n## alpha\n\nAlpha note.\n',
    });

    expect(fixRepo(root)).toEqual([]);
    expect(existsSync(join(root, '.gloss/src/old.ts.md'))).toBe(true);
  });

  test('two orphans matching one source are a tie', () => {
    const root = makeRepo({
      'src/a.ts': '// gloss\nexport const alpha = 1;\n',
      '.gloss/src/old.ts.md': '# src/old.ts\n\n## alpha\n\nOne note.\n',
      '.gloss/src/older.ts.md': '# src/older.ts\n\n## alpha\n\nAnother note.\n',
    });

    expect(fixRepo(root)).toEqual([]);
    expect(existsSync(join(root, '.gloss/src/old.ts.md'))).toBe(true);
    expect(existsSync(join(root, '.gloss/src/older.ts.md'))).toBe(true);
  });

  test('a source that already has a mirror is not a candidate', () => {
    const root = makeRepo({
      'src/a.ts': '// gloss\nexport const alpha = 1;\n',
      '.gloss/src/a.ts.md': '# src/a.ts\n\n## alpha\n\nAlpha note.\n',
      '.gloss/src/old.ts.md': '# src/old.ts\n\n## alpha\n\nStale note.\n',
    });

    expect(fixRepo(root)).toEqual([]);
    expect(readRepoFile(root, '.gloss/src/a.ts.md')).toContain('Alpha note.');
  });
});

describe('rewriteHeaderPath', () => {
  test('a mirror at the right path with the wrong h1 is rewritten', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/moved/widget.ts\n\n## widget\n\nThe widget note.\n',
    });

    const actions = fixRepo(root);

    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe('rewriteHeaderPath');
    expect(actions[0].detail).toContain('# src/moved/widget.ts');
    expect(actions[0].detail).toContain('# src/widget.ts');
    expect(readRepoFile(root, '.gloss/src/widget.ts.md').startsWith('# src/widget.ts\n')).toBe(
      true,
    );
    expect(checkRepo(root)).toEqual([]);
  });
});

describe('fixRepo as a whole', () => {
  test('a clean repo yields no actions', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss:file\n\n// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md':
        '# src/widget.ts\n\nWhy this module exists.\n\n## widget\n\nnote\n',
    });

    expect(checkRepo(root)).toEqual([]);
    expect(fixRepo(root)).toEqual([]);
  });

  test('a second run over a repaired repo does nothing', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const renamedAlpha = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## alpha\n\nAlpha note.\n',
    });

    expect(fixRepo(root).map((action) => action.kind)).toEqual(['renameSection']);

    const afterFirstRun = readRepoFile(root, '.gloss/src/widget.ts.md');

    expect(fixRepo(root)).toEqual([]);
    expect(readRepoFile(root, '.gloss/src/widget.ts.md')).toBe(afterFirstRun);
    expect(checkRepo(root)).toEqual([]);
  });

  test('fixing never leaves more violations than it found', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const renamedWidget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/other.ts\n\n## widget\n\nThe widget note.\n',
    });
    const before = checkRepo(root).length;

    const actions = fixRepo(root);

    expect(actions.map((action) => action.kind).sort()).toEqual([
      'renameSection',
      'rewriteHeaderPath',
    ]);
    expect(checkRepo(root).length).toBeLessThan(before);
    expect(checkRepo(root)).toEqual([]);
  });
});
