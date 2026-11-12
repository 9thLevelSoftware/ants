#!/usr/bin/env node
/**
 * run-ts.mjs — run a TypeScript entry point in Node with the project's `@/` alias (headless sim tools).
 *
 *   node tools/sim/run-ts.mjs <file.ts> [args...]
 *   npm run sim -- <file.ts> [args...]
 *   example: node tools/sim/run-ts.mjs tools/sim/hello-core.ts 42
 *
 * How: starts a Vite server in middleware mode (no HTTP port, no watchers, no HMR) with the project's
 * vite.config.ts, and imports the file through Vite's SSR module runner, so TypeScript, `@/...` imports and
 * extension-less relative imports behave exactly as in the game build and in Vitest. No extra dependency.
 *
 * Inside the script, `process.argv` is `[node, <absolute file>, ...args]`. If the module has a default export
 * that is a function, it is awaited as `default(args)` after the module body ran. Any thrown error prints its
 * stack (source-mapped to the .ts lines) and exits with code 1; otherwise the exit code is `process.exitCode`
 * (0 by default). Type errors are NOT checked here (Oxc only strips types): run `npm run typecheck`.
 *
 * Performance note: the first import transforms each module once (~0.5 s start-up); the sim code itself then
 * runs at normal Node speed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function main() {
  const [fileArg, ...args] = process.argv.slice(2);
  if (!fileArg || fileArg === '--help' || fileArg === '-h') {
    process.stderr.write('usage: node tools/sim/run-ts.mjs <file.ts> [args...]\n');
    return fileArg ? 0 : 2;
  }
  const file = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(file)) {
    process.stderr.write(`run-ts: file not found: ${file}\n`);
    return 2;
  }

  const vite = await import(pathToFileURL(path.join(PROJECT, 'node_modules/vite/dist/node/index.js')).href);
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundress-run-ts-')); // per run: no cache races
  const server = await vite.createServer({
    root: PROJECT,
    configFile: path.join(PROJECT, 'vite.config.ts'),
    logLevel: 'error',
    clearScreen: false,
    cacheDir,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, watch: null, ws: false },
  });
  try {
    const runner = vite.createServerModuleRunner(server.environments.ssr, { hmr: false });
    process.argv = [process.argv[0], file, ...args];
    const mod = await runner.import(file);
    if (typeof mod?.default === 'function') await mod.default(args);
    await runner.close();
  } finally {
    await server.close();
    fs.rmSync(cacheDir, { recursive: true, force: true });
  }
  return typeof process.exitCode === 'number' ? process.exitCode : 0;
}

main().then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`run-ts: ${err?.stack ?? err}\n`);
    process.exit(1);
  },
);
