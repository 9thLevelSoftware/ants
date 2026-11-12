import { defineConfig } from 'vitest/config';
// Run: npx vitest run --config spikes/nest/vitest.config.ts   (pure sim modules, Node environment)
export default defineConfig({ test: { environment: 'node', include: ['spikes/nest/**/*.test.ts'], testTimeout: 120000 } });
