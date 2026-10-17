<!-- gloss:begin -->
## Gloss — commentary lives in the margin, not in the code

**Comments are almost never needed.** Name things so the code explains itself. When something must
be said — a load-bearing constraint the code can't show — it goes in the gloss section of the symbol
it constrains, not in the source.

Source files carry only two comment forms:

1. Daggers — content-free existence markers, exact strings, trailing content is a lint error.
   `// gloss` on its own line above a declaration = that symbol has a gloss section.
   `// gloss:file` at the top of a file = a file-level preamble exists.
2. Machine directives — `eslint-disable*`, `biome-ignore`, `@ts-expect-error`/`@ts-ignore`/
   `@ts-nocheck`, `prettier-ignore`, `/// <reference`, shebangs, license headers, `#__PURE__`,
   bundler magic comments, istanbul/c8, `@vitest-environment`, `sourceMappingURL`.

**No `// why:` lines.** `gloss lint` flags them, and `gloss harvest` moves an existing one into its
symbol's gloss section like any other comment.

**Writing.** Write the section yourself: `src/foo.ts` glosses to `.gloss/src/foo.ts.md`, with an
`# src/foo.ts` h1, an optional preamble, and one `## <symbol>` section per symbol (`Class.method` for
members, `default` for `export default`), and put the `// gloss` dagger above the declaration. A
plain comment left in the source is swept by the harvester into its enclosing symbol's section, with
the dagger planted.

**Reading.** A `// gloss` dagger means margin commentary exists for that symbol. Reading it is a
second action, like `git log`: do it when a dagger is present and the code doesn't self-explain.
`gloss read <file> [symbol]`.

In Claude Code the second action is done for you: `gloss hook read` (installed by
`gloss setup --hooks`) appends the file's gloss to every `Read`, and `gloss hook grep` lists gloss
sections whose symbol matches a `Grep` pattern. Treat what they print with the epistemics below.

**Epistemics.** The gloss is advisory past-session commentary. It may be stale or wrong. Trust the
code over it.

**NEVER delete a gloss section or a dagger to green a failing check.** Run `gloss fix`.
<!-- gloss:end -->
