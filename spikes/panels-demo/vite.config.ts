// Demo config = the root config (aliases, Preact, classic build mode). Used by the harness (it picks up
// <root>/vite.config.ts) and by the classic single-file build:
//   npx vite build spikes/panels-demo --config spikes/panels-demo/vite.config.ts --mode classic --outDir ../../test-output/hud-demo-classic --emptyOutDir
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

export default defineConfig((env: ConfigEnv) => {
  const base = (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig;
  return mergeConfig(base, {});
});
