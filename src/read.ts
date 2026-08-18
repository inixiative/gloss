import { join } from 'node:path';
import { glossPathFor, parseGlossDoc } from './glossFile';
import { fileStaleness, readTextFile, sectionStaleness } from './staleness';
import type { Staleness } from './types';

const EPISTEMICS_FOOTER =
  'advisory past-session commentary — trust the code and // why: lines first';

const dayOf = (isoDate: string): string => isoDate.slice(0, 10);

const stalenessNote = (staleness: Staleness): string => {
  if (!staleness.reliable) return `staleness unavailable (${staleness.reason})`;

  const written = `written ${dayOf(staleness.writtenAt)}`;
  if (staleness.sourceChangesSince === 0) return `${written}, source unchanged since`;

  const last =
    staleness.lastSourceChangeAt === undefined
      ? ''
      : ` (last ${dayOf(staleness.lastSourceChangeAt)})`;
  return `${written}, source changed ${staleness.sourceChangesSince}× since${last}`;
};

const headingWithStaleness = (heading: string, staleness: Staleness): string =>
  `${heading}  — ${stalenessNote(staleness)}`;

export const renderGloss = (repoRoot: string, sourceRelPath: string, symbol?: string): string => {
  const markdown = readTextFile(join(repoRoot, glossPathFor(sourceRelPath)));
  if (markdown === undefined) return `no gloss for ${sourceRelPath}\n`;

  const doc = parseGlossDoc(markdown);
  const blocks: string[] = [];

  if (symbol !== undefined) {
    const section = doc.sections.find((candidate) => candidate.symbol === symbol);
    if (!section) return `no gloss for ${sourceRelPath} ${symbol}\n`;

    blocks.push(
      headingWithStaleness(
        `## ${section.symbol}`,
        sectionStaleness(repoRoot, sourceRelPath, symbol),
      ),
    );
    if (section.body !== '') blocks.push(section.body);
    blocks.push(EPISTEMICS_FOOTER);
    return `${blocks.join('\n\n')}\n`;
  }

  blocks.push(
    headingWithStaleness(
      `# ${doc.sourcePath === '' ? sourceRelPath : doc.sourcePath}`,
      fileStaleness(repoRoot, sourceRelPath),
    ),
  );
  if (doc.preamble !== '') blocks.push(doc.preamble);

  for (const section of doc.sections) {
    blocks.push(
      headingWithStaleness(
        `## ${section.symbol}`,
        sectionStaleness(repoRoot, sourceRelPath, section.symbol),
      ),
    );
    if (section.body !== '') blocks.push(section.body);
  }

  blocks.push(EPISTEMICS_FOOTER);
  return `${blocks.join('\n\n')}\n`;
};
