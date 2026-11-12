import { defineConfig } from 'vite';
import preact from '@preact/preset-vite'; // JSX -> preact (jsxImportSource), prefresh HMR in dev. Needs @babel/core (peer, already in node_modules)

// Root config. Production root is the project root (index.html -> src/main.ts), output dist/.
// Spikes/harness override `root` (CLI argument or programmatically, see tools/harness/play.mjs).
//
// `vite build --mode classic` emits ONE classic (non-module) IIFE script with `defer` into dist-classic/. Use it
// when the game is hosted inside a sandboxed iframe WITHOUT allow-same-origin: such a frame has an opaque ("null")
// origin and a <script type="module" crossorigin> load then needs an Access-Control-Allow-Origin header from the
// host, which many static hosts do not send. Classic scripts have no such requirement. (No code splitting.)

// Absolute path of src/ without node typings (tsconfig has no @types/node); Vite rewrites import.meta.url
// to this file's real location when it bundles the config.
const SRC_DIR = decodeURIComponent(new URL('./src', import.meta.url).pathname);

export default defineConfig(({ mode }) => {
  const classic = mode === 'classic';
  return {
    base: './', // relative URLs: works from any sub-path and inside an iframe
    resolve: {
      alias: [{ find: /^@\//, replacement: SRC_DIR + '/' }],
      dedupe: ['three'], // postprocessing and the game must share one three instance
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      outDir: classic ? 'dist-classic' : 'dist',
      ...(classic ? { modulePreload: false, rolldownOptions: { output: { format: 'iife' as const, codeSplitting: false } } } : {}),
    },
    plugins: classic
      ? [preact(), {
        name: 'foundress-classic-script',
        transformIndexHtml: { order: 'post' as const, handler: (html: string) => html.replace(/<script type="module" crossorigin /g, '<script defer ') },
      }]
      : [preact()],
  };
});
