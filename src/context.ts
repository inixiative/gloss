import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { listGlossFiles, normalizeRelPath } from './check';
import { glossPathFor, parseGlossDoc, sourcePathFor } from './glossFile';
import { renderGloss } from './read';

const GLOSS_DIR = '.gloss';
const MIN_TOKEN = 4;
const MAX_GREP_HITS = 8;
const SNIPPET_CHARS = 160;

export type GlossLocation = { repoRoot: string; relPath: string };

const walkUpToGloss = (directory: string): string | undefined => {
  if (existsSync(join(directory, GLOSS_DIR))) return directory;
  const parent = dirname(directory);
  return parent === directory ? undefined : walkUpToGloss(parent);
};

export const findGlossRoot = (startDirectory: string): string | undefined =>
  walkUpToGloss(resolve(startDirectory));

export const locateGlossFile = (absolutePath: string): GlossLocation | undefined => {
  const target = resolve(absolutePath);
  const repoRoot = findGlossRoot(dirname(target));
  if (repoRoot === undefined) return undefined;
  return { repoRoot, relPath: normalizeRelPath(relative(repoRoot, target)) };
};

export const glossContextForRead = (repoRoot: string, relPath: string): string | undefined => {
  if (!existsSync(join(repoRoot, glossPathFor(relPath)))) return undefined;
  return `gloss for ${relPath} (margin commentary; \`bunx gloss read ${relPath} [symbol]\` re-prints it):\n\n${renderGloss(repoRoot, relPath).trimEnd()}`;
};

// gloss
export const identifierToken = (pattern: string): string | undefined => {
  const tokens = pattern.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [];
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
  return longest !== undefined && longest.length >= MIN_TOKEN ? longest : undefined;
};

const snippetOf = (body: string): string => {
  const line = body
    .split('\n')
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate !== '');
  if (line === undefined) return '';
  return line.length > SNIPPET_CHARS ? `${line.slice(0, SNIPPET_CHARS)}…` : line;
};

const sectionHits = (repoRoot: string, token: string): string[] => {
  const lower = token.toLowerCase();
  const hits: string[] = [];
  for (const glossRelPath of listGlossFiles(repoRoot)) {
    const sourcePath = sourcePathFor(glossRelPath);
    if (sourcePath === undefined) continue;
    const doc = parseGlossDoc(readFileSync(join(repoRoot, glossRelPath), 'utf8'));
    for (const section of doc.sections) {
      if (!section.symbol.toLowerCase().includes(lower)) continue;
      const snippet = snippetOf(section.body);
      hits.push(`  ${sourcePath} → ${section.symbol}${snippet === '' ? '' : `: ${snippet}`}`);
      if (hits.length >= MAX_GREP_HITS) return hits;
    }
  }
  return hits;
};

export const glossContextForGrep = (repoRoot: string, pattern: string): string | undefined => {
  const token = identifierToken(pattern);
  if (token === undefined) return undefined;
  const hits = sectionHits(repoRoot, token);
  if (hits.length === 0) return undefined;
  return [
    `gloss sections whose symbol matches "${token}" (\`bunx gloss read <file> <symbol>\` prints one in full):`,
    ...hits,
  ].join('\n');
};
