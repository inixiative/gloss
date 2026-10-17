import { checkRepo, glossPathFor, parseGlossDoc } from '../../src/index';
import {
  addedLines,
  changedPaths,
  type GradeContext,
  packageJsonFor,
  type Scenario,
  whyTexts,
} from '../harness';

const SOURCE_PATH = 'src/retryQueue.ts';
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

const grade = ({ sandbox, diff, readFile }: GradeContext) => {
  const paths = changedPaths(diff);
  const sourcePaths = paths.filter((path) => path.startsWith('src/') && path.endsWith('.ts'));
  const sourceText = sourcePaths.map((path) => readFile(path) ?? '').join('\n');
  const persisted = FSYNC_CALLED.test(sourceText);

  const glossText = readFile(glossPathFor(SOURCE_PATH));
  const sections = glossText === undefined ? [] : parseGlossDoc(glossText).sections;
  const filedIn = sections.filter((section) => isConstraint(section.body));
  const addedWhys = whyTexts(addedLines(diff));
  const checkClean = checkRepo(sandbox).length === 0;

  return {
    pass: persisted && filedIn.length > 0 && addedWhys.length === 0 && checkClean,
    notes: [
      `enqueue actually fsyncs: ${persisted}`,
      `constraint filed in a gloss section: ${filedIn.map((section) => section.symbol).join(', ') || 'none'}`,
      `'// why:' lines added (the wrong answer): ${addedWhys.join(' / ') || 'none'}`,
      `gloss check clean (dagger and section paired): ${checkClean}`,
    ],
  };
};

export const constraintFiling: Scenario = {
  name: 'constraintFiling',
  files: {
    'package.json': packageJsonFor('constraint-filing'),
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
