import { defineConfig } from 'vitest/config';

// Same alias as vite.config.ts (vitest does not read vite.config.ts when this file exists).
const SRC_DIR = decodeURIComponent(new URL('./src', import.meta.url).pathname);

// Core/sim/worldgen tests run in plain Node (no jsdom, no WebGL).
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: SRC_DIR + '/' }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
