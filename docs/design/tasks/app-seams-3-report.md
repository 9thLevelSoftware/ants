# app-seams-3 report

Written 2026-11-22 (UTC), by the implementing engineer. Nothing under `src/sim`, `src/worldgen`, `src/core` was changed.

## Acceptance

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Typecheck clean; tests green folder by folder | met | `npm run typecheck`: no line in my paths. `src/game` 98 files / 619 tests (includes `src/game/save` 13 files), `src/content` + `src/ui/hud` + `tests/docs` 30 files / 226 tests, `src/render/ants` 17 files / 123 tests |
| 2 | `save.verify.test.ts` green, with a test that an earlier save still loads | met | `save.verify.test.ts` 13/13; `container.frame.test.ts` 7/7 including a fixture written by the code before the change |
| 3 | Pictures for items 2, 3, 5 under `test-output/app-seams-3/`, each looked at | met | listed per item below |
| 4 | No change under `src/sim`, `src/worldgen`, `src/core` | met | see "Needs from others" for what I found there and did not touch |

## Item 1: a corrupted save file loads

**What was wrong.** Probing every byte of an exported save (4 xor masks) showed 89 single-byte changes that still parsed as ok. Two kinds:
1. The gzip header bytes the format does not checksum: MTIME (bytes 4 to 7, and `fflate` fills it with the wall clock), XFL, OS, FLG bits, and the 4-byte ISIZE in the trailer (never compared to the data).
2. Bit flips inside the deflate stream that decode to the same output (deflate has two spellings of some symbols, e.g. match length 258), so the CRC of the data cannot see them. Byte 11560 of the test's save was one of these.
Trailing bytes were already rejected (the trailer is read from the end).

**What changed.** New `src/game/save/gzipFrame.ts`, used by `container.ts`:
* Saves written from now on are still an ordinary gzip member (gunzip, `gzip -t`, and the old reader all open them) with one FEXTRA subfield `FC` that holds the CRC-32 of the deflate body, a fixed header (MTIME 0) and a checked ISIZE. Any single-byte change now fails one of: header equality, body CRC, data CRC, data length. As a side effect an export of the same save is byte-for-byte reproducible (no wall clock in the header).
* The parser checks the frame before it inflates anything.

**Saves written before the fix.** They still open (header FLG 0): test `container.frame.test.ts` "still open, by file bytes and by pasted text" uses `src/game/save/fixtures/legacySave.fixture.ts`, an export written by the unmodified code before I touched `container.ts`. For those files the header's fixed bytes, the data CRC and the data length are now checked (flips there are rejected, tested), but MTIME and deflate-equivalent bit flips cannot be detected: nothing in the file covers them. That is a property of the old format, not something a reader can add. New saves also open in a build from before the fix (test "is still a plain gzip member").

**Tests.** `container.frame.test.ts`: every byte, two masks (0x01 and 0xff), no survivor; trailing bytes (1, 5, 2 starting like a gzip member) and a truncated byte rejected; reproducible export; legacy fixture; legacy damage still caught; foreign gzip refused; text form. `save.verify.test.ts` unchanged and green.

## Item 2: "Queen under attack" for a flood

**What was wrong.** The sim raises `queen-in-danger` for three causes: a creature (title "Queen under attack" is right), rising water (flood module, tokens `attacker: 'rising water'`) and combat's own card (`damage`, `hostile-near`, title "The queen is in danger" with the raw cause id as the cause line, so the card read "hostile-near").

**What changed.** I did not change `ALERT_TEXT['queen-in-danger']` because `src/sim/nest/flood/founding.test.ts` reads that title and the spec keeps the sim's tests untouched. The wording follows the alert's tokens on the UI side: `content/text/index.ts` `alertText` (+ `QUEEN_DANGER_BY_CAUSE`, `QUEEN_DANGER_CALM_TITLE` in `alerts.ts`), and `game/uiBridge/hudSlices.ts` `alertsOf` rewords this kind from its tokens even when the sim supplied a title. Water and an enemy that is only close read "Queen in danger"; a creature or damage reads "Queen under attack"; the raw ids became "she has been hurt" / "an enemy is close to her". The journal line uses the same function.
* Test `src/game/uiBridge/queenAlertWording.test.ts` (4 tests). GDD 08 deviation row D-APP3-1 added to `docs/design/gdd/DEVIATIONS.md` (`tests/docs/docs-final.test.ts` green).
* Picture: `test-output/app-seams-3/alerts/queen-danger-cards.png` (looked at): three cards, "Queen in danger - rising water, royal chamber", "Queen under attack - wolf spider, royal chamber", "Queen in danger - an enemy is close to her". The feed shows three cards at a time, so the fourth (`damage`) is pinned by the unit test only. Script `tests/e2e/appSeams3-alerts.mjs` (cheat.raiseAlert through progression's publisher).

## Item 3: the backdrop cars

**Which worlds have them.** Cars are placed along edge runs of the `road` treatment, i.e. where the zone just inside the map edge is asphalt, at about 0.18 per metre (2 cars along a 12 m compact run, about 3 on a 16 m standard side), 1.2 to 2.2 m beyond the edge. I generated compact worlds for 6 archetypes x seeds 1 to 3 and listed the edge runs: road runs exist in `woodland-edge` seed 3, `car-park-verge` seeds 1 to 3, `field-margin` seeds 1 to 3 (7 of 18 worlds); none in `suburban-garden`, `playground-park`, `kitchen-door`.

**Pictures** (`car-park-verge`, seed 1, compact; script `tests/e2e/appSeams3-cars.mjs`; all in `test-output/app-seams-3/cars/`, all looked at):
* `meta-edge.png` and `meta-high.png` (observer camera raised above the edge, 2.5 m and 9 m up; I read "meta camera" as the raised, whole-map observer view): they read as cars. A body, a window band with pillars, four dark wheels, a dark skirt, in the four palette colours, haze tinting them.
* `ant-0..2.png` (ant height, 300 mm inside the edge, looking at where the cars stand): huge flat coloured blocks with sparse white speckle; at that scale only the body and the lower window band show. That is the intended "never shown whole from ant height" scale.
* `start-view-150.png` (the queen's own start, 7.7 m from the edge, camera 150 mm up): backdrop car silhouettes with window bands in haze, behind the in-map car props. This is what a player can actually see from where the game puts them.

**Decision: left as they are, no code change.** One thing I noted, not fixed: `BACKDROP_FUZZ` (hashed-alpha silhouette fuzz, 0.85) sprinkles white dots over large faces seen at an oblique angle at ant height (`ant-0.png`). It is the same material for trees, fence and facade, so changing it for cars alone needs a per-vertex attribute; not done.

## Item 4: `stage1a.mjs` strict at the egg beat

**What the code says.** Step 7 first asked `lay-egg` of a founding queen whose opening was still on the intro card. The game refuses it, correctly: `src/sim/colony/queen.ts` `canLay` needs the opening phase to be in `FOUNDING_LAY_PHASES`, and the refusal is reported as `budget` (see "Needs from others": the reason id is misleading). The script then plays the real opening from the dug shaft (`playOpeningToLay`: close card, dig, seal, lay) and only if that fails calls the stand-in. The stand-in message quoted the first, correct refusal, which is why the strict failure read as "lay-egg refused (lay-egg:budget)" whatever the real cause was. The cheat does not leave the queen in a state the game would not produce.

**What changed.** `tests/e2e/stage1a.mjs` step 7: the refusal outside the lay phase is now an asserted check (`result.egg.refusedOutsideLayPhase`), and the stand-in message reports the real opening's log, the phase at lay time and the refusals after it.

**Result.** I could not reproduce the failure: two full runs on seed 1 (`test-output/app-seams-3/stage1a-run1.log`, non-strict; `stage1a-strict.log`, `STAGE1A_STRICT=1`) both reached the lay phase and laid 6 eggs in the opening (`laidInOpening 6`), `standIns: []`, `ok: true`, no console errors. Both with `STAGE1A_SKIP_HIGH=1` (the slow high-quality part is skipped). After review the full strict gate was run once without it: `STAGE1A_STRICT=1`, seed 1, high part included, `test-output/app-seams-3/stage1a-strict-full.log`: `ok: true`, `errors: []`, `standIns: []`, `laidInOpening 6`, exit 0; the high-quality shots `08-high-surface.png` and `09-high-underground.png` in `test-output/app-seams-3/stage1a-strict-full/` were looked at (correct). Whatever made the integrator's strict run fail (a tree where the real opening did not reach `lay`) is now named in the message if it happens again.

## Item 5: epitaph cause, queen gloss

**5a, epitaph cause after `cheat.killAll`.** (As found at the time; the sim has since gained an optional cause, see Needs from others.) The cause is set in `src/sim`: `cheat.killAll` books every death as `unknown` (`src/sim/colony/index.ts` line 279, `killAnt(sim, a.id, 'unknown')`) and the epitaph reads `finalCauses[0] ?? 'unknown'`. The screen shows exactly what the sim recorded ("the last ant died of an unknown cause") and has no other source for a true cause, so there is nothing to fix on the UI side. `tests/e2e/lifecycle.mjs` already kills with a cause per ant (`cheat.kill`); it was not run in a browser here either.

**5b, the queen's gloss (corrected after review).** The first version of this change was dead: it edited `LASIUS_QUEEN.colors`, but in the game `AntRenderer` always passes the species appearance to `resolveMorph`, and `applyAppearance` (catalog.ts) then wrote the species `bodyColour` / `gasterColour` (`#1e1814` / `#1a1512`, `src/sim/species/data/lasius-niger.ts`) over head, mesosoma and gaster of every caste. So the in-game queen used her workers' colours, the before and after pictures were pixel-identical, and my earlier statement that her colours were darker than her workers' was wrong (it only held on the appearance-less demo path). The "modest visible lift" claim in that version was false.
* Fix (all in `src/render/ants/morph`): new optional `AntMorphology.ownColours` (types.ts); `applyAppearance` (catalog.ts) skips the species body and gaster colour for a morphology that sets it; `LASIUS_QUEEN` sets it (the gyne inherits it). Wing tint, waist, hairiness and the rest of the appearance still apply. Colours: mesosoma `#382a22`, gaster `#2e241e`, head `#30251f`, one warm step lighter than the workers' `#1e1814`. Species data in `src/sim` is untouched.
* Tests: the reviewer's `queenColours.verify.test.ts` (both green now) and `ownColours.test.ts` (queen and gyne keep their colours and differ from the worker with the game's appearance; other appearance fields still apply).
* Pictures: `test-output/app-seams-3/queen-fix-{test,medium,high}/` against the old `queen-before-*` (which equal the old game). Pixel difference is now non-zero at all three presets (queen region, max channel difference 18 / 46 / 33 in `01-default`, 24 / 68 / 56 in `02-side`). Enlarged side-by-side, before left, after right: `test-output/app-seams-3/queen-fix-zoom-side.png` (looked at): the thorax and gaster read as a slightly lighter, warmer brown-black with the tergite bands and the key-light gradient easier to see. It is a modest lift, not a transformation; from behind she remains a rim-lit dark disc (possession highlight rule).

## Needs from others (all unfixed)

* Resolved by the sim engineer since: `cheat.killAll` now takes an optional `cause`. Nothing in the app paths forwards it yet; `tests/e2e/lifecycle.mjs` kills per ant with `cheat.kill` and could pass `{cause}` to `killAll` instead (not run in a browser).
* `src/sim/ants/actions/defs/care.ts:47`: `lay-egg` returns `budget` when the founding queen is outside the opening's lay phase (`canLay` is false for the phase, not the budget). A reason such as `not-allowed-here` would be true; `stage1a.mjs` quotes it.
* `src/core/serialize.ts:286` `gzip()`: `fflate` stamps the wall clock into the gzip header (MTIME) in a module that is meant to be pure. I worked around it in `src/game/save/gzipFrame.ts` (the container zeroes it); `gzipSync(bytes, { level, mtime: 0 })` would fix it at the source, and then the legacy MTIME could also be checked for files written after that.

## Files

Changed: `src/game/save/container.ts`, `src/content/text/alerts.ts`, `src/content/text/index.ts`, `src/game/uiBridge/hudSlices.ts`, `src/render/ants/morph/lasius.ts`, `src/render/ants/morph/catalog.ts`, `src/render/ants/morph/types.ts`, `tests/e2e/stage1a.mjs`, `docs/design/gdd/DEVIATIONS.md`.
New: `src/render/ants/morph/ownColours.test.ts`, `src/game/save/gzipFrame.ts`, `src/game/save/container.frame.test.ts`, `src/game/save/fixtures/legacySave.fixture.ts`, `src/game/uiBridge/queenAlertWording.test.ts`, `tests/e2e/appSeams3-alerts.mjs`, `tests/e2e/appSeams3-cars.mjs`, `tests/e2e/appSeams3-queen.mjs`, `docs/design/tasks/progress/app-seams-3-impl.md`.

Pictures and logs: `test-output/app-seams-3/` (`alerts/`, `cars/`, `queen-*`, `stage1a-run1.log`, `stage1a-strict.log`, `stage1a/`, `stage1a-strict/`).
