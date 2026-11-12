# Task audio — Sound: ambience, foley, giant human sounds, interface, optional generative music (Stage 2, Opus)

## Goal
The game's soundscape at ant scale: layered ambience that follows habitat, time of day, weather and whether the listener is above or below ground; positional foley tied to simulation cues; colossal low-frequency human sounds; interface sounds; and a sparse optional generative score — all starting only after a user gesture and tolerating refusal.

## Read in full
GDD 08 (`docs/design/gdd/08-ui-ux-art-audio.md`): the audio design (ambience matrix, the effects list mapped to simulation events with distance and occlusion rules, giant human sounds, UI sounds, generative music, mix levels, which sounds come from files and which are synthesised, the no-speech rule for the distant playground bed). `public/assets/manifest.json`, `public/assets/CREDITS.md` and `assets-src/MANIFEST.md` (what audio exists; its known defects: loop files have a ~5 ms dropout at the loop point and MP3 encoder delay; some clips are stand-ins). `docs/03-architecture.md` §8 (audio bytes come only from the asset loader; no `new Audio(url)`).

## You own
`src/audio/**`, a demo page `spikes/audio-demo/**`, and `tools/assets/fix-loops.mjs` if you reprocess loop files (you may re-encode files under `public/assets/audio/` to fix loop points; keep names stable and update the manifest and credits processing notes).

## Boundaries
Simulation code emits cue events; you subscribe. UI calls `audio.ui(id)`. Settings (volumes, mute, music on/off) come from the settings store.

## Deliverables
1. Engine on Web Audio: context creation on first user gesture with graceful refusal handling, master/ambience/effects/UI/music buses with a limiter, decoded buffers from the asset loader with caching, voice limiting and priorities, pause/resume with the game and on tab hide.
2. Ambience: seamless looping (crossfading at the Web Audio level so file loop defects are inaudible), layers selected and cross-faded by habitat zone at the listener, time of day, weather, and above/below ground (underground: low-passed surface bed plus the underground bed).
3. Positional effects: listener at the camera; distance attenuation scaled to ant-scale distances; occlusion low-pass for sounds through soil; cue-to-sound mapping per GDD 08 with variation (pitch/sample round-robin), throttled for crowds (many footsteps become a texture).
4. Synthesised sounds for everything the manifest lacks (the chapter lists them): generated procedurally with Web Audio (noise, filters, envelopes), documented.
5. Giant human sounds (sub-bass thuds, mower, car, broom) with long attenuation distances; UI sounds; optional sparse generative music (off by default if the chapter says so) that never fights the ambience.
6. Demo page: buttons to audition every cue and ambience state; an analyser read-out so that correctness can be checked without ears.

## Acceptance criteria
1. Typecheck and unit tests green (cue mapping tables complete: every cue id used by the simulation has a sound or a deliberate "silent" entry; bus math; voice limiting).
2. In the harness (which cannot listen): for each ambience state and a sample of cues, the analyser shows non-silent output in the expected band and no clipping; loop boundaries show no discontinuity above a threshold (offline render test over a loop boundary).
3. Audio never starts before a user gesture; a refused or missing AudioContext leaves the game fully playable with no console errors.
4. CPU: 32 simultaneous voices plus ambience stay under 1 ms per frame of main-thread time (report).
5. Works in the classic single-file build with audio served from asset packs.
