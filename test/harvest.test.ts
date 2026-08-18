import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { harvestPaths, harvestSource, sourceFilesUnder } from '../src/harvest';
import { parseSource } from '../src/resolver';
import type { GlossDoc } from '../src/types';
import { readFixture } from './fixture';

const HARVEST_FIXTURES = [
  'harvest.ts',
  'harvestBlock.ts',
  'harvestDecorated.ts',
  'harvestFileLevel.ts',
  'component.tsx',
  'markers.ts',
  'symbols.ts',
];

const harvestFixture = (name: string, existingGloss?: GlossDoc) =>
  harvestSource(`test/fixtures/${name}`, readFixture(name), existingGloss, `test/fixtures/${name}`);

const sectionBody = (doc: GlossDoc, symbol: string): string => {
  const found = doc.sections.find((section) => section.symbol === symbol);
  if (!found) throw new Error(`no section for ${symbol}`);
  return found.body;
};

const harvestableCount = (filePath: string, sourceText: string): number =>
  parseSource(filePath, sourceText).comments.filter((comment) => comment.kind === 'harvestable')
    .length;

const REPO_FILES: Record<string, string> = {
  'src/demo.ts': [
    'export function compute(total: number) {',
    '  // doubles the total',
    '  return total * 2;',
    '}',
    '',
  ].join('\n'),
  'src/fixtures/sample.ts': '// left alone in a fixtures directory\nexport const sample = 1;\n',
  'src/notes.md': '# not a source file\n',
  'node_modules/pkg/index.ts': '// left alone in node_modules\nexport const dep = 1;\n',
  'dist/out.ts': '// left alone in dist\nexport const built = 1;\n',
  '.gloss/scratch.ts': '// left alone in the gloss mirror\nexport const scratch = 1;\n',
};

const SKIPPED_FILES = Object.keys(REPO_FILES).filter((file) => file !== 'src/demo.ts');

const HARVESTED_DEMO = [
  '// gloss',
  'export function compute(total: number) {',
  '  return total * 2;',
  '}',
  '',
].join('\n');

const HARVESTED_DEMO_GLOSS = [
  '# src/demo.ts',
  '',
  '## compute',
  '',
  '> `return total * 2;`',
  '',
  'doubles the total',
  '',
].join('\n');

const roots: string[] = [];

const makeRepo = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-harvest-'));
  roots.push(root);
  for (const [file, content] of Object.entries(REPO_FILES)) {
    const path = join(root, file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }
  return root;
};

const readRepoFile = (root: string, file: string): string => readFileSync(join(root, file), 'utf8');

const eventLines = (root: string): string[] =>
  readRepoFile(root, '.gloss/.events.jsonl').trimEnd().split('\n');

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

describe('harvestSource', () => {
  const harvested = harvestFixture('harvest.ts');

  test('a comment inside a body lands under the enclosing symbol', () => {
    expect(sectionBody(harvested.gloss, 'compute')).toBe(
      '> `return total * 2;`\n\nthis note lives inside the body',
    );
  });

  test('a comment above a declaration lands under that declaration', () => {
    expect(sectionBody(harvested.gloss, 'rate')).toBe(
      '> `export const rate = 0.5;`\n\nthis note sits above the declaration',
    );
  });

  test('a trailing comment keeps its anchor and leaves the code on the line', () => {
    expect(sectionBody(harvested.gloss, 'seed')).toBe(
      '> `const seed = 1;`\n\ntrailing note on a code line',
    );
    expect(harvested.cleanSource).toContain('\n// gloss\nconst seed = 1;\n');
    expect(harvested.cleanSource).not.toContain('trailing note');
  });

  test('a file-level comment becomes the preamble', () => {
    expect(harvested.gloss.preamble).toBe(
      '> `console.log(rate);`\n\nstray note between statements',
    );
  });

  test('every harvested comment is reported in source order', () => {
    expect(harvested.moved.map((hit) => hit.startLine)).toEqual([2, 6, 9, 12]);
  });

  test('a new gloss records the source path', () => {
    expect(harvested.gloss.sourcePath).toBe('test/fixtures/harvest.ts');
  });

  test('daggers are planted above each glossed declaration', () => {
    expect(harvested.cleanSource).toBe(
      [
        '// gloss:file',
        '',
        '// gloss',
        'export function compute(total: number) {',
        '  return total * 2;',
        '}',
        '',
        '// gloss',
        'export const rate = 0.5;',
        '',
        '// gloss',
        'const seed = 1;',
        '',
        'console.log(seed);',
        'console.log(rate);',
        '',
      ].join('\n'),
    );
  });

  test('the file dagger is planted after the shebang and the license block', () => {
    const result = harvestFixture('harvestFileLevel.ts');

    expect(result.gloss.preamble).toBe(
      "> `console.log('demo');`\n\nthis file is the entry point for the demo",
    );
    expect(result.cleanSource).toBe(
      [
        '#!/usr/bin/env bun',
        '// SPDX-License-Identifier: MIT',
        '',
        '// gloss:file',
        '',
        "console.log('demo');",
        '',
      ].join('\n'),
    );
  });

  test('a dagger sits above the decorators at the declaration indentation', () => {
    const result = harvestFixture('harvestDecorated.ts');

    expect(sectionBody(result.gloss, 'Panel.render')).toBe(
      '> `return thing;`\n\nrenders the panel straight from thing',
    );
    expect(result.cleanSource).toBe(
      [
        "import { thing } from './thing';",
        '',
        'export class Panel {',
        '  // gloss',
        '  @observable',
        '  render() {',
        '    return thing;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  test('a block comment is unwrapped from its gutters and its lines are removed', () => {
    const result = harvestFixture('harvestBlock.ts');

    expect(sectionBody(result.gloss, 'build')).toBe(
      '> `export function build() {`\n\nBuilds the widget.\nTwice as fast as the old builder.',
    );
    expect(result.cleanSource).toBe(
      ['// gloss', 'export function build() {', '  return 2;', '}', ''].join('\n'),
    );
  });

  test('consecutive comment lines land as one entry under one anchor', () => {
    const result = harvestSource(
      'inline.ts',
      [
        '// first line of the note',
        '// second line of the note',
        'export const value = 1;',
        '',
      ].join('\n'),
      undefined,
      'src/inline.ts',
    );

    expect(sectionBody(result.gloss, 'value')).toBe(
      '> `export const value = 1;`\n\nfirst line of the note\nsecond line of the note',
    );
    expect(result.moved).toHaveLength(2);
    expect(result.cleanSource).toBe('// gloss\nexport const value = 1;\n');
  });

  test('an anchor containing backticks gets a wider code fence', () => {
    const result = harvestSource(
      'inline.ts',
      ['// the note', 'export const label = `a b`;', ''].join('\n'),
      undefined,
      'src/inline.ts',
    );

    expect(sectionBody(result.gloss, 'label')).toBe(
      '> ``export const label = `a b`;``\n\nthe note',
    );
  });

  test('an anchor that starts or ends with a backtick is padded inside its fence', () => {
    const result = harvestSource(
      'inline.ts',
      ['const value = cond', '  // the note', '    ? `left`', '    : `right`;', ''].join('\n'),
      undefined,
      'src/inline.ts',
    );

    expect(sectionBody(result.gloss, 'value')).toBe('> `` ? `left` ``\n\nthe note');
  });

  test('a mid-line block comment is excised in place', () => {
    const result = harvestSource(
      'inline.ts',
      'export const size = /* the note */ 2;\n',
      undefined,
      'src/inline.ts',
    );

    expect(result.cleanSource).toBe('// gloss\nexport const size =  2;\n');
    expect(harvestableCount('inline.ts', result.cleanSource)).toBe(0);
  });

  test('a jsx comment leaves an empty expression container behind', () => {
    const result = harvestFixture('component.tsx');

    expect(result.moved).toHaveLength(1);
    expect(result.cleanSource).toContain('      {}\n');
    expect(harvestableCount('test/fixtures/component.tsx', result.cleanSource)).toBe(0);
  });

  test('an existing section is appended to and its dagger is not duplicated', () => {
    const existing: GlossDoc = {
      sourcePath: 'src/inline.ts',
      preamble: '',
      sections: [{ symbol: 'rate', body: 'Prior note.' }],
    };
    const result = harvestSource(
      'inline.ts',
      ['// gloss', '// a fresh note about the rate', 'export const rate = 0.5;', ''].join('\n'),
      existing,
      'src/inline.ts',
    );

    expect(sectionBody(result.gloss, 'rate')).toBe(
      'Prior note.\n\n> `export const rate = 0.5;`\n\na fresh note about the rate',
    );
    expect(result.gloss.sections).toHaveLength(1);
    expect(result.cleanSource).toBe('// gloss\nexport const rate = 0.5;\n');
  });

  test('an existing preamble keeps its text and gets the missing file dagger', () => {
    const existing: GlossDoc = {
      sourcePath: 'src/inline.ts',
      preamble: 'Existing preamble.',
      sections: [],
    };
    const result = harvestSource(
      'inline.ts',
      'export const rate = 0.5;\n',
      existing,
      'src/inline.ts',
    );

    expect(result.moved).toEqual([]);
    expect(result.gloss.preamble).toBe('Existing preamble.');
    expect(result.cleanSource).toBe('// gloss:file\n\nexport const rate = 0.5;\n');
  });

  test('a file marker already present is not planted twice', () => {
    const result = harvestSource(
      'inline.ts',
      [
        '// gloss:file',
        '',
        "console.log('one');",
        '// a stray note',
        "console.log('two');",
        '',
      ].join('\n'),
      undefined,
      'src/inline.ts',
    );

    expect(result.gloss.preamble).toContain('a stray note');
    expect(result.cleanSource).toBe(
      ['// gloss:file', '', "console.log('one');", "console.log('two');", ''].join('\n'),
    );
  });

  test('why lines, directives and daggers are left alone', () => {
    const result = harvestFixture('markers.ts');

    expect(result.moved).toEqual([]);
    expect(result.cleanSource).toBe(readFixture('markers.ts'));
    expect(result.gloss.sections).toEqual([]);
  });

  test('a file whose markers are malformed is returned unchanged', () => {
    const result = harvestFixture('harvestBlocked.ts');

    expect(result.moved).toEqual([]);
    expect(result.cleanSource).toBe(readFixture('harvestBlocked.ts'));
    expect(result.gloss.sections).toEqual([]);
    expect(result.gloss.preamble).toBe('');
  });

  test.each(HARVEST_FIXTURES)('%s: the clean source keeps no harvestable comment', (name) => {
    const result = harvestFixture(name);

    expect(harvestableCount(`test/fixtures/${name}`, result.cleanSource)).toBe(0);
    expect(parseSource(`test/fixtures/${name}`, result.cleanSource).errors).toEqual([]);
  });

  test.each(HARVEST_FIXTURES)('%s: harvesting is idempotent', (name) => {
    const first = harvestFixture(name);
    const second = harvestSource(
      `test/fixtures/${name}`,
      first.cleanSource,
      first.gloss,
      `test/fixtures/${name}`,
    );

    expect(second.moved).toEqual([]);
    expect(second.cleanSource).toBe(first.cleanSource);
    expect(second.gloss).toEqual(first.gloss);
  });
});

describe('sourceFilesUnder', () => {
  test('walks source files and skips node_modules, dist, the mirror and fixtures', () => {
    const root = makeRepo();

    expect(sourceFilesUnder(root)).toEqual(['src/demo.ts']);
  });

  test('honours explicit paths', () => {
    const root = makeRepo();

    expect(sourceFilesUnder(root, ['src'])).toEqual(['src/demo.ts']);
    expect(sourceFilesUnder(root, ['src/demo.ts'])).toEqual(['src/demo.ts']);
    expect(sourceFilesUnder(root, ['dist'])).toEqual([]);
  });
});

describe('harvestPaths', () => {
  test('rewrites the source, writes the mirror and logs one event per changed file', () => {
    const root = makeRepo();

    expect(harvestPaths(root)).toEqual([{ file: 'src/demo.ts', moved: 1 }]);
    expect(readRepoFile(root, 'src/demo.ts')).toBe(HARVESTED_DEMO);
    expect(readRepoFile(root, '.gloss/src/demo.ts.md')).toBe(HARVESTED_DEMO_GLOSS);
  });

  test('appends one valid json event line and gitignores the event log', () => {
    const root = makeRepo();
    harvestPaths(root);

    const lines = eventLines(root);

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toEqual({
      file: 'src/demo.ts',
      symbols: ['compute'],
      movedComments: 1,
      ts: expect.any(String),
    });
    expect(readRepoFile(root, '.gloss/.gitignore')).toContain('.events.jsonl');
  });

  test('leaves skipped directories untouched', () => {
    const root = makeRepo();
    harvestPaths(root);

    for (const file of SKIPPED_FILES) expect(readRepoFile(root, file)).toBe(REPO_FILES[file]);
  });

  test('a second run writes nothing new', () => {
    const root = makeRepo();
    harvestPaths(root);
    const source = readRepoFile(root, 'src/demo.ts');
    const gloss = readRepoFile(root, '.gloss/src/demo.ts.md');

    expect(harvestPaths(root)).toEqual([]);
    expect(readRepoFile(root, 'src/demo.ts')).toBe(source);
    expect(readRepoFile(root, '.gloss/src/demo.ts.md')).toBe(gloss);
    expect(eventLines(root)).toHaveLength(1);
  });
});
