import { destroySandbox, requireClaudeBinary, runScenario, type Scenario } from './harness';
import { scenarioNames, scenarios, scenariosNamed } from './scenarios';

const ENABLE_VARIABLE = 'GLOSS_EVALS';
const DEFAULT_MODEL = 'haiku';
const DEFAULT_RUNS = 1;

type Options = {
  selected: Scenario[];
  model: string;
  runs: number;
  keep: boolean;
};

type Tally = {
  scenario: string;
  passed: number;
  runs: number;
};

const report = (line: string): void => {
  process.stdout.write(`${line}\n`);
};

const enableHint = (): string =>
  [
    'gloss evals are opt-in: every run spawns a headless Claude Code session and spends tokens.',
    '',
    `  ${ENABLE_VARIABLE}=1 bun evals/run.ts [scenario...] [--model <model>] [--runs <n>] [--keep]`,
    '',
    `  scenarios  ${scenarioNames().join(', ')}`,
    `  --model    default ${DEFAULT_MODEL}`,
    `  --runs     repeats per scenario, default ${DEFAULT_RUNS}; behavioral results are stochastic`,
    '  --keep     retain each sandbox and transcript for inspection',
  ].join('\n');

const valueFor = (argv: string[], index: number, flag: string): string => {
  const value = argv[index];
  if (value === undefined || value.startsWith('-')) throw new Error(`${flag} needs a value`);
  return value;
};

const parseOptions = (argv: string[]): Options => {
  const names: string[] = [];
  let model = DEFAULT_MODEL;
  let runs = DEFAULT_RUNS;
  let keep = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--keep') {
      keep = true;
      continue;
    }
    if (arg === '--model') {
      index += 1;
      model = valueFor(argv, index, '--model');
      continue;
    }
    if (arg === '--runs') {
      index += 1;
      runs = Number(valueFor(argv, index, '--runs'));
      continue;
    }
    if (arg.startsWith('-')) throw new Error(`unknown option '${arg}'`);
    names.push(arg);
  }

  if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer');

  return { selected: names.length === 0 ? scenarios : scenariosNamed(names), model, runs, keep };
};

const summaryTable = (tallies: Tally[]): string[] => {
  const width = Math.max(8, ...tallies.map((tally) => tally.scenario.length));
  const header = `  ${'scenario'.padEnd(width)}  passed  runs  rate`;
  const rows = tallies.map((tally) => {
    const rate = `${Math.round((tally.passed / tally.runs) * 100)}%`;
    return `  ${tally.scenario.padEnd(width)}  ${String(tally.passed).padStart(6)}  ${String(tally.runs).padStart(4)}  ${rate.padStart(4)}`;
  });
  return [header, ...rows];
};

const runTally = (scenario: Scenario, options: Options): Tally => {
  let passed = 0;

  for (let run = 1; run <= options.runs; run += 1) {
    const outcome = runScenario(scenario, options.model);
    if (outcome.grade.pass) passed += 1;

    report(
      `${outcome.grade.pass ? 'PASS' : 'FAIL'}  ${scenario.name}  run ${run}/${options.runs}  ${outcome.transcript.toolCalls.length} tool calls`,
    );
    for (const note of outcome.grade.notes) report(`        ${note}`);

    if (options.keep) {
      report(`        sandbox     ${outcome.sandbox.root}`);
      report(`        transcript  ${outcome.sandbox.transcriptPath}`);
    } else {
      destroySandbox(outcome.sandbox);
    }
    report('');
  }

  return { scenario: scenario.name, passed, runs: options.runs };
};

const main = (): number => {
  if (process.env[ENABLE_VARIABLE] !== '1') {
    report(enableHint());
    return 0;
  }

  const options = parseOptions(process.argv.slice(2));
  const version = requireClaudeBinary();

  report(
    `gloss behavioral evals — claude ${version}, model ${options.model}, ${options.runs} run(s) per scenario`,
  );
  report('each run drives a real headless Claude Code session against a throwaway repo');
  report('');

  const tallies = options.selected.map((scenario) => runTally(scenario, options));
  for (const line of summaryTable(tallies)) report(line);

  const dead = tallies.filter((tally) => tally.passed === 0);
  if (dead.length === 0) return 0;

  report('');
  report(`no run passed for: ${dead.map((tally) => tally.scenario).join(', ')}`);
  return 1;
};

try {
  process.exit(main());
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}
