# audio-provenance implementation progress

Started 2026-11-18 04:25 UTC (first engineer; no earlier progress file).

## Decisions
- Replace ALL 36 tier-B / second-hand files (26 archive.org + stridulation, wood_creak_03, water_drip_01/02, 5 Kenney UI, underground_rumble) with
  original files rendered by deterministic scripts in tools/audio/ (circular synthesis for loops => perfect wrap), encoded with ffmpeg libmp3lame
  (installed: ffmpeg 6.1.1) at the same settings as before (44.1 kHz, 96 kbps CBR, same mono/stereo layout, same durations).
- Kept as tier A (OGA author's own page, CC0 badge, not in audit's "cannot be shown" list): birdsong_day, rain_light, wind_leaves, room_fridge_hum,
  gravel_grit_01, crunch_01, crunch_02, wet_splat_01, wet_splat_02 (9 files). Say in report these rest on the OGA page claim, not new evidence.
- No network fetch attempted/needed (everything replaced).
- Old files copied to test-output/audio-provenance/old/ BEFORE overwriting (for the "before" columns). Do not delete.
- Normalisation as before: beds -24 LUFS (rumble -26), loops sfx -22 LUFS, one-shots peak -3 dBFS.
- Measurement script: tools/audio/measure.ts, run with node tools/sim/run-ts.mjs (reuses src/audio/loudness.ts).
- tools/assets/build_manifest.py (not mine) has stale archive.org narrative text; my own tools/audio/sync-records.mjs updates records_audio.json,
  public/assets/manifest.json audio entries and audio part of assets-src/MANIFEST.md in place. Report the stale generator text to integrator.

## Done
- tools/audio/lib: rng, lufs (port of loudness.ts), dsp, finish (normalise, ffmpeg mp3 encode/decode), pipeline (renderPcm, renderMp3 with 2-pass LUFS compensation for the encoder's -0.45 dB), analysis (fft, spectrum, loopSeam, engineJoin)
- tools/audio/sounds/beds.mjs (6 beds, all measured OK: -24.0/-26.0 LUFS on decoded file, PCM wrap exact), sounds/index.mjs registry (beds only so far), render.mjs, measure.ts (run: node tools/sim/run-ts.mjs tools/audio/measure.ts <dir> <out.json>)
- old measurements: test-output/audio-provenance/old.json (dir old/audio/...), new: new/ and new.json
- finding: MP3 encode lowers loudness 0.45 dB (old files too: -24.4); decoded mp3 has 1105-sample delay (seam measured on trimmed content)

## In progress
- sounds/foley.mjs, wood.mjs, giants.mjs, creatures.mjs, ui.mjs (SFX one-shots + 2 mower loops)

## Remaining (in order)
1. lib, 2. sounds (beds, foley, wood, giants, creatures, ui), 3. render.mjs, 4. measure.ts + tables, 5. tests (src/audio/provenance.test.ts),
6. sync-records + CREDITS.md + public/assets/CREDITS.md + CREDITS-AUDIT.md + MANIFEST.md + src/audio/README.md, 7. run audio tests, 8. build:portable + verify:portable,
9. report docs/design/tasks/audio-provenance-report.md

## Update 05:20 UTC
- All 36 sounds have generators (tools/audio/sounds/{beds,foley,wood,giants,creatures,ui}.mjs), registry sounds/index.mjs (+ old-levels.json = measured old levels; one-shots match old mean LUFS, peak <= -3), render.mjs renders into --out dir.
- Design loop: node tools/audio/quick.mjs [substr] (PCM only, shows centroid/mean LUFS vs old). Measure: node tools/sim/run-ts.mjs tools/audio/measure.ts test-output/audio-provenance/new test-output/audio-provenance/new.json
- Outputs so far go to test-output/audio-provenance/new (NOT yet public/assets). public/assets/audio is still the OLD files; final render with `node tools/audio/render.mjs` (default out public/assets) comes after tuning.
- Remaining: tune pass (check measure output), spectrogram sanity PNGs, tests, sync-records/credits docs, audio tests, portable build, report.

## Update 04:50 UTC (real clock; the earlier "05:20" above was a slip)
- FINAL files rendered into public/assets/audio (36 replaced; deterministic, cmp of two renders = 0 diffs). sync-records.mjs run: records_audio.json (+replaces/provenance/tier), public/assets/manifest.json, MANIFEST.md rows + prose (done by hand-scripted edit).
- Before copies: test-output/audio-provenance/{records_audio.before.json, MANIFEST.before.md, manifest.before.json, old/}.
- TODO next: CREDITS.md (root), public/assets/CREDITS.md (keep it parseable by src/ui/screens/credits/parse.ts: sections with tables need http sources; the UI test parse.test.ts line 25 expects an 'archive.org' group => will need a one-line change by its owner: report it), docs/CREDITS-AUDIT.md, src/audio/README.md note, tests src/audio/provenance.test.ts, run audio tests, build:portable + verify:portable, spectrogram sanity, report.

## Update 04:55 UTC
- Done: final render in public/assets/audio, sync-records run, CREDITS.md, public/assets/CREDITS.md, docs/CREDITS-AUDIT.md, MANIFEST.md prose edited. tools/audio/check.mjs (judges all 36: all ok), src/audio/provenance.test.ts (11 pass + LONG block).
- Squash/matching tuned (thud drive 10, car 3/4, click_03 6, drip_01 3, switch 3). Re-render + sync after any further sound change: node tools/audio/render.mjs && node tools/audio/sync-records.mjs
- Remaining: src/audio/README.md + assetIds.ts comment, run audio tests (packaging loudness audioPass engine eventMap lifecycle) + credits parse test (expect fail: src/ui/screens/credits/parse.test.ts line 25 wants 'archive.org' group -> report one-line change), FOUNDRESS_LONG run of provenance test, portable build+verify, measure tables (old.json vs new.json via measure.ts on public/assets), spectrogram look, report.

## Update 05:08 UTC
- Report written: docs/design/tasks/audio-provenance-report.md (one placeholder left: VERIFY_STATUS_PLACEHOLDER = result of npm run verify:portable browser stages, running in background via /tmp/verify.sh -> test-output/audio-provenance/verify-portable.log; it waits for other engineers' headless browsers).
- All code, tests (provenance.test.ts 13 pass LONG), docs (CREDITS x2, AUDIT, MANIFEST, README) done. build:portable OK (audio pack 8.14 MB), static verify PASS.
- Remaining: fill the placeholder from verify log, final StructuredOutput. Do not re-render sounds (final).
