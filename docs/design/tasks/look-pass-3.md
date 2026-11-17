# Task look-pass-3 — What a player would call ugly or broken on the app side (Sonnet implement / Opus verify, visual)

## Goal
The app half of the first-playable gate left a ranked list of things a player would call broken or ugly (`docs/design/tasks/gate-close-app-report.md` §7 and §9, pictures under `test-output/gate-close/app/`). Fix the app-side ones, each proven by a before/after picture taken the same way, that you look at.

## Read in full
`gate-close-app-report.md` (all), `reviews/gate-close-app.json` (review findings and the fix report), `look-pass-2.md` and its results in `docs/STATUS.md` (Nov 17 00:20 entry), the look sections of GDD 08 (`docs/design/gdd/08-ux-audio-art.md`: art direction, lighting by time of day, ant materials, camera rigs), `docs/research/tech-stack.md` §7.

## You own
`src/render/**`, `src/game/**`, `src/ui/**`, `src/content/**`, `src/input/**`, `tests/e2e/**`, `tools/harness/**`. Not `src/sim/**` (three other engineers work there; a sim cause goes in your report with a reproduction).

## Work — most serious first; each item: reproduce with a picture, find the cause, fix, same picture again
1. **Night at ground level looks like an overcast day** (S4; `playSeed1/day-h06.png`, `day-h12.png`, `day-h16.png`). Art decision by the integrator: night must read as night at a glance — a dark, cool, low-saturation scene in which the possessed ant, nestmates within 10 BU, the ground within 5 BU and trail/scent cues stay readable (moonlight key from the sky, the possession rim, no global lift that turns leaves daylight-green). Re-meter `NIGHT_LOOK` to that; keep its tests meaningful (update the target lumas with the reasoning). Show clear night, overcast night, night rain, dusk and dawn from observer and possession on seed 1.
2. **Ants at night and in rain**: pale see-through ant in a tunnel (S5), gyne pale at night and faint male wings (S8), first workers drawn as wire sketches at `quality=test` (S12), milky glassy bodies in night rain (S15: clearcoat/sheen reflecting the wet sky), white rings on a full gaster (S16: the stretched membrane should be a dull pale brown, darker than the sclerite highlights). One coherent cuticle look across day, dusk, night, rain and underground, at `quality` low, medium, high and test.
3. **Cameras**: the follow camera tips to the sky on slopes with a stem across the frame (S10, `firstplay/14-worker-following-trail.png`); the possession camera ends inside the soil in a very low room (stage1a strict: the queen's body clears the ceiling by 0.4 mm — the rig must find a valid pose or fall back to a close chase pose that is not inside solid; `STAGE1A_STRICT=1 stage1a.mjs` must pass); the observer camera left inside the nest after leaving the colony view (`check4/rain-pip.png`).
4. **World dressing at ant height**: leaves read as flat decals (S9: give draped leaves visible thickness or curl and a contact shadow at ant height on medium and high); the entrance mound's foot ends in square edges (S13); the pale strip along the horizon at night (S11); the nearest building and fence shapes read as pale straight-edged blocks in the opening shot (`firstplay/04-queen-surface.png`: far structures need a material, haze that does not bleach them, or a silhouette treatment — they must not look like untextured boxes).
5. **Colony view**: chamber labels sometimes smeared by the depth-of-field pass (S18).
6. **HUD and text**: the pad View tap fails when a frame is longer than the real-time threshold (`panels.mjs` second half: count the tap in frames or accept a press that begins and ends within N polls, so the script passes under load); GDD 06 §4.5 speed-control flash on an auto-slow and the `time.auto-slow` event; the New Game rules screen marks rules and preset rows whose `inEffect` flag is false (`src/sim/config/presetDisplay.ts`) as "not in this build" instead of offering them as working; after ruling R20 the reference species starts on **day 5 (spring)**: find every player-facing string that names the season or month of the founding flight and make it consistent (list them).
7. Re-run `tests/e2e/playthrough.mjs` once at the end (it was fixed and not re-run) and look at every picture; add anything new to the report's list.

## Acceptance criteria
1. Typecheck clean; tests green in every folder you touched (folder by folder).
2. Before/after pictures for every item under `test-output/look3/`, taken with the same script and pose, each looked at; an item that could not be fixed is reported with what was tried.
3. `stage1a.mjs` strict, `panels.mjs` (both halves), `photo.mjs` quick, `views.mjs`, `controls.mjs`, `firstplay.mjs` beats 1–20 pass in the browser (a timeout under load is "not measured": re-run alone with a longer timeout).
4. Draw calls and triangles at low / medium / high on the seed 1 colony do not rise by more than 10 % (same method as the gate report §5); say so with numbers.
5. Report `docs/design/tasks/look-pass-3-report.md` with the picture paths.

## Machine rules
4 cores shared with three other engineers (life runs, benches). One headless browser at a time; global Playwright only; long `--script-timeout`; never the whole vitest suite in one process; `date -u` before a timestamp; no git commands that change the index. Evidence under `test-output/look3/`.
