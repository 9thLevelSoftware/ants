# app-seams-3 review progress
Started 09:30 UTC 2026-11-22.
## Done
- typecheck (owned paths: clean); vitest src/game/save + src/game/uiBridge 182 green.
- NEW src/game/save/gzipFrame.verify.test.ts (5 tests, green): all 8 bit masks on header+trailer, body sampled, FLG 4->0, ISIZE gigabytes.
- NEW src/render/ants/morph/queenColours.verify.test.ts: 1 RED by design (finding F1).
- Looked at their pictures: alerts card OK; cars meta-edge/meta-high/ant-0/start-view-150 OK.
## Findings so far
- F1 MAJOR: item 5b queen colour change is a no-op in game: catalog.ts applyAppearance overwrites head/mesosoma/gaster with species appearance (lasius-niger.ts bodyColour/gasterColour). queen-before-* and queen-after-* PNGs are pixel-identical (PIL diff bbox None). Report claim "modest visible lift" is false.
- Item 1 save frame: sound. Item 2 alerts: sound.
## Remaining
- item 4 stage1a script diff read; maybe own harness shot (alerts) ; final StructuredOutput
