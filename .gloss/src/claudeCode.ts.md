# src/claudeCode.ts

## runClaudeHook

a hook that throws surfaces as an error to the agent on every Read/Grep; silence is the correct failure mode.

## claudeHookCommand

the repo's own installed bin, never `bunx gloss`: a teammate without node_modules would have bunx fetch
the unrelated unscoped `gloss` package on every Read; a missing install stays silent like the hook does.

## installClaudeHooks

settings.json is shared with every other hook and permission in the repo; anything we cannot
parse into the expected shape is left untouched rather than rewritten.
