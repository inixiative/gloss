# gloss, for its Wardens

gloss (`@inixiative/gloss`) is a small published TypeScript package and CLI. It keeps source files
free of comments by moving commentary into a mirrored markdown sidecar: `src/foo.ts` glosses to
`.gloss/src/foo.ts.md`, with one `## <symbol>` section per symbol. Source keeps only daggers
(`// gloss`, `// gloss:file`), machine directives and the rare one-line `// why:`. Most work here
changes one of the existing parts; very little is new.

## Shape of the repository

- `src/`: the library and CLI, one file per part. `src/index.ts` is the only export (`.`); the
  `gloss` bin is `src/cli.ts`.
- `test/`: bun tests, with source fixtures in `test/fixtures/`.
- `evals/`: opt-in behavioural evals that run real Claude Code sessions (never part of the check).
- `snippets/`: the CLAUDE.md block `gloss setup` installs (the comment rule's one source) and the
  lefthook snippet.
- `.gloss/`: this repo's own margin notes.
- `README.md` is the full user doc.

## Systems other code depends on

- The resolver (`parseSource`) binds a dagger to its declaration through the TypeScript AST; lint,
  harvest, check and fix all use it, so there is one answer to "which symbol is this".
- Comment classification (`classifyComments`) and the directive patterns, extensible per repo in
  `package.json` `gloss` config; a config error throws rather than degrading.
- The sidecar format (`parseGlossDoc`, `serializeGlossDoc`, `upsertSection`, `glossPathFor`).
- Git helpers in `src/git.ts`: staleness is derived from git at read time, never stored.
- Agent context (`glossContextForRead`, `glossContextForGrep`) is harness-neutral;
  `src/claudeCode.ts` is the Claude Code adapter, and a hook fails silently.

## Words used here

Gloss (the margin), mirror (the sidecar file), dagger, directive, `why:` line, harvest, section,
preamble, staleness.
