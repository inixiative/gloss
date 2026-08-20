import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { listSourceFiles } from '../src/check';
import { sourceFilesUnder } from '../src/harvest';
import { createRepo, destroyRepo, writeFiles } from './tempRepo';

const FILES = {
  '.gitignore': 'generated/\nsrc/client.gen.ts\n',
  'src/service.ts': 'export const service = 1;\n',
  'src/client.gen.ts': '// generated header\nexport const client = 2;\n',
  'generated/sdk.ts': '// generated header\nexport const sdk = 3;\n',
  'nested/generated/deep.ts': '// generated header\nexport const deep = 4;\n',
};

describe('gitignored files are excluded from enumeration', () => {
  const repoRoot = createRepo();
  writeFiles(repoRoot, FILES);

  afterAll(() => {
    destroyRepo(repoRoot);
  });

  test('sourceFilesUnder drops ignored files, tracked or not', () => {
    expect(sourceFilesUnder(repoRoot)).toEqual(['src/service.ts']);
  });

  test('listSourceFiles drops ignored files', () => {
    expect(listSourceFiles(repoRoot)).toEqual(['src/service.ts']);
  });

  test('scoped enumeration still filters', () => {
    expect(sourceFilesUnder(repoRoot, ['src'])).toEqual(['src/service.ts']);
    expect(listSourceFiles(repoRoot, ['src'])).toEqual(['src/service.ts']);
  });
});

describe('a directory without git enumerates everything', () => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-nogit-'));
  for (const [file, content] of Object.entries(FILES)) {
    mkdirSync(dirname(join(root, file)), { recursive: true });
    writeFileSync(join(root, file), content, 'utf8');
  }

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test('sourceFilesUnder keeps every source file', () => {
    expect(sourceFilesUnder(root)).toEqual([
      'generated/sdk.ts',
      'nested/generated/deep.ts',
      'src/client.gen.ts',
      'src/service.ts',
    ]);
  });
});
