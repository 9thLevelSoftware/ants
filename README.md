# FOUNDRESS

FOUNDRESS is a naturalistic ant colony sandbox for the browser, written in TypeScript with Three.js (WebGL2). You start as a young queen, dig a first chamber and raise the first workers. After that you look after the colony from above, from the height of any one worker, or from inside the soil, and the colony does most of its own work.

It is single-player and needs no server. The game is unfinished: the state of play is at the end of this file.

Last checked 2026-11-23 on the working tree of look pass 5 (last commit `645f21f`). The commands were run on 2026-11-18 (commit `fb15f3d`); on 2026-11-23 the install, type check, test, harness and URL-flag lines were used again and still hold.

## Requirements

- Node.js 22 and npm 10 (checked with Node 22.23.4, npm 10.9.9).
- To play: a current Chromium-based browser with WebGL2. Chromium is the only browser the project has been tested in; Firefox and Safari were not tested. A GPU is recommended. The game has quality presets (Low, Medium, High, Ultra) and picks one automatically.
- To run the headless harness and the browser tests: Playwright, installed **globally** (the repository does not depend on it). The harness looks in the project, `NODE_PATH`, `/opt/node-tools/node_modules` and `npm root -g`. Do not run `playwright install` here; the browsers are already under `/opt/pw-browsers`.
- Memory: the full test suite needs several GB. `vitest.config.ts` caps it at two workers.
- Package versions are pinned exactly in `package.json` (three 0.187.0, preact 11.2.0, vite 8.3.8, vitest 5.1.0, TypeScript 7.0.2). Details and known traps: `docs/research/tech-stack.md`.

## Install

```
npm install
```

## Run the dev server

```
npm run dev
```

Vite prints the address (usually `http://localhost:5173/`). To skip the menus and start a generated game:

```
http://localhost:5173/?autostart=1&seed=1
```

## Test

Type errors do not stop Vite or Vitest, so run the type check on its own:

```
npm run typecheck
```

Run tests by folder, not the whole suite:

```
npx vitest run src/core
npx vitest run src/input
npx vitest run src/sim/colony
npx vitest run tests/docs
```

`tests/docs` checks the written documents against the code: the controls and difficulty tables of `docs/MANUAL.md`, the settings it names, and the rulings and code pointers of `docs/design/gdd/DEVIATIONS.md`. It runs in about two seconds.

Notes:

- The whole suite (`npm test`) took about 14 minutes on an idle machine on 2026-11-15 and over half an hour on a loaded one. It is not green: see "State of the game today" and `docs/STATUS.md` for the known red tests. Run it only when you need it.
- Test files are meant to finish in about 20 seconds each. Large sweeps (many seeds, multi-day soaks) are skipped unless the environment variable `FOUNDRESS_LONG=1` is set:

  ```
  FOUNDRESS_LONG=1 npx vitest run src/sim/environment/human/schedule.long.test.ts
  ```

  That file took about 4.5 minutes on a loaded machine. The long files are named `*.long.test.ts`.
- Simulation and world-generation code (`src/sim`, `src/worldgen`, `src/core`) is pure TypeScript and runs in Node. Test files for it do not need a browser.
- Headless simulation runs (no browser) go through `npm run sim`:

  ```
  npm run sim -- tools/sim/hello-core.ts 42
  ```

  Longer tools in `tools/sim/` (for example `life.ts`, `soak.ts`, `quietRun.ts`) are run the same way.

## Run a harness script (headless browser, screenshots)

`tools/harness/play.mjs` starts its own Vite server on a free port and its own headless Chromium with software WebGL (SwiftShader), loads the game, takes screenshots, and prints one JSON line.

```
node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --out test-output/readme-shot
```

Then look at the PNG files in the output folder. Scripts that drive the page live in `tests/e2e/` and are passed with `--script`:

```
node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/smoke.mjs
```

Software rendering is slow (seconds per frame): the smoke script above took about 3 minutes on a loaded machine. Step the simulation with the `window.__game` debug API instead of waiting in real time. Run one harness at a time. Options and the script contract: `tools/harness/README.md`.

## Build

```
npm run build              # normal site -> dist/ (module scripts; needs a host that serves them normally)
npm run build:portable     # the shipping build -> dist-portable/
npm run verify:portable    # checks the portable build (static scan, sub-path run, sandboxed-iframe run)
npm run build:classic      # one classic script, no modules -> dist-classic/
```

The portable build is the one to ship. It is a single folder of seven files: one `index.html`, one classic script bundle and "asset packs" (scripts that carry the textures and sounds). It works from any sub-path and inside a sandboxed iframe with an opaque origin, where module scripts and `fetch` of the game's own files fail. Its limits (total under 60 MB, each file under 18 MB, under 250 files) are enforced by the build. `npm run verify:portable --` accepts `--scan-only` (no browser), `--skip-iframe` and `--no-build`; the full list is at the top of `tools/build/verify-portable.mjs`.

`dist-portable/CREDITS.md` is made during the build from `public/assets/CREDITS.md` and the licence text of each bundled library. The credits of the repository are in `CREDITS.md`; how they were checked is in `docs/CREDITS-AUDIT.md`.

## URL flags

Given after `?` and joined with `&`. They exist so that scripted runs are fast and repeatable.

| Flag | Values | Effect |
|---|---|---|
| `test=1` | | Test mode: no intro animation, audio off, cheats and the debug hooks on, quality `test` unless `quality` is given. |
| `seed=` | a number or any text | World seed. The same seed gives the same locality. |
| `quality=` | `auto`, `low`, `medium`, `high`, `ultra` (and `test`) | Graphics preset. |
| `post=` | `0` or `1` | Switch the post-processing chain off or on. |
| `autostart=1` | | Skip the title screen and begin a generated game at once. |
| `species=` | `lasius-niger` (default), `camponotus-pennsylvanicus`, `messor-barbarus`, `atta-texana` | Species. Honoured only together with `test=1` (`src/game/flags.ts`): a normal page ignores it and starts the black garden ant, the one playable species. The other three are for testing only (their colonies did not meet the survival bar and the New Game screen greys them out). |
| `archetype=` | `woodland-edge`, `suburban-garden`, `playground-park`, `car-park-verge`, `kitchen-door` | Locality type. |
| `size=` | `compact`, `standard`, `large` | World size (3000, 4000 or 5000 body units). |
| `difficulty=` | `gentle`, `naturalist`, `harsh` | Difficulty preset. |
| `view=` | `observer`, `possess` | View the game starts in. |
| `title=0` | | Do not draw the 3D title backdrop. |
| `render=debug` | | Use the plain debug renderers in every slot. |
| `autosave=1` | | Switch autosave on in test mode (it is off there by default). |
| `nodownload=1` | | Pretend file downloads are blocked, to test the copy-and-paste export. |
| `nowebgl=1` | | Pretend WebGL2 is missing, to test the "unsupported" screen. |
| `audio=on` | | Force audio on in test mode. |

Source: `src/game/flags.ts`, `src/render/app/flags.ts`, `src/game/title/titleHost.ts`, `src/game/save/install.ts`, `src/audio/gameAudio.ts`.

With `test=1` the page also exposes `window.__game` (new game, step N ticks, read a summary, issue commands, teleport, possess, cheats) and `window.__ready`. The API is listed in `docs/03-architecture.md` section 5 and is implemented in `src/game/debug/`.

## Repository layout

| Path | What is in it |
|---|---|
| `src/core/` | Pure utilities: maths, noise, seeded random numbers, events, ids, spatial grids, serialisation. |
| `src/sim/` | The simulation. Pure TypeScript, no Three.js, no DOM, no `Math.random`, runs in Node. Fixed tick of 0.1 s of game time. Contracts are in `src/sim/types/`, tunable numbers in `src/sim/balance/` and `src/sim/species/`. |
| `src/worldgen/` | Deterministic world generator: parameters and a seed in, terrain, structures, plants, food and creature sites out. |
| `src/render/` | Three.js renderers. They read the simulation and never change it. |
| `src/input/` | Keyboard, mouse and gamepad: bindings, contexts, rebinding. |
| `src/game/` | The `Game` object that joins everything: loop, views, possession, settings, saves, onboarding, debug API. |
| `src/ui/` | Menus, HUD and panels (Preact and signals). |
| `src/audio/` | Web Audio engine: ambience, positional sounds, synthesised fallbacks, music. |
| `src/content/` | Text: alerts, journal, hints, codex entries, controls reference. |
| `tests/docs/` | A test that checks the manual and the deviations list against the code. |
| `tests/e2e/` | Browser scripts run through the harness. |
| `tools/harness/` | `play.mjs`, the headless browser runner. |
| `tools/sim/` | Node runners for long simulation runs, benches and sweeps. |
| `tools/build/` | The portable build and its verification. |
| `tools/assets/` | Scripts that fetched and processed the textures and sounds. |
| `public/assets/` | The shipped textures and sounds, `manifest.json` and the asset credits. |
| `assets-src/` | Records of where each asset came from. The raw downloads in `assets-src/raw/` are git-ignored. |
| `spikes/` | Throwaway demo pages used while building the modules. |
| `docs/` | Design and operations documents (next section). |
| `test-output/` | Output of tests, harness runs and sweeps. Git-ignored. |

Layering rule: `core` imports nothing from the project; `sim` and `worldgen` import only `core`; `render`, `audio`, `ui` and `input` read the simulation and send commands through `game`. The full rules are in `docs/03-architecture.md`.

## Where the design lives

| Document | Content |
|---|---|
| `docs/00-original-brief.md` | The original brief. |
| `docs/01-design-seed.md` | Binding decisions: units (millimetres, Y up, body units), the field function, the surface walker, layering. |
| `docs/02-design-directions.md` | Design directions, including the rulings in sections J and K. |
| `docs/03-architecture.md` | Layout, layering, verification hooks, packaging constraints. |
| `docs/design/gdd/` | The game design document: eight chapters, `00-index.md` (identifier registry, shared constants, decision log), digests and a traceability table. |
| `docs/design/gdd/DEVIATIONS.md` | Where the game differs from the GDD, with the integrator rulings R1 to R28. |
| `docs/design/tdd/` | Technical design: contract guidance and the kernel API. |
| `docs/design/tasks/` | One spec per task, task reports, the colony-life ledger. |
| `docs/research/` | Technology and biology research, including `tech-stack.md`. |
| `docs/STATUS.md` | The running log of the build, with every ruling. |
| `docs/MANUAL.md` | The player's manual: the one manual (sections 0 to 20; the tables between `<!-- generated:NAME -->` markers are regenerated from the code by `npm run sim -- tests/docs/regen-manual.mjs`). The old `docs/manual/` folder is gone. |
| `docs/CREDITS-AUDIT.md` | How the credits were checked and what could not be shown. |

Where sources disagree, the order is: design seed, design directions (sections J and K), GDD index, the chapter that owns the topic, other chapters.

## State of the game today (2026-11-23)

Taken from `docs/STATUS.md`. The game is a first playable, not a finished game.

What works:

- Starting a game from the title screen with the black garden ant (*Lasius niger*) on five locality types, three difficulty presets and custom rules.
- The opening played by hand: find a site, dig a chamber, seal it, lay eggs, a first-brood time-lapse (the camera looks down into the queen's cell through a cut in the ground), the result card, hand-over to the first workers. In the browser it is reliable up to the result card on the two test seeds, but not past it: at seed 1 the entrance stays in "reopening" and the first workers do not walk out, at seed 2 rain floods the chamber and the founding fails (`docs/design/tasks/look-pass-5-report.md`).
- The three views (possess an ant, observer, colony view with a nest cutaway), colony orders, markers and dig plans, scent view and overlays, alerts with automatic slow-down, time controls, photo mode, saving and loading with export, gamepad and accessibility settings.
- Creatures, weather, human events, rival colonies, winter time-lapse, winged queens and the nuptial flight, a lineage record and an epitaph screen.
- A portable build that runs from a sub-path and inside a sandboxed iframe (27.8 MB).

What does not work yet, or not well:

- **Colonies do not reliably grow.** The unattended simulation sweeps got better (sweep 15: 14 of 15 colonies viable at the first winter, at least 2 of 3 per locality; the final gate's first close sweep gave 12 of 15 and is still being settled), but three growth bars are still not met (protein intake, first workers, second-year growth). Where the numbers live: `docs/design/tasks/colony-life-ledger.md` and `docs/STATUS.md`. A final simulation gate (`docs/design/tasks/gate-sim-2.md`) is running.
- **Three of the four species are not available.** *Camponotus*, *Messor* and *Atta* have modules, but their colonies did not meet the viability bar, so they are flagged `available: false` and the New Game screen greys them out.
- Several difficulty parameters have no effect yet (they are marked "Not in this build" on the New Game screen).
- The rulings R13, R14 and R28 in `docs/STATUS.md` are written down but not built.
- The look has known defects (night scenes are almost black at ground level, some materials, a coarse dot pattern on the queen when the camera sits close inside the nest, the time-lapse sometimes missing the queen); the first-hour pictures are listed in `docs/design/tasks/look-pass-5-report.md`. The frame rate on a real GPU has not been measured: all rendering tests used software rendering.
- The full test suite has known red tests; the list is in `docs/STATUS.md`.

A longer list for players is in `docs/MANUAL.md`, section "Known problems".

## Licence and credits

The repository has no licence file for the game's own code yet. Third-party textures, sounds, fonts and libraries are listed in `CREDITS.md`.
