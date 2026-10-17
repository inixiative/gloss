# src/cli.ts

## runCommand

the hook runs on every agent Read/Grep; it must not depend on git or throw on a bad package.json.

## isEntryPath

package managers link the bin as node_modules/.bin/gloss -> dist/cli.js, and
resolve() does not follow symlinks — comparing it to import.meta.url made every
`bunx gloss` / `.bin/gloss` run a silent no-op that still exited 0.
