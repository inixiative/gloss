import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { ignoredPaths } from './git';
import { glossPathFor, parseGlossDoc, serializeGlossDoc, upsertSection } from './glossFile';
import { parseSource } from './resolver';
import {
  type CommentHit,
  DAGGER,
  FILE_DAGGER,
  type GlossDoc,
  type HarvestResult,
  type ParsedSource,
  type ResolverErrorCode,
} from './types';

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', '.git', '.gloss', 'fixtures']);

const BLOCKING_ERROR_CODES: ResolverErrorCode[] = [
  'markerTrailingContent',
  'stackedMarkers',
  'multiDeclaratorMarker',
  'danglingMarker',
];

const GLOSS_DIRECTORY = '.gloss';
const EVENTS_FILE = '.events.jsonl';
const IGNORE_FILE = '.gitignore';

type SourceIndex = {
  text: string;
  lines: string[];
  lineStarts: number[];
};

type Deletion = { from: number; to: number };
type Insertion = { at: number; text: string };
type LocatedComment = { hit: CommentHit; pos: number; end: number };

const indexSource = (text: string): SourceIndex => {
  const lines = text.split('\n');
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  return { text, lines, lineStarts };
};

const lineTextOf = (source: SourceIndex, line: number): string => source.lines[line - 1] ?? '';

const lineStartOf = (source: SourceIndex, line: number): number =>
  source.lineStarts[line - 1] ?? source.text.length;

const lineEndOf = (source: SourceIndex, line: number): number =>
  lineStartOf(source, line) + lineTextOf(source, line).length;

const isBlankLine = (source: SourceIndex, line: number): boolean =>
  lineTextOf(source, line).trim() === '';

const indentOf = (line: string): string => line.slice(0, line.length - line.trimStart().length);

const trailingBlankLength = (text: string): number => text.length - text.trimEnd().length;

const leadingBlankLength = (text: string): number => text.length - text.trimStart().length;

const stripCommentMarkers = (text: string): string => {
  const inner = text.startsWith('/*')
    ? text.replace(/^\/\*+/, '').replace(/\*+\/$/, '')
    : text.replace(/^\/\/+/, '');
  return inner
    .split('\n')
    .map((line) => line.replace(/^\s*\*+\s?/, '').trimEnd())
    .join('\n')
    .trim();
};

const locateComments = (source: SourceIndex, hits: CommentHit[]): LocatedComment[] => {
  const located: LocatedComment[] = [];
  let cursor = 0;

  for (const hit of hits) {
    const pos = source.text.indexOf(hit.text, Math.max(cursor, lineStartOf(source, hit.startLine)));
    if (pos === -1) continue;
    cursor = pos + hit.text.length;
    located.push({ hit, pos, end: cursor });
  }

  return located;
};

const removalRange = (source: SourceIndex, located: LocatedComment): Deletion => {
  const { hit, pos, end } = located;
  const before = source.text.slice(lineStartOf(source, hit.startLine), pos);
  const after = source.text.slice(end, lineEndOf(source, hit.endLine));

  if (before.trim() !== '' && after.trim() !== '') return { from: pos, to: end };
  if (before.trim() !== '') {
    return { from: pos - trailingBlankLength(before), to: lineEndOf(source, hit.endLine) };
  }
  if (after.trim() !== '') return { from: pos, to: end + leadingBlankLength(after) };

  const swallowsBlankLine =
    isBlankLine(source, hit.startLine - 1) && isBlankLine(source, hit.endLine + 1);
  return {
    from: lineStartOf(source, hit.startLine),
    to: lineStartOf(source, hit.endLine + (swallowsBlankLine ? 2 : 1)),
  };
};

const groupAdjacent = (hits: CommentHit[]): CommentHit[][] => {
  const groups: CommentHit[][] = [];

  for (const hit of hits) {
    const group = groups.at(-1);
    const previous = group?.at(-1);
    const continues =
      previous !== undefined &&
      previous.endLine + 1 === hit.startLine &&
      previous.enclosingSymbol === hit.enclosingSymbol &&
      previous.adjacentCode === hit.adjacentCode;
    if (group && continues) group.push(hit);
    else groups.push([hit]);
  }

  return groups;
};

const codeSpan = (text: string): string => {
  const longestRun = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const fence = '`'.repeat(longestRun + 1);
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
};

// why: a harvested line starting with '#' would parse as gloss structure (h1 path header,
// '##' symbol section) and fabricate sections naming no symbol; escape it at column 0.
const escapeHeadings = (text: string): string =>
  text
    .split('\n')
    .map((line) => (line.startsWith('#') ? `\\${line}` : line))
    .join('\n');

const entryFor = (group: CommentHit[]): string => {
  const body = group
    .map((hit) => escapeHeadings(stripCommentMarkers(hit.text)))
    .filter((text) => text !== '')
    .join('\n');
  const anchor = group[0].adjacentCode;
  return anchor === undefined ? body : `> ${codeSpan(anchor)}\n\n${body}`.trimEnd();
};

const joinBlocks = (existing: string, addition: string): string =>
  existing.trim() === '' ? addition : `${existing.trim()}\n\n${addition}`;

const withEntry = (doc: GlossDoc, group: CommentHit[]): GlossDoc => {
  const entry = entryFor(group);
  const symbol = group[0].enclosingSymbol;
  if (symbol === undefined) return { ...doc, preamble: joinBlocks(doc.preamble, entry) };

  const existing = doc.sections.find((section) => section.symbol === symbol)?.body ?? '';
  return upsertSection(doc, symbol, joinBlocks(existing, entry));
};

const fileDaggerInsertion = (source: SourceIndex, comments: CommentHit[]): Insertion => {
  const covered = new Set<number>();
  for (const comment of comments) {
    if (comment.kind !== 'directive') break;
    for (let line = comment.startLine; line <= comment.endLine; line += 1) covered.add(line);
  }

  let line = 1;
  while (line <= source.lines.length && (covered.has(line) || isBlankLine(source, line))) {
    line += 1;
  }

  if (line > source.lines.length) return { at: source.text.length, text: `${FILE_DAGGER}\n` };
  return { at: lineStartOf(source, line), text: `${FILE_DAGGER}\n\n` };
};

const daggerInsertions = (
  source: SourceIndex,
  parsed: ParsedSource,
  doc: GlossDoc,
): Insertion[] => {
  const insertions: Insertion[] = [];
  if (doc.preamble.trim() !== '' && !parsed.hasFileMarker) {
    insertions.push(fileDaggerInsertion(source, parsed.comments));
  }

  const glossed = new Set(doc.sections.map((section) => section.symbol));
  const taken = new Set<number>();

  for (const symbol of parsed.symbols) {
    if (!glossed.has(symbol.name) || symbol.markerLine !== undefined) continue;
    const at = lineStartOf(source, symbol.startLine);
    if (taken.has(at)) continue;
    taken.add(at);
    insertions.push({ at, text: `${indentOf(lineTextOf(source, symbol.startLine))}${DAGGER}\n` });
  }

  return insertions;
};

const applyEdits = (
  source: SourceIndex,
  deletions: Deletion[],
  insertions: Insertion[],
): string => {
  const orderedDeletions = [...deletions].sort((a, b) => a.from - b.from);
  const orderedInsertions = [...insertions].sort((a, b) => a.at - b.at);
  let output = '';
  let cursor = 0;
  let deletionIndex = 0;
  let insertionIndex = 0;

  while (deletionIndex < orderedDeletions.length || insertionIndex < orderedInsertions.length) {
    const deletion = orderedDeletions[deletionIndex];
    const insertion = orderedInsertions[insertionIndex];
    const insertFirst =
      insertion !== undefined && (deletion === undefined || insertion.at <= deletion.from);
    const boundary = Math.max(cursor, insertFirst ? insertion.at : deletion.from);

    output += source.text.slice(cursor, boundary);
    if (insertFirst) {
      output += insertion.text;
      cursor = boundary;
      insertionIndex += 1;
      continue;
    }
    cursor = Math.max(boundary, deletion.to);
    deletionIndex += 1;
  }

  return output + source.text.slice(cursor);
};

export const harvestSource = (
  filePath: string,
  sourceText: string,
  existingGloss: GlossDoc | undefined,
  sourceRelPath: string,
): HarvestResult => {
  const parsed = parseSource(filePath, sourceText);
  const gloss = existingGloss ?? { sourcePath: sourceRelPath, preamble: '', sections: [] };

  if (parsed.errors.some((error) => BLOCKING_ERROR_CODES.includes(error.code))) {
    return { cleanSource: sourceText, gloss, moved: [] };
  }

  const source = indexSource(sourceText);
  const located = locateComments(
    source,
    parsed.comments.filter((comment) => comment.kind === 'harvestable'),
  );
  const moved = located.map((entry) => entry.hit);

  const doc = groupAdjacent(moved).reduce(withEntry, gloss);
  const cleanSource = applyEdits(
    source,
    located.map((entry) => removalRange(source, entry)),
    daggerInsertions(source, parsed, doc),
  );

  return { cleanSource, gloss: doc, moved };
};

const toPosix = (path: string): string => path.split(sep).join('/');

const walkSourceFiles = (root: string): string[] => {
  const stats = statSync(root, { throwIfNoEntry: false });
  if (!stats) return [];
  if (stats.isFile()) return SOURCE_EXTENSIONS.has(extname(root)) ? [root] : [];
  if (!stats.isDirectory()) return [];

  const entries = readdirSync(root, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return entries.flatMap((entry) => {
    if (entry.isDirectory()) {
      return SKIPPED_DIRECTORIES.has(entry.name) ? [] : walkSourceFiles(join(root, entry.name));
    }
    if (!entry.isFile() || !SOURCE_EXTENSIONS.has(extname(entry.name))) return [];
    return [join(root, entry.name)];
  });
};

export const sourceFilesUnder = (repoRoot: string, paths?: string[]): string[] => {
  const roots = (paths ?? [repoRoot]).map((path) =>
    isAbsolute(path) ? path : join(repoRoot, path),
  );
  const files = roots
    .flatMap(walkSourceFiles)
    .map((file) => toPosix(relative(repoRoot, file)))
    .filter((file) => !file.split('/').some((segment) => SKIPPED_DIRECTORIES.has(segment)));

  const unique = [...new Set(files)];
  const ignored = ignoredPaths(repoRoot, unique);
  return unique.filter((file) => !ignored.has(file));
};

const ensureEventsIgnored = (repoRoot: string): void => {
  const ignorePath = join(repoRoot, GLOSS_DIRECTORY, IGNORE_FILE);
  mkdirSync(join(repoRoot, GLOSS_DIRECTORY), { recursive: true });

  const existing = existsSync(ignorePath) ? readFileSync(ignorePath, 'utf8') : '';
  if (existing.split('\n').some((line) => line.trim() === EVENTS_FILE)) return;

  const head = existing.trimEnd();
  writeFileSync(ignorePath, head === '' ? `${EVENTS_FILE}\n` : `${head}\n${EVENTS_FILE}\n`, 'utf8');
};

const appendEvent = (repoRoot: string, file: string, moved: CommentHit[]): void => {
  const symbols = [
    ...new Set(
      moved.flatMap((hit) => (hit.enclosingSymbol === undefined ? [] : [hit.enclosingSymbol])),
    ),
  ];
  const event = { file, symbols, movedComments: moved.length, ts: new Date().toISOString() };

  appendFileSync(
    join(repoRoot, GLOSS_DIRECTORY, EVENTS_FILE),
    `${JSON.stringify(event)}\n`,
    'utf8',
  );
};

export const harvestPaths = (
  repoRoot: string,
  paths?: string[],
): { file: string; moved: number }[] => {
  const harvested: { file: string; moved: number }[] = [];

  for (const file of sourceFilesUnder(repoRoot, paths)) {
    const sourcePath = join(repoRoot, file);
    const sourceText = readFileSync(sourcePath, 'utf8');
    const glossPath = join(repoRoot, glossPathFor(file));
    const existingGloss = existsSync(glossPath)
      ? parseGlossDoc(readFileSync(glossPath, 'utf8'))
      : undefined;
    const result = harvestSource(sourcePath, sourceText, existingGloss, file);

    if (result.moved.length === 0 && result.cleanSource === sourceText) continue;

    if (result.cleanSource !== sourceText) writeFileSync(sourcePath, result.cleanSource, 'utf8');
    if (result.moved.length > 0) {
      mkdirSync(dirname(glossPath), { recursive: true });
      writeFileSync(glossPath, serializeGlossDoc(result.gloss), 'utf8');
    }

    ensureEventsIgnored(repoRoot);
    appendEvent(repoRoot, file, result.moved);
    harvested.push({ file, moved: result.moved.length });
  }

  return harvested;
};
