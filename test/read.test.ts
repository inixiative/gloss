import { afterEach, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sectionHistory } from '../src/history';
import { renderGloss } from '../src/read';
import { commitFiles, createRepo, destroyRepo, shallowCloneOf, writeFiles } from './tempRepo';

const SOURCE = 'src/mod.ts';
const MIRROR = '.gloss/src/mod.ts.md';

const FOOTER = 'advisory past-session commentary — trust the code and // why: lines first';

const SOURCE_V1 = `export const alpha = () => {
  return 1;
};

export const beta = () => {
  return 2;
};
`;

const SOURCE_V2 = SOURCE_V1.replace('return 1;', 'return 11;');

const MIRROR_V1 = `# src/mod.ts

Module preamble.

## alpha

Alpha note.

## beta

Beta note.
`;

const repos: string[] = [];

const glossedRepo = (): string => {
  const repoRoot = createRepo();
  repos.push(repoRoot);
  commitFiles(
    repoRoot,
    { [SOURCE]: SOURCE_V1, [MIRROR]: MIRROR_V1 },
    'gloss',
    '2026-01-01T12:00:00Z',
  );
  commitFiles(repoRoot, { [SOURCE]: SOURCE_V2 }, 'edit alpha', '2026-01-05T12:00:00Z');
  return repoRoot;
};

afterEach(() => {
  while (repos.length > 0) {
    const repoRoot = repos.pop();
    if (repoRoot) destroyRepo(repoRoot);
  }
});

describe('renderGloss', () => {
  test('renders the preamble and every section under a derived header', () => {
    const rendered = renderGloss(glossedRepo(), SOURCE);

    expect(rendered).toContain('# src/mod.ts  — written 2026-01-01, source changed 1× since');
    expect(rendered).toContain('Module preamble.');
    expect(rendered).toContain(
      '## alpha  — written 2026-01-01, source changed 1× since (last 2026-01-05)',
    );
    expect(rendered).toContain('Alpha note.');
    expect(rendered).toContain('## beta  — written 2026-01-01, source unchanged since');
    expect(rendered).toContain('Beta note.');
    expect(rendered.trimEnd().endsWith(FOOTER)).toBe(true);
  });

  test('renders a single section on request', () => {
    const rendered = renderGloss(glossedRepo(), SOURCE, 'alpha');

    expect(rendered).toContain(
      '## alpha  — written 2026-01-01, source changed 1× since (last 2026-01-05)',
    );
    expect(rendered).toContain('Alpha note.');
    expect(rendered).not.toContain('## beta');
    expect(rendered).not.toContain('Module preamble.');
    expect(rendered).toContain(FOOTER);
  });

  test('says so in one line when there is no mirror', () => {
    expect(renderGloss(glossedRepo(), 'src/other.ts').trim()).toBe('no gloss for src/other.ts');
  });

  test('says so in one line when the section is absent', () => {
    expect(renderGloss(glossedRepo(), SOURCE, 'nowhere').trim()).toBe(
      'no gloss for src/mod.ts nowhere',
    );
  });

  test('writes nothing back to the mirror or the source', () => {
    const repoRoot = glossedRepo();
    renderGloss(repoRoot, SOURCE);

    expect(readFileSync(join(repoRoot, MIRROR), 'utf8')).toBe(MIRROR_V1);
    expect(readFileSync(join(repoRoot, SOURCE), 'utf8')).toBe(SOURCE_V2);
  });

  test('reports the reason instead of a date when staleness is unavailable', () => {
    const clone = shallowCloneOf(glossedRepo());
    repos.push(clone);

    const rendered = renderGloss(clone, SOURCE);

    expect(rendered).toContain('# src/mod.ts  — staleness unavailable (shallowClone)');
    expect(rendered).toContain('## alpha  — staleness unavailable (shallowClone)');
    expect(rendered).not.toContain('written 2026');
    expect(rendered).toContain(FOOTER);
  });
});

describe('sectionHistory', () => {
  test('returns the patches for one section range', () => {
    const history = sectionHistory(glossedRepo(), SOURCE, 'alpha');

    expect(history).toContain('Alpha note.');
    expect(history).toContain('@@');
    expect(history).not.toContain('Beta note.');
  });

  test('returns the whole mirror history when no symbol is given', () => {
    const history = sectionHistory(glossedRepo(), SOURCE);

    expect(history).toContain('Alpha note.');
    expect(history).toContain('Beta note.');
    expect(history).toContain('Module preamble.');
  });

  test('reports no history for an unknown section or a missing mirror', () => {
    const repoRoot = glossedRepo();

    expect(sectionHistory(repoRoot, SOURCE, 'nowhere').trim()).toBe('no history');
    expect(sectionHistory(repoRoot, 'src/other.ts').trim()).toBe('no history');
  });
});
