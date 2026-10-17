# @inixiative/gloss

**This is about decluttering.** Comments interrupt code; reading a file should be reading the code.
A gloss is a margin: you read the source, and only if you are confused do you read the note beside
it. `@inixiative/gloss` keeps source files comment-free except for the forms that have to be
inline, and moves everything else into a mirrored sidecar — `src/foo.ts` → `.gloss/src/foo.ts.md`.
Clean source is the primary win; gloss content is upside for whoever reads the file next. An empty
gloss is acceptable, not failure.

## Where the gloss lives

A mirrored tree at the repo root: every source file's margin is the same path under `.gloss/`, with
`.md` appended.

```
src/lens/applyLens.ts        →  .gloss/src/lens/applyLens.ts.md
src/fieldMap/types.ts        →  .gloss/src/fieldMap/types.ts.md
packages/api/src/hooks.ts    →  .gloss/packages/api/src/hooks.ts.md
```

Enumeration respects `.gitignore`: a gitignored source file (generated SDK clients, build
output) is never linted, harvested, or checked, tracked or not. Outside a git repo the full
tree is walked.

`.gloss/` is committed and reviewed like any docs tree — the one exception is
`.gloss/.events.jsonl` (machine-local harvester state), which setup gitignores. A gloss file exists
only when a source file has something in its margin; comment-free files get no mirror.

## The comment rule

The rule agents follow lives in one place: [`snippets/CLAUDE.gloss.md`](snippets/CLAUDE.gloss.md),
which `gloss setup` installs into `CLAUDE.md`. In short: comments are almost never needed; source
keeps daggers, machine directives and the rare one-line `// why:`; everything else goes in the gloss
section of its symbol. This section describes what the tooling recognises.

Everything else in a source file is harvestable, including JSDoc.

**Daggers** — content-free existence markers. Fixed strings; any trailing content is a lint
error. `// gloss:file` at the top of a file says a file-level preamble exists; `// gloss` on its own
line immediately above a declaration says that symbol has a gloss section.

```ts
// gloss:file

// gloss
export const resolveMarkerTarget = (source: ParsedSource, line: number) => { ... };
```

**Machine directives** — recognized by pattern, extensible per repo: `eslint-disable*`,
`biome-ignore`, `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck`, `prettier-ignore`,
`/// <reference`, shebangs, license headers, `#__PURE__`, webpack/vite magic comments, istanbul/c8,
`@vitest-environment`, `sourceMappingURL`.

```ts
// biome-ignore lint/suspicious/noExplicitAny: the resolver hands back an untyped AST node
```

**`// why:`** — a comment whose text starts `why:` in any form (`//`, `///`, `/* */`, own-line or
trailing). Lint allows one short line and flags the rest (`longWhy`): a `why:` spanning more than one
line (consecutive `why:` lines or a multi-line block), or one longer than 120 characters, measured
over the whole comment. A plain comment directly under a `why:` line is reported (`longWhy`) as its overflow. The
harvester never moves a `why:`; it sweeps only the plain overflow, like any other comment. The limit
is per repo:

```json
{ "gloss": { "whyMaxLength": 100 } }
```

Repos with their own machine-read comment forms extend the recognized set in `package.json` —
regex sources tested against the full comment text:

```json
{ "gloss": { "directives": ["@atlas\\b"] } }
```

A config error (non-array, non-string entry, invalid regex, unparseable `package.json`) throws
rather than degrading to no patterns — silently dropping a directive pattern would reclassify
protected machine comments as harvestable and the next harvest would sweep them.

Vendored trees are excluded by path. Enumeration otherwise skips only what `git check-ignore`
skips, so a tracked-but-not-ours directory — a pinned upstream mirror, a generated client — gets
harvested, editing files the repo forbids editing and filing upstream's commentary as our margin:

```json
{ "gloss": { "exclude": [".claude/skills"] } }
```

Entries are path prefixes, never regexes or globs, matched at the segment boundary (`vendor/skill`
does not exclude `vendor/skills`). A leading `./` and trailing slashes normalize away; an empty
entry throws rather than excluding the whole repo. Excludes apply to every surface — harvest,
lint, check, fix.

## The sidecar

Plain markdown, no frontmatter, no schema. An `# <source path>` h1, an optional file preamble, then
one `## <symbol>` section per symbol. Class members key as `Class.method`; `export default` keys as
`default`. Linear and PR references are ordinary markdown links.

An entry that fits on one line is one bullet; anything longer is a paragraph. The `## <symbol>`
heading is the entry's only binding — it is the one link the checker can verify (dagger ↔ section).
A quoted code line or a line number would answer "where does this apply" with a syntactic proxy
that rots silently, so a section names what inside its symbol it means in words, never by line.

```md
# src/resolver.ts

The single marker→symbol resolver. The ESLint rule and the CI check both consume this — two
implementations of "which declaration does this marker belong to" would diverge and produce
lint-passes/CI-fails split-brain.

## resolveMarkerTarget

- a decorator is part of the declaration it decorates

Skips blank lines and other comments between the dagger and the declaration. Rejects
multi-declarator `const a = 1, b = 2` rather than guessing which half was meant. See
[ZLT-1204](https://linear.app/...).

## ParsedSource

`markerLine` is absent for symbols reached without a dagger; the checker uses that to find sections
whose dagger was deleted.
```

## The harvester

The write path is mechanical, not instructional. A comment an agent writes out of habit doesn't stay
in the source: the harvester sweeps every comment that isn't a dagger, a directive or a `// why:`
into the enclosing symbol's gloss section and plants the dagger, and nothing is
deleted to satisfy lint: the spillway fills by machine.

The calm default is harvest-at-commit (`gloss harvest --staged` in pre-commit). `gloss watch` is
opt-in per dev process and heavily debounced — it must never rewrite a file mid-edit, which is the
one real race here: an agent whose `Read` predates the harvest is holding drifted content.

## Derived staleness

`gloss read` prints each section under a header it derives at read time:

```
## resolveMarkerTarget    written 2026-06-14, symbol changed 3× since

- a decorator is part of the declaration it decorates
```

The staleness note is derived from git at read time — a stored date or line number would rot, a
derived one cannot.

Both timestamps come from git — the mirror's history for the note, a numeric `git log -L
<start>,<end>:<file>` over the AST-resolved symbol span for the code. Nothing is written into any
file, so nothing can be rubber-stamped fresh. On a shallow clone the header refuses rather than
reporting the clone boundary as "last touched"; after a paired `git mv` it walks back a hop rather
than letting a rename-only commit launder a stale note into a fresh one.

## CLI

Run as `bunx gloss <cmd>`, or `bun src/cli.ts <cmd>` in this repo.

| Command | |
| --- | --- |
| `gloss lint [paths]` | Flag source comments that belong in the gloss: anything but a dagger, a machine directive or a one-line `// why:` within the limit. |
| `gloss check` | Bidirectional dagger ⇔ section audit, both directions. Blocking in CI; also the rename/move/orphan detector. |
| `gloss fix` | Repair what `check` found: re-pair renamed symbols, move mirrors after a `git mv`, rewrite header paths. |
| `gloss harvest [paths]` | Sweep harvestable comments into the gloss and plant daggers. `--staged` for the pre-commit path. |
| `gloss watch` | Harvest on save, debounced. Opt-in per dev process. |
| `gloss read <file> [symbol]` | Print the gloss with the derived staleness header per section. |
| `gloss history <file> [symbol]` | Per-section changelog — `git log -p` scoped to one section. |
| `gloss setup [--hooks \| --no-hooks] [--update-block]` | Create `.gloss/`, install the CLAUDE.md block, offer the Claude Code hooks (`--hooks` / `--no-hooks` to decide without a prompt). Idempotent; never overwrites a customised block unless confirmed or `--update-block` is passed. |
| `gloss hook <read\|grep>` | Claude Code `PostToolUse` hook: reads the hook JSON on stdin, prints the gloss context as `additionalContext`. |

## Setup

```bash
bun add -d @inixiative/gloss
bunx gloss setup
```

`setup` creates `.gloss/` with a header README and appends the agent instructions from
`snippets/CLAUDE.gloss.md` to your `CLAUDE.md`, between `<!-- gloss:begin -->` / `<!-- gloss:end -->`
markers. With no block it appends one; with a block identical to the snippet it does nothing.

A block that differs from the shipped snippet (an upgrade, or a repo's own ruling) is never
overwritten silently. Setup prints the difference (`-` the repo's lines, `+` the shipped ones) and
then, on a TTY, asks whether to replace it (default no); without a TTY it keeps the block and says
so. `bunx gloss setup --update-block` replaces it without asking, which is how an upgrade lands.
Line endings are compared as `\n`, so a CRLF copy of the snippet counts as identical. A begin
marker with no end marker is never replaced, flag or not, because the block would run to the end
of the file; setup says so and leaves it for you to close. An existing `.gloss/README.md` is never
rewritten.

It deliberately does not touch git config, `lefthook.yml`, or your `package.json`; the only other file
it may write is `.claude/settings.json`, and only for the [agent hooks](#agent-hooks) you accept. Wire the hooks
yourself from `snippets/lefthook.gloss.yml`:

```yaml
pre-commit:
  commands:
    gloss-harvest:
      glob: '*.{ts,tsx}'
      run: bunx gloss harvest --staged
      stage_fixed: true

pre-push:
  commands:
    gloss-check:
      run: bunx gloss check
```

If the repo publishes to npm, add `.gloss` to `package.json` `files` — our own agents read published
source in `node_modules`, and daggers must not dangle downstream.

## Agent hooks

The margin is worth most at the moment an agent reads the file, so gloss ships it as a Claude Code
hook rather than waiting for the agent to run `gloss read`:

- **Read** of a file with a margin → the rendered gloss (with staleness), as if `gloss read <file>` ran.
- **Grep** for an identifier → the gloss sections whose symbol contains the pattern's longest
  identifier run (four characters or more), each with its first line, at most eight.

`gloss setup` asks whether to add them; `gloss setup --hooks` adds them without asking and
`--no-hooks` skips them silently (declined, or without a TTY and without a flag, setup skips and
prints the suggestion).
It merges into `.claude/settings.json`: an existing `Read` or `Grep` matcher group gets the entry
appended, other hooks and keys are left as they are, an entry already present (any command that runs
`gloss hook read` / `gloss hook grep` under a matcher covering that tool) is never duplicated, and a file it cannot parse is left
untouched with the entries printed to add by hand. The result:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Read",
        "hooks": [
          {
            "type": "command",
            "command": "test -x \"$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss\" && \"$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss\" hook read || true",
            "timeout": 20,
            "statusMessage": "gloss: margin for this file"
          }
        ]
      },
      {
        "matcher": "Grep",
        "hooks": [
          {
            "type": "command",
            "command": "test -x \"$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss\" && \"$CLAUDE_PROJECT_DIR/node_modules/.bin/gloss\" hook grep || true",
            "timeout": 20,
            "statusMessage": "gloss: sections for this pattern"
          }
        ]
      }
    ]
  }
}
```

The command runs the repo's installed bin, not `bunx gloss`: without `node_modules`, `bunx` would
fetch the unrelated unscoped `gloss` package on every Read. A checkout that has not run the install
gets no context and no error.

The hook fails silently: bad input, a file outside a glossed tree, or no margin prints nothing and
exits 0, because a hook that errors interrupts the agent on every Read. `GLOSS_HOOK_DEBUG=1` prints
the swallowed error to stderr. Output is capped at 8,000 characters.

The core is harness-neutral: `glossContextForRead(repoRoot, relPath)` and
`glossContextForGrep(repoRoot, pattern)` return the context text, and `src/claudeCode.ts` is the
Claude Code adapter (stdin JSON in, `hookSpecificOutput.additionalContext` out, settings merge).
Another harness gets its own adapter over the same two functions.

## Doctrine

**The gloss is advisory.** It is past-session commentary. It may be stale, it may have been wrong
when written. Trust the code over it. This is not a new cost: truth was never
enforceable for comments either, and comments carried no staleness signal at all. The gloss is held
to the standard comments always actually had, plus a derived freshness header they never had.

**Reading it is a second action**, like `git log` or `git blame` — triggered by a visible dagger and
felt confusion, not performed on every read. A gloss consulted 10% of the time still beats a comment
taxing 100% of reads.

**Never delete a gloss section or a dagger to green a failing check.** Run `gloss fix`. A check that
trains deletion gives the corpus a negative half-life — on every red rename, deleting the pair is the
cheapest green. Repair is built to be strictly cheaper than deletion, and the failure message says so.

## Design

[inixiative/template#88](https://github.com/inixiative/template/issues/88) carries the ratified
design and the full two-round adversarial review — including the mandated changes (no funcname-based
`git log -L`, `fix` ships with the blocking check, one shared marker→symbol resolver) and the risks
accepted with eyes open.
