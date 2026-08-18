import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';
import { glossPathFor, parseGlossDoc, sourcePathFor } from './glossFile';
import { parseSource } from './resolver';
import {
  type CheckViolation,
  DAGGER,
  FILE_DAGGER,
  type GlossDoc,
  type ParsedSource,
} from './types';

const GLOSS_DIR = '.gloss';
const GLOSS_EXTENSION = '.md';
const GLOSS_README = 'README.md';
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'fixtures']);
const LEADING_DOT_SLASH = /^\.\//;

export const normalizeRelPath = (path: string): string =>
  path.trim().split(sep).join('/').replace(LEADING_DOT_SLASH, '');

const toRepoRelative = (repoRoot: string, path: string): string =>
  normalizeRelPath(relative(repoRoot, isAbsolute(path) ? path : join(repoRoot, path)));

const hasSourceExtension = (path: string): boolean =>
  SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension));

const isSkippedDirectory = (name: string): boolean =>
  name.startsWith('.') || SKIPPED_DIRECTORIES.has(name);

const childRelPath = (dirRelPath: string, name: string): string =>
  dirRelPath === '' ? name : `${dirRelPath}/${name}`;

const walkSourceFiles = (repoRoot: string, dirRelPath: string, found: string[]): void => {
  for (const entry of readdirSync(join(repoRoot, dirRelPath), { withFileTypes: true })) {
    const entryRelPath = childRelPath(dirRelPath, entry.name);
    if (entry.isDirectory()) {
      if (!isSkippedDirectory(entry.name)) walkSourceFiles(repoRoot, entryRelPath, found);
      continue;
    }
    if (entry.isFile() && hasSourceExtension(entry.name)) found.push(entryRelPath);
  }
};

const walkGlossFiles = (repoRoot: string, dirRelPath: string, found: string[]): void => {
  for (const entry of readdirSync(join(repoRoot, dirRelPath), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const entryRelPath = childRelPath(dirRelPath, entry.name);
    if (entry.isDirectory()) {
      walkGlossFiles(repoRoot, entryRelPath, found);
      continue;
    }
    if (!entry.isFile() || entry.name === GLOSS_README) continue;
    if (entry.name.endsWith(GLOSS_EXTENSION)) found.push(entryRelPath);
  }
};

export const scopesFor = (repoRoot: string, paths?: string[]): string[] | undefined =>
  paths?.length ? paths.map((path) => toRepoRelative(repoRoot, path)) : undefined;

export const isWithinScopes = (relPath: string, scopes?: string[]): boolean =>
  !scopes || scopes.some((scope) => relPath === scope || relPath.startsWith(`${scope}/`));

export const listSourceFiles = (repoRoot: string, paths?: string[]): string[] => {
  const found: string[] = [];
  for (const scope of scopesFor(repoRoot, paths) ?? ['']) {
    const absolute = join(repoRoot, scope);
    if (!existsSync(absolute)) continue;
    if (statSync(absolute).isDirectory()) walkSourceFiles(repoRoot, scope, found);
    else if (hasSourceExtension(scope)) found.push(scope);
  }
  return [...new Set(found)].sort();
};

export const listGlossFiles = (repoRoot: string): string[] => {
  if (!existsSync(join(repoRoot, GLOSS_DIR))) return [];
  const found: string[] = [];
  walkGlossFiles(repoRoot, GLOSS_DIR, found);
  return found.sort();
};

export const parseSourceFile = (
  repoRoot: string,
  sourceRelPath: string,
): ParsedSource | undefined => {
  const absolute = join(repoRoot, sourceRelPath);
  if (!existsSync(absolute)) return undefined;
  return parseSource(sourceRelPath, readFileSync(absolute, 'utf8'));
};

export const readGlossDoc = (repoRoot: string, glossRelPath: string): GlossDoc | undefined => {
  const absolute = join(repoRoot, glossRelPath);
  if (!existsSync(absolute)) return undefined;
  return parseGlossDoc(readFileSync(absolute, 'utf8'));
};

export const markerBearingNames = (parsed: ParsedSource): string[] =>
  parsed.symbols.filter((symbol) => symbol.markerLine !== undefined).map((symbol) => symbol.name);

export const headerMatches = (doc: GlossDoc, sourceRelPath: string): boolean =>
  normalizeRelPath(doc.sourcePath) === normalizeRelPath(sourceRelPath);

const fileMarkerLine = (parsed: ParsedSource): number | undefined =>
  parsed.comments.find((comment) => comment.kind === 'fileDagger')?.startLine;

const sectionViolation = (
  parsed: ParsedSource,
  sourceRelPath: string,
  glossRelPath: string,
  sectionSymbol: string,
): CheckViolation => {
  const symbol = parsed.symbols.find((entry) => entry.name === sectionSymbol);
  if (symbol) {
    return {
      kind: 'sectionWithoutMarker',
      sourcePath: sourceRelPath,
      symbol: sectionSymbol,
      line: symbol.startLine,
      message: `'## ${sectionSymbol}' in ${glossRelPath} names a symbol that carries no '${DAGGER}' in ${sourceRelPath}; restore the marker above it or run 'gloss fix'`,
    };
  }
  return {
    kind: 'sectionWithoutMarker',
    sourcePath: sourceRelPath,
    symbol: sectionSymbol,
    message: `'## ${sectionSymbol}' in ${glossRelPath} names no symbol in ${sourceRelPath}; it was renamed or removed`,
  };
};

const headerViolation = (
  doc: GlossDoc,
  sourceRelPath: string,
  glossRelPath: string,
): CheckViolation => ({
  kind: 'headerPathMismatch',
  sourcePath: sourceRelPath,
  line: 1,
  message:
    doc.sourcePath.trim() === ''
      ? `${glossRelPath} opens with no '# ${sourceRelPath}' header`
      : `${glossRelPath} declares '# ${doc.sourcePath}' but mirrors ${sourceRelPath}`,
});

export const checkFile = (repoRoot: string, sourceRelPath: string): CheckViolation[] => {
  const relPath = toRepoRelative(repoRoot, sourceRelPath);
  const parsed = parseSourceFile(repoRoot, relPath);
  if (!parsed) return [];

  const glossRelPath = glossPathFor(relPath);
  const doc = readGlossDoc(repoRoot, glossRelPath);
  const sectionSymbols = new Set(doc?.sections.map((section) => section.symbol) ?? []);
  const violations: CheckViolation[] = parsed.errors.map((error) => ({
    kind: 'resolverError',
    sourcePath: relPath,
    line: error.line,
    message: error.message,
  }));

  for (const symbol of parsed.symbols) {
    if (symbol.markerLine === undefined || sectionSymbols.has(symbol.name)) continue;
    violations.push({
      kind: 'markerWithoutSection',
      sourcePath: relPath,
      symbol: symbol.name,
      line: symbol.markerLine,
      message: `'${DAGGER}' above ${symbol.name} has no '## ${symbol.name}' section in ${glossRelPath}`,
    });
  }

  const markerNames = new Set(markerBearingNames(parsed));
  for (const section of doc?.sections ?? []) {
    if (markerNames.has(section.symbol)) continue;
    violations.push(sectionViolation(parsed, relPath, glossRelPath, section.symbol));
  }

  const hasPreamble = (doc?.preamble.trim() ?? '') !== '';
  if (parsed.hasFileMarker && !hasPreamble) {
    violations.push({
      kind: 'fileMarkerWithoutPreamble',
      sourcePath: relPath,
      line: fileMarkerLine(parsed),
      message: `'${FILE_DAGGER}' in ${relPath} promises a preamble that ${glossRelPath} does not carry`,
    });
  }
  if (!parsed.hasFileMarker && hasPreamble) {
    violations.push({
      kind: 'preambleWithoutFileMarker',
      sourcePath: relPath,
      message: `${glossRelPath} opens with a preamble but ${relPath} carries no '${FILE_DAGGER}'`,
    });
  }

  if (doc && !headerMatches(doc, relPath)) {
    violations.push(headerViolation(doc, relPath, glossRelPath));
  }

  return violations;
};

const orphanViolations = (repoRoot: string, scopes?: string[]): CheckViolation[] =>
  listGlossFiles(repoRoot).flatMap((glossRelPath) => {
    const sourceRelPath = sourcePathFor(glossRelPath);
    if (!sourceRelPath || !isWithinScopes(sourceRelPath, scopes)) return [];
    if (existsSync(join(repoRoot, sourceRelPath))) return [];
    return [
      {
        kind: 'orphanGlossFile' as const,
        sourcePath: sourceRelPath,
        message: `${glossRelPath} mirrors ${sourceRelPath}, which does not exist; move the gloss beside its source with 'gloss fix' rather than deleting it`,
      },
    ];
  });

export const checkRepo = (repoRoot: string, paths?: string[]): CheckViolation[] => [
  ...listSourceFiles(repoRoot, paths).flatMap((sourceRelPath) =>
    checkFile(repoRoot, sourceRelPath),
  ),
  ...orphanViolations(repoRoot, scopesFor(repoRoot, paths)),
];
