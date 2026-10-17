import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DEFAULT_WHY_MAX_LENGTH, lintPaths, lintSource, setWhyMaxLength } from '../src/lint';
import type { LintViolation } from '../src/types';
import { readFixture } from './fixture';

const lintFixture = (name: string): LintViolation[] =>
  lintSource(`test/fixtures/${name}`, readFixture(name));

const kindsAt = (violations: LintViolation[]): [number, string][] =>
  violations.map((violation) => [violation.line, violation.kind]);

describe('lintSource', () => {
  test('every harvestable comment is a forbidden comment on its own line', () => {
    const violations = lintFixture('harvest.ts');

    expect(kindsAt(violations)).toEqual([
      [2, 'forbiddenComment'],
      [6, 'forbiddenComment'],
      [9, 'forbiddenComment'],
      [12, 'forbiddenComment'],
    ]);
    expect(
      violations.every((violation) => violation.sourcePath === 'test/fixtures/harvest.ts'),
    ).toBe(true);
  });

  test('the message names the enclosing symbol and the harvester command', () => {
    const violations = lintFixture('harvest.ts');

    expect(violations[0].message).toContain("comment on 'compute'");
    expect(violations[0].message).toContain('relocates it into the gloss');
    expect(violations[0].message).toContain('run: gloss harvest test/fixtures/harvest.ts');
  });

  test('a comment with no enclosing symbol is reported against the file', () => {
    const violations = lintFixture('harvest.ts');

    expect(violations[3].message).toContain('comment on this file');
  });

  test('every resolver error kind surfaces as its own violation kind', () => {
    const violations = lintFixture('markerErrors.ts');

    expect(kindsAt(violations)).toEqual([
      [1, 'danglingMarker'],
      [5, 'danglingMarker'],
      [9, 'stackedMarkers'],
      [14, 'multiDeclaratorMarker'],
      [18, 'markerTrailingContent'],
      [23, 'danglingMarker'],
      [25, 'danglingMarker'],
    ]);
  });

  test('forbidden comments and marker errors interleave by line', () => {
    expect(kindsAt(lintFixture('harvestBlocked.ts'))).toEqual([
      [1, 'markerTrailingContent'],
      [3, 'forbiddenComment'],
    ]);
  });

  test('directives and well-formed daggers yield nothing', () => {
    expect(lintFixture('directives.ts')).toEqual([]);
    expect(lintFixture('fileMarker.ts')).toEqual([]);
  });

  test('a one-line why, own-line or trailing, yields nothing', () => {
    expect(lintFixture('markers.ts')).toEqual([]);
    expect(lintSource('inline.ts', 'export const a = 1; // why: wire format is fixed\n')).toEqual(
      [],
    );
    expect(
      lintSource('inline.ts', '/* why: block form, one line */\nexport const a = 1;\n'),
    ).toEqual([]);
  });

  test('a why spanning several lines is flagged once, at its first line', () => {
    const source = [
      'export function flush() {',
      '  // why: the fsync must finish before we return:',
      '  // why: callers treat a return as a durable ack.',
      '  return 1;',
      '}',
      '',
    ].join('\n');
    const violations = lintSource('src/flush.ts', source);

    expect(kindsAt(violations)).toEqual([[2, 'longWhy']]);
    expect(violations[0].message).toContain('spans 2 lines');
    expect(violations[0].message).toContain("the 'flush' gloss section");
  });

  test('a multi-line block why is flagged', () => {
    const source = '/* why: first line\n   second line */\nexport const a = 1;\n';

    expect(kindsAt(lintSource('src/a.ts', source))).toEqual([[1, 'longWhy']]);
  });

  test('a plain comment continuing a why is flagged as its overflow', () => {
    const source = '// why: one reason\n// and three more paragraphs\nexport const a = 1;\n';
    const violations = lintSource('src/a.ts', source);

    expect(kindsAt(violations)).toEqual([[2, 'longWhy']]);
    expect(violations[0].message).toContain("continues the '// why:' on line 1");
  });

  test('a why longer than the limit is flagged; the limit is configurable', () => {
    const long = `// why: ${'x'.repeat(DEFAULT_WHY_MAX_LENGTH)}\nexport const a = 1;\n`;
    const atLimit = `// why: ${'x'.repeat(DEFAULT_WHY_MAX_LENGTH - 8)}\nexport const a = 1;\n`;

    expect(kindsAt(lintSource('src/a.ts', long))).toEqual([[1, 'longWhy']]);
    expect(lintSource('src/a.ts', long)[0]?.message).toContain(`limit ${DEFAULT_WHY_MAX_LENGTH}`);
    expect(lintSource('src/a.ts', atLimit)).toEqual([]);

    setWhyMaxLength(20);
    try {
      expect(kindsAt(lintSource('src/a.ts', atLimit))).toEqual([[1, 'longWhy']]);
    } finally {
      setWhyMaxLength();
    }
  });

  test('a comment-free file yields nothing', () => {
    expect(lintSource('inline.ts', 'export const value = 1;\n')).toEqual([]);
    expect(lintFixture('symbols.ts')).toEqual([]);
  });
});

describe('lintPaths', () => {
  const files: Record<string, string> = {
    'src/one.ts': '// a note above the value\nexport const one = 1;\n',
    'src/two.ts': '// gloss: trailing\nexport const two = 2;\n',
    'src/clean.ts': '// gloss\nexport const clean = 3;\n',
    'src/why.ts': '// why: load bearing\n// and a second line\nexport const why = 3;\n',
    'src/fixtures/skipped.ts': '// skipped note\nexport const skipped = 4;\n',
    'node_modules/pkg/index.ts': '// skipped note\nexport const dep = 5;\n',
  };

  const root = mkdtempSync(join(tmpdir(), 'gloss-lint-'));

  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content, 'utf8');
  }

  test('lints the walked tree and reports repo-relative paths', () => {
    const violations = lintPaths(root);

    expect(violations.map((violation) => [violation.sourcePath, violation.kind])).toEqual([
      ['src/one.ts', 'forbiddenComment'],
      ['src/two.ts', 'markerTrailingContent'],
      ['src/why.ts', 'longWhy'],
    ]);
  });

  test('honours explicit paths', () => {
    expect(lintPaths(root, ['src/clean.ts'])).toEqual([]);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});
