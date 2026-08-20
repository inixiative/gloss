import { afterAll, afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setRepoDirectives } from '../src/comments';
import { loadRepoDirectives } from '../src/config';
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
