import { describe, expect, test } from 'bun:test';
import { parseSource } from '../src/index';
import type { SymbolEntry } from '../src/types';
import { parseFixture } from './fixture';

const shape = (entry: SymbolEntry) => ({
  name: entry.name,
  kind: entry.kind,
  startLine: entry.startLine,
  endLine: entry.endLine,
});

const named = (symbols: SymbolEntry[], name: string): SymbolEntry => {
  const found = symbols.find((symbol) => symbol.name === name);
  if (!found) throw new Error(`no symbol named ${name}`);
  return found;
};

describe('symbol enumeration', () => {
  test('enumerates declarations and skips imports and re-exports', () => {
    const parsed = parseFixture('symbols.ts');

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'overloaded', kind: 'function', startLine: 6, endLine: 10 },
      { name: 'Shape', kind: 'interface', startLine: 12, endLine: 14 },
      { name: 'Alias', kind: 'typeAlias', startLine: 16, endLine: 16 },
      { name: 'Level', kind: 'enum', startLine: 18, endLine: 21 },
      { name: 'settings', kind: 'const', startLine: 23, endLine: 23 },
      { name: 'mutable', kind: 'const', startLine: 25, endLine: 25 },
      { name: 'Alpha', kind: 'class', startLine: 27, endLine: 33 },
      { name: 'Alpha.run', kind: 'method', startLine: 28, endLine: 30 },
      { name: 'Alpha.send', kind: 'method', startLine: 32, endLine: 32 },
      { name: 'Beta', kind: 'class', startLine: 35, endLine: 39 },
      { name: 'Beta.run', kind: 'method', startLine: 36, endLine: 38 },
    ]);
  });

  test('an overload set yields one entry spanning first signature to implementation', () => {
    const parsed = parseFixture('symbols.ts');
    const overloads = parsed.symbols.filter((symbol) => symbol.name === 'overloaded');

    expect(overloads).toHaveLength(1);
    expect(shape(overloads[0])).toEqual({
      name: 'overloaded',
      kind: 'function',
      startLine: 6,
      endLine: 10,
    });
  });

  test('class methods are keyed as Class.method', () => {
    const parsed = parseFixture('symbols.ts');

    expect(named(parsed.symbols, 'Alpha.run').kind).toBe('method');
    expect(named(parsed.symbols, 'Alpha.send').kind).toBe('method');
  });

  test('two classes with the same method name yield distinct entries', () => {
    const parsed = parseFixture('symbols.ts');
    const methods = parsed.symbols.filter((symbol) => symbol.name.endsWith('.run'));

    expect(methods.map((method) => method.name)).toEqual(['Alpha.run', 'Beta.run']);
    expect(named(parsed.symbols, 'Alpha.run').startLine).toBe(28);
    expect(named(parsed.symbols, 'Beta.run').startLine).toBe(36);
  });

  test('anonymous default function is named default', () => {
    const parsed = parseFixture('defaultAnonymous.ts');

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'default', kind: 'default', startLine: 1, endLine: 3 },
    ]);
  });

  test('named default function keeps its own name', () => {
    const parsed = parseFixture('defaultNamed.ts');

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'named', kind: 'function', startLine: 1, endLine: 3 },
    ]);
  });

  test('default export of an expression is named default', () => {
    const parsed = parseFixture('defaultExpression.ts');

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'registry', kind: 'const', startLine: 1, endLine: 1 },
      { name: 'default', kind: 'default', startLine: 3, endLine: 3 },
    ]);
  });

  test('a method overload set yields one entry', () => {
    const parsed = parseSource(
      'inline.ts',
      [
        'export class A {',
        '  run(a: string): void;',
        '  run(a: number): void;',
        '  run(a: unknown): void {}',
        '}',
        '',
      ].join('\n'),
    );

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'A', kind: 'class', startLine: 1, endLine: 5 },
      { name: 'A.run', kind: 'method', startLine: 2, endLine: 4 },
    ]);
  });

  test('an anonymous default class is named default and prefixes its members', () => {
    const parsed = parseSource(
      'inline.ts',
      ['export default class {', '  run() {}', '}', ''].join('\n'),
    );

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'default', kind: 'default', startLine: 1, endLine: 3 },
      { name: 'default.run', kind: 'method', startLine: 2, endLine: 2 },
    ]);
  });

  test('a tsx component resolves as a symbol', () => {
    const parsed = parseFixture('component.tsx');

    expect(parsed.symbols.map(shape)).toEqual([
      { name: 'Props', kind: 'typeAlias', startLine: 1, endLine: 3 },
      { name: 'Badge', kind: 'const', startLine: 6, endLine: 8 },
      { name: 'Panel', kind: 'function', startLine: 10, endLine: 17 },
    ]);
    expect(parsed.errors).toEqual([]);
  });
});

describe('marker binding', () => {
  test('markers attach through decorators, why lines and directives', () => {
    const parsed = parseFixture('markers.ts');

    expect(parsed.errors).toEqual([]);
    expect(named(parsed.symbols, 'Widget').markerLine).toBe(5);
    expect(named(parsed.symbols, 'Widget').startLine).toBe(7);
    expect(named(parsed.symbols, 'Widget.render').markerLine).toBe(10);
    expect(named(parsed.symbols, 'tagged').markerLine).toBe(16);
    expect(named(parsed.symbols, 'tagged').startLine).toBe(18);
    expect(named(parsed.symbols, 'config').markerLine).toBe(22);
  });

  test('a file marker at the top sets hasFileMarker', () => {
    const parsed = parseFixture('fileMarker.ts');

    expect(parsed.hasFileMarker).toBe(true);
    expect(parsed.errors).toEqual([]);
  });

  test('a file marker below the first statement is a dangling marker', () => {
    const parsed = parseFixture('fileMarkerMisplaced.ts');

    expect(parsed.hasFileMarker).toBe(false);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].code).toBe('danglingMarker');
    expect(parsed.errors[0].line).toBe(7);
    expect(parsed.errors[0].message).toContain('top of the file');
  });

  test('markers bind by position, never by name similarity', () => {
    const parsed = parseFixture('hazards.ts');

    expect(named(parsed.symbols, 'getUser').markerLine).toBe(6);
    expect(named(parsed.symbols, 'getUserById').markerLine).toBeUndefined();
  });

  test('the tsx component marker binds to the component', () => {
    const parsed = parseFixture('component.tsx');

    expect(named(parsed.symbols, 'Badge').markerLine).toBe(5);
  });
});

describe('marker errors', () => {
  const parsed = parseFixture('markerErrors.ts');
  const errorAt = (line: number) => {
    const found = parsed.errors.find((error) => error.line === line);
    if (!found) throw new Error(`no error on line ${line}`);
    return found;
  };

  test('a blank line between marker and declaration breaks the binding', () => {
    expect(errorAt(1).code).toBe('danglingMarker');
    expect(named(parsed.symbols, 'detached').markerLine).toBeUndefined();
  });

  test('a marker above an import is dangling', () => {
    expect(errorAt(5).code).toBe('danglingMarker');
  });

  test('stacked markers report once on the second marker', () => {
    expect(errorAt(9).code).toBe('stackedMarkers');
    expect(parsed.errors.filter((error) => error.code === 'stackedMarkers')).toHaveLength(1);
    expect(named(parsed.symbols, 'stacked').markerLine).toBe(9);
  });

  test('a marker above a multi-declarator statement is reported', () => {
    expect(errorAt(14).code).toBe('multiDeclaratorMarker');
  });

  test('a marker with trailing content is reported', () => {
    expect(errorAt(18).code).toBe('markerTrailingContent');
    expect(named(parsed.symbols, 'annotated').markerLine).toBeUndefined();
  });

  test('a marker trailing code on a line does not bind', () => {
    expect(errorAt(23).code).toBe('danglingMarker');
    expect(named(parsed.symbols, 'trailingMarker').markerLine).toBeUndefined();
  });

  test('a marker at the end of the file is dangling', () => {
    expect(errorAt(25).code).toBe('danglingMarker');
  });

  test('errors are ordered by line', () => {
    expect(parsed.errors.map((error) => error.line)).toEqual([1, 5, 9, 14, 18, 23, 25]);
  });

  test('a file marker with trailing content is reported', () => {
    const result = parseSource('inline.ts', '// gloss:file see notes\nexport const a = 1;\n');

    expect(result.hasFileMarker).toBe(false);
    expect(result.errors).toEqual([
      {
        code: 'markerTrailingContent',
        line: 1,
        message: expect.stringContaining('trailing content'),
      },
    ]);
  });

  test('gloss-prefixed words are not markers', () => {
    const result = parseSource('inline.ts', '// glossary of terms\nexport const a = 1;\n');

    expect(result.errors).toEqual([]);
    expect(result.comments[0].kind).toBe('harvestable');
  });
});
