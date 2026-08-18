# @inixiative/gloss

**This is about decluttering.** Comments interrupt code; reading a file should be reading the code.
A gloss is a margin: you read the source, and only if you are confused do you read the note beside
it. `@inixiative/gloss` keeps source files comment-free except for the three forms that have to be
inline, and moves everything else into a mirrored sidecar — `src/foo.ts` → `.gloss/src/foo.ts.md`.
Clean source is the primary win; gloss content is upside for whoever reads the file next. An empty
gloss is acceptable, not failure.

## The three permitted comment forms

Everything else in a source file is harvestable, including JSDoc.

**1. `// why:`** — a load-bearing constraint the code can't show. Must-read-now, stays inline,
interrupts on purpose.

```ts
// why: Stripe replays webhooks for up to 3 days; the ledger insert must stay idempotent on eventId.
await ledger.upsert({ where: { eventId }, create: entry, update: {} });
```

**2. Daggers** — content-free existence markers. Fixed strings; any trailing content is a lint
error. `// gloss:file` at the top of a file says a file-level preamble exists; `// gloss` on its own
line immediately above a declaration says that symbol has a gloss section.

```ts
// gloss:file

// gloss
export const resolveMarkerTarget = (source: ParsedSource, line: number) => { ... };
```

**3. Machine directives** — recognized by pattern, extensible per repo: `eslint-disable*`,
`biome-ignore`, `@ts-expect-error` / `@ts-ignore` / `@ts-nocheck`, `prettier-ignore`,
`/// <reference`, shebangs, license headers, `#__PURE__`, webpack/vite magic comments, istanbul/c8,
`@vitest-environment`, `sourceMappingURL`.

```ts
// biome-ignore lint/suspicious/noExplicitAny: the resolver hands back an untyped AST node
```

## The sidecar

Plain markdown, no frontmatter, no schema. An `# <source path>` h1, an optional file preamble, then
one `## <symbol>` section per symbol. Class members key as `Class.method`; `export default` keys as
`default`. Linear and PR references are ordinary markdown links.

```md
# src/resolver.ts

The single marker→symbol resolver. The ESLint rule and the CI check both consume this — two
implementations of "which declaration does this marker belong to" would diverge and produce
lint-passes/CI-fails split-brain.

## resolveMarkerTarget

Skips blank lines and `// why:` lines between the dagger and the declaration, but not decorators —
a decorator is part of the declaration it decorates. Rejects multi-declarator `const a = 1, b = 2`
rather than guessing which half was meant. See [ZLT-1204](https://linear.app/...).

## ParsedSource

`markerLine` is absent for symbols reached without a dagger; the checker uses that to find sections
whose dagger was deleted.
```

## The harvester

The write path is mechanical, not instructional. Comment the way you are trained to; the harvester
sweeps every non-directive, non-`why:`, non-dagger comment out of the source into the enclosing
symbol's gloss section — appending the quoted adjacent code line as an anchor — and plants the
dagger. Nothing depends on an agent remembering a CLAUDE.md line through a long session, and nothing
is deleted to satisfy lint: the spillway fills by machine.

The calm default is harvest-at-commit (`gloss harvest --staged` in pre-commit). `gloss watch` is
opt-in per dev process and heavily debounced — it must never rewrite a file mid-edit, which is the
one real race here: an agent whose `Read` predates the harvest is holding drifted content.

## Derived staleness

`gloss read` prints each section under a header it derives at read time:

```
## resolveMarkerTarget    written 2026-06-14, symbol changed 3× since
```

Both timestamps come from git — the mirror's history for the note, a numeric `git log -L
<start>,<end>:<file>` over the AST-resolved symbol span for the code. Nothing is written into any
file, so nothing can be rubber-stamped fresh. On a shallow clone the header refuses rather than
reporting the clone boundary as "last touched"; after a paired `git mv` it walks back a hop rather
than letting a rename-only commit launder a stale note into a fresh one.

## CLI

Run as `bunx gloss <cmd>`, or `bun src/cli.ts <cmd>` in this repo.

| Command | |
| --- | --- |
| `gloss lint [paths]` | Flag source comments that are not `// why:`, a dagger, or a machine directive. |
| `gloss check` | Bidirectional dagger ⇔ section audit, both directions. Blocking in CI; also the rename/move/orphan detector. |
| `gloss fix` | Repair what `check` found: re-pair renamed symbols, move mirrors after a `git mv`, rewrite header paths. |
| `gloss harvest [paths]` | Sweep harvestable comments into the gloss and plant daggers. `--staged` for the pre-commit path. |
| `gloss watch` | Harvest on save, debounced. Opt-in per dev process. |
| `gloss read <file> [symbol]` | Print the gloss with the derived staleness header per section. |
| `gloss history <file> [symbol]` | Per-section changelog — `git log -p` scoped to one section. |
| `gloss setup [root]` | Create `.gloss/`, install the CLAUDE.md block. Idempotent; upgrades an existing block in place. |

## Setup

```bash
bun add -d @inixiative/gloss
bunx gloss setup
```

`setup` creates `.gloss/` with a header README and appends the agent instructions from
`snippets/CLAUDE.gloss.md` to your `CLAUDE.md`, between `<!-- gloss:begin -->` / `<!-- gloss:end -->`
markers. Re-running it replaces the block between those markers with the current snippet, so an
upgrade is `bunx gloss setup`.

It deliberately does not touch git config, `lefthook.yml`, or your `package.json`. Wire the hooks
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

## Doctrine

**The gloss is advisory.** It is past-session commentary. It may be stale, it may have been wrong
when written. Trust the code and its `// why:` lines over it. This is not a new cost: truth was never
enforceable for comments either, and comments carried no staleness signal at all. The gloss is held
to the standard comments always actually had, plus a derived freshness header they never had.

**Reading it is a second action**, like `git log` or `git blame` — triggered by a visible dagger and
felt confusion, not performed on every read. A gloss consulted 10% of the time still beats a comment
taxing 100% of reads.

**The filing rule.** If deleting a gloss entry could change what correct behavior looks like, it was
misfiled — it belongs in `// why:`. A misfile is recoverable (the content is in the gloss rather than
nowhere, and review can promote it); a `// why:` that was never written is not.

**Never delete a gloss section or a dagger to green a failing check.** Run `gloss fix`. A check that
trains deletion gives the corpus a negative half-life — on every red rename, deleting the pair is the
cheapest green. Repair is built to be strictly cheaper than deletion, and the failure message says so.

## Design

[inixiative/template#88](https://github.com/inixiative/template/issues/88) carries the ratified
design and the full two-round adversarial review — including the mandated changes (no funcname-based
`git log -L`, `fix` ships with the blocking check, one shared marker→symbol resolver) and the risks
accepted with eyes open.
