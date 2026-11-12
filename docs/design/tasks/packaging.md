# Task packaging — Portable build and asset packs (Stage 1B, Sonnet implement / Opus verify)

## Goal
The shipping artefact: a portable build that runs from any static host AND inside a sandboxed iframe with an opaque origin — one classic script bundle, assets embedded in pack scripts, fonts inlined, no module scripts, no fetches — with a verification script that proves it.

## Read first
- `docs/design/tasks/gate-1A-sim-report.md` (§1 what works end to end, §2 what is stubbed, §8 what Stage 1B tasks must know — the public functions to call) and `docs/design/tasks/gate-1A-app-report.md` §7. The scripted stand-ins under `src/sim/testing/e2e/` show working call sequences against the real modules.
- `docs/03-architecture.md` §8 (packaging constraints — binding) and `docs/research/tech-stack.md` §6-7 (classic build mode, the sandboxed-iframe findings, harness `--static` and `--mount`).
- `src/render/assets/**` — the asset loader's embedded-pack back end and the pack format documented in `src/render/assets/backends.ts`; `spikes/appshell-demo/scripts/make-pack-fixture.mjs` is a working reference for packs and the sandboxed test.
- `vite.config.ts` (the `classic` mode), `package.json` scripts, `public/assets/manifest.json` and `public/assets/CREDITS.md`.
- Any worker usage in `src/worldgen/worker/**` (workers must be created from Blob URLs built from inlined source in the portable build).

## You own
`tools/build/**`, the `build:portable` and `verify:portable` scripts in `package.json` (script entries only), and `tests/e2e/portable.mjs`. If the asset loader or the worker entry needs a small change to support the portable build, make it minimal, keep the dev path working, and report it.

## Deliverables
1. `npm run build:portable` -> `dist-portable/`: `index.html` with one deferred classic script (no `type="module"`, no `crossorigin`, no dynamic import), CSS inlined or linked as a classic stylesheet with fonts inlined as data URIs, asset pack scripts under `packs/` (each under 15 MB, grouped so the first pack holds what the title screen and a first game need and later packs load lazily), an inlined pack index, licences/credits file, and nothing else. Only assets actually referenced by the game are packed (report what was left out).
2. Size report printed by the build: every file with its size, totals, and failure if the total exceeds 60 MB, any file exceeds 18 MB, or there are more than 250 files.
3. Worker support: the build inlines worker source so it can be started from a Blob URL; a main-thread fallback remains.
4. `npm run verify:portable`: serves `dist-portable/` with the harness in `--static` mode from a sub-path and also inside `<iframe sandbox="allow-scripts allow-pointer-lock">` (opaque origin), boots the game with `?test=1&autostart=1`, steps the simulation, takes a screenshot, and fails on any console error, failed request, or blocked resource. It also greps the output for forbidden patterns (`type="module"`, `import(`, absolute URLs, `fetch(` of assets outside the loader).
5. Documentation at the top of `tools/build/portable.mjs`: how the build works and how to publish the folder.

## Acceptance criteria
1. `npm run build:portable` succeeds and prints the size report within the limits.
2. `npm run verify:portable` passes: the game boots and renders in both hosting situations; the screenshot (looked at) shows the game world with real textures (not placeholder textures), proving packs load.
3. Audio data and fonts load in the sandboxed iframe (the asset loader returns audio bytes from packs; the UI shows the intended fonts — check in a screenshot of the title screen).
4. `npm run dev` and `npm run build` still work unchanged.
5. The verification fails (exit code 1) when a forbidden pattern is injected deliberately (negative test described in the report).
