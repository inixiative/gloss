import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setRepoDirectives } from '../src/comments';
import { loadRepoDirectives } from '../src/config';
import { setRepoExcludes } from '../src/git';
import { lintPaths } from '../src/lint';

const MARKED_FILE = '/**\n * @codemap\n * kind: service\n */\nexport const value = 1;\n';

const makeRepo = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-config-'));
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content, 'utf8');
  }
  return root;
};

describe('loadRepoDirectives', () => {
  const roots: string[] = [];
  const repo = (files: Record<string, string>): string => {
    const root = makeRepo(files);
    roots.push(root);
    return root;
  };

  afterEach(() => {
    setRepoDirectives([]);
  });

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  test('without config a repo-specific machine comment is harvestable', () => {
    const root = repo({ 'src/service.ts': MARKED_FILE });
    loadRepoDirectives(root);

    expect(lintPaths(root).map((violation) => violation.kind)).toEqual(['forbiddenComment']);
  });

  test('a configured pattern classifies the comment as a directive', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { directives: ['@codemap\\b'] } }),
      'src/service.ts': MARKED_FILE,
    });
    loadRepoDirectives(root);

    expect(lintPaths(root)).toEqual([]);
  });

  test('a missing package.json or missing key loads nothing', () => {
    loadRepoDirectives(repo({ 'src/empty.ts': 'export const value = 1;\n' }));
    loadRepoDirectives(repo({ 'package.json': JSON.stringify({ name: 'x' }) }));
  });

  test('a non-array value throws', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { directives: '@atlas' } }),
    });

    expect(() => loadRepoDirectives(root)).toThrow('must be an array');
  });

  test('a non-string entry throws with its index', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { directives: [7] } }),
    });

    expect(() => loadRepoDirectives(root)).toThrow('entry 0 is not a string');
  });

  test('an invalid regular expression throws rather than silently declassifying', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { directives: ['('] } }),
    });

    expect(() => loadRepoDirectives(root)).toThrow('not a valid regular expression');
  });

  test('malformed package.json throws', () => {
    const root = repo({ 'package.json': '{ not json' });

    expect(() => loadRepoDirectives(root)).toThrow('not valid JSON');
  });
});

describe('gloss.exclude', () => {
  const roots: string[] = [];
  const repo = (files: Record<string, string>): string => {
    const root = makeRepo(files);
    roots.push(root);
    return root;
  };

  const HARVESTABLE = '// a plain comment\nexport const value = 1;\n';

  afterEach(() => {
    setRepoDirectives([]);
    setRepoExcludes([]);
  });

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  test('an excluded directory is not enumerated even though git tracks it', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { exclude: ['vendor/skills'] } }),
      'vendor/skills/example.ts': HARVESTABLE,
      'src/service.ts': HARVESTABLE,
    });
    loadRepoDirectives(root);

    expect(lintPaths(root).map((violation) => violation.sourcePath)).toEqual(['src/service.ts']);
  });

  test('a trailing slash and a leading ./ normalize to the same prefix', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { exclude: ['./vendor/skills/'] } }),
      'vendor/skills/example.ts': HARVESTABLE,
    });
    loadRepoDirectives(root);

    expect(lintPaths(root)).toEqual([]);
  });

  test('a prefix stops at the path segment boundary', () => {
    const root = repo({
      'package.json': JSON.stringify({ gloss: { exclude: ['vendor/skill'] } }),
      'vendor/skills/example.ts': HARVESTABLE,
    });
    loadRepoDirectives(root);

    expect(lintPaths(root).map((violation) => violation.sourcePath)).toEqual([
      'vendor/skills/example.ts',
    ]);
  });

  test('a non-array value throws', () => {
    const root = repo({ 'package.json': JSON.stringify({ gloss: { exclude: 'vendor' } }) });

    expect(() => loadRepoDirectives(root)).toThrow('gloss.exclude');
  });

  test('a non-string entry throws with its index', () => {
    const root = repo({ 'package.json': JSON.stringify({ gloss: { exclude: [7] } }) });

    expect(() => loadRepoDirectives(root)).toThrow('entry 0 is not a string');
  });

  test('an empty entry throws rather than excluding the whole repo', () => {
    const root = repo({ 'package.json': JSON.stringify({ gloss: { exclude: ['  '] } }) });

    expect(() => loadRepoDirectives(root)).toThrow('entry 0 is empty');
  });
});
