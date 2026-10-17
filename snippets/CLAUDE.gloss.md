<!-- gloss:begin -->
## Gloss — commentary lives in the margin, not in the code

**Comments are almost never needed.** Name things so the code explains itself. When something must
be said, it goes in the gloss section of the symbol it concerns, not in the source.

Source files carry only these comment forms:

1. Daggers — content-free existence markers, exact strings, trailing content is a lint error.
   `// gloss` on its own line above a declaration = that symbol has a gloss section.
   `// gloss:file` at the top of a file = a file-level preamble exists.
2. Machine directives — `eslint-disable*`, `biome-ignore`, `@ts-expect-error`/`@ts-ignore`/
   `@ts-nocheck`, `prettier-ignore`, `/// <reference`, shebangs, license headers, `#__PURE__`,
   bundler magic comments, istanbul/c8, `@vitest-environment`, `sourceMappingURL`.
3. `// why:` — the rare exception, strongly discouraged: ONE short line (120 characters by default),
   only where the code can't make a constraint clear on its own. Aim for about 1% of comments. Never a
   narrative: anything longer goes in the symbol's gloss section. `gloss lint` warns about a `why:` that
   runs past one line or the limit (a warning, never a failure); the harvester never touches one.

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
