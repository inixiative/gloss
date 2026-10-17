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

const MOVE_HINT = `drop the extra lines' '${WHY_PREFIX}' label and run gloss harvest, which moves them and plants the dagger`;

const continuationMessage = (symbol: string | undefined, whyLine: number): string =>
  `comment continues the ${WHY} on line ${whyLine}; a ${WHY} is one short line, so the rest belongs in ${sectionOf(symbol)} (run: gloss harvest)`;

const multiLineMessage = (symbol: string | undefined, lines: number): string =>
  `${WHY} on ${targetOf(symbol)} spans ${lines} lines; keep it to one short line and move the rest to ${sectionOf(symbol)} (${MOVE_HINT})`;

const tooLongMessage = (symbol: string | undefined, length: number): string =>
  `${WHY} on ${targetOf(symbol)} is ${length} characters (limit ${whyMaxLength}); shorten it, or keep one short line and move the rest to ${sectionOf(symbol)} (${MOVE_HINT})`;

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

const commentViolations = (filePath: string, comments: CommentHit[]): LintViolation[] => {
  const violations: LintViolation[] = [];
  let run: { start: CommentHit; whyLines: number; end: number } | undefined;

  const closeRun = (): void => {
    if (run !== undefined && run.whyLines > 1) {
      violations.push(
        violation(
          filePath,
          run.start.startLine,
          'longWhy',
          multiLineMessage(run.start.enclosingSymbol, run.whyLines),
        ),
      );
    }
    run = undefined;
  };

  for (const comment of comments) {
    const extendsRun = run !== undefined && comment.ownLine && comment.startLine === run.end + 1;

    if (comment.kind === 'why') {
      const lines = comment.text.split('\n').length;
      if (lines > 1) {
        closeRun();
        violations.push(
          violation(
            filePath,
            comment.startLine,
            'longWhy',
            multiLineMessage(comment.enclosingSymbol, lines),
          ),
        );
      } else if (extendsRun && run !== undefined) {
        run.whyLines += 1;
        run.end = comment.endLine;
      } else {
        closeRun();
        if (comment.ownLine) run = { start: comment, whyLines: 1, end: comment.endLine };
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

    if (comment.kind === 'harvestable' && extendsRun && run !== undefined) {
      violations.push(
        violation(
          filePath,
          comment.startLine,
          'longWhy',
          continuationMessage(comment.enclosingSymbol, run.start.startLine),
        ),
      );
      run.end = comment.endLine;
      continue;
    }

    closeRun();
    if (comment.kind !== 'harvestable') continue;
    violations.push(
      violation(
        filePath,
        comment.startLine,
        'forbiddenComment',
        forbiddenCommentMessage(filePath, comment.enclosingSymbol),
      ),
    );
  }
  closeRun();

  return violations.sort((a, b) => a.line - b.line);
};

export const lintSource = (filePath: string, sourceText: string): LintViolation[] => {
  const parsed = parseSource(filePath, sourceText);

  const markerErrors = parsed.errors.map(
    (error): LintViolation => violation(filePath, error.line, error.code, error.message),
  );

  return [...commentViolations(filePath, parsed.comments), ...markerErrors].sort(
    (a, b) => a.line - b.line,
  );
};

export const lintPaths = (repoRoot: string, paths?: string[]): LintViolation[] =>
  sourceFilesUnder(repoRoot, paths).flatMap((file) =>
    lintSource(file, readFileSync(join(repoRoot, file), 'utf8')),
  );
