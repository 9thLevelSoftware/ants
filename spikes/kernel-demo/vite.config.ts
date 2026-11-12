import { defineConfig } from 'vite';

// Demo config: the production kernel is imported through the project's `@/` alias (src/).
// tools/harness/play.mjs uses this file automatically when --root is this directory.
const SRC_DIR = decodeURIComponent(new URL('../../src', import.meta.url).pathname);

export default defineConfig({
  base: './',
  resolve: {
    alias: [{ find: /^@\//, replacement: SRC_DIR + '/' }],
    dedupe: ['three'],
  },
});
