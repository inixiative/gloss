import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  findGlossRoot,
  glossContextForGrep,
  glossContextForRead,
  locateGlossFile,
} from './context';

export const CLAUDE_HOOK_EVENTS = ['read', 'grep'] as const;

export type ClaudeHookEvent = (typeof CLAUDE_HOOK_EVENTS)[number];

export const isClaudeHookEvent = (value: string | undefined): value is ClaudeHookEvent =>
  CLAUDE_HOOK_EVENTS.some((event) => event === value);

const MAX_CONTEXT_CHARS = 8000;
const TRUNCATED_NOTE = '… (truncated; run the command above for the rest)';

type PostToolUseInput = {
  cwd?: unknown;
  tool_input?: { file_path?: unknown; pattern?: unknown; path?: unknown };
};

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

const readContext = (input: PostToolUseInput): string | undefined => {
  const filePath = stringOrUndefined(input.tool_input?.file_path);
  if (filePath === undefined) return undefined;
  const location = locateGlossFile(filePath);
  return location && glossContextForRead(location.repoRoot, location.relPath);
};

const grepContext = (input: PostToolUseInput, fallbackCwd: string): string | undefined => {
  const pattern = stringOrUndefined(input.tool_input?.pattern);
  if (pattern === undefined) return undefined;
  const cwd = stringOrUndefined(input.cwd) ?? fallbackCwd;
  const path = stringOrUndefined(input.tool_input?.path);
  const repoRoot = findGlossRoot(path === undefined ? cwd : resolve(cwd, path));
  return repoRoot && glossContextForGrep(repoRoot, pattern);
};

export const claudeHookContext = (
  event: ClaudeHookEvent,
  input: unknown,
  fallbackCwd: string,
): string | undefined => {
  if (typeof input !== 'object' || input === null) return undefined;
  const hookInput = input as PostToolUseInput;
  return event === 'read' ? readContext(hookInput) : grepContext(hookInput, fallbackCwd);
};

export const formatAdditionalContext = (text: string): string | undefined => {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  const body =
    trimmed.length > MAX_CONTEXT_CHARS
      ? `${trimmed.slice(0, MAX_CONTEXT_CHARS)}\n${TRUNCATED_NOTE}`
      : trimmed;
  return JSON.stringify({
    suppressOutput: true,
    hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: body },
  });
};

// why: a hook that throws surfaces as an error to the agent on every Read/Grep; silence is the correct failure mode.
export const runClaudeHook = (
  event: ClaudeHookEvent,
  stdin: string,
  fallbackCwd: string,
  onError: (error: unknown) => void = () => {},
): string | undefined => {
  try {
    const context = claudeHookContext(event, JSON.parse(stdin), fallbackCwd);
    return context === undefined ? undefined : formatAdditionalContext(context);
  } catch (error) {
    onError(error);
    return undefined;
  }
};

const LOCAL_BIN = '"$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss"';

// why: the repo's own installed bin, never `bunx gloss`: a teammate without node_modules would have bunx fetch
// why: the unrelated unscoped `gloss` package on every Read; a missing install stays silent like the hook does.
export const claudeHookCommand = (event: ClaudeHookEvent): string =>
  `test -x ${LOCAL_BIN} && ${LOCAL_BIN} hook ${event} || true`;

export const CLAUDE_HOOK_MATCHERS: Record<ClaudeHookEvent, string> = { read: 'Read', grep: 'Grep' };

export const CLAUDE_HOOK_STATUS: Record<ClaudeHookEvent, string> = {
  read: 'gloss: margin for this file',
  grep: 'gloss: sections for this pattern',
};

export const CLAUDE_SETTINGS_FILE = '.claude/settings.json';

const HOOK_TIMEOUT_SECONDS = 20;
const POST_TOOL_USE = 'PostToolUse';

export type ClaudeHookEntry = {
  type: 'command';
  command: string;
  timeout: number;
  statusMessage: string;
};

export type ClaudeHookGroup = { matcher: string; hooks: ClaudeHookEntry[] };

export const claudeHookEntry = (event: ClaudeHookEvent): ClaudeHookEntry => ({
  type: 'command',
  command: claudeHookCommand(event),
  timeout: HOOK_TIMEOUT_SECONDS,
  statusMessage: CLAUDE_HOOK_STATUS[event],
});

export const claudeHookGroups = (): ClaudeHookGroup[] =>
  CLAUDE_HOOK_EVENTS.map((event) => ({
    matcher: CLAUDE_HOOK_MATCHERS[event],
    hooks: [claudeHookEntry(event)],
  }));

export type ClaudeHooksOutcome = 'created' | 'updated' | 'present' | 'unmergeable';

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const matcherCovers = (matcher: unknown, tool: string): boolean => {
  if (matcher === undefined || matcher === '' || matcher === '*') return true;
  if (typeof matcher !== 'string') return false;
  try {
    return new RegExp(`^(?:${matcher})$`).test(tool);
  } catch {
    return matcher === tool;
  }
};

const commandsFor = (groups: unknown[], tool: string): string[] =>
  groups.flatMap((group) =>
    isObject(group) && Array.isArray(group.hooks) && matcherCovers(group.matcher, tool)
      ? group.hooks.flatMap((hook) =>
          isObject(hook) && typeof hook.command === 'string' ? [hook.command] : [],
        )
      : [],
  );

const hasGlossHook = (groups: unknown[], event: ClaudeHookEvent): boolean => {
  const invocation = new RegExp(`\\bgloss"?\\s+hook\\s+${event}\\b`);
  return commandsFor(groups, CLAUDE_HOOK_MATCHERS[event]).some((command) =>
    invocation.test(command),
  );
};

const addGlossHook = (groups: unknown[], event: ClaudeHookEvent): void => {
  const matcher = CLAUDE_HOOK_MATCHERS[event];
  const sameMatcher = groups.find(
    (group): group is JsonObject & { hooks: unknown[] } =>
      isObject(group) && group.matcher === matcher && Array.isArray(group.hooks),
  );
  if (sameMatcher) sameMatcher.hooks.push(claudeHookEntry(event));
  else groups.push({ matcher, hooks: [claudeHookEntry(event)] });
};

const parseSettings = (path: string): JsonObject | undefined => {
  if (!existsSync(path)) return {};
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    return isObject(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
};

const postToolUseOf = (settings: JsonObject): unknown[] | undefined => {
  if (settings.hooks === undefined) settings.hooks = {};
  if (!isObject(settings.hooks)) return undefined;
  if (settings.hooks[POST_TOOL_USE] === undefined) settings.hooks[POST_TOOL_USE] = [];
  const groups = settings.hooks[POST_TOOL_USE];
  return Array.isArray(groups) ? groups : undefined;
};

// why: settings.json is shared with every other hook and permission in the repo; anything we cannot
// why: parse into the expected shape is left untouched rather than rewritten.
export const installClaudeHooks = (repoRoot: string): ClaudeHooksOutcome => {
  const path = join(repoRoot, CLAUDE_SETTINGS_FILE);
  const existed = existsSync(path);
  const settings = parseSettings(path);
  if (settings === undefined) return 'unmergeable';
  const groups = postToolUseOf(settings);
  if (groups === undefined) return 'unmergeable';

  const missing = CLAUDE_HOOK_EVENTS.filter((event) => !hasGlossHook(groups, event));
  if (missing.length === 0) return 'present';
  for (const event of missing) addGlossHook(groups, event);

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  return existed ? 'updated' : 'created';
};

export const hasClaudeHooks = (repoRoot: string): boolean => {
  const settings = parseSettings(join(repoRoot, CLAUDE_SETTINGS_FILE));
  if (settings === undefined || !isObject(settings.hooks)) return false;
  const groups = settings.hooks[POST_TOOL_USE];
  return Array.isArray(groups) && CLAUDE_HOOK_EVENTS.every((event) => hasGlossHook(groups, event));
};
