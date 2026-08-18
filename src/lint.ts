import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sourceFilesUnder } from './harvest';
import { parseSource } from './resolver';
import { DAGGER, type LintViolation, WHY_PREFIX } from './types';

const forbiddenCommentMessage = (sourcePath: string, symbol: string | undefined): string => {
  const target = symbol === undefined ? 'this file' : `'${symbol}'`;
  return `comment on ${target} is not '// ${WHY_PREFIX}', a '${DAGGER}' dagger or a machine directive; the harvester relocates it into the gloss (run: gloss harvest ${sourcePath})`;
};

export const lintSource = (filePath: string, sourceText: string): LintViolation[] => {
  const parsed = parseSource(filePath, sourceText);

  const forbidden = parsed.comments
    .filter((comment) => comment.kind === 'harvestable')
    .map(
      (comment): LintViolation => ({
        kind: 'forbiddenComment',
        sourcePath: filePath,
        line: comment.startLine,
        message: forbiddenCommentMessage(filePath, comment.enclosingSymbol),
      }),
    );

  const markerErrors = parsed.errors.map(
    (error): LintViolation => ({
      kind: error.code,
      sourcePath: filePath,
      line: error.line,
      message: error.message,
    }),
  );

  return [...forbidden, ...markerErrors].sort((a, b) => a.line - b.line);
};

export const lintPaths = (repoRoot: string, paths?: string[]): LintViolation[] =>
  sourceFilesUnder(repoRoot, paths).flatMap((file) =>
    lintSource(file, readFileSync(join(repoRoot, file), 'utf8')),
  );
