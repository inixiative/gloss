# src/harvest.ts

## escapeHeadings

a harvested line starting with '#' would parse as gloss structure (h1 path header,
'##' symbol section) and fabricate sections naming no symbol; escape it at column 0.

## entryFor

the symbol section is gloss's only validated binding — a quoted code line (like a line
number) rots silently and answers "where does this apply" with a syntactic proxy.
