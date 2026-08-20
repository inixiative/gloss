import * as ts from 'typescript';
import {
  type CommentHit,
  type CommentKind,
  DAGGER,
  FILE_DAGGER,
  type SymbolEntry,
  WHY_PREFIX,
} from './types';

export const DIRECTIVE_PATTERNS: RegExp[] = [
  /^#!/,
  /^\/\/\/\s*<reference\b/,
  /\beslint-(disable|enable)(-next-line|-line)?\b/,
  /\bbiome-ignore(-all)?\b/,
  /@ts-(expect-error|ignore|nocheck)\b/,
  /\bprettier-ignore(-start|-end)?\b/,
  /#__PURE__/,
  /@__NO_SIDE_EFFECTS__/,
  /\bwebpack(ChunkName|Mode|Prefetch|Preload)\b/,
  /@vite-ignore\b/,
  /\bistanbul\s+ignore\b/,
  /\bc8\s+ignore\b/,
  /@vitest-environment\b/,
  /\bsourceMappingURL=/,
  /\bSPDX-License-Identifier:/,
  /^\/\*!/,
  /^\/\*[\s*!]*Copyright\b/i,
  /@atlas\b/,
];

let repoDirectivePatterns: RegExp[] = [];

export const setRepoDirectives = (patterns: RegExp[]): void => {
  repoDirectivePatterns = patterns;
};

export type SourceComment = {
  pos: number;
  end: number;
  text: string;
  startLine: number;
  endLine: number;
  isLineComment: boolean;
  ownLine: boolean;
};

export type MarkerShape = {
  kind: 'dagger' | 'fileDagger';
  exact: boolean;
};

const IDENTIFIER_CHAR = /[A-Za-z0-9_$]/;

const lineAt = (sourceFile: ts.SourceFile, pos: number): number =>
  ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1;

const startsOwnLine = (sourceText: string, pos: number): boolean =>
  sourceText.slice(sourceText.lastIndexOf('\n', pos - 1) + 1, pos).trim() === '';

const shebangRange = (sourceText: string): SourceComment[] => {
  if (!sourceText.startsWith('#!')) return [];
  const lineEnd = sourceText.indexOf('\n');
  const end = lineEnd === -1 ? sourceText.length : lineEnd;
  return [
    {
      pos: 0,
      end,
      text: sourceText.slice(0, end),
      startLine: 1,
      endLine: 1,
      isLineComment: true,
      ownLine: true,
    },
  ];
};

export const collectComments = (sourceFile: ts.SourceFile, sourceText: string): SourceComment[] => {
  const ranges = new Map<number, ts.CommentRange>();

  const record = (found: ts.CommentRange[] | undefined) => {
    for (const range of found ?? []) ranges.set(range.pos, range);
  };

  const visit = (node: ts.Node) => {
    record(ts.getLeadingCommentRanges(sourceText, node.getFullStart()));
    record(ts.getTrailingCommentRanges(sourceText, node.getEnd()));
    for (const child of node.getChildren(sourceFile)) visit(child);
  };

  visit(sourceFile);

  const collected = [...ranges.values()].map((range) => ({
    pos: range.pos,
    end: range.end,
    text: sourceText.slice(range.pos, range.end),
    startLine: lineAt(sourceFile, range.pos),
    endLine: lineAt(sourceFile, range.end),
    isLineComment: range.kind === ts.SyntaxKind.SingleLineCommentTrivia,
    ownLine: startsOwnLine(sourceText, range.pos),
  }));

  return [...shebangRange(sourceText), ...collected].sort((a, b) => a.pos - b.pos);
};

export const markerShapeOf = (comment: SourceComment): MarkerShape | undefined => {
  if (!comment.isLineComment) return undefined;
  const text = comment.text.trimEnd();
  if (text === FILE_DAGGER) return { kind: 'fileDagger', exact: true };
  if (text === DAGGER) return { kind: 'dagger', exact: true };
  if (text.startsWith(FILE_DAGGER)) return { kind: 'fileDagger', exact: false };
  if (text.startsWith(DAGGER) && !IDENTIFIER_CHAR.test(text.charAt(DAGGER.length))) {
    return { kind: 'dagger', exact: false };
  }
  return undefined;
};

export const blankCommentRanges = (sourceText: string, comments: SourceComment[]): string => {
  let blanked = sourceText;
  for (const comment of comments) {
    const masked = comment.text.replace(/[^\n]/g, ' ');
    blanked = blanked.slice(0, comment.pos) + masked + blanked.slice(comment.end);
  }
  return blanked;
};

const isWhy = (comment: SourceComment): boolean =>
  comment.isLineComment && comment.text.slice(2).trimStart().startsWith(WHY_PREFIX);

const kindOf = (comment: SourceComment): CommentKind => {
  const marker = markerShapeOf(comment);
  if (marker) return marker.kind;
  if (isWhy(comment)) return 'why';
  if (DIRECTIVE_PATTERNS.some((pattern) => pattern.test(comment.text))) return 'directive';
  if (repoDirectivePatterns.some((pattern) => pattern.test(comment.text))) return 'directive';
  return 'harvestable';
};

const codeOnLine = (codeLines: string[], line: number): string =>
  (codeLines[line - 1] ?? '').trim();

const attachesDownward = (
  comment: SourceComment,
  symbol: SymbolEntry,
  sourceLines: string[],
  codeLines: string[],
): boolean => {
  if (!comment.ownLine) return false;
  if (codeOnLine(codeLines, comment.endLine) !== '') return false;
  for (let line = comment.endLine + 1; line < symbol.startLine; line += 1) {
    const raw = (sourceLines[line - 1] ?? '').trim();
    if (raw === '') return false;
    if (codeOnLine(codeLines, line) !== '') return false;
  }
  return true;
};

const enclosingSymbolFor = (
  comment: SourceComment,
  symbols: SymbolEntry[],
  sourceLines: string[],
  codeLines: string[],
): string | undefined => {
  const below = symbols.find((symbol) => symbol.startLine > comment.endLine);
  if (below && attachesDownward(comment, below, sourceLines, codeLines)) return below.name;

  const containing = symbols
    .filter((symbol) => symbol.startLine <= comment.startLine && symbol.endLine >= comment.endLine)
    .sort((a, b) => a.startLine - b.startLine)
    .at(-1);
  if (containing) return containing.name;

  return below?.name;
};

const adjacentCodeFor = (comment: SourceComment, codeLines: string[]): string | undefined => {
  const own = codeOnLine(codeLines, comment.endLine);
  if (own !== '') return own;
  for (let line = comment.endLine + 1; line <= codeLines.length; line += 1) {
    const code = codeOnLine(codeLines, line);
    if (code !== '') return code;
  }
  return undefined;
};

export const classifyComments = (
  sourceFile: ts.SourceFile,
  sourceText: string,
  symbols: SymbolEntry[],
): CommentHit[] => {
  const comments = collectComments(sourceFile, sourceText);
  const sourceLines = sourceText.split('\n');
  const codeLines = blankCommentRanges(sourceText, comments).split('\n');
  const ordered = [...symbols].sort((a, b) => a.startLine - b.startLine);

  return comments.map((comment) => {
    const kind = kindOf(comment);
    const hit: CommentHit = {
      kind,
      text: comment.text,
      startLine: comment.startLine,
      endLine: comment.endLine,
    };
    if (kind !== 'harvestable') return hit;

    const enclosingSymbol = enclosingSymbolFor(comment, ordered, sourceLines, codeLines);
    if (enclosingSymbol !== undefined) hit.enclosingSymbol = enclosingSymbol;
    const adjacentCode = adjacentCodeFor(comment, codeLines);
    if (adjacentCode !== undefined) hit.adjacentCode = adjacentCode;
    return hit;
  });
};
