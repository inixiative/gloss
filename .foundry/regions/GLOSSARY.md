# foundry-regions glossary

**Every term foundry-regions's region Wardens use, alphabetical, each with the region that holds it.**

<!-- Generated with the region Warden docs by the region pipeline's assemble.py. A term defined by two regions appears once per region. -->

---

## 2

**25 turns**  
Per-run session cap, with Bash,Read,Edit,Write,Grep,Glob allowed. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## 8

**8,000 characters**  
Cap on hook output. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

## A

**additionalContext**  
The `hookSpecificOutput.additionalContext` field the hook prints, carrying the gloss text. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**advisory gloss**  
Doctrine: gloss is past-session commentary that may be stale; trust the code. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**agent-context**  
Class: harness-neutral context text for an agent's Read or Grep (glossContextForRead, glossContextForGrep). *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

## B

**behavioural-evals**  
Class: opt-in evals running real Claude Code sessions against the snippet. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## C

**check-fix**  
Class: the dagger↔section audit (checkRepo/checkFile) and its repair (fixRepo). *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**checkRepo**  
Public: returns CheckViolations for the repo or scoped paths. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**classifyComments**  
Public: returns each comment's kind and enclosing symbol. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**claude-code-hooks**  
Class: the Claude Code adapter: PostToolUse hook I/O, silent failure, output cap, settings.json merge. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**.claude/settings.json**  
Claude Code settings file shared with other hooks; the only extra file setup may write. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**claudeBlockStatus**  
Read-only report of the CLAUDE.md gloss block's state against the snippet. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**claudeHookContext**  
Computes gloss context text for an already-parsed Claude hook payload. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**cli**  
Class: the gloss bin dispatcher in src/cli.ts: command table, runners, exit codes. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**comment-classification**  
Class: sorting a file's comments into daggers, directives, why: and harvestable ones. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**comment-rule**  
Class: the rule for what comments may stay in source, plus the doctrine rules around the gloss. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**constraintFiling**  
Scenario: a real fsync-ordering constraint filed as one-line why: or in the gloss. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## D

**dagger**  
Content-free marker: `// gloss` above a declaration says it has a section; trailing text is a lint error. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**dagger**  
`// gloss` above a declaration, planted by harvest, paired with a section by check. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**dagger-resolver**  
Class: the one TypeScript-AST resolver binding a dagger to its declaration (parseSource). *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**deletionDiscipline**  
Scenario: repair a red rename with gloss fix, never delete the pair; the tripwire. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**derived staleness**  
Note age versus symbol change count computed from git when read, never stored in a file. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**DIRECTIVE_PATTERNS**  
The built-in regexes for machine directives. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

## E

**escapeHeadings**  
Internal: escapes harvested lines starting with '#' so they cannot fabricate sections. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**evals/run.ts**  
The eval runner: scenarios in throwaway git repos, reports pass-rate. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## F

**fails silently**  
Bad input, no margin or a file outside a glossed tree prints nothing and exits 0. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**file dagger**  
`// gloss:file` at the top of a file: a file-level preamble exists in the gloss. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**file-enumeration**  
Class: which source files every surface touches (.gitignore via git check-ignore, gloss.exclude prefixes, path args). *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**fileStaleness**  
Public: staleness verdict for a whole file's gloss. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**findGlossRoot**  
Public: walks up from a directory to the repo root holding gloss. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**fixRepo**  
Public: applies FixActions (renameSection, moveGlossFile, rewriteHeaderPath). *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**forbiddenComment**  
Lint violation: a comment in source that belongs in the gloss. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

## G

**git log -L**  
Numeric line-range log over the AST-resolved symbol span; never funcname-based. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**git-helpers**  
Class: the internal git wrapper layer in src/git.ts. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**gloss**  
The margin note for a source file: .gloss/<path>.md, one `## <symbol>` section per symbol. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**gloss block**  
The CLAUDE.md text between `<!-- gloss:begin -->` and `<!-- gloss:end -->`, copied from the snippet. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**gloss harvest --staged**  
Pre-commit harvest of staged files; the default write path. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**gloss history**  
CLI: per-section changelog from git log -p scoped to one section. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**gloss hook <read|grep>**  
CLI command a Claude Code hook runs: reads hook JSON on stdin, prints gloss context. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**gloss read**  
CLI: prints a file's gloss, or one symbol's section, with a staleness header per section. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**gloss setup**  
Creates .gloss/, installs the CLAUDE.md block, offers hooks; idempotent. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**gloss shim**  
A gloss on the child's PATH delegating to this repo's src/cli.ts. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**gloss watch**  
Opt-in save-time harvest, heavily debounced (DEFAULT_DEBOUNCE_MS). *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**gloss.directives**  
package.json regex sources adding repo-specific directives, tested against the full comment text. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**gloss.exclude**  
package.json path prefixes for vendored, tracked-but-not-ours trees; segment-boundary match, no regex or glob. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**gloss.exclude**  
package.json path prefixes skipped by harvest, lint, check and fix; segment-boundary match. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**gloss.whyMaxLength**  
package.json per-repo why: length limit; default 120 (DEFAULT_WHY_MAX_LENGTH). *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**.gloss/**  
The committed mirror tree at the repo root that holds every sidecar. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**.gloss/.events.jsonl**  
Machine-local harvester state; the one gitignored file under .gloss/. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**GLOSS_EVALS=1**  
Env var that enables the evals; without it the runner prints a hint and exits 0. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**GLOSS_HOOK_DEBUG**  
Env var; `GLOSS_HOOK_DEBUG=1` prints the hook's swallowed error to stderr. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**glossContextForGrep**  
Returns up to eight sections whose symbol contains the pattern's longest identifier run (4+ chars). *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**glossContextForRead**  
Returns the rendered gloss for a file being read (as `gloss read` would). *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**GlossDoc**  
Parsed sidecar data from parseGlossDoc: source path, preamble, sections. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**glossPathFor**  
Public: maps a repo-relative source path to its sidecar path. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

## H

**harvest**  
Class: moving source comments into sidecar sections and planting daggers. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**harvestable**  
Any comment that is not a dagger, directive or why:, JSDoc included; the harvester sweeps it. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**harvestPaths**  
Public: harvests files on disk under paths and reports counts. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**harvestSource**  
Public: harvests one in-memory source string into a gloss doc. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**hasClaudeHooks**  
Read-only check whether .claude/settings.json already has the gloss hooks. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**headerPathMismatch**  
Check violation: the sidecar's `# <path>` h1 does not match its source path. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**--hooks / --no-hooks**  
Setup flags to add or skip the Claude Code hooks without a prompt. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

## I

**identifierToken**  
Picks the longest identifier-shaped run from a grep regex; the only part worth looking up. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**ignoredPaths**  
Internal: gitignored paths via git check-ignore; no git or nothing ignored means filter nothing. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**installClaudeHooks**  
Merges the gloss Read/Grep hook entries into .claude/settings.json. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**installed bin**  
The hook command runs `$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss`, never `bunx gloss`. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**isEntryPath**  
Internal cli.ts check that the bin is the entry, resolving symlinked node_modules/.bin/gloss. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**isExcluded**  
Internal: tests a path against gloss.exclude prefixes. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**isShallowRepository**  
Internal: detects a shallow clone. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

## J

**jsxCommentContainers**  
Internal: JSX `{/* */}` braces that hold only a comment and are removed along with it. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

## K

**--keep**  
Keep each sandbox and its transcript.jsonl and print the paths. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## L

**lint**  
Class: `gloss lint`, lintPaths and lintSource, which flag comments that belong in the gloss. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**lintPaths**  
Public: lints files under paths from disk, as `gloss lint` does. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**lintSource**  
Public: lints one in-memory source string. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**loadRepoDirectives**  
Reads the package.json `gloss` block and applies directives, exclude and whyMaxLength; throws on a bad config. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**locateGlossFile**  
Public: finds the existing sidecar for a source file. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**longWhy**  
Lint warning (never a failure) for a why: past one line or past whyMaxLength. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

## M

**machine directive**  
A comment tools read (eslint-disable, biome-ignore, @ts-expect-error, shebang, license header, sourceMappingURL); never harvested. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**markerTrailingContent**  
Lint violation: a dagger with text after it. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**markerWithoutSection**  
Check violation: a dagger whose symbol has no section. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**matcher group**  
A PostToolUse entry for one tool (Read or Grep); gloss appends to an existing one instead of duplicating. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**mechanical grading**  
Strings, regexes, git diff and parseSource/checkRepo; no LLM judging. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**--model**  
Model for the child session; default haiku to keep smoke runs cheap. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## N

**noHistory**  
Unreliable reason: git has no commits for the note or code. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

## O

**orphanGlossFile**  
Check violation: a sidecar whose source file no longer exists. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

## P

**package.json files**  
A repo that publishes to npm adds `.gloss` here so daggers don't dangle downstream. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**parseSource**  
Public: parses a TypeScript file into its markers and the symbols they annotate. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**pass-rate**  
Share of runs a scenario passed; below 100% is a signal, not a build break. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**PostToolUse**  
The Claude Code hook event gloss uses, after Read or Grep, to add context. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**preamble**  
Optional file-level text under the `# <path>` h1; paired with `// gloss:file`. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

## R

**readClaudeSnippet**  
Returns the bundled snippet text. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**readSide**  
Scenario: does the agent consult the margin before tightening a daggered parseAmount. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**rename-only commit**  
A pure `git mv`; staleness walks back past it so it cannot freshen a note. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**renderGloss**  
Public: the text `gloss read` prints. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**repo-config**  
Class: the package.json `gloss` block (directives, whyMaxLength, exclude) and how it is loaded. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**rollout gate**  
deletionDiscipline and readSide pass-rates gate widening adoption. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**runClaudeHook**  
Hook entry point: raw stdin in, response JSON text out; never throws. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**runCommand**  
Internal cli.ts dispatcher; runs the hook branch before findRepoRoot and loadRepoDirectives. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**runGit**  
Internal: the single wrapper that runs a git command. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**--runs**  
Repeats per scenario, default 1; the summary reports a pass-rate. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

## S

**sandbox**  
The throwaway git repo a scenario builds and removes unless --keep. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**section**  
A `## <symbol>` block in a sidecar; the heading is its only binding to code. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**sectionHistory**  
Public: commits that changed a section, or the whole sidecar when no symbol is given. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**sectionStaleness**  
Public: staleness verdict for one symbol's section. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**sectionWithoutMarker**  
Check violation: a section whose dagger is gone or whose symbol was renamed. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**setup**  
Class: `gloss setup` and its library function: .gloss/, the CLAUDE.md block, offering hooks. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**shallowClone**  
Unreliable reason: history is cut off, so the header refuses instead of guessing. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**sidecar**  
The gloss file for one source file: .gloss/<source path>.md. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**sidecar-format**  
Class: the .gloss/ mirror layout and the markdown format of a gloss file. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**snippets/CLAUDE.gloss.md**  
The shipped agent instruction snippet; the single source of the CLAUDE.md block. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**snippets/CLAUDE.gloss.md**  
The snippet the scenarios install; the only lever they test. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**snippets/CLAUDE.gloss.md**  
The one source of the agent comment rule, installed into CLAUDE.md by `gloss setup`. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**sourceChangesSince**  
How many commits changed the symbol's code since the note was written. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**sourcePathFor**  
Public: maps a sidecar path back to its source path; undefined for non-gloss paths. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

**Staleness**  
Result type: reliable with writtenAt and sourceChangesSince, or unreliable with a reason. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**staleness-read**  
Class: `gloss read` / `gloss history` and the staleness derived from git at read time. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**stream-json transcript**  
The headless session's tool-call log that grading reads. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)

**symbol key**  
Section name for a symbol: its name, `Class.method` for members, `default` for export default. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

## U

**untracked**  
Unreliable reason: the file is not in git. *Region:* [Read and derived staleness](read-and-staleness/knowledge.md)

**--update-block**  
Setup flag that replaces a differing CLAUDE.md block without asking; how upgrades land. *Region:* [Agent hooks, setup and CLI](agent-integration-setup-and-cli/knowledge.md)

**upsertSection**  
Public: inserts or replaces one symbol's section in a parsed doc. *Region:* [Sidecar, harvest and check](sidecar-harvest-and-check/knowledge.md)

## W

**// why:**  
The rare one-line inline constraint comment; the harvester never moves it. *Region:* [Comment rule and source scanning](comment-rule-and-source-scanning/knowledge.md)

**writeSide**  
Scenario: does new reasoning land in .gloss/ or one short why:, not README. *Region:* [Behavioural agent evals](behavioural-evals/knowledge.md)
