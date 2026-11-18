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
- 02:45 typecheck clean (12.8 s); npm run sim hello-core OK; build:portable OK 27.76 MB 7 files (test-output/docs-final-review/build-portable.log); CREDITS cross-check vs planAssets (credits-check.mjs): 0 issues; DEVIATIONS pointers (dev-pointers.mjs): 146 pointers, 0 bad, R1-R28 present.
- MAJOR: preset param autoSlowDefault (Gentle "pause") has no behaviour consumer: only written to state.env.time.autoSlow (src/sim/createGame.ts:108), AutoSlowWatcher reads settings.gameplay.autoSlowCritical (src/game/Game.ts:137). MANUAL 1.6 shows it in effect.
- MAJOR: MANUAL 2 "journal's focus line (top left)" and 12 "minimap, focus line" settings: no HUD focus line or minimap exists; settings gameplay.minimap/focusLine have no consumer (only prefs.ts mapping).
- minor: DEVIATIONS R2/C row says GDD 06 5.13 specifies nothing about food; 5.13(c) says queen keeps her reserves. C row R20 says GDD "around day 9"; GDD 06 1.6 says default 10 (window 9-12).
