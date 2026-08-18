import { readFileSync } from 'node:fs';
import { parseSource } from '../src/index';

export const readFixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

export const parseFixture = (name: string) =>
  parseSource(`test/fixtures/${name}`, readFixture(name));
