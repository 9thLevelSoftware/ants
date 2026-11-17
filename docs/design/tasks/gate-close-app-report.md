# Gate close — application half (gate-close-app) report

Engineer: gate-close-app (Opus). Work from 2026-11-17 03:20 UTC on the shared checkout (load average 9-14 on 4 cores
throughout: colony-life sweeps, species engineers' browsers). Evidence root: `test-output/gate-close/app/` (git-ignored).
Cross-edits into `src/sim` (each under 30 lines, each with a test): `test-output/gate-close/cross-edits.md`.
Progress log: `docs/design/tasks/progress/gate-close-app-impl.md`.

DRAFT: sections marked (pending) are filled as the remaining runs finish.

## 0. Verdict per acceptance criterion

(pending — filled at the end)

## 1. Typecheck and tests, folder by folder (step 1)

`npm run typecheck`: clean on my paths at 03:22 and after every change since. Errors seen in the tree that are not
mine (work in progress of others, not touched): `src/sim/species/modules/wood/wood.verify.test.ts` (TS2554, carpenter),
`src/sim/ants/behaviours/outdoor/hunt.test.ts` (TS2339 `knownBy`, colony-life).

Unit tests, one vitest process per folder (`test-output/gate-close/app/unit/{summary.txt,*.log}`):

| Folder | Files | Tests | Result |
|---|---|---|---|
| src/content | 11 | 114 | green (incl. `controls.test.ts`, red at hand-over: green now) |
| src/input | 6 | 105 | green |
| src/audio | 12 | 209 | green |
| src/ui | 46 | 395 | 1 red → fixed (below) |
| src/game | 82 | 549 | green |
| src/render/ants, app, assets, camera, creatures, debug | 48 | 351 | green |
| src/render/fx | 14 | 68 | green (incl. `scentTrail.test.ts`, red at hand-over: green now — foragers lay trails again) |
| src/render/nest, slots, world | 77 | 367 (+2 skipped) | green |

Red test found and fixed:

| Test | Owner | Cause | Fix |
|---|---|---|---|
| `src/ui/panels/health/model.test.ts` "every remedy the colony publishes has words and a known action" | ui-panels (mine now) | the species engineers added remedy ids (`remedy.slider.mill`, `.store`, `remedy.caste-emphasis`, `remedy.granary.hygiene`, `remedy.dig.granary`, `remedy.guard.entrance`, `remedy.marker.satellite`, `remedy.dig.drain-chamber`, `remedy.toggle.hideFrass`) with words but no action, so the health panel offered them as plain advice | `REMEDY_ACTION` entries (nearest existing control; a `brood` directives control for caste emphasis) in `src/ui/panels/health/model.ts` |

## 2. Browser scripts on the real game (step 2)

(pending — table filled from `test-output/gate-close/app/e2e/summary.txt`)

## 3. Seams (step 3)

(pending)

## 4. Play-through with pictures (step 4)

(pending)

## 5. Frame time (step 5)

(pending)

## 6. Portable build (step 6)

(pending)

## 7. Still wrong, most serious first

(pending)
