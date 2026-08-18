import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type SetupReport = {
  created: string[];
  updated: string[];
  skipped: string[];
  suggestions: string[];
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
means a section exists here. It is advisory past-session commentary — it may be stale or wrong, so
trust the code and its \`// why:\` lines over it — and \`gloss read <file> [symbol]\` prints a section
with the staleness git derives for it.
`;

const SUGGESTIONS = [
  'Wire the harvester and the check into lefthook.yml — see snippets/lefthook.gloss.yml in @inixiative/gloss.',
  'If this repo publishes to npm, add ".gloss" to package.json "files" so daggers do not dangle for agents reading node_modules.',
  'Run `bunx gloss harvest` once over the tree to lift the comments already in source into the gloss.',
];

export const readClaudeSnippet = (): string => readFileSync(CLAUDE_SNIPPET_URL, 'utf8').trimEnd();

const spliceSnippetBlock = (existing: string, snippet: string): string => {
  const beginIndex = existing.indexOf(BEGIN_MARKER);
  if (beginIndex === -1) {
    const head = existing.trimEnd();
    return head.length === 0 ? `${snippet}\n` : `${head}\n\n${snippet}\n`;
  }

  const endIndex = existing.indexOf(END_MARKER, beginIndex);
  if (endIndex === -1) return `${existing.slice(0, beginIndex)}${snippet}\n`;

  return `${existing.slice(0, beginIndex)}${snippet}${existing.slice(endIndex + END_MARKER.length)}`;
};

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

const ensureClaudeBlock = (repoRoot: string, snippet: string, report: SetupReport): void => {
  const claudePath = join(repoRoot, CLAUDE_FILE);
  if (!existsSync(claudePath)) {
    writeFileSync(claudePath, `${snippet}\n`, 'utf8');
    report.created.push(CLAUDE_FILE);
    return;
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

export const setup = (repoRoot: string): SetupReport => {
  const report: SetupReport = { created: [], updated: [], skipped: [], suggestions: [] };

  ensureGlossReadme(repoRoot, report);
  ensureClaudeBlock(repoRoot, readClaudeSnippet(), report);
  report.suggestions.push(...SUGGESTIONS);

  return report;
};
