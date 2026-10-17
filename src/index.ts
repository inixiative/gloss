export { checkFile, checkRepo } from './check';
export {
  CLAUDE_HOOK_EVENTS,
  CLAUDE_SETTINGS_FILE,
  type ClaudeHookEntry,
  type ClaudeHookEvent,
  type ClaudeHookGroup,
  type ClaudeHooksOutcome,
  claudeHookContext,
  claudeHookEntry,
  claudeHookGroups,
  formatAdditionalContext,
  hasClaudeHooks,
  installClaudeHooks,
  isClaudeHookEvent,
  runClaudeHook,
} from './claudeCode';
export { classifyComments, DIRECTIVE_PATTERNS, setRepoDirectives } from './comments';
export { loadRepoDirectives } from './config';
export {
  findGlossRoot,
  type GlossLocation,
  glossContextForGrep,
  glossContextForRead,
  identifierToken,
  locateGlossFile,
} from './context';
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
export {
  claudeBlockDiff,
  readClaudeSnippet,
  type SetupOptions,
  type SetupReport,
  setup,
} from './setup';
export { fileStaleness, sectionStaleness } from './staleness';
export * from './types';
