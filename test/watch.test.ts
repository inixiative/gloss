import { afterEach, describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createDebouncer, type WatchHandle, watchGloss } from '../src/watch';

const DEBOUNCE_MS = 50;
const DEADLINE_MS = 5000;
const ATTACH_MS = 250;
const POLL_MS = 5;

const SOURCE = 'src/demo.ts';
const MIRROR = '.gloss/src/demo.ts.md';

const SOURCE_TEXT = [
  'export function compute(total: number) {',
  '  // doubles the total',
  '  return total * 2;',
  '}',
  '',
].join('\n');

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms));

const waitUntil = async (ready: () => boolean, deadlineMs = DEADLINE_MS): Promise<void> => {
  const deadline = Date.now() + deadlineMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error('timed out waiting for the watcher');
    await sleep(POLL_MS);
  }
};

const roots: string[] = [];
const handles: WatchHandle[] = [];

const makeRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'gloss-watch-'));
  roots.push(root);
  mkdirSync(join(root, 'src'), { recursive: true });
  return root;
};

const writeFile = (root: string, relPath: string, content: string): void => {
  const absolute = join(root, relPath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
};

const read = (root: string, relPath: string): string => readFileSync(join(root, relPath), 'utf8');

const startWatching = async (
  root: string,
  harvests: { file: string; moved: number }[],
): Promise<WatchHandle> => {
  const handle = watchGloss(root, {
    debounceMs: DEBOUNCE_MS,
    onHarvest: (file, moved) => harvests.push({ file, moved }),
  });
  handles.push(handle);
  await sleep(ATTACH_MS);
  return handle;
};

afterEach(() => {
  while (handles.length > 0) handles.pop()?.close();
  while (roots.length > 0) {
    const root = roots.pop();
    if (root) rmSync(root, { recursive: true, force: true });
  }
});

describe('createDebouncer', () => {
  test('fires once per file after the delay', async () => {
    const quiet: string[] = [];
    const debouncer = createDebouncer(10, (file) => quiet.push(file));

    debouncer.touch('a.ts');
    expect(debouncer.pending()).toEqual(['a.ts']);

    await waitUntil(() => quiet.length > 0);
    expect(quiet).toEqual(['a.ts']);
    expect(debouncer.pending()).toEqual([]);
  });

  test('a retouch extends the quiet period', async () => {
    const quiet: string[] = [];
    const debouncer = createDebouncer(30, (file) => quiet.push(file));
    const start = Date.now();

    debouncer.touch('a.ts');
    await sleep(20);
    expect(quiet).toEqual([]);
    debouncer.touch('a.ts');

    await waitUntil(() => quiet.length > 0);
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
    expect(quiet).toEqual(['a.ts']);
  });

  test('debounces two files independently', async () => {
    const quiet: string[] = [];
    const debouncer = createDebouncer(10, (file) => quiet.push(file));

    debouncer.touch('a.ts');
    debouncer.touch('b.ts');
    expect(debouncer.pending().sort()).toEqual(['a.ts', 'b.ts']);

    await waitUntil(() => quiet.length === 2);
    expect(quiet.sort()).toEqual(['a.ts', 'b.ts']);
  });

  test('dispose cancels the pending timers', async () => {
    const quiet: string[] = [];
    const debouncer = createDebouncer(10, (file) => quiet.push(file));

    debouncer.touch('a.ts');
    debouncer.dispose();
    expect(debouncer.pending()).toEqual([]);

    await sleep(60);
    expect(quiet).toEqual([]);
  });
});

describe('watchGloss', () => {
  test('harvests a saved file once and does not chase its own write', async () => {
    const root = makeRoot();
    const harvests: { file: string; moved: number }[] = [];
    await startWatching(root, harvests);

    writeFile(root, SOURCE, SOURCE_TEXT);

    await waitUntil(() => harvests.length > 0);
    expect(harvests[0]).toEqual({ file: SOURCE, moved: 1 });
    expect(read(root, MIRROR)).toContain('doubles the total');
    expect(read(root, SOURCE)).toContain('// gloss');
    expect(read(root, SOURCE)).not.toContain('doubles the total');

    await sleep(DEBOUNCE_MS * 3);
    expect(harvests).toHaveLength(1);
  }, 20000);

  test('ignores files outside the source extensions and the skipped directories', async () => {
    const root = makeRoot();
    const harvests: { file: string; moved: number }[] = [];
    await startWatching(root, harvests);

    writeFile(root, 'src/notes.md', '// doubles the total\n');
    writeFile(root, 'node_modules/pkg/index.ts', SOURCE_TEXT);
    writeFile(root, 'dist/out.ts', SOURCE_TEXT);
    writeFile(root, 'src/fixtures/sample.ts', SOURCE_TEXT);

    await sleep(DEBOUNCE_MS * 4);
    expect(harvests).toEqual([]);
    expect(existsSync(join(root, '.gloss'))).toBe(false);
  }, 20000);

  test('close stops harvesting later saves', async () => {
    const root = makeRoot();
    const harvests: { file: string; moved: number }[] = [];
    const handle = await startWatching(root, harvests);

    handle.close();
    writeFile(root, SOURCE, SOURCE_TEXT);

    await sleep(DEBOUNCE_MS * 4);
    expect(harvests).toEqual([]);
    expect(read(root, SOURCE)).toContain('doubles the total');
  }, 20000);
});
