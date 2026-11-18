# docs-final review — progress
Started 2026-11-18 (reviewer, Opus). Owned docs: README.md, docs/MANUAL.md, docs/design/gdd/DEVIATIONS.md, CREDITS.md, docs/CREDITS-AUDIT.md.
Evidence/scripts: test-output/docs-final-review/
## Done
- (nothing yet)
## In progress
- reading spec + docs
## Findings so far
- 02:30 read STATUS, all 5 docs; verified: controls tables == controlsMarkdown() (test-output/docs-final-review/ctl.ts); preset table vs presetCard (newgame.ts): 1 mismatch (Rival colonies text altered); settings fields OK.
## Findings (draft)
- minor: MANUAL 1.6 "Rival colonies" row reads "young colonies nearby"; screen prints "young rivals nearby".
- minor: MANUAL 0 "Every key can be changed" — Shift+1..7 tools, Ctrl+Z, Q/E planner rotate are hard-coded (src/game/views/colony/colonyControl.ts:40-58).
- minor: MANUAL rule table shows "-" for winterMode/foundingAssist/queenSenescence/extinctionEndsGame preset values though presets set them.
- minor: species= URL flag accepts all 4 ids (src/game/newGame/options.ts:56 pick from SPECIES_IDS, no availability gate).
