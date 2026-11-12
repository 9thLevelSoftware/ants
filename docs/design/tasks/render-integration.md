# Task render-integration — World dressing in the running game: decor slot, boundary, colour grade, near-camera fades, title backdrop (Stage 1B, Opus, visual)

## Goal
Finish joining the visual layers in the running game: register the vegetation/decor renderer, give the map a believable edge, apply the colour grade the lighting model computes, fade terrain and objects that come between the camera and the subject, and put a live scene behind the title screen.

## Read first
- `docs/design/tasks/gate-1A-app-report.md` §5 and §7 (what is missing and how the renderer slots work).
- GDD 08 art direction (look per time of day and weather; frost and night grading), GDD 04 (the map boundary: what the player sees and what stops them; decor rules), GDD 01 §6 (fade and occlusion rules for the cameras), GDD 08 Title screen specification. Digests 08, 04, 01.
- `src/render/index.ts`, `src/render/slots/**`, `src/render/world/**` (including the decor renderer), `src/render/app/**` (post chain and the no-post path), `src/render/camera/**` outputs (`fade`, occlusion data), `src/game/Game.ts` (title mode).

## You own
`src/render/slots/**`, `src/render/app/look/**` (new: colour grade), `src/render/world/boundary/**` (new), `src/game/title/**` (new: title backdrop scene), `tests/e2e/dressing.mjs`. Minimal, reported edits in `src/render/world/**`, `src/render/app/**` and `src/game/Game.ts` where a hook is needed.

## Deliverables
1. Decor in the game: the decor renderer registered (as part of the world slot or its own slot), sharing the world's material library and uniforms, patched for the cutaway like other surface materials, honouring quality presets, with the grass parting/fading around the camera-to-subject line.
2. Colour grade: saturation and gain from the lighting state applied on both the post path (as an effect) and the no-post path (shader chunk or equivalent), so frost desaturates and night/golden hour grade as GDD 08 describes.
3. Near-camera fades: ordered-dither fading for terrain, primitives and decor that intrude between camera and subject, consistent with the existing ant and nest-wall fades.
4. Map boundary per GDD 04: the visual treatment beyond the playable area (blurred giant backdrop shapes, haze, the edge glyph hook) so the world never ends in a flat line, and the soft stop for the player handled where the chapter assigns it (report if it belongs to locomotion).
5. Title backdrop: when the game is at the title screen, a small pre-seeded scene renders behind the menu (a patch of ground with decor and a few autonomous ants or a slow camera drift), cheap, deterministic in test mode, replaced cleanly when a game starts.
6. `tests/e2e/dressing.mjs`: screenshots of the title with its backdrop, a lawn view with grass and leaf litter in third person, the map edge, a frosty morning and a golden-hour view.

## Acceptance criteria
1. `npm run typecheck` clean; tests in your paths green; no console errors in the harness.
2. Screenshots, looked at and judged honestly: the title screen shows a live, attractive scene behind the menu; the lawn view has grass and litter with the subject visible; the map edge reads as distance, not as a void; frost and golden-hour grades are visible and tasteful.
3. Runtime quality switching still works with decor registered; starting and ending a game twice leaks no GPU resources (renderer info counts return to baseline).
4. The stage1a, smoke and determinism scripts still pass; the classic build passes the smoke script.

## Addendum (integrator, after the Stage 1A application gate)
- The gate recorded these as yours: colour grade from `LightingState.saturation/gain` (a scope decision, not implemented anywhere yet); GDD 01 §6.5 rule 3 occlusion dither for terrain, primitives and decor (ants and nest walls already have theirs); decor registration (the nest slot already patches every scene-lit standard material for the cutaway — reuse that path).
- The views task (running in parallel) owns `src/render/camera/**` and the nest-wall dither underground; do not edit those. Share the camera-to-subject occluder data through `FrameInfo` (additive fields) rather than reaching into the rigs.
- New-game placement currently can put the founding queen where nothing is diggable (seed 1 starts indoors in a plant pot); that is a worldgen/founding fix, not yours.
- The machine is shared and slow (software GL): iterate with `quality=test`, one harness at a time.
- **Change of scope (integrator):** deliverable 3's shader work (ordered-dither fading inside the terrain, primitive, decor and grass materials) moves to the look-pass engineer, who owns `src/render/world/materials/**`, `primitives/**`, `terrain/**`, `decor/**`, `vegetation/**`, `sky/**`, `lighting/**` and is working there at the same time as you. Your part of deliverable 3 is only the plumbing: in the world slot pass `FrameInfo.fade` into the world renderer's frame as `WorldFrame.occlusion` (an optional field `occlusion?: FadeOutput | null` that the look-pass engineer adds to `src/render/world/lighting/types.ts`; if it is not there yet when you need it, add exactly that field yourself and report it). For deliverable 1 keep your edits inside the decor renderer to its public wiring (construction, shared uniforms, quality, dispose) and do not restyle its shaders or tuning. Do not edit the world material, terrain, primitive, sky or lighting code beyond a hook; report what you need instead.
