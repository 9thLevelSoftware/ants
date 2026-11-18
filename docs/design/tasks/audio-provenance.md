# Task audio-provenance — Every shipped sound has provenance the repository can show (Sonnet implement / Opus verify)

## Why
`docs/CREDITS-AUDIT.md` names shipped audio whose licence the repository cannot show: 26 files from archive.org items (digitised studio effect libraries uploaded by a third party; "provenance tier B") and a set of OpenGameArt files that came second-hand (a trim of a Freesound recording whose page was never reachable, a cleaned-up third-party recording, files credited to one party and submitted by another, a UI set whose local readme does not say CC0). Integrator decision: the game ships no sound whose right to ship rests on an uploader's word about someone else's recording. Each such file is replaced by an original sound made in this repository, or kept only if a first-hand source and licence can be recorded.

## Read in full
`docs/CREDITS-AUDIT.md`, `CREDITS.md`, `public/assets/CREDITS.md`, `assets-src/MANIFEST.md`, `assets-src/records_audio.json`, `src/audio/README.md`, `src/audio/synth/**` (the recipe system the game already uses for original sounds), `src/audio/cueTable.ts`, `ambience/**`, `loudnessTargets.ts`, `loudness.ts`, `packaging.test.ts`, `requestedFiles.ts`, the audio chapter of GDD 08 (what each cue and ambience bed is for, its character and loudness), `docs/design/tasks/audio-pass.md` and its result in `docs/STATUS.md`.

## You own
`src/audio/**`, `public/assets/audio/**` and its manifest and credits, `assets-src/records_audio.json` and the audio part of `assets-src/MANIFEST.md`, `tools/audio/**` (new: deterministic offline renderers), `CREDITS.md` and `docs/CREDITS-AUDIT.md` (audio rows), `tests/e2e/` audio script if one exists. Nothing under `src/sim`, `src/render`, `src/ui`.

## Work
1. **List**: every shipped audio file with its tier from the audit: (A) first-hand source with a licence the repository can show, (B) unverified. Table in the report.
2. **Replace every tier-B file** with an original sound, one of two ways, your choice per sound by which sounds right for its job:
   - a runtime recipe in `src/audio/synth` (as the game's existing original cues are), or
   - a file rendered by a deterministic script under `tools/audio/` (pure maths: noise, filters, envelopes, modal resonators, granular layering of material you generate; seeded; no input recordings), encoded with a tool that is installed on this machine (check `ffmpeg`, `lame`, `sox`; if none exists, ship the format the engine can already decode that needs no encoder, and say what it costs in size).
   Sounds to cover include the ambience beds (night crickets, heavy rain, suburban street, distant traffic, distant playground), soil scrapes, gravel grit, wood creaks and rasps, a crunch, giant footstep thuds, the lawnmower loop, water drips, the UI clicks, the grasshopper stridulation and the underground rumble — the audit has the exact list. Each replacement keeps the cue's id, its role, its loudness target and (for loops) a seamless loop.
3. **A first-hand source** may be recorded instead of replacing, only if the original author's own page and licence text can be fetched now and saved under `assets-src/provenance/<id>/` (page text and licence, with the fetch date). If the network refuses, replace; do not record a claim you could not read.
4. **Check by measurement** (nobody can listen here): for every replaced sound — integrated loudness against its target (`loudness.ts`), true peak below −1 dBFS, spectral centroid and band energies in the range that fits the sound's role (state the range you chose and why), loop seam (no click: sample and slope continuity, and energy within 1 dB across the seam), duration, and for stereo beds the correlation. A table per sound, before (the old file) and after. Run the existing audio tests (`packaging`, `loudness`, `audioPass`, `engine`, `eventMap`, `lifecycle`) and the offline analysis harness if the audio task left one.
5. **Credits**: `CREDITS.md`, `public/assets/CREDITS.md`, the records and `docs/CREDITS-AUDIT.md` say what is true after the change; no tier-B entry remains; the removed sources are listed as removed with the date.
6. `npm run build:portable` and `npm run verify:portable` pass; the audio pack's size before and after.

## Acceptance criteria
1. No shipped audio file is tier B; the audit's "cannot be shown" audio lists are empty or each remaining entry has first-hand evidence saved in the repository.
2. Every cue id and ambience id that existed still resolves and plays (tests); loudness targets met; loops seamless by the measurement of step 4.
3. Deterministic: running the render scripts twice gives byte-identical output; the scripts and their seeds are in the repository.
4. Report `docs/design/tasks/audio-provenance-report.md` with the tables and an honest note per sound on how close the replacement is likely to be to the old one (what was lost).

## Machine rules
4 cores shared with other engineers (load average 6–11). No life runs. One headless browser at a time on the machine (`pgrep -f chrome-headless` first). `date -u` before a timestamp; no git commands that change the index. Evidence under `test-output/audio-provenance/`.
