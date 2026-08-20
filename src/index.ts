export { checkFile, checkRepo } from './check';
export { classifyComments, DIRECTIVE_PATTERNS, setRepoDirectives } from './comments';
export { loadRepoDirectives } from './config';
export { fixRepo } from './fix';
export {
  glossPathFor,
  parseGlossDoc,
  serializeGlossDoc,
  sourcePathFor,
  upsertSection,
} from './glossFile';
export { harvestPaths, harvestSource } from './harvest';
export { sectionHistory } from './history';
export { lintPaths, lintSource } from './lint';
export { renderGloss } from './read';
export { parseSource } from './resolver';
export { readClaudeSnippet, type SetupReport, setup } from './setup';
export { fileStaleness, sectionStaleness } from './staleness';
export * from './types';
