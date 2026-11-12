// Look-dev spike: serve the project's real CC0 assets (public/) at ./assets/... relative to the page.
// The harness picks this config up automatically because it lives in the --root directory.
// (publicDir is resolved relative to the Vite root, i.e. this folder.)
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: '../../public',
  resolve: { dedupe: ['three'] },
  build: { target: 'es2022' },
});
