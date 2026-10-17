# src/git.ts

## isExcluded

a vendored tree (a pinned skills mirror, a generated client) is tracked, so check-ignore
can never exclude it — yet harvesting one edits files the repo forbids editing, and its
comments are upstream's to fix, not ours. Matching is path-prefix only, never a regex, so
a stray '.' cannot silently widen an exclude into neighbouring directories.

## ignoredPaths

exit 1 ("nothing ignored") and exit 128 ("not a git repo") both throw with empty output,
and both must mean "filter nothing" — a repo without git still gets full enumeration.
