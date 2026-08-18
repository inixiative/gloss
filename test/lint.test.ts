import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { lintPaths, lintSource } from '../src/lint';
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

  test('why lines, directives and well-formed daggers yield nothing', () => {
    expect(lintFixture('markers.ts')).toEqual([]);
    expect(lintFixture('directives.ts')).toEqual([]);
    expect(lintFixture('fileMarker.ts')).toEqual([]);
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
    'src/clean.ts': '// why: load bearing\nexport const clean = 3;\n',
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
    ]);
  });

  test('honours explicit paths', () => {
    expect(lintPaths(root, ['src/clean.ts'])).toEqual([]);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
});
