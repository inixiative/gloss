import type { Scenario } from '../harness';
import { deletionDiscipline } from './deletionDiscipline';
import { readSide } from './readSide';
import { whyFiling } from './whyFiling';
import { writeSide } from './writeSide';

export const scenarios: Scenario[] = [readSide, writeSide, deletionDiscipline, whyFiling];

export const scenarioNames = (): string[] => scenarios.map((scenario) => scenario.name);

export const scenariosNamed = (names: string[]): Scenario[] =>
  names.map((name) => {
    const found = scenarios.find((scenario) => scenario.name === name);
    if (!found) {
      throw new Error(`unknown scenario '${name}'; known scenarios: ${scenarioNames().join(', ')}`);
    }
    return found;
  });
