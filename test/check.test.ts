import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { checkFile, checkRepo } from '../src/check';
import type { CheckViolation } from '../src/types';

const roots: string[] = [];

const makeRepo = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-check-'));
  roots.push(root);
  for (const [relPath, contents] of Object.entries(files)) {
    const absolute = join(root, relPath);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, contents, 'utf8');
  }
  return root;
};

const kinds = (violations: CheckViolation[]): string[] =>
  violations.map((violation) => violation.kind);

const only = (violations: CheckViolation[]): CheckViolation => {
  expect(violations).toHaveLength(1);
  return violations[0];
};

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('dagger without section', () => {
  test('a marked symbol with no mirror at all is reported at the marker line', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const before = 1;\n\n// gloss\nexport const widget = 2;\n',
    });

    const violation = only(checkRepo(root));

    expect(violation.kind).toBe('markerWithoutSection');
    expect(violation.sourcePath).toBe('src/widget.ts');
    expect(violation.symbol).toBe('widget');
    expect(violation.line).toBe(3);
    expect(violation.message).toContain('.gloss/src/widget.ts.md');
  });

  test('a marked symbol missing from an existing mirror is reported', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## other\n\nnote\n',
    });

    expect(kinds(checkRepo(root))).toEqual(['markerWithoutSection', 'sectionWithoutMarker']);
  });
});

describe('section without dagger', () => {
  test('a section whose symbol exists but lost its dagger says so', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## widget\n\nnote\n',
    });

    const violation = only(checkFile(root, 'src/widget.ts'));

    expect(violation.kind).toBe('sectionWithoutMarker');
    expect(violation.symbol).toBe('widget');
    expect(violation.line).toBe(1);
    expect(violation.message).toContain('carries no');
  });

  test('a section naming no symbol at all reads as a rename or removal', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## gone\n\nnote\n',
    });

    const violation = only(checkFile(root, 'src/widget.ts'));

    expect(violation.kind).toBe('sectionWithoutMarker');
    expect(violation.symbol).toBe('gone');
    expect(violation.line).toBeUndefined();
    expect(violation.message).toContain('names no symbol');
  });
});

describe('file marker and preamble', () => {
  test('a file marker with an empty mirror preamble is reported at the marker line', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss:file\n\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n',
    });

    const violation = only(checkFile(root, 'src/widget.ts'));

    expect(violation.kind).toBe('fileMarkerWithoutPreamble');
    expect(violation.line).toBe(1);
  });

  test('a preamble with no file marker is reported', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\nWhy this module exists.\n',
    });

    const violation = only(checkFile(root, 'src/widget.ts'));

    expect(violation.kind).toBe('preambleWithoutFileMarker');
    expect(violation.message).toContain('// gloss:file');
  });

  test('a file marker paired with a preamble is clean', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss:file\n\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\nWhy this module exists.\n',
    });

    expect(checkRepo(root)).toEqual([]);
  });
});

describe('header path', () => {
  test('a mirror h1 naming another file is reported', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/other.ts\n\n## widget\n\nnote\n',
    });

    const violation = only(checkFile(root, 'src/widget.ts'));

    expect(violation.kind).toBe('headerPathMismatch');
    expect(violation.message).toContain('# src/other.ts');
    expect(violation.message).toContain('src/widget.ts');
  });

  test('a leading ./ in the h1 still matches', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# ./src/widget.ts\n\n## widget\n\nnote\n',
    });

    expect(checkRepo(root)).toEqual([]);
  });
});

describe('orphans and ignored gloss entries', () => {
  test('a gloss file whose source is gone is an orphan', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      '.gloss/src/widget.ts.md': '# src/widget.ts\n\n## widget\n\nnote\n',
      '.gloss/src/gone.ts.md': '# src/gone.ts\n\n## gone\n\nnote\n',
    });

    const violation = only(checkRepo(root));

    expect(violation.kind).toBe('orphanGlossFile');
    expect(violation.sourcePath).toBe('src/gone.ts');
    expect(violation.message).toContain('.gloss/src/gone.ts.md');
  });

  test('the .gloss README and dotfiles are not orphans', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const widget = 1;\n',
      '.gloss/README.md': '# .gloss\n\nMargin commentary.\n',
      '.gloss/.gitignore': '*.tmp\n',
      '.gloss/.events.jsonl': '{"kind":"harvest"}\n',
    });

    expect(checkRepo(root)).toEqual([]);
  });
});

describe('the walk', () => {
  test('an unglossed source file needs no gloss', () => {
    const root = makeRepo({
      'src/widget.ts': 'export const widget = 1;\n\nexport const other = () => widget;\n',
    });

    expect(checkRepo(root)).toEqual([]);
  });

  test('node_modules, dist and fixtures are skipped', () => {
    const root = makeRepo({
      'node_modules/pkg/index.ts': '// gloss\nexport const vendored = 1;\n',
      'dist/index.ts': '// gloss\nexport const built = 1;\n',
      'test/fixtures/sample.ts': '// gloss\nexport const fixture = 1;\n',
      'src/widget.ts': 'export const widget = 1;\n',
    });

    expect(checkRepo(root)).toEqual([]);
  });

  test('paths narrow the walk and the orphan scan', () => {
    const root = makeRepo({
      'src/widget.ts': '// gloss\nexport const widget = 1;\n',
      'lib/tool.ts': '// gloss\nexport const tool = 1;\n',
      '.gloss/lib/gone.ts.md': '# lib/gone.ts\n\n## gone\n\nnote\n',
    });

    expect(kinds(checkRepo(root, ['src']))).toEqual(['markerWithoutSection']);
    expect(kinds(checkRepo(root, ['lib']))).toEqual(['markerWithoutSection', 'orphanGlossFile']);
  });
});

describe('resolver errors', () => {
  test('a resolver error surfaces as a violation carrying the resolver message', () => {
    const root = makeRepo({ 'src/widget.ts': '// gloss\n\nexport const detached = 1;\n' });

    const violation = only(checkRepo(root));

    expect(violation.kind).toBe('resolverError');
    expect(violation.line).toBe(1);
    expect(violation.message).toContain('// gloss');
  });
});
