// Demo config = the root config (the `@/` alias, `--mode classic` single-file build). Used by the harness (it picks
// up <root>/vite.config.ts) and by:
//   npx vite build spikes/render-creatures-demo --config spikes/render-creatures-demo/vite.config.ts --mode classic \
//     --outDir ../../test-output/creatures-render/classic --emptyOutDir
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

export default defineConfig((env: ConfigEnv) => (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig);
