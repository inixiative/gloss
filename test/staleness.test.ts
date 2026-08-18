import { afterEach, describe, expect, test } from 'bun:test';
import { fileStaleness, sectionStaleness } from '../src/staleness';
import {
  commitFiles,
  createRepo,
  destroyRepo,
  git,
  movePath,
  shallowCloneOf,
  writeFiles,
} from './tempRepo';

const SOURCE = 'src/mod.ts';
const MIRROR = '.gloss/src/mod.ts.md';

const sourceWith = (alphaBody: string, betaBody: string): string =>
  `export const alpha = () => {
  ${alphaBody}
};

export const beta = () => {
  ${betaBody}
};
`;

const mirrorWith = (preamble: string, alphaNote: string, betaNote: string): string =>
  `# src/mod.ts

${preamble}

## alpha

${alphaNote}

## beta

${betaNote}
`;

const SOURCE_V1 = sourceWith('return 1;', 'return 2;');
const MIRROR_V1 = mirrorWith('Module preamble.', 'Alpha note.', 'Beta note.');

const repos: string[] = [];

const tracked = (): string => {
  const repoRoot = createRepo();
  repos.push(repoRoot);
  return repoRoot;
};

const writtenRepo = (): string => {
  const repoRoot = tracked();
  commitFiles(
    repoRoot,
    { [SOURCE]: SOURCE_V1, [MIRROR]: MIRROR_V1 },
    'gloss',
    '2026-01-01T12:00:00Z',
  );
  return repoRoot;
};

const dayOf = (isoDate: string): string => isoDate.slice(0, 10);

afterEach(() => {
  while (repos.length > 0) {
    const repoRoot = repos.pop();
    if (repoRoot) destroyRepo(repoRoot);
  }
});

describe('sectionStaleness', () => {
  test('counts a source edit made after the section was written', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 2;') },
      'edit alpha',
      '2026-01-05T12:00:00Z',
    );

    const staleness = sectionStaleness(repoRoot, SOURCE, 'alpha');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.sourceChangesSince).toBe(1);
    expect(dayOf(staleness.lastSourceChangeAt ?? '')).toBe('2026-01-05');
  });

  test('reports no changes for a symbol untouched since the section was written', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 2;') },
      'edit alpha',
      '2026-01-05T12:00:00Z',
    );

    const staleness = sectionStaleness(repoRoot, SOURCE, 'beta');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.lastSourceChangeAt).toBeUndefined();
  });

  test('resets the count when the section is rewritten after source churn', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 2;') },
      'edit alpha',
      '2026-01-05T12:00:00Z',
    );
    commitFiles(
      repoRoot,
      { [MIRROR]: mirrorWith('Module preamble.', 'Alpha note, rewritten.', 'Beta note.') },
      'rewrite alpha note',
      '2026-01-07T12:00:00Z',
    );

    const staleness = sectionStaleness(repoRoot, SOURCE, 'alpha');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-07');
    expect(staleness.sourceChangesSince).toBe(0);
    expect(staleness.lastSourceChangeAt).toBeUndefined();
  });

  test('counts a commit that touched several symbols, and ignores one that missed the span', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 22;') },
      'edit alpha and beta',
      '2026-01-05T12:00:00Z',
    );
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 222;') },
      'edit beta only',
      '2026-01-06T12:00:00Z',
    );

    const alpha = sectionStaleness(repoRoot, SOURCE, 'alpha');
    const beta = sectionStaleness(repoRoot, SOURCE, 'beta');

    expect(alpha.reliable).toBe(true);
    expect(beta.reliable).toBe(true);
    if (!alpha.reliable || !beta.reliable) return;
    expect(alpha.sourceChangesSince).toBe(1);
    expect(dayOf(alpha.lastSourceChangeAt ?? '')).toBe('2026-01-05');
    expect(beta.sourceChangesSince).toBe(2);
    expect(dayOf(beta.lastSourceChangeAt ?? '')).toBe('2026-01-06');
  });

  test('refuses when the mirror is untracked', () => {
    const repoRoot = tracked();
    commitFiles(repoRoot, { [SOURCE]: SOURCE_V1 }, 'source only', '2026-01-01T12:00:00Z');
    writeFiles(repoRoot, { [MIRROR]: MIRROR_V1 });

    expect(sectionStaleness(repoRoot, SOURCE, 'alpha')).toEqual({
      reliable: false,
      reason: 'untracked',
    });
  });

  test('refuses when the source is untracked', () => {
    const repoRoot = tracked();
    commitFiles(repoRoot, { [MIRROR]: MIRROR_V1 }, 'mirror only', '2026-01-01T12:00:00Z');
    writeFiles(repoRoot, { [SOURCE]: SOURCE_V1 });

    expect(sectionStaleness(repoRoot, SOURCE, 'alpha')).toEqual({
      reliable: false,
      reason: 'untracked',
    });
  });

  test('refuses when the tracked files carry no commit yet', () => {
    const repoRoot = tracked();
    writeFiles(repoRoot, { [SOURCE]: SOURCE_V1, [MIRROR]: MIRROR_V1 });
    git(repoRoot, ['add', '-A']);

    expect(sectionStaleness(repoRoot, SOURCE, 'alpha')).toEqual({
      reliable: false,
      reason: 'noHistory',
    });
  });

  test('refuses when the symbol is absent from the source', () => {
    const repoRoot = tracked();
    commitFiles(
      repoRoot,
      {
        [SOURCE]: SOURCE_V1,
        [MIRROR]: `${MIRROR_V1}\n## gamma\n\nGamma note for a symbol that is gone.\n`,
      },
      'gloss with a stale section',
      '2026-01-01T12:00:00Z',
    );

    expect(sectionStaleness(repoRoot, SOURCE, 'gamma')).toEqual({
      reliable: false,
      reason: 'noHistory',
    });
  });

  test('refuses when the section is absent from the mirror', () => {
    const repoRoot = writtenRepo();

    expect(sectionStaleness(repoRoot, SOURCE, 'nowhere')).toEqual({
      reliable: false,
      reason: 'noHistory',
    });
  });

  test('refuses on a shallow clone rather than reporting the clone boundary', () => {
    const origin = writtenRepo();
    commitFiles(
      origin,
      { [SOURCE]: sourceWith('return 11;', 'return 2;') },
      'edit alpha',
      '2026-01-05T12:00:00Z',
    );
    const clone = shallowCloneOf(origin);
    repos.push(clone);

    expect(sectionStaleness(clone, SOURCE, 'alpha')).toEqual({
      reliable: false,
      reason: 'shallowClone',
    });
    expect(fileStaleness(clone, SOURCE)).toEqual({ reliable: false, reason: 'shallowClone' });
  });
});

describe('move laundering', () => {
  const RENAMED_SOURCE = 'src/renamed.ts';
  const RENAMED_MIRROR = '.gloss/src/renamed.ts.md';

  const renamedRepo = (): string => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: sourceWith('return 11;', 'return 2;') },
      'edit alpha',
      '2026-01-05T12:00:00Z',
    );
    movePath(repoRoot, SOURCE, RENAMED_SOURCE);
    movePath(repoRoot, MIRROR, RENAMED_MIRROR);
    commitFiles(repoRoot, {}, 'move the module', '2026-01-08T12:00:00Z');
    return repoRoot;
  };

  test('a rename-only commit does not launder a stale section fresh', () => {
    const repoRoot = renamedRepo();

    const staleness = sectionStaleness(repoRoot, RENAMED_SOURCE, 'alpha');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.sourceChangesSince).toBe(1);
    expect(dayOf(staleness.lastSourceChangeAt ?? '')).toBe('2026-01-05');
  });

  test('a rename-only commit does not launder a stale file preamble fresh', () => {
    const repoRoot = renamedRepo();

    const staleness = fileStaleness(repoRoot, RENAMED_SOURCE);

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.sourceChangesSince).toBe(1);
    expect(dayOf(staleness.lastSourceChangeAt ?? '')).toBe('2026-01-05');
  });

  test('hops one commit back when rename detection cannot follow the move', () => {
    const repoRoot = renamedRepo();
    git(repoRoot, ['config', 'diff.renames', 'false']);

    const staleness = sectionStaleness(repoRoot, RENAMED_SOURCE, 'alpha');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.sourceChangesSince).toBe(1);
    expect(dayOf(staleness.lastSourceChangeAt ?? '')).toBe('2026-01-05');
  });

  test('a rename that also rewrote both sides counts as a real write', () => {
    const repoRoot = writtenRepo();
    movePath(repoRoot, SOURCE, RENAMED_SOURCE);
    movePath(repoRoot, MIRROR, RENAMED_MIRROR);
    commitFiles(
      repoRoot,
      {
        [RENAMED_SOURCE]: sourceWith('return 11;', 'return 2;'),
        [RENAMED_MIRROR]: mirrorWith('Module preamble.', 'Alpha note, rewritten.', 'Beta note.'),
      },
      'move and rewrite the module',
      '2026-01-08T12:00:00Z',
    );

    const staleness = sectionStaleness(repoRoot, RENAMED_SOURCE, 'alpha');

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-08');
    expect(staleness.sourceChangesSince).toBe(0);
  });
});

describe('fileStaleness', () => {
  test('measures the preamble against the whole source file', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: `${SOURCE_V1}\nexport const gamma = () => 3;\n` },
      'add gamma',
      '2026-01-04T12:00:00Z',
    );
    commitFiles(
      repoRoot,
      { [SOURCE]: `${SOURCE_V1}\nexport const gamma = () => 33;\n` },
      'edit gamma',
      '2026-01-06T12:00:00Z',
    );

    const staleness = fileStaleness(repoRoot, SOURCE);

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-01');
    expect(staleness.sourceChangesSince).toBe(2);
    expect(dayOf(staleness.lastSourceChangeAt ?? '')).toBe('2026-01-06');
  });

  test('resets when the preamble is rewritten', () => {
    const repoRoot = writtenRepo();
    commitFiles(
      repoRoot,
      { [SOURCE]: `${SOURCE_V1}\nexport const gamma = () => 3;\n` },
      'add gamma',
      '2026-01-04T12:00:00Z',
    );
    commitFiles(
      repoRoot,
      { [MIRROR]: mirrorWith('Module preamble, rewritten.', 'Alpha note.', 'Beta note.') },
      'rewrite the preamble',
      '2026-01-09T12:00:00Z',
    );

    const staleness = fileStaleness(repoRoot, SOURCE);

    expect(staleness.reliable).toBe(true);
    if (!staleness.reliable) return;
    expect(dayOf(staleness.writtenAt)).toBe('2026-01-09');
    expect(staleness.sourceChangesSince).toBe(0);
  });
});
