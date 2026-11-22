# app-seams-3 progress (impl)
Started 2026-11-22 08:30 UTC.

## Item 1 DONE (08:35)
Cause: gzip header MTIME/XFL/OS, the ISIZE trailer and deflate-equivalent bit flips were unchecked (fflate writes wall-clock MTIME).
Fix: src/game/save/gzipFrame.ts (sealGzip, frameProblem, lengthMatches) used by container.ts. New saves: FEXTRA subfield `FC` = CRC32 of deflate body, MTIME 0.
Legacy saves (FLG 0) still open; fixture src/game/save/fixtures/legacySave.fixture.ts written by the OLD code. Test: src/game/save/container.frame.test.ts. `npx vitest run src/game/save` 110 pass.
Legacy limits: MTIME (4 bytes) and deflate-equivalent flips in legacy saves stay undetectable (nothing covers them).

## Remaining in order: 2 alert title, 3 backdrop cars, 4 stage1a egg beat, 5 epitaph cause + queen gloss, 6 report
