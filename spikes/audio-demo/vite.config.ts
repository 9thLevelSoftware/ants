// Demo config = the root config plus the project's public/ directory (assets/manifest.json and the audio files).
// Used by the harness (it picks up <root>/vite.config.ts) and by the classic single-file build (scripts/classic.mjs, which turns publicDir off: audio then comes from packs).
import { defineConfig, mergeConfig, type ConfigEnv, type UserConfig } from 'vite';
import rootConfig from '../../vite.config';

const PUBLIC_DIR = decodeURIComponent(new URL('../../public', import.meta.url).pathname);

export default defineConfig((env: ConfigEnv) => {
  const base = (typeof rootConfig === 'function' ? rootConfig(env) : rootConfig) as UserConfig;
  return mergeConfig(base, { publicDir: PUBLIC_DIR });
});
