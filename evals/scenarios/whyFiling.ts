import { parseSource } from '../../src/index';
import {
  addedLines,
  changedPaths,
  type GradeContext,
  isNarration,
  packageJsonFor,
  type Scenario,
  whyTexts,
} from '../harness';

const SOURCE_PATH = 'src/retryQueue.ts';
const GLOSS_PREFIX = '.gloss/';
const FSYNC_MENTIONED = /fsync|fdatasync/i;
const FSYNC_CALLED = /\bf(?:data)?sync(?:Sync)?\s*\(/i;
const ORDERING_MENTIONED = /\back\b|acknowledg|before\s+return|caller|crash|durab|order/i;

const source = `export type RetryJob = {
  id: string;
  payload: string;
  attempts: number;
};

export const createRetryQueue = () => {
  const pending = new Map<string, RetryJob>();

  return {
    enqueue: (job: RetryJob): void => {
      pending.set(job.id, job);
    },
    ack: (id: string): void => {
      pending.delete(id);
    },
    pendingCount: (): number => pending.size,
  };
};
`;

const index = `export { createRetryQueue, type RetryJob } from './retryQueue';
`;

const isConstraint = (text: string): boolean =>
  FSYNC_MENTIONED.test(text) && ORDERING_MENTIONED.test(text);

const grade = ({ diff, readFile }: GradeContext) => {
  const paths = changedPaths(diff);
  const sourcePaths = paths.filter((path) => path.startsWith('src/') && path.endsWith('.ts'));
  const sourceText = sourcePaths.map((path) => readFile(path) ?? '').join('\n');
  const persisted = FSYNC_CALLED.test(sourceText);

  const sourceWhys = whyTexts(
    sourcePaths
      .flatMap((path) => parseSource(path, readFile(path) ?? '').comments)
      .filter((comment) => comment.kind === 'why')
      .map((comment) => comment.text),
  );
  const addedWhys = whyTexts(addedLines(diff));
  const filedInSource = sourceWhys.some(isConstraint);
  const filedInDiff = addedWhys.some(isConstraint);
  const narrating = sourceWhys.filter(isNarration);
  const glossTouched = paths.some((path) => path.startsWith(GLOSS_PREFIX));

  return {
    pass: persisted && filedInSource && filedInDiff && narrating.length === 0,
    notes: [
      `enqueue actually fsyncs: ${persisted}`,
      `constraint filed inline as '// why:' in source: ${filedInSource}`,
      `that '// why:' line appears in the diff: ${filedInDiff}`,
      `inline '// why:' lines found: ${sourceWhys.join(' / ') || 'none'}`,
      `'// why:' lines that narrate instead of stating a constraint: ${narrating.join(' / ') || 'none'}`,
      `also wrote into ${GLOSS_PREFIX}: ${glossTouched}`,
    ],
  };
};

export const whyFiling: Scenario = {
  name: 'whyFiling',
  files: {
    'package.json': packageJsonFor('why-filing'),
    [SOURCE_PATH]: source,
    'src/index.ts': index,
  },
  task:
    'src/retryQueue.ts holds the retry queue in memory, so a process crash loses every job handed ' +
    'to enqueue. Persist it to a file next to the queue. enqueue must write the job out and fsync ' +
    'it to disk before it returns to its caller: the caller treats a returned enqueue as a durable ' +
    'acknowledgement, so if we return first and fsync afterwards, a crash in that window silently ' +
    'drops a job nobody will ever retry. Make sure future maintainers cannot miss that this ' +
    'ordering is load-bearing.',
  grade,
};
