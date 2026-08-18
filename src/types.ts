export const DAGGER = '// gloss';
export const FILE_DAGGER = '// gloss:file';
export const WHY_PREFIX = 'why:';

export type SymbolKind =
  | 'function'
  | 'class'
  | 'method'
  | 'const'
  | 'interface'
  | 'typeAlias'
  | 'enum'
  | 'default';

export type SymbolEntry = {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  markerLine?: number;
};

export type CommentKind = 'directive' | 'why' | 'dagger' | 'fileDagger' | 'harvestable';

export type CommentHit = {
  kind: CommentKind;
  text: string;
  startLine: number;
  endLine: number;
  enclosingSymbol?: string;
  adjacentCode?: string;
};

export type ResolverErrorCode =
  | 'stackedMarkers'
  | 'danglingMarker'
  | 'multiDeclaratorMarker'
  | 'markerTrailingContent';

export type ResolverError = {
  code: ResolverErrorCode;
  line: number;
  message: string;
};

export type ParsedSource = {
  filePath: string;
  symbols: SymbolEntry[];
  comments: CommentHit[];
  hasFileMarker: boolean;
  errors: ResolverError[];
};

export type GlossSection = {
  symbol: string;
  body: string;
};

export type GlossDoc = {
  sourcePath: string;
  preamble: string;
  sections: GlossSection[];
};

export type HarvestResult = {
  cleanSource: string;
  gloss: GlossDoc;
  moved: CommentHit[];
};

export type CheckViolationKind =
  | 'markerWithoutSection'
  | 'sectionWithoutMarker'
  | 'fileMarkerWithoutPreamble'
  | 'preambleWithoutFileMarker'
  | 'orphanGlossFile'
  | 'headerPathMismatch'
  | 'resolverError';

export type CheckViolation = {
  kind: CheckViolationKind;
  sourcePath: string;
  symbol?: string;
  line?: number;
  message: string;
};

export type FixAction = {
  kind: 'renameSection' | 'moveGlossFile' | 'rewriteHeaderPath';
  detail: string;
};

export type Staleness =
  | {
      reliable: true;
      writtenAt: string;
      sourceChangesSince: number;
      lastSourceChangeAt?: string;
    }
  | {
      reliable: false;
      reason: 'shallowClone' | 'untracked' | 'noHistory';
    };

export type LintViolationKind =
  | 'forbiddenComment'
  | 'markerTrailingContent'
  | 'stackedMarkers'
  | 'danglingMarker'
  | 'multiDeclaratorMarker';

export type LintViolation = {
  kind: LintViolationKind;
  sourcePath: string;
  line: number;
  message: string;
};
