import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLAUDE_SETTINGS_FILE,
  claudeHookGroups,
  hasClaudeHooks,
  installClaudeHooks,
} from './claudeCode';

export type SetupReport = {
  created: string[];
  updated: string[];
  skipped: string[];
  suggestions: string[];
  blockDiff: string[];
};

const CLAUDE_SNIPPET_URL = new URL('../snippets/CLAUDE.gloss.md', import.meta.url);

const BEGIN_MARKER = '<!-- gloss:begin -->';
const END_MARKER = '<!-- gloss:end -->';

const GLOSS_DIR = '.gloss';
const GLOSS_README = `${GLOSS_DIR}/README.md`;
const CLAUDE_FILE = 'CLAUDE.md';

const GLOSS_README_BODY = `# .gloss

Margin commentary for this repo's source: \`src/foo.ts\` glosses to \`.gloss/src/foo.ts.md\`, an
\`# src/foo.ts\` h1 plus one \`## <symbol>\` section per symbol, and a \`// gloss\` dagger in the source
means a section exists here. \`gloss read <file> [symbol]\` prints a section with the staleness git
derives for it. The rule for what goes here and how to read it is the gloss block in \`CLAUDE.md\`.
`;

const SUGGESTIONS = [
  'Wire the harvester and the check into lefthook.yml — see snippets/lefthook.gloss.yml in @inixiative/gloss.',
  'If this repo publishes to npm, add ".gloss" to package.json "files" so daggers do not dangle for agents reading node_modules.',
  'Run `bunx gloss harvest` once over the tree to lift the comments already in source into the gloss.',
];

export type SetupOptions = {
  claudeHooks?: boolean;
  updateBlock?: boolean;
};

const HOOKS_OFFER = `Add the gloss Read/Grep hooks to ${CLAUDE_SETTINGS_FILE} so agents see the margin as they read: \`gloss setup --hooks\`.`;

const hooksByHand = (): string =>
  `${CLAUDE_SETTINGS_FILE} could not be merged (not a JSON object with a hooks.PostToolUse array); add these to hooks.PostToolUse by hand: ${JSON.stringify(claudeHookGroups())}`;

export const readClaudeSnippet = (): string => readFileSync(CLAUDE_SNIPPET_URL, 'utf8').trimEnd();

type SnippetBlock = { start: number; end: number; closed: boolean; text: string };

const findSnippetBlock = (existing: string): SnippetBlock | undefined => {
  const start = existing.indexOf(BEGIN_MARKER);
  if (start === -1) return undefined;
  const endIndex = existing.indexOf(END_MARKER, start);
  const end = endIndex === -1 ? existing.length : endIndex + END_MARKER.length;
  return { start, end, closed: endIndex !== -1, text: existing.slice(start, end) };
};

const spliceSnippetBlock = (existing: string, snippet: string): string => {
  const block = findSnippetBlock(existing);
  if (block === undefined) {
    const head = existing.trimEnd();
    return head.length === 0 ? `${snippet}\n` : `${head}\n\n${snippet}\n`;
  }
  return `${existing.slice(0, block.start)}${snippet}${existing.slice(block.end)}`;
};

const lineDiff = (before: string[], after: string[]): string[] => {
  const common = Array.from({ length: before.length + 1 }, () =>
    new Array<number>(after.length + 1).fill(0),
  );
  const at = (i: number, j: number): number => common[i]?.[j] ?? 0;
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      const row = common[i];
      if (row === undefined) continue;
      row[j] = before[i] === after[j] ? at(i + 1, j + 1) + 1 : Math.max(at(i + 1, j), at(i, j + 1));
    }
  }

  const lines: string[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      i += 1;
      j += 1;
    } else if (i < before.length && (j === after.length || at(i + 1, j) >= at(i, j + 1))) {
      lines.push(`- ${before[i]}`);
      i += 1;
    } else {
      lines.push(`+ ${after[j]}`);
      j += 1;
    }
  }
  return lines;
};

export type ClaudeBlockStatus =
  | { state: 'absent' | 'current' }
  | { state: 'customised' | 'unclosed'; diff: string[] };

const normalizeNewlines = (text: string): string => text.replace(/\r\n/g, '\n');

export const claudeBlockStatus = (
  repoRoot: string,
  snippet: string = readClaudeSnippet(),
): ClaudeBlockStatus => {
  const claudePath = join(repoRoot, CLAUDE_FILE);
  if (!existsSync(claudePath)) return { state: 'absent' };
  const block = findSnippetBlock(normalizeNewlines(readFileSync(claudePath, 'utf8')));
  if (block === undefined) return { state: 'absent' };
  if (block.closed && block.text === snippet) return { state: 'current' };
  return {
    state: block.closed ? 'customised' : 'unclosed',
    diff: lineDiff(block.text.split('\n'), snippet.split('\n')),
  };
};

const KEPT_BLOCK_SUGGESTION = `The gloss block in ${CLAUDE_FILE} differs from the shipped snippet and was kept; \`gloss setup --update-block\` replaces it.`;
export const UNCLOSED_BLOCK_SUGGESTION = `${CLAUDE_FILE} has a ${BEGIN_MARKER} with no ${END_MARKER}, so the block would run to the end of the file; it was left alone. Add the end marker where the block ends, then re-run setup.`;

const ensureGlossReadme = (repoRoot: string, report: SetupReport): void => {
  const readmePath = join(repoRoot, GLOSS_README);
  if (existsSync(readmePath)) {
    report.skipped.push(GLOSS_README);
    return;
  }

  mkdirSync(join(repoRoot, GLOSS_DIR), { recursive: true });
  writeFileSync(readmePath, GLOSS_README_BODY, 'utf8');
  report.created.push(GLOSS_README);
};

const ensureClaudeBlock = (
  repoRoot: string,
  snippet: string,
  updateBlock: boolean,
  report: SetupReport,
): void => {
  const claudePath = join(repoRoot, CLAUDE_FILE);
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, `${snippet}\n`, 'utf8');
    report.created.push(CLAUDE_FILE);
    return;
  }

  const status = claudeBlockStatus(repoRoot, snippet);
  if (status.state === 'current') {
    report.skipped.push(CLAUDE_FILE);
    return;
  }
  if (status.state === 'unclosed') {
    report.blockDiff = status.diff;
    report.skipped.push(CLAUDE_FILE);
    report.suggestions.push(UNCLOSED_BLOCK_SUGGESTION);
    return;
  }
  if (status.state === 'customised') {
    report.blockDiff = status.diff;
    if (!updateBlock) {
      report.skipped.push(CLAUDE_FILE);
      report.suggestions.push(KEPT_BLOCK_SUGGESTION);
      return;
    }
  }

  const existing = readFileSync(claudePath, 'utf8');
  const next = spliceSnippetBlock(existing, snippet);
  if (next === existing) {
    report.skipped.push(CLAUDE_FILE);
    return;
  }

  writeFileSync(claudePath, next, 'utf8');
  report.updated.push(CLAUDE_FILE);
};

const ensureClaudeHooks = (repoRoot: string, report: SetupReport): void => {
  const outcome = installClaudeHooks(repoRoot);
  if (outcome === 'created') report.created.push(CLAUDE_SETTINGS_FILE);
  else if (outcome === 'updated') report.updated.push(CLAUDE_SETTINGS_FILE);
  else if (outcome === 'present') report.skipped.push(CLAUDE_SETTINGS_FILE);
  else report.suggestions.push(hooksByHand());
};

export const setup = (repoRoot: string, options: SetupOptions = {}): SetupReport => {
  const report: SetupReport = {
    created: [],
    updated: [],
    skipped: [],
    suggestions: [],
    blockDiff: [],
  };

  ensureGlossReadme(repoRoot, report);
  ensureClaudeBlock(repoRoot, readClaudeSnippet(), options.updateBlock === true, report);
  if (options.claudeHooks === true) ensureClaudeHooks(repoRoot, report);
  else if (options.claudeHooks === undefined && !hasClaudeHooks(repoRoot)) {
    report.suggestions.push(HOOKS_OFFER);
  }
  report.suggestions.push(...SUGGESTIONS);

  return report;
};
