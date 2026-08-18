import { describe, expect, test } from 'bun:test';
import { DIRECTIVE_PATTERNS, parseSource } from '../src/index';
import type { CommentHit } from '../src/types';
import { parseFixture } from './fixture';

const hitStartingWith = (comments: CommentHit[], fragment: string): CommentHit => {
  const found = comments.find((comment) => comment.text.includes(fragment));
  if (!found) throw new Error(`no comment containing ${fragment}`);
  return found;
};

const classifyInline = (comment: string): CommentHit => {
  const parsed = parseSource('inline.ts', `${comment}\nexport const value = 1;\n`);
  return parsed.comments[0];
};

const DIRECTIVE_SAMPLES = [
  '#!/usr/bin/env bun',
  '/// <reference types="node" />',
  '// eslint-disable-next-line no-console',
  '/* eslint-disable no-console */',
  '// eslint-disable-line no-console',
  '// biome-ignore lint/suspicious/noExplicitAny: sample',
  '// biome-ignore-all lint/style/useConst: sample',
  '// @ts-expect-error sample',
  '// @ts-ignore sample',
  '// @ts-nocheck',
  '// prettier-ignore',
  '/* #__PURE__ */',
  '/* @__NO_SIDE_EFFECTS__ */',
  '/* webpackChunkName: "chunk" */',
  '/* webpackMode: "lazy" */',
  '/* webpackPrefetch: true */',
  '/* webpackPreload: true */',
  '/* @vite-ignore */',
  '// istanbul ignore next',
  '// c8 ignore next',
  '// @vitest-environment jsdom',
  '//# sourceMappingURL=out.js.map',
  '// SPDX-License-Identifier: MIT',
  '/*! bang license block */',
  '/*\n * Copyright (c) 2026 Example Corp\n */',
];

describe('comment classification', () => {
  test('daggers and file daggers are classified by their exact text', () => {
    const parsed = parseFixture('markers.ts');
    const kinds = parsed.comments.map((comment) => comment.kind);

    expect(kinds).toEqual([
      'fileDagger',
      'dagger',
      'why',
      'dagger',
      'dagger',
      'directive',
      'dagger',
    ]);
  });

  test('a why comment is classified why', () => {
    expect(classifyInline('// why: this must stay synchronous').kind).toBe('why');
    expect(classifyInline('//why: no space is still a why').kind).toBe('why');
  });

  test.each(DIRECTIVE_SAMPLES)('directive: %s', (sample) => {
    expect(classifyInline(sample).kind).toBe('directive');
  });

  test('every directive pattern is exercised by a sample', () => {
    for (const pattern of DIRECTIVE_PATTERNS) {
      expect(DIRECTIVE_SAMPLES.some((sample) => pattern.test(sample))).toBe(true);
    }
  });

  test('a directive-laden file yields only directive hits', () => {
    const parsed = parseFixture('directives.ts');

    expect(parsed.comments).not.toHaveLength(0);
    expect(parsed.comments.every((comment) => comment.kind === 'directive')).toBe(true);
    expect(parsed.comments[0].startLine).toBe(1);
    expect(parsed.comments[0].text).toBe('#!/usr/bin/env bun');
  });

  test('an unrecognized comment is harvestable', () => {
    expect(classifyInline('// just a note').kind).toBe('harvestable');
    expect(classifyInline('/** doc block */').kind).toBe('harvestable');
  });

  test('marker text inside strings, templates and regexes yields no comment hits', () => {
    const parsed = parseFixture('hazards.ts');

    expect(parsed.comments).toHaveLength(1);
    expect(parsed.comments[0].kind).toBe('dagger');
    expect(parsed.comments[0].startLine).toBe(6);
  });
});

describe('harvestable placement', () => {
  const parsed = parseFixture('harvest.ts');

  test('a comment inside a function body belongs to that function', () => {
    const hit = hitStartingWith(parsed.comments, 'lives inside the body');

    expect(hit.enclosingSymbol).toBe('compute');
    expect(hit.adjacentCode).toBe('return total * 2;');
  });

  test('a comment above a declaration belongs to that declaration', () => {
    const hit = hitStartingWith(parsed.comments, 'sits above the declaration');

    expect(hit.enclosingSymbol).toBe('rate');
    expect(hit.adjacentCode).toBe('export const rate = 0.5;');
  });

  test('a trailing comment reports the code it trails', () => {
    const hit = hitStartingWith(parsed.comments, 'trailing note');

    expect(hit.enclosingSymbol).toBe('seed');
    expect(hit.adjacentCode).toBe('const seed = 1;');
  });

  test('a comment between top-level statements has no enclosing symbol', () => {
    const hit = hitStartingWith(parsed.comments, 'stray note');

    expect(hit.enclosingSymbol).toBeUndefined();
    expect(hit.adjacentCode).toBe('console.log(rate);');
  });

  test('a comment above a class member belongs to that member', () => {
    const parsedClass = parseSource(
      'inline.ts',
      ['export class Panel {', '  // member note', '  render() {}', '}', ''].join('\n'),
    );

    expect(parsedClass.comments[0].enclosingSymbol).toBe('Panel.render');
  });

  test('a jsx comment belongs to its enclosing component', () => {
    const parsedTsx = parseFixture('component.tsx');
    const hit = hitStartingWith(parsedTsx.comments, 'jsx note');

    expect(hit.kind).toBe('harvestable');
    expect(hit.enclosingSymbol).toBe('Panel');
  });
});
