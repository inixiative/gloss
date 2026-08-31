import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setRepoDirectives } from './comments';
import { setRepoExcludes } from './git';

const PACKAGE_JSON = 'package.json';
const DIRECTIVES_KEY = 'gloss.directives';
const EXCLUDE_KEY = 'gloss.exclude';

const configError = (detail: string, key: string = DIRECTIVES_KEY): Error =>
  new Error(`${key} in ${PACKAGE_JSON}: ${detail}`);

const normalizeExclude = (source: unknown, index: number): string => {
  if (typeof source !== 'string') throw configError(`entry ${index} is not a string`, EXCLUDE_KEY);
  const trimmed = source.trim().replace(/^\.\//, '').replace(/\/+$/, '');
  if (trimmed === '') throw configError(`entry ${index} is empty`, EXCLUDE_KEY);
  return trimmed;
};

const compile = (source: unknown, index: number): RegExp => {
  if (typeof source !== 'string') throw configError(`entry ${index} is not a string`);
  try {
    return new RegExp(source);
  } catch {
    throw configError(`entry ${index} is not a valid regular expression: ${source}`);
  }
};

// why: a config error must throw, never degrade to [] — silently dropping a repo directive
// pattern reclassifies protected machine comments as harvestable and the next harvest sweeps them.
export const loadRepoDirectives = (repoRoot: string): void => {
  const packagePath = join(repoRoot, PACKAGE_JSON);
  if (!existsSync(packagePath)) {
    setRepoDirectives([]);
    setRepoExcludes([]);
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    throw configError(`${PACKAGE_JSON} is not valid JSON`);
  }

  const config = (parsed as { gloss?: { directives?: unknown; exclude?: unknown } })?.gloss;

  const directives = config?.directives ?? [];
  if (!Array.isArray(directives)) throw configError('must be an array of regex strings');
  setRepoDirectives(directives.map(compile));

  const exclude = config?.exclude ?? [];
  if (!Array.isArray(exclude)) throw configError('must be an array of paths', EXCLUDE_KEY);
  setRepoExcludes(exclude.map(normalizeExclude));
};
