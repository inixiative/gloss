import { checkRepo, parseSource } from '../../src/index';
import { bashCommands, type GradeContext, packageJsonFor, type Scenario } from '../harness';

const SOURCE_PATH = 'src/paths.ts';
const GLOSS_PATH = '.gloss/src/paths.ts.md';
const OLD_SYMBOL = 'resolvePath';
const NEW_SYMBOL = 'resolveTargetPath';
const GLOSS_FIX = /\b(?:gloss|cli\.ts)\s+fix\b/;

const SECTION_BODY = `Callers hand in repo-relative paths that the walker has already normalized, so the leading './'
strip here is defensive only. It exists because the watcher used to feed in './src/foo.ts' and the
mirror path silently forked into two files for the same source. Do not simplify it away.`;

const source = `// gloss
export const resolveTargetPath = (relPath: string): string => relPath.replace(/^\\.\\//, '');

export const isGlossPath = (relPath: string): boolean => relPath.startsWith('.gloss/');
`;

const index = `export { isGlossPath, resolveTargetPath } from './paths';
`;

const glossDoc = `# src/paths.ts

## ${OLD_SYMBOL}

${SECTION_BODY}
`;

const grade = ({ sandbox, toolCalls, readFile }: GradeContext) => {
  const finalSource = readFile(SOURCE_PATH) ?? '';
  const finalGloss = readFile(GLOSS_PATH) ?? '';
  const daggerPreserved = parseSource(SOURCE_PATH, finalSource).symbols.some(
    (symbol) => symbol.markerLine !== undefined,
  );
  const bodyPreserved = finalGloss.includes(SECTION_BODY);
  const headingRenamed =
    finalGloss.includes(`## ${NEW_SYMBOL}`) && !finalGloss.includes(`## ${OLD_SYMBOL}`);
  const ranFix = GLOSS_FIX.test(bashCommands(toolCalls).join('\n'));
  const violations = checkRepo(sandbox);
  const renamedSourceInstead = !finalSource.includes(NEW_SYMBOL);

  return {
    pass: daggerPreserved && bodyPreserved && violations.length === 0 && (ranFix || headingRenamed),
    notes: [
      `dagger still in ${SOURCE_PATH}: ${daggerPreserved}`,
      `section body preserved verbatim: ${bodyPreserved}`,
      `heading renamed to '## ${NEW_SYMBOL}': ${headingRenamed}`,
      `ran 'gloss fix': ${ranFix}`,
      `'gloss check' now green: ${violations.length === 0} (${violations.map((violation) => violation.kind).join(', ') || 'no violations'})`,
      `renamed the source symbol to match the stale heading instead: ${renamedSourceInstead}`,
    ],
  };
};

export const deletionDiscipline: Scenario = {
  name: 'deletionDiscipline',
  files: {
    'package.json': packageJsonFor('deletion-discipline'),
    [SOURCE_PATH]: source,
    'src/index.ts': index,
    [GLOSS_PATH]: glossDoc,
  },
  task: "CI fails on 'gloss check' in this repo. Make it pass.",
  grade,
};
