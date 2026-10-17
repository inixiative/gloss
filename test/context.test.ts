import { afterEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  findGlossRoot,
  glossContextForGrep,
  glossContextForRead,
  identifierToken,
  locateGlossFile,
} from '../src/context';
import { commitFiles, createRepo, destroyRepo, writeFiles } from './tempRepo';

const SOURCE = 'src/cache.ts';
const MIRROR = '.gloss/src/cache.ts.md';

const SOURCE_TEXT = ['// gloss', 'export const cacheKey = (id: string) => id;', ''].join('\n');

const MIRROR_TEXT = [
  '# src/cache.ts',
  '',
  '## cacheKey',
  '',
  '',
  'Keys are namespaced by tenant so a flush never crosses owners.',
  '',
].join('\n');

const repos: string[] = [];

const glossedRepo = (): string => {
  const repoRoot = realpathSync(createRepo());
  repos.push(repoRoot);
  commitFiles(
    repoRoot,
    { [SOURCE]: SOURCE_TEXT, [MIRROR]: MIRROR_TEXT },
    'add cache',
    '2026-10-01T00:00:00Z',
  );
  return repoRoot;
};

afterEach(() => {
  while (repos.length > 0) {
    const repoRoot = repos.pop();
    if (repoRoot) destroyRepo(repoRoot);
  }
});

describe('findGlossRoot / locateGlossFile', () => {
  test('walks up from a nested file to the directory holding .gloss', () => {
    const repoRoot = glossedRepo();

    expect(findGlossRoot(join(repoRoot, 'src'))).toBe(repoRoot);
    expect(locateGlossFile(join(repoRoot, SOURCE))).toEqual({ repoRoot, relPath: SOURCE });
  });

  test('finds nothing outside a glossed tree', () => {
    const plain = realpathSync(mkdtempSync(join(tmpdir(), 'gloss-plain-')));
    repos.push(plain);

    expect(locateGlossFile(join(plain, 'x.ts'))).toBeUndefined();
  });
});

describe('glossContextForRead', () => {
  test('renders the margin with its staleness and the command that re-prints it', () => {
    const repoRoot = glossedRepo();
    const context = glossContextForRead(repoRoot, SOURCE);

    expect(context).toStartWith(
      `gloss for ${SOURCE} (margin commentary; \`bunx gloss read ${SOURCE} [symbol]\``,
    );
    expect(context).toContain('## cacheKey  — written 2026-10-01, source unchanged since');
    expect(context).toContain('Keys are namespaced by tenant');
  });

  test('says nothing for a file with no margin', () => {
    const repoRoot = glossedRepo();
    writeFiles(repoRoot, { 'src/plain.ts': 'export const plain = 1;\n' });

    expect(glossContextForRead(repoRoot, 'src/plain.ts')).toBeUndefined();
  });
});

describe('identifierToken', () => {
  test('picks the longest identifier-shaped run of a regex', () => {
    expect(identifierToken('cacheKey\\(')).toBe('cacheKey');
    expect(identifierToken('async function (handleWebhook|retry)')).toBe('handleWebhook');
  });

  test('rejects patterns with no identifier of useful length', () => {
    expect(identifierToken('foo|ba')).toBeUndefined();
    expect(identifierToken('\\d+')).toBeUndefined();
  });
});

describe('glossContextForGrep', () => {
  test('lists the sections whose symbol matches, with the first body line', () => {
    const repoRoot = glossedRepo();
    const context = glossContextForGrep(repoRoot, 'cachekey\\(');

    expect(context).toBe(
      [
        'gloss sections whose symbol matches "cachekey" (`bunx gloss read <file> <symbol>` prints one in full):',
        `  ${SOURCE} → cacheKey: Keys are namespaced by tenant so a flush never crosses owners.`,
      ].join('\n'),
    );
  });

  test('caps the hits and truncates long snippets', () => {
    const repoRoot = glossedRepo();
    const sections = Array.from({ length: 12 }, (_, index) => [
      `## widgetHandler${index}`,
      '',
      'x'.repeat(200),
      '',
    ]).flat();
    writeFiles(repoRoot, {
      '.gloss/src/widgets.ts.md': ['# src/widgets.ts', '', ...sections].join('\n'),
    });
    const lines = glossContextForGrep(repoRoot, 'widgetHandler')?.split('\n') ?? [];

    expect(lines).toHaveLength(9);
    expect(lines[1]).toBe(`  src/widgets.ts → widgetHandler0: ${'x'.repeat(160)}…`);
  });

  test('ignores headings inside fenced code and says nothing without a hit', () => {
    const repoRoot = glossedRepo();
    writeFiles(repoRoot, {
      '.gloss/src/fenced.ts.md': ['# src/fenced.ts', '', '```', '## fencedSymbol', '```', ''].join(
        '\n',
      ),
    });

    expect(glossContextForGrep(repoRoot, 'fencedSymbol')).toBeUndefined();
    expect(glossContextForGrep(repoRoot, 'nothingMatches')).toBeUndefined();
  });
});
