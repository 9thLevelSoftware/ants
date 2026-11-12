// Demo config = the root config (the `@/` alias, `--mode classic` single-file build). Used by the harness (it picks
// up <root>/vite.config.ts) and by:
//   npx vite build spikes/render-ants-demo --config spikes/render-ants-demo/vite.config.ts --mode classic \
//     --outDir ../../test-output/render-ants-classic --emptyOutDir
import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

export default defineConfig((env: ConfigEnv) => (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig);
