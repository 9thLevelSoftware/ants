# audio-provenance review — progress

Reviewer for docs/design/tasks/audio-provenance.md. Started 2026-11-18.

## Done
- (none yet)

## In progress
- Reading spec + docs

## Remaining
1. Read owned code (tools/audio/**, src/audio/provenance.test.ts)
2. typecheck, vitest src/audio
3. Verify acceptance criteria (tiers, determinism, loudness, loops, credits)
4. Write src/audio/*.verify.test.ts
5. Report

## Findings so far
- F1 (candidate major): new MP3s have NO Xing/Info+LAME gapless header (encoded to pipe:1, ffmpeg cannot write it to a
  non-seekable output). Old files had it. ffmpeg decode: old crickets 1984500 samples (exact), new 1986048 (+1105 delay
  +443 pad); ui_click_01 new 6912 vs content 4851. => every replaced one-shot starts ~25 ms late in a decoder that honours
  the tag. Also measure.ts subtracts ENCODER_DELAY from OLD files too -> "before" seam/join columns measured on a window
  shifted by 25 ms (old files have no delay after decode).
- Read so far: spec, CREDITS-AUDIT (old+new), records, all tools/audio/** code, provenance.test.ts.
- typecheck: 0 errors overall (05:10). `npx vitest run src/audio`: 1 FAILED (provenance.test.ts 'three cheap one-shots
  keep the level convention' - ui_click_01 PCM mean -25.1 vs old -25.6 + 0.3 slack; pipeline.mjs ENCODER_LOSS_DB 0.45
  makes PCM old+0.45 by construction; pipeline.mjs mtime 04:57 is after test file 04:54). Implementer claimed all pass.
- F3 (minor): one-shot meanLufs on decoded new files includes 1105 delay + padding silence -> short clips read 1.5 LU
  quieter (ui_click_01 decoded -27.1, tp -8.6 so NOT peak-limited; report blames the -3 dBFS peak).
- Next: LONG provenance test (byte identity), determinism re-render into test-output/audio-provenance-review/.
- DONE: src/audio/provenance.verify.test.ts (9 tests; 2 FAIL by design = F1: 'every replaced file carries a Xing/Info
  gapless header too', 'a replaced one-shot decodes to the length of the sound that was rendered'); typecheck clean.
- LONG provenance test run once: 12 pass (all 36 checks + byte identity OK), only the cheap one-shot test fails.
- Confirmed fix route for F1 (scratch): encoding to a seekable file gives the Info tag and is byte-deterministic.
- F2 (minor): measure.ts applies ENCODER_DELAY to OLD files too (old decode has no delay) -> report "before" seam values
  wrong (traffic old jump/kink 15.3/138 reported vs 2.8/28 on the right window).
- Browser busy (another engineer's harness, pid 28474) -> loudness scene harness + Chrome decode check deferred.
- Checked OK: manifest texture entries unchanged; records/manifest sizes match disk; dist-portable audio pack holds the
  new bytes; dist-portable/CREDITS.md has no archive.org; assetIds.ts diff is comment-only; credits UI test fails as
  reported (outside paths).
- Prepared browser decode check: test-output/audio-provenance-review/decode/ + decode-script.mjs (run with
  play.mjs --static --root test-output/audio-provenance-review/decode --script test-output/audio-provenance-review/decode-script.mjs).
- Then (browser free): spikes/audio-demo loudness.mjs (label=review) and analyse.mjs ?skip=all (loops) -> out test-output/audio-provenance-review/.
- DONE browser: decode check (Chrome decodes old to exact length, new +1548..2061 samples, thud onset sample 1118 vs 224)
  -> test-output/audio-provenance-review/decode-out; loudness scenes all ok (footstep short-max -14.6, target -14+-3)
  -> test-output/audio-provenance-review/loudness/review.json + loudness.png (looked at).
- Next: analyse.mjs ?skip=all (loop boundaries), then final report.
