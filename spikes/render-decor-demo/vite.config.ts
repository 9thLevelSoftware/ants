// Demo config = the root config plus the project's public/ directory (assets/manifest.json and the CC0 textures).
// Used by the harness (it picks up <root>/vite.config.ts) and by the classic single-file build:
//   npx vite build spikes/render-decor-demo --config spikes/render-decor-demo/vite.config.ts --mode classic \
//     --outDir ../../test-output/render-decor-classic --emptyOutDir
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

const PUBLIC_DIR = decodeURIComponent(new URL('../../public', import.meta.url).pathname);

export default defineConfig((env: ConfigEnv) => {
  const base = (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig;
  return mergeConfig(base, { publicDir: PUBLIC_DIR });
});
