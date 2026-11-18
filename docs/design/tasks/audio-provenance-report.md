# Audio provenance: report

Task `audio-provenance` (spec `docs/design/tasks/audio-provenance.md`). Written 2026-11-18. Evidence under `test-output/audio-provenance/` (git-ignored): `old/` (the 36 replaced files as they were), `old.json` / `final.json` (measurements), `tables.md`, `spec/` (spectrogram sheets), `build-portable.log`.

## Summary

Every shipped sound whose right to ship rested on an uploader's word is gone. The 26 archive.org files and the ten second-hand OpenGameArt files (36 in all) are replaced, under the same ids, by **original sounds rendered by deterministic scripts in `tools/audio/`**: pure maths (seeded noise, filters, envelopes, modal resonators, Doppler by retarded-time reading, circular synthesis for loops), no input recording, encoded with ffmpeg's libmp3lame (installed: ffmpeg 6.1.1) at the same 96 kbps / 44.1 kHz and the same mono/stereo layout and durations as before. No first-hand source was recorded instead (the network was not used), so none of the 36 is "kept on new evidence". Nine OpenGameArt files stay (see "Residual risk"). Nothing from a tier-B recording is in a shipped file: no sampling, no layering; the raw downloads were only used to measure the old files for the before columns.

Nobody can listen on this machine. Every statement about how a sound sounds below is inferred from construction, spectra, envelopes and spectrograms; a person's ear check of the 36 files is still advisable.

## 1. Every shipped audio file and its tier

Tier A: first-hand source with a licence the repository can show (the author's own OpenGameArt page, CC0 badge read 2026-11-12, recorded in the record; the repository holds no saved copy of the page). Tier B: unverified (`docs/CREDITS-AUDIT.md`, entries 1 and 2). Bytes: before / after.

| file | tier before | source before | action | bytes |
|---|---|---|---|---|
| `ambience/birdsong_day` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, Thimras; isaiah658 | kept | 540734 / 540734 |
| `ambience/crickets_night` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Animals_Misc" | replaced by an original render | 540734 / 540421 |
| `ambience/rain_light` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, Kresiek The Furry | kept | 540734 / 540734 |
| `ambience/rain_heavy` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Nature_Rain" | replaced by an original render | 504685 / 504372 |
| `ambience/wind_leaves` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, Thimras | kept | 540734 / 540734 |
| `ambience/street_suburban` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Ambience_1" | replaced by an original render | 348891 / 348578 |
| `ambience/traffic_distant` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Ambience_2" | replaced by an original render | 540734 / 540421 |
| `ambience/playground_distant` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "SSE_Library_AMBIENCE" | replaced by an original render | 540734 / 540421 |
| `ambience/room_fridge_hum` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, Kresiek The Furry | kept | 360803 / 360803 |
| `ambience/underground_rumble` | B (second-hand on OpenGameArt) | OpenGameArt, gmason | replaced by an original render | 480862 / 480549 |
| `sfx/soil_scrape_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "SSE_Library_DIRT_SAND" | replaced by an original render | 14733 / 14420 |
| `sfx/soil_scrape_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Tools" | replaced by an original render | 17554 / 17241 |
| `sfx/gravel_grit_01` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, TinyWorlds | kept | 9090 / 9090 |
| `sfx/gravel_grit_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Footsteps_1" | replaced by an original render | 11598 / 11285 |
| `sfx/gravel_grit_03` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Footsteps_1" | replaced by an original render | 11598 / 11285 |
| `sfx/wood_creak_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_2" | replaced by an original render | 15046 / 14733 |
| `sfx/wood_creak_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Creaks" | replaced by an original render | 27271 / 26958 |
| `sfx/wood_creak_03` | B (second-hand on OpenGameArt) | OpenGameArt, Department64 (original recording, per OGA description); cleaned up by AntumDeluge (OGA uploader) | replaced by an original render | 48901 / 48588 |
| `sfx/wood_rasp_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_2" | replaced by an original render | 16300 / 15987 |
| `sfx/wood_rasp_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_2" | replaced by an original render | 14419 / 14106 |
| `sfx/crunch_01` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, StarNinjas | kept | 11284 / 11284 |
| `sfx/crunch_02` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, StarNinjas | kept | 9404 / 9404 |
| `sfx/crunch_03` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_4" | replaced by an original render | 12852 / 12539 |
| `sfx/water_drip_01` | B (second-hand on OpenGameArt) | OpenGameArt, Independent.nu (credited on the OGA page; submitted to OGA by qubodup) | replaced by an original render | 11598 / 11285 |
| `sfx/water_drip_02` | B (second-hand on OpenGameArt) | OpenGameArt, Independent.nu (credited on the OGA page; submitted to OGA by qubodup) | replaced by an original render | 11598 / 11285 |
| `sfx/wet_splat_01` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, EZduzziteh | kept | 3761 / 3761 |
| `sfx/wet_splat_02` | A (author page on OpenGameArt, CC0 badge) | OpenGameArt, rubberduck | kept | 7523 / 7523 |
| `sfx/thud_giant_step_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Impacts" | replaced by an original render | 20062 / 19749 |
| `sfx/thud_giant_step_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Impacts" | replaced by an original render | 20062 / 19749 |
| `sfx/lawnmower_loop` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "SSE_Library_VEHICLES" | replaced by an original render | 240744 / 240431 |
| `sfx/lawnmower_push_loop` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "SSE_Library_MACHINES" | replaced by an original render | 240744 / 240431 |
| `sfx/car_pass_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Cars_2" | replaced by an original render | 108773 / 108460 |
| `sfx/car_pass_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Cars_3" | replaced by an original render | 120685 / 120372 |
| `sfx/broom_sweep_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_2" | replaced by an original render | 36675 / 36362 |
| `sfx/broom_sweep_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Foley_Props_2" | replaced by an original render | 36675 / 36362 |
| `sfx/insect_wing_buzz_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Animals_Misc" | replaced by an original render | 20062 / 19749 |
| `sfx/insect_wing_buzz_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "SSE_Library_ANIMALS" | replaced by an original render | 20062 / 19749 |
| `sfx/cricket_chirp_01` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Animals_Misc" | replaced by an original render | 10344 / 10031 |
| `sfx/cricket_chirp_02` | B (archive.org item, uploader-asserted CC0 over a studio library) | Internet Archive "Red_Library_Animals_Misc" | replaced by an original render | 10344 / 10031 |
| `sfx/stridulation_grasshopper_01` | B (second-hand on OpenGameArt) | OpenGameArt, AntumDeluge (trim) / straget (recording) | replaced by an original render | 22883 / 22570 |
| `sfx/ui_click_01` | B (second-hand on OpenGameArt) | OpenGameArt, Kenney | replaced by an original render | 1880 / 1881 |
| `sfx/ui_click_02` | B (second-hand on OpenGameArt) | OpenGameArt, Kenney | replaced by an original render | 1880 / 1567 |
| `sfx/ui_click_03` | B (second-hand on OpenGameArt) | OpenGameArt, Kenney | replaced by an original render | 1253 / 1254 |
| `sfx/ui_hover_01` | B (second-hand on OpenGameArt) | OpenGameArt, Kenney | replaced by an original render | 1880 / 1881 |
| `sfx/ui_switch_01` | B (second-hand on OpenGameArt) | OpenGameArt, Kenney | replaced by an original render | 3134 / 3135 |

After the change: 36 files are original (`provenance: original` in `assets-src/records_audio.json`, with a `replaces` entry naming the removed source for the audit trail), 9 are tier A, **0 are tier B**.

Audio size: records total 6,112,317 B before, 6,102,305 B after (-10,012 B). Pack text of the portable build (base64 plus wrapper lines): 8,151,791 B before, 8,138,427 B after (the build reports `packs/audio.*.js 8.14 MB`, 45 assets, both times). `public/assets` total 19,913,385 B before, 19,903,373 B after; portable total 27.74 MB.

## 2. How the replacements are made

- `tools/audio/render.mjs` renders all 36 (`--only name,name` for some; `--out <dir>` to write elsewhere). `tools/audio/sync-records.mjs` then updates `assets-src/records_audio.json`, `public/assets/manifest.json` and the audio rows of `assets-src/MANIFEST.md`. Registry: `tools/audio/sounds/index.mjs` (id, seed, channels, level convention, and for each sound the spectral range its job calls for, with the reason). Sound code: `tools/audio/sounds/{beds,foley,wood,giants,creatures,ui}.mjs`. Kit: `tools/audio/lib/` (`rng` mulberry32 with forked sub-streams, `dsp` filters / modal resonators / circular processing / Doppler read, `lufs` BS.1770, `finish` normalisation and ffmpeg, `pipeline`, `analysis` FFT spectrum, loop seam, engine join). Design loop: `node tools/audio/quick.mjs [name]` (PCM only, against the old file) and `node tools/audio/check.mjs [name]` (the whole judgement on the decoded MP3).
- **Loops are periodic by construction**: noise is filtered "around the circle" (three copies, the middle one kept), events and impulse responses wrap past the end, drones use whole cycles per loop, mower pulse trains are rescaled to a whole number of firings. The last sample therefore flows into the first with no crossfade and no 5 ms dropout (the old loops had both; `assets-src/MANIFEST.md` listed it as a known defect).
- **Levels keep the conventions of the files they replace**, so `tuning.ts` and the cue table need no change: beds -24 LUFS integrated (underground rumble -26, mowers -22) **measured on the decoded MP3** (the encoder lowers the level by 0.45 dB, so a second encode pass nudges the gain; the old files read -24.4 for the same reason), one-shots peak -3 dBFS. One-shots are additionally **lowered, never raised, to the mean K-weighted loudness of the file they replace** (`tools/audio/sounds/old-levels.json`, measured on the old files), because the cue gains of the audio pass were tuned against those levels; where a replacement could not reach the old loudness under the -3 dBFS peak it was given a lower crest (tanh `squash`) instead, and the rest is listed below.
- **Deterministic**: no `Math.random`, no clock; each sound has a seed, sub-layers use forked streams so editing one layer never shifts another. Two full renders were compared file by file (`cmp`): 0 differences. `FOUNDRESS_LONG=1 npx vitest run src/audio/provenance.test.ts` also compares the shipped files with a fresh render byte for byte. Same ffmpeg build and Node assumed (V8 uses its own fdlibm-derived `Math.sin`/`exp`/`tan`, so the maths is platform-independent; the encoder is the one external piece).
- `playground_distant` is **voice-less by design** (the old file held children's voices and never played because it is gated by the §13.7 intelligibility check). The gate in `assetIds.ts` is unchanged (App. E 28 still holds: the manifest does not mark the file as speech-checked, so the synth murmur plays and the Distant voices row stays hidden); lifting it would change what a setting plays, which is not this task's call. Comment updated.

## 3. How the check was made (nobody can listen)

`tools/audio/measure.ts` (run with `node tools/sim/run-ts.mjs`) decodes each shipped MP3 with ffmpeg and measures: duration, integrated loudness (and mean K-weighted loudness for clips under 1 s), true peak, spectral centroid and band shares (Welch power spectrum, 4096-point Hann, mono mix), stereo correlation, loop seam and engine join. Loudness and true peak use `src/audio/loudness.ts`; `tools/audio/lib/lufs.mjs` is a port for the renderers and `src/audio/provenance.test.ts` checks that the two agree to 6 decimals.

Limits and the reasons for them:

- **Loudness**: loops within 0.3 LU of their target on the decoded file (all are within 0.05: -24.0 / -26.0 / -22.0). One-shots: peak -3 dBFS at most (MP3 overshoot slack 0.6 dB), mean loudness not above the old file's.
- **True peak** under -1 dBFS for every replaced sound (measured on the decoded file; the loudest is -3.0 dBFS, the loops -5.4 dBFS or lower).
- **Spectral range (centroid)**: per sound, in the registry, with the reason. The ranges follow the sound's physics and role: crickets carry at 2.7-5.1 kHz (so 3000-5200 Hz), distant traffic is a low wash (130-600 Hz), a giant footfall lives in the 100-500 Hz band (110-400 Hz), clicks and ticks sit where their tone and tick are (UI click 1.2-3.6 kHz, sharp tick 3.5-8.5 kHz), and so on; where the old file was the reference and the role did not argue against it, the range was set around the old centroid (listed in the tables).
- **Loop seam**, three measurements (the pass/fail limits apply to the exact PCM render in `check.mjs`; the decoded-file values are reported in the table, where the MP3's own residue shows): (a) the wrap of the content as a sample-accurate loop: `jump` = |x[0] - x[N-1]| in units of the RMS first difference (smooth: at most 3.5), `kink` = change of slope across the wrap in units of the RMS second difference (smooth: at most 4.5), `level step` = level of the 250 ms after the seam against the 250 ms before (spec: within 1 dB); (b) **engine join**: what `loopSchedule.ts` actually plays (skip 30 ms at both ends, 1.5 s equal-power crossfade): the largest sample step of the join against the file's own largest step (`click`, must not exceed the file's own value) and the lowest 250 ms level inside the join against the level outside it (`dip`). The decoded MP3 starts with the encoder's 1105-sample delay, so the loops are measured on the content only (every loop is a whole number of seconds long).
- **Stereo** (underground rumble, the only stereo replacement): correlation 0.5-0.95. The old rumble was near mono (0.99); the new one is partly shared, partly independent (0.74) so it widens a little without phase games.

## 4. Measurements, before / after

(Each cell is old / new. "mean LUFS" is the ungated K-weighted level of the whole file; the loops use integrated loudness. Centroid and share above 2 kHz from the spectrum of the decoded file. A true peak of -3.0 for the one-shots is the convention; lower values mean the file was lowered to match the old loudness.)

### Loops and beds (before / after)

| sound | target | length s | LUFS | true peak dBFS | centroid Hz | share > 2 kHz | wrap jump | wrap kink | wrap level step dB | join click (file max) | join dip dB | stereo corr |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `ambience/crickets_night` | -24 LUFS | 45.01 / 45.04 | -24.5 / -24.0 | -10.2 / -10.4 | 3640 / 3715 | 0.84 / 1.00 | 1.0 / 1.0 | 1.8 / 0.7 | 0.64 / 0.15 | 5.9 / 5.7 (6.8) | -2.37 / -0.95 | - |
| `ambience/rain_heavy` | -24 LUFS | 42.01 / 42.03 | -24.4 / -24.0 | -14.4 / -13.0 | 1795 / 2658 | 0.31 / 0.53 | 3.0 / 1.4 | 5.7 / 0.9 | 0.24 / 0.34 | 4.1 / 4.3 (4.5) | -0.40 / -0.07 | - |
| `ambience/street_suburban` | -24 LUFS | 29.02 / 29.05 | -24.4 / -24.0 | -9.8 / -8.8 | 492 / 503 | 0.03 / 0.06 | 3.7 / 0.3 | 6.3 / 3.4 | 1.21 / 0.37 | 7.3 / 3.7 (5.2) | -1.19 / -0.31 | - |
| `ambience/traffic_distant` | -24 LUFS | 45.01 / 45.04 | -24.4 / -24.0 | -5.8 / -6.0 | 257 / 182 | 0.00 / 0.00 | 15.3 / 1.0 | 138.3 / 6.2 | 1.83 / 0.15 | 3.5 / 4.8 (6.2) | -4.18 / -1.59 | - |
| `ambience/playground_distant` | -24 LUFS | 45.01 / 45.04 | -24.5 / -24.0 | -3.2 / -7.9 | 1546 / 1149 | 0.25 / 0.20 | 0.9 / 0.3 | 2.4 / 0.5 | 3.31 / 0.06 | 8.1 / 4.3 (6.4) | -2.23 / -1.57 | - |
| `ambience/underground_rumble` | -26 LUFS | 40.02 / 40.05 | -26.4 / -26.0 | -13.2 / -11.6 | 71 / 86 | 0.00 / 0.00 | 109.8 / 1.3 | 983.1 / 2.7 | 0.95 / 0.81 | 3.6 / 4.5 (4.5) | -1.40 / -0.60 | 0.99 / 0.74 |
| `sfx/lawnmower_loop` | -22 LUFS | 20.01 / 20.04 | -22.4 / -22.0 | -10.0 / -5.4 | 2142 / 1457 | 0.47 / 0.29 | 1.8 / 0.2 | 2.9 / 1.0 | 0.43 / 0.21 | 4.6 / 6.0 (6.6) | -0.92 / -0.92 | - |
| `sfx/lawnmower_push_loop` | -22 LUFS | 20.01 / 20.04 | -22.5 / -22.0 | -6.1 / -7.6 | 2856 / 1954 | 0.66 / 0.37 | 1.2 / 0.8 | 1.9 / 1.0 | 0.21 / 0.75 | 4.2 / 4.4 (4.7) | -0.70 / -1.45 | - |

### One-shots (before / after)

| sound | length s | mean LUFS | true peak dBFS | centroid Hz | share > 2 kHz | expected centroid (reason) |
|---|---|---|---|---|---|---|
| `sfx/soil_scrape_01` | 1.18 / 1.20 | -26.3 / -26.3 | -3.2 / -8.1 | 2622 / 2409 | 0.51 / 0.43 | 900-4000 (grit grains rung at 1.5-6.2 kHz over a dull 900 Hz body) |
| `sfx/soil_scrape_02` | 1.41 / 1.44 | -20.6 / -20.6 | -3.5 / -3.7 | 2713 / 1926 | 0.50 / 0.35 | 1200-3500 (grit at 1.1-5.2 kHz with a low plunge knock) |
| `sfx/gravel_grit_02` | 0.92 / 0.94 | -21.7 / -21.9 | -3.6 / -3.6 | 1723 / 2061 | 0.28 / 0.44 | 1500-3400 (short stone ticks rung at 1.3-4 kHz) |
| `sfx/gravel_grit_03` | 0.92 / 0.94 | -23.0 / -23.1 | -3.4 / -6.6 | 1838 / 1999 | 0.28 / 0.41 | 1500-3400 (stone ticks rung at 1.2-3.8 kHz) |
| `sfx/crunch_03` | 1.02 / 1.04 | -19.0 / -19.0 | -3.7 / -3.5 | 2904 / 3563 | 0.64 / 0.64 | 2000-4800 (a dense crackle of grains in 0.5-4.3 kHz with a few lower cracks) |
| `sfx/wood_creak_01` | 1.20 / 1.23 | -19.6 / -19.8 | -3.5 / -4.1 | 769 / 988 | 0.08 / 0.09 | 500-2600 (slip pulses at 150-235 Hz rung through 0.7-3.1 kHz wood modes) |
| `sfx/wood_creak_02` | 2.22 / 2.25 | -28.4 / -28.5 | -3.4 / -11.1 | 349 / 564 | 0.02 / 0.00 | 350-2000 (slower slip (75-150 Hz), lower modes 0.36-1.8 kHz) |
| `sfx/wood_creak_03` | 4.02 / 4.05 | -30.1 / -30.2 | -3.2 / -13.0 | 1787 / 797 | 0.18 / 0.07 | 450-2200 (very slow slip (40-95 Hz), modes 0.3-2.1 kHz) |
| `sfx/wood_rasp_01` | 1.31 / 1.33 | -19.5 / -19.6 | -3.4 / -4.2 | 476 / 536 | 0.01 / 0.02 | 450-1900 (noisy grains rung at 0.33-1.9 kHz: the old stand-in was a low, heavy scrape (centroid about 480 Hz)) |
| `sfx/wood_rasp_02` | 1.15 / 1.18 | -27.9 / -28.1 | -3.5 / -9.9 | 606 / 777 | 0.02 / 0.05 | 550-2200 (grains rung at 0.5-2.4 kHz, finer than rasp_01) |
| `sfx/thud_giant_step_01` | 1.62 / 1.65 | -16.3 / -18.8 | -3.4 / -3.4 | 235 / 177 | 0.00 / 0.00 | 110-400 (low-passed at 700 Hz with a bass shelf; body 85-150 Hz, floor modes 110-470 Hz) |
| `sfx/thud_giant_step_02` | 1.62 / 1.65 | -19.6 / -19.7 | -3.4 / -5.1 | 172 / 190 | 0.00 / 0.00 | 110-400 (floor modes 118-480 Hz ringing) |
| `sfx/car_pass_01` | 9.01 / 9.04 | -22.0 / -22.0 | -3.6 / -9.8 | 573 / 444 | 0.05 / 0.05 | 250-900 (engine harmonics from 110 Hz to 1.5 kHz and tyre noise 0.2-2.6 kHz) |
| `sfx/car_pass_02` | 10.01 / 10.03 | -16.8 / -16.8 | -3.4 / -7.3 | 510 / 290 | 0.03 / 0.01 | 250-900 (higher engine order, less tyre noise) |
| `sfx/broom_sweep_01` | 3.01 / 3.03 | -16.9 / -18.3 | -3.3 / -3.1 | 3652 / 3795 | 0.75 / 0.78 | 1500-4800 (bristle hiss centred 2.2-4 kHz, grit ticks, dull sweep) |
| `sfx/broom_sweep_02` | 3.01 / 3.03 | -17.5 / -19.4 | -2.9 / -3.5 | 3735 / 3740 | 0.77 / 0.76 | 1500-4800 (as broom_01) |
| `sfx/insect_wing_buzz_01` | 1.62 / 1.65 | -13.7 / -13.8 | -3.3 / -3.8 | 3063 / 2376 | 0.71 / 0.50 | 1200-3600 (wingbeat near 190 Hz, a narrow pulse (flat harmonic comb to 6 kHz) plus air noise 0.8-5.2 kHz) |
| `sfx/insect_wing_buzz_02` | 1.62 / 1.65 | -15.7 / -16.2 | -3.4 / -3.3 | 1475 / 2322 | 0.24 / 0.48 | 900-3000 (seven wingbeats at 205-255 Hz, same construction) |
| `sfx/cricket_chirp_01` | 0.81 / 0.84 | -12.5 / -15.3 | -3.3 / -3.4 | 2766 / 4544 | 0.99 / 1.00 | 3800-5200 (cricket carriers 4.15 and 4.6 kHz) |
| `sfx/cricket_chirp_02` | 0.81 / 0.84 | -12.2 / -15.2 | -3.4 / -3.4 | 3123 / 4269 | 1.00 / 1.00 | 3800-5000 (carrier 4.3 kHz) |
| `sfx/stridulation_grasshopper_01` | 1.86 / 1.88 | -24.0 / -24.0 | -3.3 / -5.1 | 9515 / 4968 | 1.00 / 0.97 | 2800-6200 (scrape pulses in 2.5-7 kHz (the cue raises it a fifth)) |
| `sfx/ui_click_01` | 0.11 / 0.16 | -25.6 / -27.1 | -4.2 / -8.6 | 1127 / 1493 | 0.27 / 0.01 | 1200-3600 (tick at 3.2 kHz over a 1.5 kHz tone) |
| `sfx/ui_click_02` | 0.11 / 0.13 | -29.1 / -30.2 | -3.2 / -12.9 | 2692 / 1859 | 0.50 / 0.04 | 1200-3500 (tick at 3.4 kHz over a 1.9 kHz tone) |
| `sfx/ui_click_03` | 0.05 / 0.10 | -18.9 / -23.5 | -2.3 / -3.0 | 7854 / 6809 | 1.00 / 0.94 | 3500-8500 (tick at 7 kHz over a 4.8 kHz tone) |
| `sfx/ui_hover_01` | 0.11 / 0.16 | -23.3 / -24.8 | -3.2 / -12.7 | 714 / 759 | 0.02 / 0.00 | 550-1100 (sine glide 700-980 Hz) |
| `sfx/ui_switch_01` | 0.21 / 0.26 | -26.5 / -27.3 | -3.7 / -8.2 | 2270 / 1341 | 0.24 / 0.05 | 1000-3200 (two clicks, tones at 1.7 kHz and 1.1 kHz) |
| `sfx/water_drip_01` | 0.92 / 0.94 | -24.6 / -24.8 | -3.5 / -6.5 | 1179 / 1075 | 0.04 / 0.02 | 900-3200 (bubble 0.8-1.3 kHz, splash tick near 3.4 kHz) |
| `sfx/water_drip_02` | 0.92 / 0.94 | -30.8 / -31.0 | -3.6 / -6.8 | 1484 / 1347 | 0.05 / 0.01 | 900-3400 (bubble 0.96-1.8 kHz, splash tick near 3.4 kHz) |


Reading the tables:

- All 8 loops/beds: level on target (-24.0 / -26.0 / -22.0 against old -24.4 / -26.4 / -22.4). **Wrap, exact (the PCM render, `check.mjs`)**: jump at most 2.03 (the push mower; the others 1.0 or less), kink at most 1.04, level step at most 0.81 dB: all inside the limits above. **Wrap of the decoded MP3 (the table; what a sample-accurate loop of the file would play)**: jump at most 1.4, kink at most 3.4 except `traffic_distant` at 6.2 (codec residue at the file ends; its PCM kink is 0.77), level step at most 0.81 dB; the old files read up to 15 / 110 (jump), 138 / 983 (kink) for `traffic_distant` / `underground_rumble`, and up to 3.3 dB for `playground_distant`: audible wrap steps that the engine's trim and crossfade hid. **Engine join**: no clickier than the file itself in every case (click <= file max step), dip at most -1.6 dB (old up to -4.2 dB).
- One-shots whose loudness could not be matched under the -3 dBFS peak: `thud_giant_step_01` (-18.8 against -16.3 LUFS mean: 2.5 LU quieter; the audio pass measured the giant footstep scene at -13.3 against a target of -14 +/- 3, so about -15.8 is expected, still inside; **inferred, the browser scene render was not run**), `cricket_chirp_01/02` (-2.8 / -3.0 LU: tonal bursts are peaky and the old recording was a dense chorus), `ui_click_03` (-4.6 LU, a 50 ms tick), `ui_hover_01` (-2.0), `ui_click_01` (-2.0), `ui_click_02` (-1.6), `broom_sweep_01/02` (-1.4 / -1.9). Everything else is within about 0.7 LU of the old file (the remainder is the encoder's 0.45 dB).
- Centroids that moved most against the old files: `wood_creak_03` 1787 -> 796 Hz (a low groan instead of a bright creak), `lawnmower_loop` 2142 -> 1457 and `lawnmower_push_loop` 2856 -> 1954 (darker), `rain_heavy` 1795 -> 2658 (brighter; the old one was band-limited), `stridulation_grasshopper_01` 9515 -> 4981 (the cue raises it a fifth), `cricket_chirp_01` 2766 -> 4544 (a clean 4.6 kHz carrier instead of a noisy recording), `thud_giant_step_01` 235 -> 177, `car_pass_01/02` 573/510 -> 444/290.

## 5. What was lost: an honest note per sound

Common to all: these are synthetic. They lack the irregular detail, room, surface and microphone character of a real recording; a trained ear will hear a model. The roles (what each cue needs) are met by construction and by the numbers above, not by listening.

Ambience beds
- `crickets_night`: 64 voices of pulse trains on 4.0-5.1 kHz (and some 2.7-3.3 kHz tree crickets), grouped in slow bouts. Likely to read as crickets at a glance; more regular and cleaner than a real chorus (all energy above 2 kHz against 84 % before), without the other insects and the ambience between the chirps.
- `rain_heavy`: shaped noise plus five bands of random drop impacts plus low knocks. Reads as steady rain; no roof, leaf or puddle surface character; brighter than the old band-limited file. Lowest-risk replacement.
- `street_suburban`: a 140 Hz-2.6 kHz wash, low hum, two far car passes (Doppler 6 %), seven far bird whistles. The old file's real neighbourhood events are gone; this is a plausible but plain street.
- `traffic_distant`: slow swells of low wash, rumble under 110 Hz, far tyre hiss. No individual vehicles or horns; a little lower (centroid 182 against 257 Hz).
- `playground_distant`: **no children's voices** (a deliberate loss: the old one had them and was gated off). A band wash with irregular swells, five ball-bounce sequences and a dozen chain clinks. Reads as distant activity, not as children.
- `underground_rumble`: low-passed noise (320 Hz), three slow whole-cycle drones (38, 45.5, 57 Hz) and soft settling knocks, partly decorrelated stereo. The old engine character is gone (more earth-like, which is what the cue wants); needs headphones or a subwoofer to be felt, like the old one.

Loops
- `lawnmower_loop`: a four-stroke single firing at about 27 Hz with exhaust modes, clatter and blade hiss. Darker than the old file; no real mechanical irregularity beyond a governor drift and the odd weak stroke.
- `lawnmower_push_loop`: reel blade clicks at about 17 per second, whirr and wheels, a gentle push cadence (level swings under 1.5 dB so the seam stays level). Darker and less clattery than the recording.

Ground foley
- `soil_scrape_01/02`: grit grains in 1.1-6.2 kHz over a dull body (02 adds the blade's plunge). Played pitched up 12-19 semitones and sliced to 0.12-0.3 s for ant-scale digging, where this kind of sound survives well; no real shovel or soil moisture.
- `gravel_grit_02/03`: clusters of short stone ticks. Brighter and sparser than the sliding-step recording.
- `crunch_03`: a dense crackle of grains thinning over the second, a few lower cracks; the old level was matched with a squash, so it is a little more compressed than a real dry crunch.

Wood
- `wood_creak_01/02/03`: stick-slip pulse trains gliding in pitch, rung through wood modes. Creaks are the most model-like of the lot: they will sound like a creak but with a regular, "synthetic wooden hinge" quality. `wood_creak_03` (tree) is now a lower groan than the old, brighter file.
- `wood_rasp_01/02`: a rough tooth drawn over wood (the old files were scrapes used as a stand-in for gnawing; these are stand-ins too). 02 is finer and faster. Centroid close to the old 01 (535 against 476 Hz); 02 is brighter than the old sped-up file (776 against 606 Hz).

Giants
- `thud_giant_step_01/02`: a broad strike, a pitch-falling body and the floor's modes ringing, low-passed at 700 Hz with a bass shelf, then squashed so the loudness stays near the old files. Heavier at the low end, less "thump with a settling bag"; 01 is 2.5 LU quieter than the old file (see above). The old files held more than one impact each; these hold one.
- `car_pass_01/02`: source (engine harmonics, tyre noise) read through true propagation delay, distance and air absorption: a real Doppler pass, which the old recordings did not have (they stayed at constant level), with a gentler level law to keep the old loudness. Darker than before (centroid 444 / 290 against 573 / 510).
- `broom_sweep_01/02`: three bristle strokes, grit ticks, a dull sweep. 1.4-1.9 LU quieter than the old, otherwise close in spectrum (3.8 kHz against 3.7 kHz).

Insects
- `insect_wing_buzz_01/02`: a fly (190 Hz wingbeat with vibrato, flutter, hiss) and a swarm of seven bees. The old "buzzing sound" was never confirmed as a fly; this one is one by construction. Brighter than the old swarm, darker than the old single buzz.
- `cricket_chirp_01/02`: clean pulse-train chirps on 4.15-4.6 kHz carriers. Cleaner and 3 LU quieter than the recording.
- `stridulation_grasshopper_01`: three phrases of scrape pulses in 2.5-7 kHz, up-stroke louder. A model of a grasshopper song; the old one was a real recording and much brighter (9.5 kHz).

Interface and water
- `ui_click_01/02/03`, `ui_hover_01`, `ui_switch_01`: a few ms of band-limited noise, a short damped tone and a low tap; the hover is a soft rising blip, the switch two clicks. Close in function and in loudness; they are not Kenney's timbres (by design, the originality rule). `ui_click_03` is 4.6 LU quieter than the old tick.
- `water_drip_01/02`: a Minnaert bubble (pitch climbing as the bubble shrinks), a splash tick, a short echo like a hollow room, with one or two smaller drops after the first. Plausible; a real drip has more irregular resonance.

## 6. Acceptance criteria

1. **No shipped audio file is tier B; the audit's "cannot be shown" audio lists are empty.** MET. All 45 records `tier: A`; 36 `provenance: original`; `docs/CREDITS-AUDIT.md` entries 1 and 2 are marked REMOVED with a closing section; `CREDITS.md` and `public/assets/CREDITS.md` list no archive.org source and no tier-B entry; `src/audio/provenance.test.ts` fails if any of that regresses.
2. **Every cue id and ambience id that existed still resolves and plays; loudness targets met; loops seamless by the step-4 measurement.** MET by tests and measurement. The ids are unchanged: `packaging.test.ts` (every requested file ships, every shipped file is requested) and `provenance.test.ts` (all 36 are still requested and in the manifest) pass; the 220 tests of `src/audio` pass. Level targets: section 4. Seams: section 4 (PCM wrap and engine join, all 8 loops pass). What was not run: a browser run of the real game with the new files (see "Not done").
3. **Deterministic: the scripts and their seeds are in the repository, two renders are byte-identical.** MET. `cmp` of two full renders: 0 differences; the LONG test compares the shipped files with a fresh render.
4. **Report with the tables and an honest note per sound.** MET: this file.

Spec work items: (1) list: section 1. (2) replace: all 36, by renderers (not runtime recipes: the file-based cues keep their synth fallbacks as before). (3) first-hand source: not used (no network; everything replaced). (4) measurement: sections 3 and 4. (5) credits: `CREDITS.md`, `public/assets/CREDITS.md`, records, `docs/CREDITS-AUDIT.md`, `assets-src/MANIFEST.md`; removed sources listed with the date 2026-11-18. (6) build: see section 7.

App. E checks of the audio chapter (GDD 08) that concern this module: 28 (playground bed is the synth murmur while `playground_distant` has not passed the speech check) is unchanged and covered by `ambience.test.ts`; 4, 15, 16, 27 do not depend on the files and their tests pass.

## 7. Tests and build

- `npx vitest run src/audio`: 13 files, 220 passed, 1 skipped (the LONG block). Includes `packaging`, `loudness`, `audioPass`, `engine`, `eventMap`, `lifecycle` and the new `provenance.test.ts` (11 checks always, 2 more under LONG). About 10 s.
- `FOUNDRESS_LONG=1 npx vitest run src/audio/provenance.test.ts`: 13 passed in 69 s (all 36 sounds rendered, encoded, decoded and judged; shipped files compared with a fresh render).
- `npm run typecheck` filtered to `src/audio`: no errors. (`tools/audio` is plain `.mjs` plus one `.ts` run through `tools/sim/run-ts.mjs`, outside the typecheck as `tools/build` is.)
- `npm run build:portable`: OK, 45 audio files in one `audio` pack of 8.14 MB, total 27.74 MB. `node tools/build/verify-portable.mjs --scan-only --no-build`: PASS (forbidden patterns, size limits). Browser stages of `npm run verify:portable`: **PASS** (`npm run verify:portable`, run 2026-11-18 after the last render: static checks, the build served from a sub-path, and inside a sandboxed iframe; the audio pack `packs/audio.53adbea0.js` loads lazily, 45 files, decodes, no console error; log `test-output/audio-provenance/verify-portable.log`). The harness run did not play the new sounds through the mixer: it checks that the pack loads and decodes.

## 8. Decisions, contradictions, findings

- **Scope.** Replaced exactly the integrator's list (26 archive.org + 10 second-hand OpenGameArt, including `underground_rumble`, whose record says it is an engine effect). The nine remaining OpenGameArt files are not on that list and were kept.
- **Per-sound route.** All 36 became rendered files, none a new runtime recipe: the cue table, the loop player and the loudness retune already assume files with those ids; the existing synth recipes stay as the fallbacks they were.
- **Loudness convention versus "loudness target".** The spec says "keeps its loudness target": for beds that is -24 / -26 / -22 LUFS; for one-shots the old rule was only "peak -3 dBFS", which does not fix perceived level, so the renderers also match the old mean loudness (never raising above -3 dBFS).
- **Encoder level.** libmp3lame at 96 kbps lowers the decoded level by 0.45 dB; the old files carried the same offset (-24.4). The renderers compensate (beds in a second pass, one-shots in the matching target), so decoded files hit -24.0.
- **Seam measurement.** The decoded MP3 carries the encoder's 1105-sample delay and padding; measured naively every loop shows a zero-valued seam. Loops are measured on the content only; the engine join is measured separately.
- **Precedence.** No contradiction between sources needed ruling beyond: design seed (originality, pure simulation code: untouched, all new code is in `tools/audio` and the tests) > the audio chapter (what each cue is for: roles kept) > the task spec.

## 9. Not done, and what other modules need

- **A person's ear check** of the 36 files (nobody can listen here), and a browser run of the real game and of the loudness scenes of `spikes/audio-demo` (`scripts/loudness.mjs`, `analyse.mjs`) with the new files: not run (shared machine, one headless browser at a time, and the task asked for measurement). Expected: the calm-surface, rain and night scenes stay inside their bands (the beds have the old loudness to within 0.4 LU and similar spectra); the giant footstep about -15.8 (see section 4).
- **`src/ui/screens/credits/parse.test.ts` (not mine) now fails one assertion** (line 25): it expects the credits groups `['Poly Haven', 'ambientCG', 'OpenGameArt', 'archive.org']`. The archive.org section is gone, so the list should be `['Poly Haven', 'ambientCG', 'OpenGameArt']`. The new "Original sounds" section is notes only (no table), so it is not a row group. One-line change for the UI owner or the integrator; the Credits screen itself needs nothing (it renders the sections it finds, and the Original sounds paragraph appears as a notes block).
- **`tools/assets/build_manifest.py` and `process_audio.py` (not mine) are stale for audio**: running `build_manifest.py` would regenerate `MANIFEST.md` and `manifest.json` with the old archive.org narrative and `CC0-1.0` for every audio file. I did not edit them; `tools/audio/sync-records.mjs` is the working replacement for the audio part. They should be updated or retired.
- **Residual risk (the nine files that stay):** `ambience/birdsong_day`, `rain_light`, `wind_leaves`, `room_fridge_hum`, `sfx/gravel_grit_01`, `crunch_01`, `crunch_02`, `wet_splat_01`, `wet_splat_02`. Their evidence is the author name and the CC0 badge on the OpenGameArt page as read on 2026-11-12; the repository holds no saved copy of those pages, and OpenGameArt cannot prove an uploader recorded what they uploaded. The same renderers could replace them (a light-rain and a wind bed, a fridge hum, grit, crunch and splat are within reach; birdsong is the hard one).
- Distant voices: `playground_distant` is voice-less but remains gated (App. E 28); enabling it for the Distant voices setting is a design call.
