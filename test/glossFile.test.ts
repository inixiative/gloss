import { describe, expect, test } from 'bun:test';
import {
  type GlossDoc,
  glossPathFor,
  parseGlossDoc,
  serializeGlossDoc,
  sourcePathFor,
  upsertSection,
} from '../src/index';

const doc: GlossDoc = {
  sourcePath: 'src/foo.ts',
  preamble: 'This module owns the widget lifecycle.',
  sections: [
    { symbol: 'buildWidget', body: 'Builds the widget.\n\nSecond paragraph.' },
    { symbol: 'Widget.render', body: 'Renders the widget.' },
  ],
};

describe('gloss path mapping', () => {
  test('maps a source path into the gloss mirror', () => {
    expect(glossPathFor('src/foo.ts')).toBe('.gloss/src/foo.ts.md');
    expect(glossPathFor('./src/foo.tsx')).toBe('.gloss/src/foo.tsx.md');
  });

  test('maps a gloss path back to its source', () => {
    expect(sourcePathFor('.gloss/src/foo.ts.md')).toBe('src/foo.ts');
    expect(sourcePathFor(glossPathFor('src/deep/nested/bar.mts'))).toBe('src/deep/nested/bar.mts');
  });

  test('rejects paths outside the mirror or without the markdown extension', () => {
    expect(sourcePathFor('src/foo.ts')).toBeUndefined();
    expect(sourcePathFor('.gloss/src/foo.ts')).toBeUndefined();
    expect(sourcePathFor('.gloss/.md')).toBeUndefined();
    expect(sourcePathFor('docs/.gloss/src/foo.ts.md')).toBeUndefined();
  });
});

describe('gloss document', () => {
  test('parses heading, preamble and sections', () => {
    const parsed = parseGlossDoc(
      [
        '# src/foo.ts',
        '',
        'This module owns the widget lifecycle.',
        '',
        '## buildWidget',
        '',
        'Builds the widget.',
        '',
        '### detail heading stays in the body',
        '',
        '## Widget.render',
        '',
        'Renders the widget.',
        '',
      ].join('\n'),
    );

    expect(parsed.sourcePath).toBe('src/foo.ts');
    expect(parsed.preamble).toBe('This module owns the widget lifecycle.');
    expect(parsed.sections).toEqual([
      {
        symbol: 'buildWidget',
        body: 'Builds the widget.\n\n### detail heading stays in the body',
      },
      { symbol: 'Widget.render', body: 'Renders the widget.' },
    ]);
  });

  test('a missing heading yields an empty source path', () => {
    const parsed = parseGlossDoc('Loose preamble.\n\n## alpha\n\nBody.\n');

    expect(parsed.sourcePath).toBe('');
    expect(parsed.preamble).toBe('Loose preamble.');
    expect(parsed.sections).toEqual([{ symbol: 'alpha', body: 'Body.' }]);
  });

  test('headings inside fenced code blocks stay in the body', () => {
    const parsed = parseGlossDoc(
      ['# src/foo.ts', '', '## alpha', '', '```sh', '## not a section', '```', ''].join('\n'),
    );

    expect(parsed.sections).toEqual([{ symbol: 'alpha', body: '```sh\n## not a section\n```' }]);
  });

  test('serialize then parse round-trips', () => {
    expect(parseGlossDoc(serializeGlossDoc(doc))).toEqual(doc);
  });

  test('serializes with a single trailing newline', () => {
    const serialized = serializeGlossDoc(doc);

    expect(serialized.startsWith('# src/foo.ts\n\n')).toBe(true);
    expect(serialized.endsWith('Renders the widget.\n')).toBe(true);
    expect(serialized.endsWith('\n\n')).toBe(false);
  });

  test('round-trips a document with no preamble', () => {
    const bare: GlossDoc = {
      sourcePath: 'src/bar.ts',
      preamble: '',
      sections: [{ symbol: 'bar', body: 'Body.' }],
    };

    expect(parseGlossDoc(serializeGlossDoc(bare))).toEqual(bare);
  });
});

describe('upsertSection', () => {
  test('replaces an existing section body without reordering', () => {
    const updated = upsertSection(doc, 'buildWidget', 'Rewritten body.');

    expect(updated.sections).toEqual([
      { symbol: 'buildWidget', body: 'Rewritten body.' },
      { symbol: 'Widget.render', body: 'Renders the widget.' },
    ]);
  });

  test('appends a new section', () => {
    const updated = upsertSection(doc, 'teardown', 'Tears the widget down.');

    expect(updated.sections.map((section) => section.symbol)).toEqual([
      'buildWidget',
      'Widget.render',
      'teardown',
    ]);
  });

  test('is pure', () => {
    const before = structuredClone(doc);
    upsertSection(doc, 'buildWidget', 'Rewritten body.');

    expect(doc).toEqual(before);
  });
});
