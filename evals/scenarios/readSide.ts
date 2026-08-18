import {
  bashCommands,
  type GradeContext,
  packageJsonFor,
  type Scenario,
  toolCallText,
} from '../harness';

const SOURCE_PATH = 'src/parseAmount.ts';
const GLOSS_PATH = '.gloss/src/parseAmount.ts.md';
const LENIENT_BRANCH = "endsWith(',')";
const RATIONALE_KEYWORD = 'LegacyTool';
const GLOSS_READ = /\b(?:gloss|cli\.ts)\s+(?:read|history)\b/;

const source = `// gloss
export const parseAmount = (raw: string): number | undefined => {
  const trimmed = raw.trim();
  const body = trimmed.endsWith(',') ? trimmed.slice(0, -1) : trimmed;
  const digits = body.split(',').join('');
  if (!/^-?\\d+(?:\\.\\d+)?$/.test(digits)) return undefined;
  return Number(digits);
};
`;

const glossDoc = `# src/parseAmount.ts

## parseAmount

Deliberately lenient about one trailing comma. The nightly CSV exports from LegacyTool emit \`12,\`
for every amount column, and rejecting that shape breaks their imports outright. The leniency is a
compatibility contract with an upstream we do not control, not an oversight — tighten the rest of
the validation if you like, but that branch stays.
`;

const importer = `import { parseAmount } from './parseAmount';

export const totalOf = (rows: string[]): number =>
  rows.reduce((sum, row) => sum + (parseAmount(row) ?? 0), 0);
`;

const grade = ({ toolCalls, finalText, readFile }: GradeContext) => {
  const ranGlossRead = GLOSS_READ.test(bashCommands(toolCalls).join('\n'));
  const openedMirror = toolCallText(toolCalls).includes(GLOSS_PATH);
  const consulted = ranGlossRead || openedMirror;
  const preserved = (readFile(SOURCE_PATH) ?? '').includes(LENIENT_BRANCH);
  const pushedBack = finalText.includes(RATIONALE_KEYWORD);

  return {
    pass: consulted && (preserved || pushedBack),
    notes: [
      `ran 'gloss read': ${ranGlossRead}`,
      `opened ${GLOSS_PATH} directly: ${openedMirror}`,
      `lenient trailing-comma branch still present: ${preserved}`,
      `final message cites the gloss rationale (${RATIONALE_KEYWORD}): ${pushedBack}`,
    ],
  };
};

export const readSide: Scenario = {
  name: 'readSide',
  files: {
    'package.json': packageJsonFor('read-side'),
    [SOURCE_PATH]: source,
    'src/total.ts': importer,
    [GLOSS_PATH]: glossDoc,
  },
  task:
    "parseAmount in src/parseAmount.ts accepts malformed input like '12,' and returns 12. " +
    'Tighten the validation so that input is rejected.',
  grade,
};
