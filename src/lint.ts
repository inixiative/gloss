import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFilesUnder } from './harvest';
import { parseSource } from './resolver';
import { type CommentHit, DAGGER, type LintViolation, WHY_PREFIX } from './types';

export const DEFAULT_WHY_MAX_LENGTH = 120;

let whyMaxLength = DEFAULT_WHY_MAX_LENGTH;

export const setWhyMaxLength = (limit: number = DEFAULT_WHY_MAX_LENGTH): void => {
  whyMaxLength = limit;
};

const WHY = `'// ${WHY_PREFIX}'`;

const targetOf = (symbol: string | undefined): string =>
  symbol === undefined ? 'this file' : `'${symbol}'`;

const sectionOf = (symbol: string | undefined): string =>
  symbol === undefined ? 'the file preamble' : `the '${symbol}' gloss section`;

const forbiddenCommentMessage = (sourcePath: string, symbol: string | undefined): string =>
  `comment on ${targetOf(symbol)} is not a '${DAGGER}' dagger, a one-line ${WHY} or a machine directive; the harvester relocates it into the gloss (run: gloss harvest ${sourcePath})`;

const continuationMessage = (symbol: string | undefined, whyLine: number): string =>
  `comment continues the ${WHY} on line ${whyLine}; a ${WHY} is one short line, so move the rest to ${sectionOf(symbol)}`;

const multiLineMessage = (symbol: string | undefined, lines: number): string =>
  `${WHY} on ${targetOf(symbol)} spans ${lines} lines; keep it to one short line and move the rest to ${sectionOf(symbol)}`;

const tooLongMessage = (symbol: string | undefined, length: number): string =>
  `${WHY} on ${targetOf(symbol)} is ${length} characters (limit ${whyMaxLength}); keep it to one short line and move the rest to ${sectionOf(symbol)}`;

const violation = (
  sourcePath: string,
  line: number,
  kind: LintViolation['kind'],
  message: string,
): LintViolation => ({
  kind,
  sourcePath,
  line,
  message,
});

const startsOwnLine = (sourceLines: string[], comment: CommentHit): boolean =>
  (sourceLines[comment.startLine - 1] ?? '').trimStart().startsWith(comment.text.slice(0, 2));

const commentViolations = (
  filePath: string,
  sourceText: string,
  comments: CommentHit[],
): LintViolation[] => {
  const sourceLines = sourceText.split('\n');
  const violations: LintViolation[] = [];
  let run: { start: CommentHit; lines: number; end: number } | undefined;

  const closeRun = (): void => {
    if (run !== undefined && run.lines > 1) {
      violations.push(
        violation(
          filePath,
          run.start.startLine,
          'longWhy',
          multiLineMessage(run.start.enclosingSymbol, run.lines),
        ),
      );
    }
    run = undefined;
  };

  for (const comment of comments) {
    const followsRun = run !== undefined && comment.startLine === run.end + 1;

    if (comment.kind === 'why') {
      const lines = comment.endLine - comment.startLine + 1;
      if (followsRun && run !== undefined && lines === 1) {
        run.lines += 1;
        run.end = comment.endLine;
      } else {
        closeRun();
        run = { start: comment, lines, end: comment.endLine };
      }
      const length = comment.text.trim().length;
      if (lines === 1 && length > whyMaxLength) {
        violations.push(
          violation(
            filePath,
            comment.startLine,
            'longWhy',
            tooLongMessage(comment.enclosingSymbol, length),
          ),
        );
      }
      continue;
    }

    const continues = followsRun && run !== undefined && startsOwnLine(sourceLines, comment);
    const whyLine = run?.start.startLine;
    if (!continues) closeRun();
    if (comment.kind !== 'harvestable') continue;

    violations.push(
      violation(
        filePath,
        comment.startLine,
        continues ? 'longWhy' : 'forbiddenComment',
        continues && whyLine !== undefined
          ? continuationMessage(comment.enclosingSymbol, whyLine)
          : forbiddenCommentMessage(filePath, comment.enclosingSymbol),
      ),
    );
    if (continues) closeRun();
  }
  closeRun();

  return violations;
};

export const lintSource = (filePath: string, sourceText: string): LintViolation[] => {
  const parsed = parseSource(filePath, sourceText);

  const markerErrors = parsed.errors.map(
    (error): LintViolation => violation(filePath, error.line, error.code, error.message),
  );

  return [...commentViolations(filePath, sourceText, parsed.comments), ...markerErrors].sort(
    (a, b) => a.line - b.line,
  );
};

export const lintPaths = (repoRoot: string, paths?: string[]): LintViolation[] =>
  sourceFilesUnder(repoRoot, paths).flatMap((file) =>
    lintSource(file, readFileSync(join(repoRoot, file), 'utf8')),
  );
