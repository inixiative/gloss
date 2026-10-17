import { parseSource } from '../../src/index';
import {
  changedPaths,
  type GradeContext,
  packageJsonFor,
  longWhys,
  type Scenario,
  whyComments,
} from '../harness';

const SOURCE_PATH = 'src/debounce.ts';
const GLOSS_PREFIX = '.gloss/';
const DEBOUNCE_DECLARED = /export (?:const|function) debounce\b/;
const TIMER_USED = 'setTimeout';

const source = `export type DebounceOptions = {
  leading?: boolean;
};
`;

const index = `export type { DebounceOptions } from './debounce';
`;

const readme = `# timing

Small timing helpers shared by the scheduler and the upload retry path.
`;

const sourceTextOf = (paths: string[], readFile: GradeContext['readFile']): string =>
  paths.map((path) => readFile(path) ?? '').join('\n');

const grade = ({ diff, readFile }: GradeContext) => {
  const paths = changedPaths(diff);
  const sourcePaths = paths.filter((path) => path.startsWith('src/') && path.endsWith('.ts'));
  const sourceText = sourceTextOf(sourcePaths, readFile);
  const implemented = DEBOUNCE_DECLARED.test(sourceText) && sourceText.includes(TIMER_USED);

  const comments = sourcePaths.flatMap((path) => parseSource(path, readFile(path) ?? '').comments);
  const prose = comments.filter((comment) => comment.kind === 'harvestable');
  const whys = whyComments(sourcePaths, readFile);
  const tooLong = longWhys(sourcePaths, readFile);

  const glossWritten = paths.some((path) => path.startsWith(GLOSS_PREFIX));
  const strayProse = paths.filter((path) => path.endsWith('.md') && !path.startsWith(GLOSS_PREFIX));
  const reasoningLanded = prose.length > 0 || whys.length > 0 || glossWritten;

  return {
    pass: implemented && reasoningLanded && strayProse.length === 0 && tooLong.length === 0,
    notes: [
      `debounce implemented with a timer: ${implemented}`,
      `ordinary comments left for the harvester: ${prose.length}`,
      `wrote into ${GLOSS_PREFIX} directly: ${glossWritten}`,
      `one-line '// why:' comments: ${whys.length}`,
      `multi-line or over-long 'why:' (the wrong answer): ${tooLong.join(', ') || 'none'}`,
      `prose filed outside the gloss: ${strayProse.join(', ') || 'none'}`,
    ],
  };
};

export const writeSide: Scenario = {
  name: 'writeSide',
  files: {
    'package.json': packageJsonFor('write-side'),
    'README.md': readme,
    [SOURCE_PATH]: source,
    'src/index.ts': index,
  },
  task:
    'Add a debounce(fn, waitMs, options) to src/debounce.ts. With { leading: true } it fires ' +
    'immediately on the first call of a burst and suppresses the trailing call for that same ' +
    'burst; with the default options it fires on the trailing edge only. Export it from ' +
    'src/index.ts. The leading-edge interaction is not obvious, so note your reasoning for ' +
    'future maintainers.',
  grade,
};
