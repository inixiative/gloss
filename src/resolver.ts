import * as ts from 'typescript';
import {
  blankRanges,
  classifyComments,
  collectComments,
  markerShapeOf,
  type SourceComment,
} from './comments';
import {
  DAGGER,
  FILE_DAGGER,
  type ParsedSource,
  type ResolverError,
  type ResolverErrorCode,
  type SymbolEntry,
  type SymbolKind,
} from './types';

const SCRIPT_KINDS: Record<string, ts.ScriptKind> = {
  '.ts': ts.ScriptKind.TS,
  '.tsx': ts.ScriptKind.TSX,
  '.mts': ts.ScriptKind.TS,
  '.cts': ts.ScriptKind.TS,
};

type BindTarget = {
  start: number;
  symbol?: SymbolEntry;
  invalid?: ResolverErrorCode;
};

const scriptKindFor = (filePath: string): ts.ScriptKind => {
  const dot = filePath.lastIndexOf('.');
  const extension = dot === -1 ? '' : filePath.slice(dot).toLowerCase();
  return SCRIPT_KINDS[extension] ?? ts.ScriptKind.TS;
};

const lineAt = (sourceFile: ts.SourceFile, pos: number): number =>
  ts.getLineAndCharacterOfPosition(sourceFile, pos).line + 1;

const propertyNameText = (name: ts.PropertyName): string | undefined => {
  if (ts.isIdentifier(name) || ts.isPrivateIdentifier(name)) return name.text;
  if (ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return undefined;
};

const memberNameOf = (member: ts.ClassElement): string | undefined => {
  if (ts.isMethodDeclaration(member)) return propertyNameText(member.name);
  if (!ts.isPropertyDeclaration(member) || !member.initializer) return undefined;
  if (!ts.isArrowFunction(member.initializer) && !ts.isFunctionExpression(member.initializer)) {
    return undefined;
  }
  return propertyNameText(member.name);
};

const collectDeclarations = (sourceFile: ts.SourceFile) => {
  const symbols: SymbolEntry[] = [];
  const targets: BindTarget[] = [];
  const byName = new Map<string, SymbolEntry>();

  const addSymbol = (node: ts.Node, name: string, kind: SymbolKind): SymbolEntry => {
    const entry: SymbolEntry = {
      name,
      kind,
      startLine: lineAt(sourceFile, node.getStart(sourceFile)),
      endLine: lineAt(sourceFile, node.getEnd()),
    };
    symbols.push(entry);
    return entry;
  };

  const addTarget = (node: ts.Node, symbol?: SymbolEntry, invalid?: ResolverErrorCode) => {
    targets.push({ start: node.getStart(sourceFile), symbol, invalid });
  };

  const addOverloadable = (node: ts.Node, name: string, kind: SymbolKind) => {
    const existing = byName.get(name);
    if (existing) {
      existing.endLine = Math.max(existing.endLine, lineAt(sourceFile, node.getEnd()));
      addTarget(node, existing);
      return;
    }
    const entry = addSymbol(node, name, kind);
    byName.set(name, entry);
    addTarget(node, entry);
  };

  const addClass = (node: ts.ClassDeclaration) => {
    const className = node.name?.text ?? 'default';
    addOverloadable(node, className, node.name ? 'class' : 'default');
    for (const member of node.members) {
      const memberName = memberNameOf(member);
      if (!memberName) continue;
      addOverloadable(member, `${className}.${memberName}`, 'method');
    }
  };

  const addVariableStatement = (node: ts.VariableStatement) => {
    const declarations = node.declarationList.declarations;
    if (declarations.length !== 1) {
      addTarget(node, undefined, 'multiDeclaratorMarker');
      return;
    }
    const declaration = declarations[0];
    if (!ts.isIdentifier(declaration.name)) return;
    addTarget(node, addSymbol(node, declaration.name.text, 'const'));
  };

  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement)) {
      const name = statement.name?.text ?? 'default';
      addOverloadable(statement, name, statement.name ? 'function' : 'default');
      continue;
    }
    if (ts.isClassDeclaration(statement)) {
      addClass(statement);
      continue;
    }
    if (ts.isInterfaceDeclaration(statement)) {
      addTarget(statement, addSymbol(statement, statement.name.text, 'interface'));
      continue;
    }
    if (ts.isTypeAliasDeclaration(statement)) {
      addTarget(statement, addSymbol(statement, statement.name.text, 'typeAlias'));
      continue;
    }
    if (ts.isEnumDeclaration(statement)) {
      addTarget(statement, addSymbol(statement, statement.name.text, 'enum'));
      continue;
    }
    if (ts.isVariableStatement(statement)) {
      addVariableStatement(statement);
      continue;
    }
    if (ts.isExportAssignment(statement) && !statement.isExportEquals) {
      addTarget(statement, addSymbol(statement, 'default', 'default'));
    }
  }

  return { symbols, targets };
};

const gapIsBindable = (
  blanked: string,
  sourceLines: string[],
  from: number,
  to: number,
  fromLine: number,
  toLine: number,
): boolean => {
  if (blanked.slice(from, to).trim() !== '') return false;
  for (let line = fromLine + 1; line < toLine; line += 1) {
    if ((sourceLines[line - 1] ?? '').trim() === '') return false;
  }
  return true;
};

const bindMarkers = (
  sourceFile: ts.SourceFile,
  sourceText: string,
  comments: SourceComment[],
  targets: BindTarget[],
): { errors: ResolverError[]; hasFileMarker: boolean } => {
  const errors: ResolverError[] = [];
  const blanked = blankRanges(sourceText, comments);
  const sourceLines = sourceText.split('\n');
  const firstStatementStart = sourceFile.statements[0]?.getStart(sourceFile) ?? sourceText.length;

  const markers = comments.flatMap((comment) => {
    const shape = markerShapeOf(comment);
    return shape ? [{ comment, shape }] : [];
  });
  const daggerLines = new Set(
    markers
      .filter(({ comment, shape }) => shape.kind === 'dagger' && shape.exact && comment.ownLine)
      .map(({ comment }) => comment.startLine),
  );

  let hasFileMarker = false;

  for (const { comment, shape } of markers) {
    const line = comment.startLine;

    if (!shape.exact) {
      errors.push({
        code: 'markerTrailingContent',
        line,
        message: `'${comment.text.trim()}' carries trailing content; markers must read exactly '${DAGGER}' or '${FILE_DAGGER}'`,
      });
      continue;
    }

    if (shape.kind === 'fileDagger') {
      if (comment.end <= firstStatementStart) {
        hasFileMarker = true;
        continue;
      }
      errors.push({
        code: 'danglingMarker',
        line,
        message: `'${FILE_DAGGER}' belongs at the top of the file, before the first statement`,
      });
      continue;
    }

    if (!comment.ownLine) {
      errors.push({
        code: 'danglingMarker',
        line,
        message: `'${DAGGER}' must sit on its own line above a declaration`,
      });
      continue;
    }

    if (daggerLines.has(line + 1)) continue;
    if (daggerLines.has(line - 1)) {
      errors.push({
        code: 'stackedMarkers',
        line,
        message: `stacked '${DAGGER}' markers; a declaration takes a single marker`,
      });
    }

    const target = targets.find((candidate) => candidate.start >= comment.end);
    if (!target) {
      errors.push({
        code: 'danglingMarker',
        line,
        message: `'${DAGGER}' is not followed by a declaration`,
      });
      continue;
    }

    const targetLine = lineAt(sourceFile, target.start);
    if (!gapIsBindable(blanked, sourceLines, comment.end, target.start, line, targetLine)) {
      errors.push({
        code: 'danglingMarker',
        line,
        message: `'${DAGGER}' does not sit directly above a declaration`,
      });
      continue;
    }

    if (target.invalid) {
      errors.push({
        code: target.invalid,
        line,
        message: `'${DAGGER}' binds to a declaration list with multiple declarators; split it into one declaration per marker`,
      });
      continue;
    }

    if (target.symbol && target.symbol.markerLine === undefined) target.symbol.markerLine = line;
  }

  return { errors: errors.sort((a, b) => a.line - b.line), hasFileMarker };
};

export const parseSource = (filePath: string, sourceText: string): ParsedSource => {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    scriptKindFor(filePath),
  );
  const { symbols, targets } = collectDeclarations(sourceFile);
  const comments = classifyComments(sourceFile, sourceText, symbols);
  const { errors, hasFileMarker } = bindMarkers(
    sourceFile,
    sourceText,
    collectComments(sourceFile, sourceText),
    targets,
  );
  const firstStatement = sourceFile.statements[0];

  return {
    filePath,
    symbols,
    comments,
    hasFileMarker,
    errors,
    firstStatementLine:
      firstStatement === undefined
        ? undefined
        : lineAt(sourceFile, firstStatement.getStart(sourceFile)),
  };
};
