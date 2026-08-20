import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { setRepoDirectives } from './comments';

const PACKAGE_JSON = 'package.json';
const DIRECTIVES_KEY = 'gloss.directives';

const configError = (detail: string): Error =>
  new Error(`${DIRECTIVES_KEY} in ${PACKAGE_JSON}: ${detail}`);

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
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packagePath, 'utf8'));
  } catch {
    throw configError(`${PACKAGE_JSON} is not valid JSON`);
  }

  const directives = (parsed as { gloss?: { directives?: unknown } })?.gloss?.directives ?? [];
  if (!Array.isArray(directives)) throw configError('must be an array of regex strings');

  setRepoDirectives(directives.map(compile));
};
