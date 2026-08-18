import type { GlossDoc, GlossSection } from './types';

const GLOSS_DIR = '.gloss';
const GLOSS_EXTENSION = '.md';

const HEADING = /^#(?!#)\s*(.*)$/;
const SECTION_HEADING = /^##(?!#)\s*(.*)$/;
const FENCE = /^\s*(?:```|~~~)/;

const normalizeRelative = (path: string): string => path.replace(/^\.\//, '').replace(/^\/+/, '');

export const glossPathFor = (sourceRelPath: string): string =>
  `${GLOSS_DIR}/${normalizeRelative(sourceRelPath)}${GLOSS_EXTENSION}`;

export const sourcePathFor = (glossRelPath: string): string | undefined => {
  const normalized = normalizeRelative(glossRelPath);
  if (!normalized.startsWith(`${GLOSS_DIR}/`)) return undefined;
  if (!normalized.endsWith(GLOSS_EXTENSION)) return undefined;
  const sourcePath = normalized.slice(GLOSS_DIR.length + 1, -GLOSS_EXTENSION.length);
  return sourcePath === '' ? undefined : sourcePath;
};

export const parseGlossDoc = (markdown: string): GlossDoc => {
  const sections: GlossSection[] = [];
  const preambleLines: string[] = [];
  let sourcePath = '';
  let sawSourcePath = false;
  let inFence = false;
  let current: { symbol: string; body: string[] } | undefined;

  const flush = () => {
    if (!current) return;
    sections.push({ symbol: current.symbol, body: current.body.join('\n').trim() });
    current = undefined;
  };

  for (const line of markdown.split('\n')) {
    if (FENCE.test(line)) inFence = !inFence;

    if (!inFence) {
      const sectionHeading = SECTION_HEADING.exec(line);
      if (sectionHeading) {
        flush();
        current = { symbol: sectionHeading[1].trim(), body: [] };
        continue;
      }
      if (!sawSourcePath && !current) {
        const heading = HEADING.exec(line);
        if (heading) {
          sourcePath = heading[1].trim();
          sawSourcePath = true;
          continue;
        }
      }
    }

    if (current) current.body.push(line);
    else preambleLines.push(line);
  }
  flush();

  return { sourcePath, preamble: preambleLines.join('\n').trim(), sections };
};

export const serializeGlossDoc = (doc: GlossDoc): string => {
  const blocks: string[] = [`# ${doc.sourcePath}`.trimEnd()];
  const preamble = doc.preamble.trim();
  if (preamble !== '') blocks.push(preamble);

  for (const section of doc.sections) {
    blocks.push(`## ${section.symbol}`.trimEnd());
    const body = section.body.trim();
    if (body !== '') blocks.push(body);
  }

  return `${blocks.join('\n\n')}\n`;
};

export const upsertSection = (doc: GlossDoc, symbol: string, body: string): GlossDoc => {
  const next = { symbol, body: body.trim() };
  const exists = doc.sections.some((section) => section.symbol === symbol);
  const sections = exists
    ? doc.sections.map((section) => (section.symbol === symbol ? next : section))
    : [...doc.sections, next];
  return { ...doc, sections };
};
