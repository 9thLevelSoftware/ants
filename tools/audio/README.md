# tools/audio: the game's own sound files

Deterministic offline renderers for the 36 sounds that replaced third-party recordings (provenance pass, 2026-11-18).
Pure maths (seeded noise, filters, envelopes, modal resonators, Doppler by retarded-time reading, circular synthesis for
loops), no input recordings. Encoded with ffmpeg's libmp3lame (96 kbps CBR, 44.1 kHz). Rendering twice gives identical bytes.

```
node tools/audio/render.mjs [--only name,name] [--out dir]   # writes public/assets/audio/**
node tools/audio/sync-records.mjs                            # records, pack manifest, MANIFEST.md rows
node tools/audio/quick.mjs [name]                            # design loop: PCM only, centroid / loudness against the old file
node tools/audio/check.mjs [name]                            # judge on the decoded MP3 (loudness, true peak, spectrum, seam)
node tools/sim/run-ts.mjs tools/audio/measure.ts <dir> <out.json>   # report tables (uses src/audio/loudness.ts)
node tools/audio/report-tables.mjs <old.json> <new.json>     # markdown tables for the report
```

- `sounds/index.mjs`: the registry (id, seed, channels, level convention, the spectral range the sound's job calls for).
- `sounds/old-levels.json`: levels of the files that were replaced; one-shots keep their mean loudness (never above -3 dBFS peak).
- The encoder writes to a temporary file, not a pipe: only a seekable output gets the Info (Xing/LAME) frame, without which a decoder keeps the 1105-sample delay and the padding. `renderMp3` throws if a decoded file is not exactly as long as the render.
- `lib/`: rng, dsp kit, BS.1770 (`lufs.mjs`, a port of `src/audio/loudness.ts`, checked by `src/audio/provenance.test.ts`), encoder, analysis.
- Seeds are part of the sound: change one and the file changes. After any change run render, then sync-records, then `npx vitest run src/audio/provenance.test.ts`.
- Report: `docs/design/tasks/audio-provenance-report.md`.
