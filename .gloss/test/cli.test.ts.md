# test/cli.test.ts

this is the whole bug — package managers invoke the bin through
node_modules/.bin/gloss, a symlink, so a resolve()-only comparison
never matched and every `bunx gloss` exited 0 having done nothing.
