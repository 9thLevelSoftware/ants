import { defineConfig } from 'vitest/config';

// Same alias as vite.config.ts (vitest does not read vite.config.ts when this file exists).
const SRC_DIR = decodeURIComponent(new URL('./src', import.meta.url).pathname);

// No @types/node in this project: read the environment without the `process` global type.
const ENV: Record<string, string | undefined> =
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env ?? {};

// Core/sim/worldgen tests run in plain Node (no jsdom, no WebGL).
export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: SRC_DIR + '/' }],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Several engineers run tests at once on a 4-core, 16 GB machine: keep every run to two
    // workers (override with VITEST_MAX_WORKERS) and give slow, load-starved tests room to finish.
    maxWorkers: Number(ENV.VITEST_MAX_WORKERS ?? 2),
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
