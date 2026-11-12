# Task F3a — Render application layer, asset loader, input system, camera rigs

## Goal
Build the simulation-independent half of the app shell: the renderer and its quality/post-processing setup, the single asset loader, the input system, and the camera rigs. A later task (F3b) wires these to the simulation through the `Game` orchestrator, so everything here must be usable without any simulation types.

## Read first
- `docs/03-architecture.md` §5 (test flags), §6 (rendering budgets), §8 (packaging constraints — the asset loader rules are binding)
- `docs/research/tech-stack.md` — sections 3, 4 and 7 in full (post chain, costs, gotchas)
- `docs/research/spike-look.md` and `docs/research/spike-nest.md` if they exist when you start (look recipe and quality presets; camera findings). If they do not exist yet, proceed from the tech-stack document and the GDD; leave clearly named constants so the values can be retuned.
- GDD chapter 01 (`docs/design/gdd/01-modes-controls-camera.md`): section 5 (controls: the complete binding tables, operation without pointer lock, rebinding rules, input edge cases) and section 6 (camera specification for every view) — read both sections in full; use `docs/design/gdd/digests/01.md` to navigate.
- GDD chapter 08 digest (`docs/design/gdd/digests/08.md`) for the Settings screen's graphics, controls and accessibility options your modules must support.
- `public/assets/manifest.json` and `public/assets/CREDITS.md` (what assets exist).

## You own
- `src/render/app/**` — renderer creation, quality presets, resize + dynamic resolution, post-processing chain, frame statistics, test-quality mode
- `src/render/assets/**` — the `AssetLoader`
- `src/input/**` — actions, bindings, devices, contexts, rebinding
- `src/render/camera/**` — camera rigs and transitions
- `spikes/appshell-demo/**` — a demo page used to verify all of the above with the harness
Do not touch `src/sim/**`, `src/core/**`, `src/main.ts`, `index.html`, config files.

## Work
1. **Renderer app** (`src/render/app`)
   - `createRenderApp(canvas, options)`: WebGL2 `WebGLRenderer`, colour management and tone mapping exactly as the tech-stack document prescribes for the post and no-post paths, shadow map setup, resize handling with device-pixel-ratio cap and a dynamic-resolution controller (target frame time, hysteresis, bounds).
   - Quality presets `test | low | medium | high | ultra` as plain data (resolution scale, shadow map size and distance, post effects on/off and their parameters, instance density multipliers, anisotropy, draw distance, fog). `test` disables post, shadows and MSAA and renders on demand. An `auto` detection that picks a preset from a short startup benchmark and the unmasked renderer string.
   - Post chain with pmndrs `postprocessing`: depth of field (focus distance/range settable every frame in mm), bloom, tone mapping, vignette, SMAA; each individually switchable at runtime where the library allows, with the documented `antialias` constraint handled (decide at creation; expose `needsRecreate` when a setting change requires a new renderer). Reduced-motion and photo-mode hooks (DoF strength, vignette).
   - Frame statistics (`fps`, frame ms, draw calls, triangles) using the `renderer.info` advice from the tech-stack document.
   - Context-loss handling (pause, restore, re-upload) and a `dispose()` that really frees everything.
2. **Asset loader** (`src/render/assets`)
   - Reads the manifest; `texture(materialId, map)` returns cached textures with correct colour space, wrapping, anisotropy and mipmaps; `audioData(id)` returns an `ArrayBuffer`; `preload(ids, onProgress)`.
   - Two transparent back ends chosen at runtime: embedded packs (`window.__FOUNDRESS_ASSETS__[path]` holding base64 payloads, with lazy pack-script injection described by a pack index) and relative-URL fetch. No other module will be allowed to fetch assets, so the API must cover textures, audio bytes and JSON.
   - Graceful failure: a missing texture yields a generated placeholder texture and one warning, never an exception.
3. **Input** (`src/input`)
   - An action layer: every action id from GDD 01 §5 with its default keyboard/mouse and gamepad bindings and its contexts; `InputState` with per-frame queries (`pressed`, `held`, `released`, analogue axes for move/look/zoom), mouse-drag orbit that works without pointer lock (click-versus-drag threshold), optional pointer lock (request only from a user gesture, tolerate refusal and loss), wheel/trackpad zoom, gamepad polling with dead zones and hot-plug, context stack (gameplay, possession, observer, colony view, photo, time-lapse, UI).
   - Rebinding: a serialisable bindings object, conflict detection per context, reset to defaults; hold-to-toggle options.
   - Edge cases from GDD 01 §5: focus loss releases all keys, browser-reserved keys, text inputs capturing keys, simultaneous keyboard and gamepad.
   - No DOM dependency in the pure mapping logic (so it is unit-testable in Node); device listeners live in a thin adapter.
4. **Camera rigs** (`src/render/camera`)
   - Rigs take a `CameraTarget { pos, up, fwd }` (structural, mm) and a collision callback `trace(origin, dir, maxDist, radius) => distance`; they do not import simulation types.
   - `ThirdPersonRig`: orbit in the target's smoothed local frame, yaw carried by parallel transport when the target's up changes, pitch limits, distance in body lengths, collision pull-in and recovery, tunnel/chamber/open states with their distances and fields of view from GDD 01 §6, look-ahead, near-plane management, a `fade` output for hiding the target or near geometry, reduced-motion behaviour.
   - `ObserverRig` (orbit and fly with bounds), `ColonyRig` (strategic view plus the underground cutaway parameters: slice plane / x-ray depth), `PhotoRig`, and a transition helper that blends between rigs over a duration.
5. **Demo page** `spikes/appshell-demo/`: a textured ground and a few shapes lit by sun and sky, a target moving along a path that includes a wall climb and a narrow corridor (use a simple analytic distance function for collision), followed by the third-person rig; keys switch rigs and quality presets; an overlay prints input state and frame statistics; URL flags `?test=1&quality=…&rig=…&t=…`; sets `window.__ready`.

## Acceptance criteria
1. `npm run typecheck` clean; unit tests green: input mapping (bindings, contexts, conflicts, focus loss, drag threshold), camera math (pull-in never places the camera inside geometry in the test field; yaw preserved across a 90° up change; smoothing converges; transitions blend monotonically), asset loader (manifest parsing, both back ends via mocks, placeholder on failure), quality presets (schema-valid, `test` has everything expensive off).
2. Harness screenshots of the demo, looked at and correct: quality `low` and `high`; post on and off; third-person rig in the open, on the wall and inside the corridor (camera pulled in, no clipping through walls); observer and colony rigs. No console errors.
3. The demo works when built with `--mode classic` and served with the harness `--static` option (no module scripts, no dynamic import).
4. Pointer-lock refusal, lost WebGL context and a missing asset are each exercised by a test or a scripted harness run without an uncaught error.
5. No file in `src/render/app`, `src/render/assets`, `src/input`, `src/render/camera` imports from `src/sim`.
