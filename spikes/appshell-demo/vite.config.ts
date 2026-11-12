// Demo config = the root config plus the project's public/ directory (so assets/manifest.json and the textures are
// served in dev and copied into builds). Used by the harness (it picks up <root>/vite.config.ts) and by:
//   npx vite build spikes/appshell-demo --config spikes/appshell-demo/vite.config.ts --mode classic \
//     --outDir ../../test-output/appshell-demo-classic --emptyOutDir
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

const PUBLIC_DIR = decodeURIComponent(new URL('../../public', import.meta.url).pathname);

export default defineConfig((env: ConfigEnv) => {
  const base = (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig;
  return mergeConfig(base, { publicDir: PUBLIC_DIR });
});
