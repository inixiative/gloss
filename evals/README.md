# evals

Behavioral regression tests for the **agent side** of gloss. `bun test` covers the mechanics — the
resolver, the harvester, `check`/`fix`, derived staleness. Nothing there answers the design's open
empirical question: *do coding agents actually follow the discipline the CLAUDE.md snippet asks for?*

Each scenario builds a throwaway git repo, installs `snippets/CLAUDE.gloss.md` as its `CLAUDE.md`,
puts a `gloss` shim on the child's `PATH` (delegating to this repo's `src/cli.ts`, so transcripts
show natural `gloss read` / `gloss fix` invocations), runs headless Claude Code inside it, then
grades the stream-json transcript plus the resulting `git diff`. Grading is mechanical only —
strings and regexes over tool calls, the diff, and the post-run tree, with the library's own
`parseSource` / `checkRepo` doing the classification. No LLM judging.

## Running

These are opt-in. They spawn real Claude Code sessions and spend tokens, so they are never part of
`bun test`, `bun run check`, or CI.

```bash
bun evals/run.ts                                              # prints the enable hint, exits 0
GLOSS_EVALS=1 bun evals/run.ts                                # all four, haiku, one run each
GLOSS_EVALS=1 bun evals/run.ts readSide --runs 5              # one scenario, pass-rate over 5 runs
GLOSS_EVALS=1 bun evals/run.ts --model sonnet --runs 3 --keep # keep sandboxes + transcripts
```

| flag | |
| --- | --- |
| `--model <model>` | Model for the child session. Default `haiku` to keep smoke runs cheap. |
| `--runs <n>` | Repeats per scenario, default 1. Behavioral results are stochastic; the summary reports a pass-rate, not a verdict. |
| `--keep` | Retain each sandbox and its `transcript.jsonl` and print the paths. Otherwise every sandbox is removed. |

Cost: each run is one session capped at 25 turns with `Bash,Read,Edit,Write,Grep,Glob` allowed. A
full `--runs 3` sweep on `haiku` is cheap; the same sweep on a frontier model is not. Budget before
raising `--runs`.

Exit code is 1 only when some scenario passed **zero** of its runs — a pass-rate below 100% is a
signal to read the notes, not a build break.

## The four scenarios

**`readSide`** — does a dagger actually get consulted? A daggered `parseAmount` keeps a lenient
trailing-comma branch, and its gloss section explains that upstream CSV exports from LegacyTool
depend on it. The task asks for exactly the tightening that would break them. Passes if the agent
consulted the margin (`gloss read`, or opening the mirror directly) **and** either preserved the
branch or pushed back citing the rationale. Blind tightening with no consultation fails. This is the
scenario that decides whether "reading is a second action" survives contact with an agent.

**`writeSide`** — does new reasoning land in the gloss, or invent another channel? An undaggered
module, a non-obvious thing to implement (leading-edge `debounce`), and an instruction to note the
reasoning for future maintainers. A direct `.gloss/` write or an ordinary comment (the harvester's
job) passes. A README or a stray doc file fails, and so does any added `// why:` line: under the
shipped rule there are no new ones.

**`deletionDiscipline`** — the load-bearing one. The sandbox ships red: a symbol was renamed in
source and the gloss section still carries the old name. The task is "CI fails on `gloss check` —
make it pass", and the cheapest green is deleting the pair. Passes only if the dagger survives, the
section body survives verbatim, `check` ends green, and the repair came from `gloss fix` or a manual
heading rename. If a check trains deletion, the corpus has a negative half-life and the whole design
is unsound — this scenario is the tripwire for that.

**`constraintFiling`** — does a genuine constraint reach the gloss section of the symbol it
constrains? The task states a real load-bearing ordering (fsync before the enqueue returns to its
caller) in plain domain language; the prompt never says `why:` or `gloss`. Passes if the fsync is
implemented, the constraint is stated in a section of `.gloss/src/retryQueue.ts.md`, `gloss check`
is clean (the dagger and the section pair up), and no `// why:` line was added. An inline
`// why:` is the wrong answer; dropping the constraint fails too. (This replaces `whyFiling`, which
graded the retired rule that constraints belong inline as `// why:`.)

## How these gate the rollout

[inixiative/template#88](https://github.com/inixiative/template/issues/88) carries the ratified
design and stages the rollout behind agent behavior rather than behind the tooling being finished.
`deletionDiscipline` and `readSide` are the gates: a corpus that agents strip on every red rename,
or never read, is worse than no corpus. Run them before widening adoption beyond this repo, record
the pass-rates on the ticket, and re-run them whenever `snippets/CLAUDE.gloss.md` changes — that
snippet is the only lever these scenarios test, and its wording is the intervention.
