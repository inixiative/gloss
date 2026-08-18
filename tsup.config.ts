import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: { cli: 'src/cli.ts' },
    format: ['esm'],
    platform: 'node',
    target: 'node20',
    banner: { js: '#!/usr/bin/env node' },
    clean: true,
  },
  {
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    external: ['typescript'],
  },
]);
