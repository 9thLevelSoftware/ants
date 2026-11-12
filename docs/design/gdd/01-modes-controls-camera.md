# GDD 01 — Modes, possession, controls, camera and action primitives

Status: design chapter, binding for `src/game/**`, `src/input/**`, `src/render/camera/**`, `src/sim/ants/actions/**`, `src/sim/ants/player-control/**`.
Depends on: `01-design-seed.md` (sections 1-5), `02-design-directions.md` (A, C, D, F, I, J), `03-architecture.md`.
Research used: `research/genre-ux.md` (2.1, 2.5, 2.6, 2.7, 3), `research/bio-lasius-niger.md` (7, 12, 13), the third-person action tables of `bio-camponotus.md`, `bio-messor.md`, `bio-atta.md` (section 14), `research/tech-stack.md` (iframe and build gotchas).

## 0. Conventions used in this chapter

| Term | Meaning |
| --- | --- |
| **L** | Body length of the ant concerned, in BU (from `SpeciesDef`: Lasius worker 1.0, Lasius queen 2.0, Atta minim 0.35, Atta major 1.8, Atta queen 2.6, Camponotus major ~1.5). Camera distances and reach are given in L so one rule serves every caste. Atta "minim" is the J caste `minor` and "small media" is caste `media` with GDD 07 size class `small-media`; neither is a caste id. |
| **game s** | Game seconds (= real seconds at 1x). Action durations are in game s and scale with time speed. |
| **real s / ms** | Wall-clock time. Camera smoothing, input timings and UI timings are in real time and do not scale with speed. |
| **Tier** | T1 / T2 / T3 per seed section 5. A feature tagged T2 is specified now but built in wave 2; T1 code must leave its hook (enum member, empty handler). |
| **Context** | Input context: `G` global while playing, `P` Possession, `O` Observer, `C` Colony view, `Ph` Photo mode, `TL` time-lapse, `UI` menus/panels. |
| **f(p)** | The seed's signed free-space field (positive in free space). |

All balance constants named here live in `src/sim/balance/player.ts` (sim-side: action timings, speed multipliers) or `src/game/config/camera.ts` / `src/input/defaults.ts` (presentation-side). They are not magic numbers.

---

## 1. Application flow (T1 unless tagged)

### 1.1 Screens

| Screen id | Entry condition | Contents | Exits |
| --- | --- | --- | --- |
| `boot` | Page load | Capability checks: WebGL2 context, `OES_texture_float_linear` optional, IndexedDB open (try/catch), localStorage (try/catch), gamepad API present. Loads settings and bindings. No audio yet. | WebGL2 missing -> `unsupported`. Otherwise -> `title` (or `loading` directly if `?autostart=1`). |
| `unsupported` | No WebGL2 | Plain text: what is needed, no retry loop. | None (terminal). |
| `title` | Boot done; Quit to title; Epitaph "Title" | Title FOUNDRESS, subtitle. Buttons: Continue (only if an autosave exists), New game, Load, Lineage (T2; only if lineage non-empty), Settings, Codex (T3), Credits. Calm background: a slowly orbiting pre-baked locality vignette (static in `?test=1`). | Each button -> its screen. Continue -> `loading` (load path). |
| `new-game` | Title -> New game | Species (4; only `lasius-niger` enabled before T3), locality archetype, size (compact 3000 / standard 4000 / large 5000 BU), seed (text; Randomise button), starting season, difficulty `gentle`/`naturalist`/`harsh` + custom toggles (T3). Start, Back. | Start -> `loading`. Back -> `title`. |
| `load` | Title or pause menu | Autosave + 5 slots (date, species, colony day, workers, thumbnail), Import file, Paste text (fallback), Delete slot (confirm). | Pick slot -> `loading`. Back -> previous. |
| `lineage` (T2) | Title | Lineage tree; "Found as this daughter queen" on any unfounded daughter. | Found -> `new-game` prefilled (species locked, new seed). Back. |
| `settings` | Title or pause menu | Tabs: Graphics, Audio, Controls (section 5.6), Camera (section 6.8), Gameplay (prompts, auto-slow, pause-on-blur), Accessibility (T3). | Back -> previous screen. Changes apply live and persist. |
| `codex` (T2 shell, T3 breadth; GDD 08 §7.3) | Title / Journal | Field journal entries unlocked so far (shared across saves). | Back. |
| `loading` | New game / load / lineage found | Progress bar with phase names from worldgen (zone layout, heightfield, structures, props, plants, resources, rivals, cavities, validation) and attempt counter "attempt 2 of 8". Cancel button. | Success -> `playing`. Cancel -> previous screen. Generation failed `GEN_MAX_ATTEMPTS` times -> error panel "This seed would not produce a viable locality" with Try another seed / Back. Load failed (corrupt, version too new) -> error panel naming the cause, Back. |
| `playing` | Loading complete | The game (section 2). Pause menu overlay: Resume, Save, Load, Settings, Controls, Journal (T2), Quit to title (confirm if last save older than `QUIT_CONFIRM_UNSAVED_S`). | Quit -> `title`. Colony extinct -> `epitaph`. |
| `epitaph` | No living ant of the player colony (seed section 1) | T1: minimal card "The colony has died", colony age, peak population, cause line; buttons New game / Title. T2: full history graph, causes, lineage entries, "Found as a daughter queen". | Buttons as listed. |

Audio context is created on the first user gesture on any screen (click, key, gamepad button). If creation fails, the game runs silent and Settings shows "Audio unavailable in this page".

### 1.2 Flow constants

| Constant | Value | Unit | Notes |
| --- | --- | --- | --- |
| `GEN_MAX_ATTEMPTS` | 8 | attempts | Worldgen regeneration retries before the error panel (worldgen chapter may lower). |
| `QUIT_CONFIRM_UNSAVED_S` | 60 | real s | Since the last save of any kind. |
| `EPITAPH_DELAY_S` | 5 | real s | Between the last death and the epitaph; camera holds on the last body. |
| `LOAD_RESUME_SPEED` | 1 | x | Speed after any load; not paused unless `pauseOnLoad` setting (default off). |

### 1.3 Playing: view state machine

Exactly one view is active. Panels (journal, roster, why view, directives) are overlays on top of a view, not views.

| View id | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `possession` (T1) | A successful `possess` command | Player drives one ant (section 3); possession camera (6.2-6.5). | `release` -> `observer` (following the released ant). Ant dies -> `observer` after `POSSESS_DEATH_HOLD_S`. M -> `colony`. F2 -> `photo`. Time-lapse starts -> `timelapse`. AFK timeout -> `observer`. |
| `observer` (T1) | Game start after loading when no ant is possessed; release; death; Esc from colony view when there is no return ant | Free fly or follow camera; click to inspect; possess by click-hold, double-click, E, Tab, role keys. | Possess -> `possession`. M -> `colony`. F2 -> `photo`. Time-lapse -> `timelapse`. |
| `colony` (T1) | M from `possession` or `observer` | Strategic camera + underground cutaway (6.7); directives panel and marker tools (directives chapter); overlays. If entered from possession the ant is soft-released (3.6). | M or Esc -> back to the view it came from (`possession` re-possesses the return ant if alive, else `observer`). Double-click an ant -> `possession` of that ant. F2 -> `photo`. |
| `photo` (T2) | F2 (`photo-mode`) from any of the three views | Sim frozen; free camera; HUD hidden (6.9). | F2 or Esc -> the view it came from, same camera pose and possession. |
| `timelapse` (T2) | Opening chapter (first brood) or environment chapter (overwintering) starts a time-lapse | Scripted camera; input limited to skip (hold), pause, drop-out when offered; possession suspended. | Ends or skipped -> previous view; if it was `possession` and the ant lives, re-possess it. Drop-out -> `possession` of the ant named by the drop-out beat. |

Game start view: the opening chapter puts the player in `possession` of the founding queen. A loaded save resumes `possession` of the saved `possessedAntId` if that ant is alive, else `observer` at the saved camera pose.

---

## 2. The four play views — summary and handovers

| From \ To | possession | observer | colony | photo |
| --- | --- | --- | --- | --- |
| **possession** | Tab / role key / roster: switch ant (old ant released, 3.5); camera fly `CAM_SWITCH` | X: release; camera stays, becomes follow-orbit on the released ant | M: soft release; camera rises over `CAM_TO_COLONY_S` | F2: freeze; camera pose kept |
| **observer** | Click-hold / double-click / E / Tab / role key; camera fly | — | M: camera rises from current focus | F2 |
| **colony** | M/Esc back (return ant) or double-click ant; camera descends `CAM_TO_COLONY_S` | M/Esc when no return ant | — | F2 |
| **photo** | F2/Esc (back to origin) | F2/Esc | F2/Esc | — |

| Transition constant | Value | Unit |
| --- | --- | --- |
| `CAM_SWITCH_MIN_S` / `CAM_SWITCH_MAX_S` | 0.4 / 0.9 | real s; duration = clamp(0.4 + d/300, min, max) with d = camera travel in BU |
| `CAM_SWITCH_FADE_DIST` | 150 | BU; beyond this the transition is a dip-fade (0.15 s out, 0.15 s in) instead of a flight |
| `CAM_TO_COLONY_S` | 0.8 | real s |
| `CAM_STREAM_WAIT_MAX_S` | 1.5 | real s; a fade may hold dark until the render reports the target region ready, then proceeds anyway |

Reduced motion (T3): all camera transitions become cross-fades of 0.3 s.

**The queen as the doorway to colony orders (T1; brief §1-3, directions A).** Possessing the queen after hand-over (opening phase `done`, GDD 06 §5.13) adds a standing context line "I  Colony orders" (9.2) that opens the Directives drawer (GDD 08 §4.2) with the global `directives` action; selecting her in Observer or Colony view shows a "Colony orders" button on her inspect card (§10). Neither changes any state: opening Directives while possessing the queen keeps her possessed (the drawer does not pause and does not release), and `colony-view` (M) from queen possession is the normal soft release (3.6), so she continues under AI and M returns to her (GDD 08 §14). The queen is the entry point, not a requirement: `directives` (I) works in every view and with any ant possessed (pillar 3). During the opening (before hand-over) the line is not shown, because the founding queen has no workers to direct.

---

## 3. Possession rules

### 3.1 Who can be possessed

| Entity | Possessable | Notes |
| --- | --- | --- |
| Any living adult of the player colony: `worker`, `minor`, `media`, `major`, `queen`, `gyne`, `male`; nanitics; callows | Yes (T1 for Lasius castes; T2 alates; T3 other species) | Including ants inside rival nests, ants being carried (Atta hitchhiker, T3), ants in satellite nests. |
| Brood (`egg`, `larva`, `pupa`), corpses | No | Inspect only. |
| Rival-colony ants, creatures | No | Observer can follow and inspect them. |
| Any ant during `photo` or `timelapse` | No | Command rejected with reason `view`. |

The possessed ant always keeps its colony identity, age, physiology and mortality (one simulated ant is one ant; there are no per-agent weights, directions K). Possession changes control, never biology: hunger, ageing, damage and death apply unchanged.

### 3.2 Ways to possess

| Method | Context | Selection rule |
| --- | --- | --- |
| Click-hold `POSSESS_HOLD_MS` on an ant, or double-click it | O, C | Pick ray against ant bounding spheres inflated to at least `PICK_MIN_PX` screen radius; nearest hit along the ray. Repeated clicks on the same spot within 1 real s cycle through overlapping candidates. |
| E on the selected or hovered ant | O | Same pick as above. |
| Tab / Shift+Tab | P, O | Candidates: living colony ants within `TAB_RADIUS` of the current ant (P) or camera focus (O), excluding the current one, sorted by distance. The list is frozen while Tab is pressed again within `TAB_LIST_TTL_S`; afterwards rebuilt. Empty -> radius `TAB_RADIUS_WIDE`, then whole colony by distance. Each press possesses the next entry. |
| Role keys 5-8: a forager, a digger, a nurse, the queen | P, O, C | Candidates by current task: `forage`/`scout`; `dig`/`haul`; `nurse`/`queen-care`; caste `queen`. Sorted by distance to camera; repeated presses within `TAB_LIST_TTL_S` cycle. None: toast "No ant is foraging now" (etc.), no change. |
| Backspace | P, O | Re-possess the previously possessed ant if alive. |
| Roster panel "possess" button, alert jump-to (T2) | Any | Roster: that ant. Alert jump moves the Observer camera only. |
| Debug API `__game.possess(idOrRole)` | Any | Role strings: `queen`, `forager`, `digger`, `nurse`, or numeric id. |

### 3.3 Effect of possession (sim side)

| Step | Rule |
| --- | --- |
| 1 | `possess {antId}` is queued; applied at the next tick start. Rejected (event `possess-rejected`, reason `dead`, `not-colony`, `view`, `unknown`) without side effects. |
| 2 | If another ant is possessed it is released first (3.5) in the same tick. |
| 3 | The ant's current AI action: interruptible actions are cancelled cleanly (the carried item stays carried); non-interruptible ones (`lay-egg`, an in-progress `put-down`) finish, then control starts. |
| 4 | `ant.controlled = true`; `ant.suspendedTask` = its task at that moment. Task allocation never reassigns a controlled ant. Statistics count it under its current task label with a "player" flag; diagnostics show "1 ant under your control". |
| 5 | Breadcrumb route memory and home-range footprints keep recording exactly as for AI ants, so a possessed forager that finds food can recruit after release. |
| 6 | Time speed rule (section 8) is applied. Event `possession-started`. |

### 3.4 While possessed

- The sim reads `PlayerIntent` (Appendix A) each tick; movement is executed by the same surface walker as AI ants, and actions are the same primitives (section 7).
- The game layer predicts the possessed ant's pose every rendered frame with the same pure walker function and the current intent, then reconciles to the authoritative tick pose: positional error blended out over 0.1 real s; error > 1 BU snaps. The sim itself stays fixed-tick and deterministic; intent changes are logged with their tick for replay.
- Player comfort exceptions (the only differences from AI): movement and action speed use `max(PLAYER_TEMP_FLOOR, tempFactor)` instead of `tempFactor` while `tempFactor > 0`; and the player may hurry (section 4.2).
- **AFK release** (setting, default on): no input for `POSSESS_AFK_S` while the sim is running -> release to autonomy, view `observer` following the ant. Paused time never counts.

**Deviation (speed).** The seed gives "~12 BU/s walk"; the Lasius dossier measures 23.5-26 mm/s = ~6 BU/s cruise. Cruise is the species value (Lasius 6 BU/s at 22-28 °C); the seed's 12 BU/s is read as the upper end of the alarm/sprint band (dossier: 10-12 BU/s). The player's hurry gives 9.6 BU/s (6 × `PLAYER_HURRY_MULT`), and AI alarm running may reach 12 BU/s (locomotion chapter). Gameplay intent (a responsive ant) is kept by the hurry input.

### 3.5 Release and resumption of autonomy

On any release of a living ant (X, switching to another ant, AFK, colony view, time-lapse) the ant gets `controlled = false`, trail laying is switched off, and a task is inferred from its situation the same tick. Rules are evaluated top to bottom; the first match wins.

| # | Situation | Resumed task / behaviour |
| --- | --- | --- |
| 1 | In a hold-lock, or damaged in the last `RESUME_COMBAT_WINDOW_S` | `fight` or `flee` by the combat chapter's threshold; keeps any current bite-hold. |
| 2 | Falling or airborne | Finish the physical state (land), then re-run this table. Alates in a flight continue flight AI. |
| 3 | Caste `queen` | Founding phase: continue the founding script (opening chapter). Established: return to the royal chamber (or the `move-queen` marker target), task `rest` (laying handled by the queen system). |
| 4 | Caste `gyne` / `male` not in flight | Return into the nest, `rest`. |
| 5 | Carrying brood | `nurse`: deliver to the brood chamber the colony chapter selects for that stage. |
| 6 | Carrying a solid food item | `forage` (return leg): deliver to food store / larvae. The source it came from is registered in its route memory as a discovered source. |
| 7 | Outside the nest with crop ≥ GDD 02 `CROP_RETURN_FRACTION` (0.8) of capacity, or with crop ≥ 0.1 load and no source with food left within 5 BU (the same exit rule as GDD 02 `forage.collect`) | `forage` (return leg), then distributes by trophallaxis. Inside: `store`. A partly filled forager next to a source with food left falls to rule 14 and keeps drinking, as the AI would. |
| 8 | Carrying a soil pellet | `haul` to the mound of the nearest open entrance. In a sealed founding cell: put it into the plug (seal) instead. |
| 9 | Carrying corpse, waste, chaff, frass | `haul` to the midden (Camponotus: nearest window, `eject-frass`). |
| 10 | Carrying an aphid (T2) | `tend`: place on the nearest host plant within `RESUME_APHID_RADIUS`; else put down. |
| 11 | Carrying seed / leaf fragment / garden material (T3) | `forage` return to granary / `forage` return to fungus chamber / `garden`. |
| 12 | Carrying anything else | `put-down` where it stands, then continue. |
| 13 | Within 3 BU of the frontier of an active dig plan | `dig` on that plan. |
| 14 | Within 5 BU of a food source with food left | `forage` (harvest it). Among aphids: `tend`. |
| 15 | `suspendedTask` still wanted by allocation | Resume `suspendedTask`. |
| 16 | Otherwise | Allocation chooses, with a locality bonus `RESUME_LOCALITY_BONUS` for tasks whose work site is within 20 BU. |

In-progress player actions on release: `dig-bite` finishes its current bite; `bite` hold is kept only if rule 1 applies; `drag` continues toward the nest under AI; `harvest-liquid` continues until full if rule 14 applies; any other running action is cancelled cleanly.

### 3.6 Soft release (colony view, time-lapse)

Entering `colony` or `timelapse` from `possession` performs a normal release (3.5) and stores `returnAntId`. Leaving restores possession of `returnAntId` if alive and still in the colony; otherwise the view becomes `observer` at the ant's last position. Possession speed rule applies on return.

### 3.7 Death and loss while possessed

| Case | Result |
| --- | --- |
| Possessed ant dies (any cause) | Event `possessed-ant-died {antId, cause}`. Input ignored. Camera holds on the body `POSSESS_DEATH_HOLD_S`, then `observer` follow-orbit on the corpse; prompt "Tab: take another ant". Setting `autoRepossessOnDeath` (default off): possess nearest nestmate after the hold. The corpse becomes an item. |
| It was the queen | Additionally the orphan alert (colony chapter). |
| It was the colony's last ant | Hold `EPITAPH_DELAY_S`, then `epitaph`. |
| Ant despawned without death (e.g., carried off map by a bird event, flown off-map as an alate, T2) | Treated as death for control purposes with cause `lost`/`dispersed`. |
| Ant removed by load/undo | Not applicable: loads re-evaluate possession (1.3). |

### 3.8 Possession constants

| Constant | Value | Unit |
| --- | --- | --- |
| `POSSESS_HOLD_MS` | 400 | real ms |
| `PICK_MIN_PX` | 12 | px (radius) |
| `TAB_RADIUS` / `TAB_RADIUS_WIDE` | 40 / 160 | BU |
| `TAB_LIST_TTL_S` | 2 | real s |
| `POSSESS_AFK_S` | 120 | real s of running sim without input |
| `POSSESS_DEATH_HOLD_S` | 3 | real s |
| `RESUME_COMBAT_WINDOW_S` | 3 | game s |
| `RESUME_APHID_RADIUS` | 100 | BU |
| `RESUME_LOCALITY_BONUS` | 0.25 | added to the allocation stimulus score (allocation chapter's scale 0-1) |
| `PLAYER_TEMP_FLOOR` | gentle 0.6 / naturalist 0.5 / harsh 0.3 | multiplier floor |

---

## 4. Moving the possessed ant (T1)

### 4.1 Camera-relative mapping and edge latch

Given stick/key vector m = (mx, my), |m| ≤ 1, camera forward c, ant up n (authoritative surface normal):

1. `fc = normalize(c − (c·n) n)`; if `|c·n| > 0.95` use the camera up vector projected the same way instead of c.
2. `rc = fc × n` (right-handed, Y-up: forward × up = right).
3. Desired direction `d = normalize(my·fc + mx·rc)`, magnitude `|m|` (dead zone 0.15 for sticks; keys give 1).

**Edge latch.** When the ant's up rotates more than `LATCH_TRIGGER_DEG` within `LATCH_TRIGGER_S` (crossing an edge, a crack lip, a stem), the desired direction is frozen in the ant's own frame (angle relative to its forward). The latch holds until any of: input magnitude < 0.2 for 0.1 real s; input direction changes by > `LATCH_BREAK_DEG`; the player orbits the camera; or `LATCH_MAX_S` elapsed and the camera up is within 10° of the ant up. Effect: holding W across a 90° edge keeps the ant walking straight over it, never reversing.

**Ant-relative style** (setting `controlStyle = 'ant'`): W forward, S backward (only when dragging; otherwise S = turn around), A/D turn at `TURN_RATE_ANT_STYLE`; camera orbit does not affect movement.

### 4.2 Locomotion parameters (player-specific)

| Constant | Value | Unit | Rule |
| --- | --- | --- | --- |
| Walk speed | species cruise × `tempFactor'` × health × load factor | BU/s | Lasius cruise 6 BU/s; `tempFactor' = max(PLAYER_TEMP_FLOOR, tempFactor)` while tempFactor > 0. |
| `PLAYER_HURRY_MULT` | 1.6 | × | Hold/toggle Shift. Lasius worker 9.6 BU/s; never above the caste's `sprintBuS` (GDD 07; Lasius 12 = alarm running, K). C burn while hurrying ×2 (economy chapter's active rate). |
| `LOAD_SPEED_MULT` | 0.85 | × | When carrying a solo item (species data may override). |
| `TURN_RATE` | 300 | °/s | Turning toward d. |
| `PIVOT_ANGLE` | 135 | ° | If the angle to d exceeds this, the ant turns on the spot until < 60°. |
| `TURN_RATE_ANT_STYLE` | 180 | °/s | |
| `GRIP_SPEED_MULT` | 0.4 | × | While grip held (4.3). |
| `STUCK_RESCUE_S` | 3 | game s | Input held, displacement < 0.1 BU, and `f(p) < 0` at the ant (inside solid): locomotion relocates to the nearest free surface point; event `ant-unstuck`. |

At `tempFactor = 0` (too cold or too hot for the species) the possessed ant crawls at 0.25 × cruise and the HUD shows "Too cold to move well" / "Overheating" (heat damage itself is the environment chapter's).

### 4.3 Grip and let-go

- **Grip** (hold Space ≥ `HOLD_THRESHOLD_MS`, or toggle): the ant clamps tarsal claws. Immune to dislodgement (rain drops, wind gusts, being shaken off a stem, footsteps tremor) at `GRIP_SPEED_MULT`.
- **Let-go** (tap Space on a surface whose normal·worldUp < `FLOOR_NORMAL_MIN`): primitive `let-go`; the ant falls ballistically (locomotion chapter) and re-attaches on contact. On a floor-like surface the same tap is `drop` (release the carried item) if carrying, otherwise nothing.

### 4.4 Flight (alates, T2)

Applies after `fly` (7.3). Steering follows the camera direction (the alate turns toward camera forward at 120 °/s); W = flap (thrust), S = brake/hover, A/D = bank, Space hold = climb, Shift hold = descend; E "Land" when a surface is within 6 L ahead. Flight energy, speed and the dispersal edge belong to GDD 06 §11.6 (ascend 40 BU/s, forward 80 BU/s, `flightEnergy` 1/90 per s).

---

## 5. Default control scheme

Bindings use `KeyboardEvent.code` (physical key), displayed through `navigator.keyboard.getLayoutMap()` when available, else the US label. Every action is rebindable except `menu` (Esc / Start). "tap/hold" means one physical input carries two actions split by a threshold; the tap fires on release, the hold fires when the threshold is crossed. All keys named in directions A are kept; this chapter only adds bindings.

| Input constant | Value | Unit | Used by |
| --- | --- | --- | --- |
| `HOLD_THRESHOLD_MS` | 250 | real ms | `foot` (grip), `possess-prev` LB tap, default for tap/hold |
| `INTERACT_HOLD_MS` | 400 | real ms | `interact` secondary, `inspect` sniff |
| `SPECIAL_ALARM_HOLD_MS` | 500 | real ms | `special` -> `release-alarm` |
| `CLICK_SLOP_PX` / `CLICK_MAX_MS` | 6 / 300 | px / real ms | RMB click vs drag |
| `STICK_DEADZONE` / `TRIGGER_THRESHOLD` | 0.15 / 0.30 | — | gamepad |
| `DEVICE_SWITCH_HYST_S` | 0.5 | real s | prompt glyph switching |
| `OBS_FAST_MULT` | 4 | × | observer fast fly |

### 5.1 Global (in `playing`, every view unless the context column narrows it)

| Action id | Description | KBM default | Gamepad (standard mapping) | Context | Type | Tier |
| --- | --- | --- | --- | --- | --- | --- |
| `menu` | Pause menu (pauses) / back | Esc | Start (9) | G | press | T1 |
| `pause-toggle` | Pause / resume | P, Pause | LB+Dpad up | G | press | T1 |
| `speed-1` / `speed-2` / `speed-4` / `speed-8` | Set speed 1x/2x/4x/8x | 1 / 2 / 3 / 4 | — | G | press | T1 |
| `speed-up` / `speed-down` | Step speed | = / − | LB+Dpad right / LB+Dpad left | G | press | T1 |
| `hide-hud` | Hide/show HUD | H | LB+Dpad down | G | toggle | T1 |
| `quick-save` / `quick-load` | Quick save / load (confirm on load) | F5 / F9 | — (menu) | G | press | T1 |
| `colony-view` | Enter/leave colony view | M | View (8) hold 500 ms | P, O, C | toggle | T1 |
| `scent-view` | Scent overlay | V | Dpad left (P), Dpad up (O) | P, O, C | toggle | T2 |
| `photo-mode` | Enter/leave photo mode | F2 | LS+RS click together | P, O, C, Ph | toggle | T2 |
| `overlay-cycle` | Cycle overlays (temperature → moisture → threats → dig plans → off; GDD 08 §10) | O | — | P, O, C | press | T2 |
| `directives` | Directives drawer (GDD 08 §4.2) | I | — (menu) | G | toggle | T1 |
| `nest-overview` | Nest overview drawer (GDD 08 §4.6) | U | — (menu) | G | toggle | T1 |
| `codex` | Codex book (GDD 08 §7.3) | K | — (menu) | G | toggle | T2 |
| `journal` | Journal panel | J | — (menu) | G | toggle | T2 |
| `why-view` | Colony health "why" panel | Y | — (menu) | G | toggle | T2 |
| `roster` | Roster panel | L | — (menu) | G | toggle | T1 |
| `controls-reminder` | Show all controls for the current context | ? (Shift+Slash) | Start hold 1 s | G | press | T1 |
| `alert-jump` | Move observer camera to newest alert | Enter | LB+RB | G | press | T2 |
| `skip-ahead` | Run until next notable event (8) | N | LB+LS click | O, C | press | T2 |
| `pointer-lock-toggle` | Switch mouse look Drag/Locked | F8 | — | P, O, Ph | toggle | T1 |
| `possess-next` / `possess-prev` | Cycle nearby ants | Tab / Shift+Tab | RB / LB tap | P, O | press | T1 |
| `possess-last` | Back to previous ant | Backspace | — | P, O | press | T1 |
| `possess-forager` / `-digger` / `-nurse` / `-queen` | Role quick keys | 5 / 6 / 7 / 8 | LB+X / LB+A / LB+B / LB+Y | P, O, C | press | T1 |

### 5.2 Possession

| Action id | Description | KBM default | Gamepad | Type | Tier |
| --- | --- | --- | --- | --- | --- |
| `move` | Camera-relative walk | W A S D | Left stick | axis | T1 |
| `hurry` | Hurry | Shift | LS click | hold (toggle option) | T1 |
| `orbit` | Orbit camera | RMB drag or MMB drag (Drag mode); mouse move (Locked mode); Arrow keys | Right stick | axis | T1 |
| `zoom` | Camera distance | Wheel; [ and ] | LB + RS vertical | axis | T1 |
| `recentre` | Camera behind the ant | Z; MMB click | RS click | press | T1 |
| `interact` | Context primary (tap) / secondary (hold ≥ 400 ms) | E | A | tap/hold | T1 |
| `cycle-target` | Next candidate target | B | Dpad right | press | T1 |
| `dig` | Dig-bite / cut / chew / tear, repeating while held | F | X | hold | T1 |
| `inspect` | Tap: inspect target; hold ≥ 400 ms: antennal sweep (sniff) | T | Y | tap/hold | T1 |
| `bite` | Tap: bite; hold: bite and hold | LMB; Q | RT | tap/hold | T2 |
| `special` | Tap: species special (spray / sting / stridulate); hold ≥ 500 ms: release alarm | RMB click (< 6 px, < 300 ms); C | LT | tap/hold | T2 |
| `trail-toggle` | Lay trail on/off | R | Dpad up | toggle | T1 |
| `share-food` | Trophallaxis offer / beg | G | Dpad down | press | T1 |
| `foot` | Tap: let go (wall/ceiling) or drop item (floor); hold: grip | Space | B | tap/hold | T1 |
| `release` | Release to observer | X | View tap | press | T1 |
| Flight set (T2) | Flap / brake / bank / climb / descend / land | W / S / A,D / Space / Shift / E | RT / LT / LS x / A hold / B hold / X | — | T2 |

Queen only (after hand-over): the global `directives` action (I, 5.1) is shown as the context line "I  Colony orders" and the possessed-ant panel reads "Colony orders (I)" (GDD 08 §5.2); pressing it opens Directives without releasing her (§2).

### 5.3 Observer

| Action id | KBM default | Gamepad | Type | Tier |
| --- | --- | --- | --- | --- |
| `obs-move` (horizontal fly, camera-relative) | W A S D | Left stick | axis | T1 |
| `obs-up` / `obs-down` | Space / C | RT / LT | hold | T1 |
| `obs-fast` | Shift (×`OBS_FAST_MULT`) | LS click | hold | T1 |
| `obs-look` | RMB drag (Drag), mouse (Locked), Arrow keys | Right stick | axis | T1 |
| `obs-pan` | MMB drag | — | axis | T1 |
| `obs-zoom` (follow distance / dolly) | Wheel, [ ] | LB + RS vertical | axis | T1 |
| `select` (inspect card) | LMB click | A (reticle target) | press | T1 |
| `possess-target` | LMB hold 400 ms, double-click, E | X | press | T1 |
| `follow-toggle` | F | Y | toggle | T1 |
| `deselect` | RMB click, Esc (if something selected) | B | press | T1 |

### 5.4 Colony view

| Action id | KBM default | Gamepad | Type | Tier |
| --- | --- | --- | --- | --- |
| `cv-pan` | W A S D, MMB drag | Left stick | axis | T1 |
| `cv-rotate` | Q / E (yaw 90 °/s), RMB drag (yaw + tilt) | Right stick | axis | T1 |
| `cv-zoom` | Wheel | RT in / LT out | axis | T1 |
| `cv-slice-up` / `cv-slice-down` | R / F, Shift+Wheel | Dpad up / Dpad down | press (repeat 8/s held) | T1 |
| `cv-cutaway-mode` | G (Off → Slice → X-ray) | Y | press | T1 |
| `cv-confirm` (select, place) | LMB | A | press | T1 |
| `cv-cancel` (cancel tool / deselect) | RMB click, Esc | B | press | T1 |
| `cv-delete` (selected marker) | Delete | X | press | T1 |
| Exit | M, Esc (with no active tool) | View hold / B | press | T1 |

### 5.5 Photo mode (T2), time-lapse (T2), menus (T1)

| Context | Action id: KBM / Gamepad |
| --- | --- |
| Ph | `ph-move` WASD / LS; `ph-up` Space / RT; `ph-down` C / LT; `ph-look` RMB drag or mouse (Locked), arrows / RS; `ph-focal` Wheel / LB+RS vertical; `ph-focus` LMB click on a point (autofocus there), Shift+Wheel / A (focus at centre); `ph-aperture` [ ] / Dpad up/down; `ph-exposure` − = / LB+Dpad up/down; `ph-roll` , . / Dpad left/right; `ph-guides` H / Y; `ph-capture` Enter / X; exit F2 or Esc / B (O is `overlay-cycle` in P/O/C and unbound in Ph). |
| TL | `tl-skip` hold Space 1 s, or Skip button / hold A 1 s; `tl-dropout` E / X (only while offered); `menu` Esc / Start. |
| UI | Arrows/Tab navigate, Enter/Space confirm, Esc back / Dpad or LS navigate, A confirm, B back, LB/RB switch tabs. Mouse works everywhere. |

### 5.6 Operating without pointer lock (T1, default)

| Rule | Detail |
| --- | --- |
| Default mouse look | `mouseLook = 'drag'`. RMB drag or MMB drag orbits; LMB never orbits in Possession (it bites). |
| Click vs drag | An RMB press that moves < `CLICK_SLOP_PX` (6 px) and is released within `CLICK_MAX_MS` (300 ms) is a click (`special` in P, `deselect` in O); otherwise it is an orbit drag and no click fires. |
| Context menu | `contextmenu` is prevented on the canvas only (never on DOM panels). |
| Touchpads | Setting `leftButton = 'bite' \| 'orbit'`: with `orbit`, LMB drag orbits and bite is Q only. Two-finger scroll zooms; `WheelEvent.deltaMode` lines/pages are converted to pixels (×16 / ×400). |
| Keyboard only | Arrow keys orbit (yaw 120 °/s, pitch 90 °/s), [ ] zoom, Z recentre. The whole game is playable without a mouse. |
| Locked mode | `mouseLook = 'locked'`: a click on the canvas requests pointer lock (needs the gesture). Sensitivity `ORBIT_SENS_LOCKED`. In lock, LMB = bite, RMB = special immediately (no click-slop delay). |
| Lock lost unexpectedly (browser Esc) | Do not open the menu on that Esc; fall back to drag behaviour until the next canvas click; toast once "Click to resume mouse look". A second Esc opens the menu. |
| Lock refused (`pointerlockerror`, sandboxed iframe without `allow-pointer-lock`, user denial) | Effective mode becomes `drag` for this session; toast once "Mouse look is not available here; drag with the right button to look." No retry for 5 real s; the stored preference is unchanged. |

### 5.7 Rebinding rules (T1 keyboard/mouse, T3 gamepad)

| Rule | Detail |
| --- | --- |
| Slots | Up to 2 KBM bindings + 1 gamepad binding per action. |
| Contexts | A binding conflicts only with actions whose contexts overlap (`G` overlaps all; P, O, C, Ph, TL are mutually exclusive). Same key in P and C is allowed (e.g., F). In `Ph` only `menu`, `photo-mode` and `pointer-lock-toggle` of the `G` actions are live (the sim is frozen and the HUD hidden), so `ph-guides` H, `ph-exposure` − = and `ph-capture` Enter do not collide with `hide-hud`, `speed-up`/`speed-down` and `alert-jump`. |
| Conflict dialog | "F is already used for Dig (Possession)." Options: Swap (the other action gets the old key of this one), Unbind other, Cancel. Never silent. |
| Reserved / refused | Esc (menu); browser-owned: Ctrl/Cmd+W, T, N, Q, Tab; F11, F12, Alt+F4, Meta combinations. Ctrl and Alt are not offered as modifiers at all (Ctrl+W closes the tab when W is held). |
| Modifiers | Only Shift as a modifier, plus modifier-only bindings for hold actions (Shift = hurry). |
| Hold/toggle | Per-action setting for `hurry`, `foot` grip, `dig`, `bite` hold, `inspect` sniff. |
| Storage | localStorage `foundress.bindings.v1` (try/catch; in-memory fallback, warning in Settings). Reset per context and Reset all. |
| Unbound actions | Allowed except `move`, `interact`, `release`, `menu`; Settings marks unbound actions in red and refuses to close with a required action unbound. |
| Prompt glyphs | Always show the current binding of the last-used device (5.8). |

### 5.8 Input edge cases

| Situation | Handling |
| --- | --- |
| Window blur / `visibilitychange` hidden | Synthesise release for every held input (keys, buttons, sticks to zero); actions in hold mode stop. If `pauseOnBlur` (default on) and the sim runs: pause, flag `autoPaused`. On return the game stays paused, showing "Paused — press P to resume"; P / Start / clicking Resume resumes. The sim never catches up time spent hidden. |
| Text field focused (seed entry, slot name) | All game bindings suspended until blur; Esc blurs the field first. |
| F5 (quick save) | `preventDefault` on keydown so the page does not reload; if the browser still unloads, a `beforeunload` confirmation is requested when the last save is older than 30 real s (may be ignored by the browser). |
| Tab key | `preventDefault` while the canvas has focus; inside DOM panels Tab moves focus normally. |
| Gamepad connected | Toast "Controller connected". Becomes the active device on its first input above dead zone; prompts switch glyph set. Chrome exposes pads only after a button press: no prompt is shown before that. |
| Several gamepads | The first pad to produce input is the player pad; others are ignored until it disconnects. |
| Gamepad disconnected | If it was the last-used device and the sim runs: pause (`autoPaused`), toast "Controller disconnected". Keyboard/mouse remain live. |
| Non-standard mapping (`mapping !== 'standard'`) | Use raw indices as if standard; toast once "Unrecognised controller layout; check bindings in Settings". |
| Stick drift | Radial dead zone `STICK_DEADZONE` 0.15; trigger digital threshold 0.30. |
| Last-used device switching | The device that produced the latest input above dead zone owns glyphs; switching has a 0.5 real s hysteresis to avoid flicker. |
| Key auto-repeat | Ignored for press/toggle actions (`event.repeat`). |
| Speed refused (8x while possessing) | Speed unchanged; toast "8× is available when you are not controlling an ant"; event `speed-refused`. |
| Focus inside sandboxed iframe | No special casing beyond the above; downloads and clipboard may be refused (photo mode 6.9 handles it). |

---

## 6. Camera specification

### 6.1 Common rules

| Rule | Value |
| --- | --- |
| Projection | Perspective. Near = clamp(0.02 × distance, 0.005 BU, 0.2 BU); far = 8000 BU. Requires a depth strategy that survives this ratio (render chapter: logarithmic or reversed depth). |
| Collision field | All cameras sphere-trace `f(p)` with radius `CAM_RADIUS = clamp(0.25 L, 0.1, 0.5)` BU (observer: 0.3 BU). A camera centre must satisfy `f ≥ CAM_RADIUS × 0.5` on every rendered frame. |
| Visual-only vegetation | Grass blades and other visual-only decor within 2 BU of the camera, or inside the camera-to-ant capsule, fade/part (render chapter). Never collide. |
| Shake | Only footstep tremor (amplitude 0.05 L, 0.4 real s); none in reduced motion. |
| Exposure | Surface↔underground exposure adaptation 1.0 real s (render chapter owns values). |

### 6.2 Possession camera: rig

The rig orbits a pivot in the ant's local frame.

| Quantity | Definition |
| --- | --- |
| Camera up `u` | Slerps toward the ant's up `n` with time constant `CAM_UP_TAU`. World-up lock (T3 option): `u` = world +Y. |
| Orbit frame | Yaw is stored relative to a tangent reference vector that is parallel-transported with `u` each frame (rotation old u -> new u). Pitch is the elevation above the tangent plane. |
| Pivot | ant position + `u × CAM_PIVOT_UP_L × L` + look-ahead. |
| Look-ahead | ant forward × min(speed × `CAM_LOOKAHEAD_T`, `CAM_LOOKAHEAD_MAX_L` × L); in tunnel state, along the ant's velocity; clamped by a sphere trace from the ant. |
| Desired position | pivot − (orbit direction × distance). |
| Collision | Sphere trace pivot -> desired. Hit at t: place at t − CAM_RADIUS. Pull-in is immediate; push-out eases with `CAM_PUSHOUT_TAU`. |
| Auto-follow | After `CAM_AUTOFOLLOW_DELAY_S` without manual orbit, while ant speed > 0.5 BU/s and ant turn rate < 90 °/s, yaw decays toward "behind the heading" with `CAM_AUTOFOLLOW_TAU`, capped at 60 °/s. Never during manual orbit. Setting: off / gentle (default) / strong (tau 0.6 s). |
| Recentre | Yaw to behind-heading, pitch to state default, over 0.3 real s. |

### 6.3 Possession camera: environment states

State is evaluated every frame from 8 lateral rays in the ant's tangent plane (length 4 L) and the underground test `fSubstrate(p_ant) < 0`. A state must persist `CAM_STATE_HOLD_S` before switching; parameters blend over `CAM_STATE_BLEND_S`.

| State | Entry condition | Framing | Distance (default / min / max) | Pitch default / range | FOV (vertical) | Exit |
| --- | --- | --- | --- | --- | --- | --- |
| `open` | Not underground and < 5 of 8 rays hit within 1.6 L | Orbit | 5 L / 1.5 L / 18 L (absolute cap 60 BU) | 20° / −5°..80° | 60° | Other condition holds |
| `chamber` | Underground and < 5 of 8 rays hit within 1.6 L | Orbit, looking down into the space | 4 L / 1.5 L / 8 L | 35° / 0°..80° | 65° | |
| `tunnel` | ≥ 5 of 8 rays hit within 1.6 L (surface cracks count) | Path boom (6.4) | 2.5 L / 1.5 L / 4 L | boom + offset | 72° | |
| `crevice` | ≥ 7 of 8 rays hit within 0.7 L | Path boom, close | 1.2 L fixed | boom | 80° | |
| `falling` | Ant airborne after let-go | Chase behind velocity; up eases to world +Y (tau 0.25 s) | 5 L | 15° | 60° | Re-attachment |
| `flight` (T2) | Alate flying | Chase behind velocity, up = world +Y, bank roll ≤ 20° | 6 L / 3 L / 15 L | 10° | 70° | Landing |

The player's zoom is remembered per state. FOV setting `fovOffset` (−10°..+20°) is added to every state. Reduced motion (T3): FOV differences limited to ±6°, blend 1.5 s.

### 6.4 Tunnel behaviour (path boom)

| Rule | Detail |
| --- | --- |
| Breadcrumb | Render-side ring buffer of the possessed ant's positions and ups, sampled every 0.1 L of travel, 64 entries. |
| Boom | Camera at arc length `distance` back along the polyline, raised 0.35 L along the stored up at that point, then sphere-traced from the pivot for safety. The path is known free space, so the camera follows bends without clipping. |
| Reversal | If the boom point is ahead of the ant (forward·(boom − ant) > 0.3 L) for 0.5 real s, rebuild the buffer by tracing backward along −forward. |
| Player look | Orbit input adds yaw ±70° and pitch ±35° around the boom direction; springs back with tau 0.8 s after 1.0 real s of no orbit input. |
| Look-ahead | 3 BU along the velocity, sphere-traced. |
| Chamber exit | On entering `chamber` from `tunnel`, distance eases out from the boom distance to the chamber default over the blend; the orbit starts at the boom's yaw so there is no swing. |

### 6.5 Fade and visibility rules

| # | Rule |
| --- | --- |
| 1 | Possessed ant opacity: 1 when camera–thorax distance ≥ 1.0 L; linear to 0.3 at 0.5 L. Carried item fades with the ant. |
| 2 | Other ants and creatures inside the camera-to-ant capsule (radius 0.6 L): dithered to 40 %. |
| 3 | Occlusion cutaway: 3 rays camera -> head, thorax, gaster. If ≥ 2 are blocked for 0.15 real s, terrain/carve/primitive fragments inside a capsule of radius 0.8 L along the camera-to-ant segment are dithered to 25 % (no hard cut). Ends 0.3 s after visibility returns. |
| 4 | `crevice` state always enables rule 3 and sets rule 1 to 0.5. |
| 5 | The prompt, the target highlight and the HUD never fade. |

### 6.6 Observer camera (T1)

| Item | Free fly | Follow |
| --- | --- | --- |
| Frame | World up | Orbit around the followed entity, world up (option: entity frame) |
| Speed | `v = 4 + 1.2 h` BU/s (h = height above surface in BU), Shift ×`OBS_FAST_MULT` 4, cap 800 BU/s; acceleration tau 0.15 s | Entity motion; orbit 120 °/s keys |
| Distance | — | 2 L .. 80 L, default 6 L |
| Limits | Horizontal [−50, worldSize + 50] BU; altitude ≤ 1200 BU above terrain; collides with `f` (can fly into open cavities and cracks, never through solid) | Same collision as 6.2 |
| Pitch | −89°..89° | −10°..85° |
| FOV | 60° (+ `fovOffset`) | 60° |
| Picking | Click selects ant, creature, food source, item, chamber (when underground), entrance | Same |
| Follow target loss | Followed entity removed: hold 2 real s at last position, then free fly | |

**Ambient watch (T3, optional; seed pillar 6, brief §5).** An unattended observation mode for quiet periods, started from the pause menu row "Watch the colony" (GDD 08 §3.5) or in Observer with the rebindable action `obs-ambient` (no default key). It hides the HUD as H does (GDD 08 §3.4: only `critical` alerts show), enters Observer follow and picks a target among living colony ants doing `forage`/`scout`, `dig`/`haul` or `nurse`, rotating through the three groups and preferring ants in view of something happening (carrying, recruiting, tending brood). It retargets every `AMBIENT_RETARGET_REAL_S` 20-40 real s (uniform, drawn on the UI side, never from a sim stream) with the normal `CAM_SWITCH` transition (a cross-fade in reduced motion), and immediately when the target dies, enters a nest the camera cannot follow, or no longer does a watched task. Follow distance 4-10 L, slow orbit 6 °/s, depth of field on the target. Speed is not changed (the player may leave 2x or 4x on). Any key, click, stick or wheel input exits to plain Observer at the current pose; a `critical` alert also exits (and auto-slow applies). Nothing is possessed and no sim state changes; the mode is a camera and HUD state of the game layer.

### 6.7 Colony view camera and cutaway (T1)

| Item | Value |
| --- | --- |
| Rig | Target point on the terrain; yaw free; pitch 30°..89° (default 55°); distance 30..1500 BU (default 200); FOV 45°. Pan speed 0.8 × distance per real s; target clamped to [0, worldSize]. |
| Entry pose | Target = possessed ant / observer focus projected to the surface; distance 120 BU. |
| Cutaway `off` | Surface only. |
| Cutaway `slice` (default when the focus is underground) | Horizontal plane at depth `y_cut`, from 0 down to (deepest nest voxel − 10 BU), step 2 BU (×5 with Shift). Within radius `R_cut` (default 120 BU, adjustable 40..400 BU with a slider in the colony view toolbar) everything above the plane (terrain, primitives, soil) is hidden; the soil cross-section at the plane is capped with a dark soil material; cavities below render normally. Outside `R_cut` the surface renders darkened 30 %. |
| Cutaway `xray` | All nest cavities of the player colony drawn as translucent shells through the soil, tinted by depth; ants as instanced dots ≥ 3 px; chambers labelled with type glyphs. |
| Picking | Click: inspect card (ant, chamber, marker, entrance). Double-click ant: possess (leaves the view). Marker tools are defined by the directives chapter. |
| Overlays | Scent, climate, threats, dig plans (overlay chapters) available here and in O/P. |

### 6.8 Camera settings (persisted in settings, not in saves)

| Setting | Default | Range | Tier |
| --- | --- | --- | --- |
| `orbitSensDrag` | 0.25 °/px | 0.05..1.0 | T1 |
| `ORBIT_SENS_LOCKED` (`orbitSensLocked`) | 0.15 °/px | 0.05..1.0 | T1 |
| `stickYawRate` / `stickPitchRate` | 180 / 120 °/s | 60..360 | T3 |
| Stick response exponent | 1.6 | 1..3 | T3 |
| Invert X / invert Y | off / off | — | T1 |
| `fovOffset` | 0° | −10..+20 | T1 |
| Auto-follow | gentle | off/gentle/strong | T1 |
| World-up lock | off | — | T3 |
| Reduced motion | off | — | T3 |

| Camera constant | Value | Unit |
| --- | --- | --- |
| `CAM_UP_TAU` | 0.35 (reduced motion 0.6) | real s |
| `CAM_PIVOT_UP_L` | 0.5 | L |
| `CAM_LOOKAHEAD_T` / `CAM_LOOKAHEAD_MAX_L` | 0.35 s / 1.5 L | |
| `CAM_PUSHOUT_TAU` | 0.4 | real s |
| `CAM_AUTOFOLLOW_DELAY_S` / `CAM_AUTOFOLLOW_TAU` | 1.5 / 1.2 | real s |
| `CAM_STATE_HOLD_S` / `CAM_STATE_BLEND_S` | 0.3 / 0.5 | real s |
| Zoom step | ×1.12 per wheel notch; ×1.8 per real s for keys | |
| `LATCH_TRIGGER_DEG` / `LATCH_TRIGGER_S` | 25° / 0.3 s | |
| `LATCH_BREAK_DEG` / `LATCH_MAX_S` | 30° / 1.5 s | |
| `FLOOR_NORMAL_MIN` | 0.7 | normal·worldUp |

### 6.9 Photo mode (T2)

| Item | Rule |
| --- | --- |
| Time | Sim frozen (no ticks) regardless of prior speed; ambient animation (grass sway, particles) frozen too. On exit, prior speed/pause state restored. |
| Camera and lens | Owned by GDD 08 §7.9 (consistency pass): `PHOTO_SPEED_BU_S` 4 (Shift ×5, Ctrl ×0.2), collision 0.3 BU from any surface, `PHOTO_MAX_RADIUS_BU` 400 from the entry point; focal length 24-200 mm equivalent; focus 0.5-200 BU; aperture f/1.4-f/22; exposure ±3 EV; roll ±45°. |
| Extras | Guides (thirds, centre), filters (none, monochrome, warm field-note), hide possessed-ant highlight. HUD always hidden. |
| Capture | Render at current resolution (×2 when the GPU budget allows) to PNG, filename `foundress-<seed>-y<year>-<season>-d<day>-<hhmm>.png` (GDD 08 §7.9). If download is refused (sandbox without `allow-downloads`), show the image in an overlay with "Copy" (Clipboard API, if permitted) and the instruction "Right-click the image to save". |
| Exit | F2 / Esc / B: back to the origin view and pose. |

---

## 7. Action primitives

### 7.1 Shared action lifecycle (sim side, T1)

Every primitive, for AI and player alike, runs this machine on the acting ant (`ant.action`).

| State | Entry condition | Behaviour | Exit conditions |
| --- | --- | --- | --- |
| `requested` | AI behaviour or `act` command | — | Same tick -> `validating`. |
| `validating` | — | Check caste/species permission, preconditions, reach (7.2), target still exists. | Pass -> `windup`; fail -> `failed` with a reason code. |
| `windup` | Valid | Pose transition; `windup` part of duration (default 20 %). | Interrupt (7.2) -> `cancelled`; done -> `active`. |
| `active` | — | Effect applied continuously or at the end per primitive. | Done -> `recovery`; interrupt -> `cancelled` (partial effects kept as stated per primitive). |
| `recovery` | — | Pose back (default 10 % of duration). | -> `done`; if `repeat` flag and input still held -> `validating`. |
| `done` / `failed` / `cancelled` | — | Emit event; clear `ant.action`. | — |

Effective duration = base duration / workRate, where `workRate = tempFactor' × healthFactor × species/caste multiplier`. AI uses `tempFactor`; the possessed ant uses `tempFactor'` (3.4).

Timing split: **timed** primitives (dig-bite, lay-egg, pick-up, tear, groom...) spend 20 % of their duration in `windup`, 70 % in `active`, 10 % in `recovery`, and apply their effect at the end of `active`; the stated duration includes all three. **Continuous** primitives (`move`, `grip`, `harvest-liquid`, trophallaxis, `drag`, `lay-trail`, `bite-hold`) have zero sim-time windup and recovery (the pose blends in render only) and apply their rate from the first tick.

### 7.2 Reach, targeting and interrupts

| Rule | Value |
| --- | --- |
| Reach | Target surface within `REACH_L` = 0.6 L of the mandible point, plus the target's radius. |
| Cone | Target centre within `REACH_CONE_DEG` = 50° of the ant's forward. |
| Interrupts | Taking damage (except while gripping and except `bite` hold), being grabbed, falling, a target that disappears, movement input with magnitude > 0.5 for > 0.15 game s on a `cancellable` primitive. |
| AI approach | AI behaviours walk into reach first; the player must walk into reach. |
| Failure reasons | `caste`, `species`, `no-target`, `out-of-reach`, `blocked`, `too-heavy`, `crop-full`, `crop-empty`, `hands-full`, `not-diggable`, `no-reserve`, `cooldown`, `conditions` (weather/temperature/season), `not-allowed-here`, `budget` (queen daily egg budget). |

### 7.3 Catalogue

"Who" uses caste ids; LN = `lasius-niger`, CP = `camponotus-pennsylvanicus`, MB = `messor-barbarus`, AT = `atta-texana`, ALL = all four. Durations are base values in game s at workRate 1. Load quantities follow directions J. Values marked (owner) are defaults that the named chapter may tune; the constant name stays.

| Id | Tier | Who | Preconditions | Duration | Effect on state | Pose cue | Sound cue |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `move` | T1 | all adults | Not in a non-moving primitive | continuous | Surface-walker step toward desired direction at the speed of 4.2. | `pose.walk` gait phase by speed; `pose.hurry` | `sfx.step.<material>` per footfall group |
| `let-go` | T1 | all adults | On a surface with normal·up < 0.7; not gripping | instant | Leaves the surface; ballistic fall; item kept. | `pose.fall` legs spread | `sfx.let-go` (faint) |
| `grip` | T1 | all adults | On any surface | hold | Dislodge immunity; speed × `GRIP_SPEED_MULT`. | `pose.grip` body lowered | none |
| `pick-up` | T1 | worker castes; founding queen (brood, pellets) | Hands free; item bulk ≤ caste `carryCap`; brood: eggs picked as a clump of up to `EGG_CLUMP_MAX` 6 (= one opening batch `OPEN_LAY_BATCH_EGGS`, GDD 06 §5.10) | 0.5 | Item -> `ant.carrying`. | `pose.pick` head down, mandibles close | `sfx.pickup.<itemClass>` |
| `put-down` | T1 | carrier | Carrying; free floor within reach (or a valid receiver: brood pile, store pile, mound area, plug) | 0.4 | Item placed at the target point, oriented on the surface; at a receiver, the receiver's logic applies (e.g., food store intake). | `pose.place` | `sfx.putdown.<itemClass>` |
| `drop` | T1 | carrier | Carrying | instant | Item released where it is; falls/rolls under gravity. AI uses it when fleeing or attacked. | `pose.release` | `sfx.drop` |
| `dig-bite` | T1 | LN worker, founding queen; CP all workers (wood); MB minor/media/major; AT small media/media/major; queen founding | Facing a diggable surface (material diggable for the species) within reach; no item, or carrying a pellet (auto-dropped behind first) | `DIG_BITE_S` 1.0 s / (`digSpeed`(material, moisture) × caste `digPower` × `workRate`) (owner GDD 03 §1.2, §2.1; wood: GDD 07 wood bite factor) | Carve sphere radius `DIG_BITE_RADIUS` 0.6 BU centred 0.4 BU into the face (≈ 0.9 BU³); spawns one `soil-pellet` (wood: `frass`) in the mandibles. Repeats while held. Auto-advance: if the face has receded beyond reach but lies within 1.5 L straight ahead, the ant steps forward into reach before the next bite (AI and player alike). | `pose.dig` head-down rasp | `sfx.dig.<material>` |
| `seal-entrance` | T1 | LN worker, founding queen; species with plugging | Carrying `soil-pellet`; inside an entrance throat within 3 BU of its surface opening | 2.0 | Adds a plug sphere (radius 1.2 BU) of loose soil at the throat (reverse carve, flag `plug`). Entrance state `sealed` once the throat cross-section is closed (typically 3 pellets). Pellet consumed. | `pose.tamp` head pressing | `sfx.seal-pat` |
| `unseal-entrance` | T1 | as `dig-bite` | Facing a plug | `dig-bite` × `PLUG_DIG_FACTOR` 0.5 | Removes plug voxels; pellets yielded as `dig-bite`. Entrance `open` when passable. | `pose.dig` | `sfx.dig.loam` |
| `lay-egg` | T1 | `queen` (dealate, mated) | In a chamber or the founding cell; protein/reserve ≥ `EGG_COST_P` 0.04 P; queen's daily egg budget (colony chapter) not exhausted; cooldown `LAY_COOLDOWN_S` 10 elapsed | 6.0, non-cancellable after windup | Spawns an `egg` at the gaster tip on the floor; deducts 0.04 P (from the founding pool `R` during claustral founding, GDD 06 §5.5). Player laying shares the AI budget; it only changes timing. **Opening exception (GDD 06 §5.10):** while the opening phase is `lay`, one `lay-egg` lays a batch of `OPEN_LAY_BATCH_EGGS` 6 eggs over 4 s (no cooldown; capped by the clutch limits); the AI queen is never subject to `LAY_COOLDOWN_S` (GDD 02 §3.2). | `pose.lay` gaster curled under | `sfx.egg-lay` (very soft) |
| `feed-larva` | T1 | worker castes; founding queen (from reserves); AT: only with fungus | Target larva within reach; crop has P or C > 0, or carrying a solid protein item; AT: carrying `staphylae` | 4.0 | Transfers up to `FEED_LARVA_LOADS` 0.1 load (crop, mixed C/P in crop proportion) or 0.1 P from the solid item; larva hunger reduced (brood chapter). | `pose.feed` head-to-larva | `sfx.feed` |
| `trophallaxis-give` | T1 | worker castes, nanitic; MB/AT per species data | Target nestmate adult within reach, facing; own crop > `TROPH_DONOR_MIN` 0.05 load; receiver not full | until done, max 10 | Rate `TROPH_RATE` 0.1 load/game s from donor crop to receiver crop, nutrients in donor proportion; stops when donor ≤ 0.05, receiver full, or either moves. | `pose.troph-give` mandibles open, head raised | `sfx.trophallaxis` |
| `trophallaxis-receive` (beg) | T1 | all adults incl. queen, males | Target nestmate with crop > 0.05 within reach | until done, max 10 | Same transfer, initiated by the receiver; the target is an AI ant, which accepts if its crop > 0.3 of capacity or the beggar is the queen/larva-feeder (colony chapter may refine). Player as target: always offered as prompt "Share food" on the next G. | `pose.troph-beg` antennal drumming | `sfx.trophallaxis` |
| `groom` | T1 | all adults (male: self only) | Target: self, nestmate or brood within reach | self 4.0; nestmate 5.0; brood 4.0 | Reduces target `dirt`/spore load by `GROOM_REDUCTION` 50 %; spreads colony odour (nestmate). | `pose.groom-self` / `pose.groom-other` | `sfx.groom` |
| `antennate` (inspect) | T1 | all adults | Any target in cone within 2 L (longer than reach) | 0.8 (AI recognition 0.5) | Opens the inspect card (section 9) for the player; AI: nestmate recognition. No state change except `knowledge` flags (e.g., source discovered). | `pose.antennate` antennae forward | `sfx.antennate` |
| `sniff` | T1 | all adults | — | 1.5 | Reveals scent haze within 10 BU for 8 real s (player-only presentation); ground site assessment if queen in founding (opening chapter). | `pose.sniff` antennae sweeping | none |
| `lay-trail` (on/off) | T1 | LN worker; CP, MB, AT foragers per species | Caste can lay trail | toggle | While on, deposits `trail` pheromone per BU walked at `TRAIL_DEPOSIT_PLAYER` (pheromone chapter scale): ×1.0 when carrying food or crop ≥ 0.5, ×0.6 otherwise. Off on release. | `pose.trail-dab` gaster tip touches ground every 2 L | `sfx.trail-dab` (very faint) |
| `harvest-liquid` (drink) | T1 | all adults that feed (not males) | At a liquid source (honeydew, nectar, sugar, spill, dew, fruit juice) within reach; crop not full | until full: `DRINK_FULL_S` 20 per full crop; cancellable | Crop += 0.05 load/game s, nutrient profile of the source; source amount −= same. | `pose.drink` mandibles in liquid, gaster swelling | `sfx.drink` |
| `harvest-solid` (tear) | T1 | worker castes | At a solid source too large to carry (carrion, fruit flesh, large crumb, dead prey) within reach; hands free | `TEAR_S` 4.0 × source hardness | Spawns a `food-piece` of 1 load (× caste carryCap) of the source's profile in the mandibles; source amount −= same. | `pose.tear` head jerks | `sfx.tear` |
| `tend-aphid` | T2 | LN worker; CP minor/media | Aphid (herd member) within reach; crop not full | stroke 3.0, then drink 3.0 if a droplet is released | Aphid releases a droplet of `APHID_DROPLET` 0.15 load if its buffer allows (ecology chapter); ant drinks it. Counts as tending (herd protection). Repeats while E held. | `pose.stroke` antennae drum aphid | `sfx.antennate` |
| `carry-aphid` | T2 | LN worker | Hands free; aphid within reach (secondary interact) | 0.8 | Aphid becomes the carried item; placed again with `put-down` on a plant. | `pose.pick` | `sfx.pickup.soft` |
| `bite` | T2 | all adults (male weak) | Target creature/ant/prey within reach | 0.5 strike | Damage per combat chapter. | `pose.bite` lunge | `sfx.mandible-snap` |
| `bite-hold` | T2 | all adults except male | Target within reach | hold | Latches (pair lock, combat chapter); holder speed ×0.3; drag if the target is lighter. Release on input up. | `pose.hold` | `sfx.mandible-snap`, `sfx.struggle` loop |
| `spray-acid` | T2 | LN, CP: worker castes, queen, gyne | Acid reserve ≥ 1 (`ACID_MAX` 5 sprays, regen 1 per `ACID_REGEN_S` 120 game s) | 0.8 windup + 0.3 | Cone 60°, range 1.5 L: damage/repel (combat chapter); deposits `alarm` pheromone at the spot. | `pose.spray` gaster curled forward between legs | `sfx.spray` |
| `sting` | T3 | MB all workers, queen | Target in contact (bite-hold or within 0.3 L) | 0.6 | Damage/venom (combat chapter). | `pose.sting` | `sfx.sting` |
| `release-alarm` | T2 | all adults except male | — | 0.5; cooldown 5 | Puff of `alarm` pheromone strength `ALARM_PUFF` (pheromone chapter) at the ant; nearby nestmates react (combat chapter). | `pose.alarm` mandibles open, rapid antennae | `sfx.alarm-rustle` |
| `drag` (cooperative) | T2 (solo drag T1) | worker castes | Item bulk > carryCap; ≤ carryCap × `SOLO_DRAG_MAX` 2 for solo; any up to `COOP_MAX_ANTS` 12 helpers | while held / until delivered | Ant grips item and walks backward pulling. Item speed = cruise × `DRAG_SPEED_MULT` 0.4 × min(1, Σ carryCap / bulk); no motion if Σ < 0.5 × bulk. The possessed ant's input direction is the lead; AI helpers align with it if within 90° of nestward, else pull nestward. | `pose.drag` backward walk | `sfx.drag.<material>` loop |
| `fly` | T2 | `gyne`, `male` with wings | Outside, launch point (surface with 10 BU free above, normal·up > 0.3); flight allowed by reproduction chapter (LN: air ≥ 13 °C, wind limit, flight day) | until landing | Enters flight state (4.4). | `pose.fly` wings blurred | `sfx.wingbeat` loop |
| `dealate` | T2 | mated `gyne` on the ground | After flight/mating (reproduction chapter) | 8.0 | Removes wings; caste becomes `queen` (founding). | `pose.dealate` legs scraping wing bases | `sfx.wing-snap` |
| `mate` | T2 | gyne, male in flight | Automatic on contact during a nuptial flight | 3.0 | Reproduction chapter. | `pose.mate` | none |
| `cut-leaf` | T3 | AT media, major, small media (small fragments) | On a leaf edge of an acceptable plant | min `CUT_MIN_S` 8, max `CUT_MAX_S` 15 at 25 °C (×3 at 15 °C) | Releasing after the minimum completes a `leaf-fragment` of size ∝ time (1 load at 15 s for a media); releasing earlier cancels (leaf scored, no fragment). Stridulation hum recruits within 6 BU. | `pose.cut` pivoting arc | `sfx.leaf-cut` + `sfx.stridulate` |
| `stridulate` | T3 | AT all workers (special); MB media/major (automatic while recruiting) | — | 1.0 | Recruitment signal within `STRIDULATE_RADIUS` 6 BU (AT) / alarm reinforcement (MB). | `pose.stridulate` gaster pumping | `sfx.stridulate` |
| `mill-seed` | T3 | MB major, large media | Carrying `seed` inside a chamber | `MILL_S` 12 × seed hardness | Seed -> `seed-paste` (larval food, nutrient per granary chapter) + `chaff`. | `pose.mill` seed rotated in mandibles | `sfx.mill-crunch` |
| `gnaw-radicle` | T3 | MB minor | Sprouted seed within reach | 5.0 | Germination reset (granary chapter). | `pose.gnaw` | `sfx.gnaw` |
| `tend-fungus` | T3 | AT minor (minim), small media | In a fungus chamber, garden surface within reach | 6.0 cycle; repeats while held | Garden contamination −, health + (fungus chapter); secondary "Plant pulp" when carrying `leaf-pulp` (5.0, adds substrate); secondary "Collect staphylae" (3.0, yields `staphylae`). | `pose.tend-fungus` | `sfx.garden-tend` |
| `eject-frass` | T3 | CP all workers | Carrying `frass` within reach of a gallery opening ("window") to outside | 1.5 | Item thrown out; lands under the window and joins the frass pile (= midden). | `pose.flick` head flick | `sfx.frass-eject` |
| `block-opening` | T3 | CP major, MB major, AT major | Facing out in an opening narrower than 1.5 L | until moved | Opening counted as guarded (combat/rival chapter). | `pose.block` head plug | none |
| `hitchhike` | T3 | AT minor | A nestmate carrying a `leaf-fragment` within reach | 1.0 to mount | Ant rides on the fragment; phorid defence (fungus/ecology chapter). `let-go` dismounts. | `pose.ride` | none |

Caste `carryCap` defaults (GDD 07 owns; its tables win where they differ): LN worker 1.0, LN queen 0 for food (brood and pellets allowed during founding), CP minor 0.5 (GDD 07), media 1.0, major 2.0, MB minor 0.5, media 1.0, major 2.5, AT minor 0.2, small media 0.5, media 1.0, major 3.0. Item `bulk` is in the same unit.

---

## 8. Time speed rules tied to views

Speed levels `SPEED_LEVELS = [0, 1, 2, 4, 8]` (0 = paused).

| Situation | Allowed | On entry | Notes |
| --- | --- | --- | --- |
| `possession` | 0, 1, 2, 4 | Set to 1x (unless paused: stays paused). Setting `dropTo1xOnPossess` (default on); when off, clamp to 4x. | 8x request refused (5.8). |
| `observer` | 0-8 | Unchanged | |
| `colony` | 0-8 | Unchanged | Possession soft-released. |
| `photo` (T2) | Frozen | Store and freeze | Restore on exit. |
| `timelapse` (T2) | Scripted | Store | Restore on exit; returning to possession applies the possession rule. |
| Pause menu, Settings (in game), Load screen | Paused | Store | Restore on close. |
| Drawers (directives, why view, roster, nest overview) | Unchanged | — | Setting `pauseWhenPanelOpen` (default off). |
| Book screens (journal, codex, settings, save/load; GDD 08 §7.1) | Paused | Store | Restore on close. |
| Major alert (T2) | — | Setting `autoSlow`: off / slow to 1x (default) / pause | Severity scale from the alerts chapter. |
| `skip-ahead` (T2, not in possession) | Runs the sim headless at max rate (render every `SKIP_RENDER_EVERY` 30 ticks) until a notable event or `SKIP_MAX_GAME_H` 24 game hours (1 GD, GDD 06 `SKIP_MAX_GD`), then returns to 1x | — | Any input aborts. |
| Window hidden | No ticks | — | No catch-up. |
| Frame budget | At most `MAX_TICKS_PER_FRAME` 16 ticks per frame and `SIM_FRAME_BUDGET_MS` 10 (GDD 06 §4.3-4.4 owns the loop and the step-down rule); if the sim cannot keep up, the HUD shows the effective rate ("8× (running at 5.6×)"). | | |
| Opening phases `search`..`lay` (GDD 06 §5.1) | Pause, 1x, 2x only | — | The founding time-lapse sets its own rate. |

Commands issued while paused (markers, directives, possess, release, inspect) are applied immediately at the current tick index without advancing time and are logged with that index, so determinism is kept. Camera orbit, inspect cards and panels work while paused; the possessed ant does not move while paused.

---

## 9. Context prompts

### 9.1 Target selection

1. Candidates: entities and surfaces in reach (7.2) of the possessed ant, plus "self" and "ground".
2. Score = class weight (table 9.2) − 0.5 × (distance / reach) − 0.3 × (angle / cone). Inapplicable actions are skipped; a candidate whose best action is disabled keeps a score but shows greyed.
3. Hysteresis: the current target gets +0.15; a new winner must lead for `PROMPT_SWITCH_MS` 200 real ms.
4. `cycle-target` (B / Dpad right) steps through the candidate list in score order for 3 real s, then automatic selection resumes.
5. The target is outlined (thin warm outline, colour-blind safe by line style) and the prompt is anchored above the ant's head in screen space, clamped to the safe area.

### 9.2 Priority classes (highest first)

| Class | Weight | Examples | Primary (E tap) | Secondary (E hold) |
| --- | --- | --- | --- | --- |
| 1 Ongoing commitment | 10 | holding prey, dragging, riding | "Let go of <thing>" | — |
| 2 Delivery receiver matching the carried item | 8 | larva while carrying protein; brood pile while carrying brood; plug while carrying pellet at an entrance throat; window while carrying frass | "Feed larva", "Put down <egg>", "Seal entrance", "Eject frass" | "Put down here" |
| 3 Brood | 7 | egg, larva, pupa | "Pick up <larva>" | "Groom <larva>" |
| 4 Food | 6 | liquid source, solid item, large source | "Drink <honeydew>", "Pick up <crumb>", "Tear off a piece" | "Pull <beetle>" (drag) |
| 5 Livestock / garden (T2/T3) | 5 | aphid, fungus | "Stroke aphid", "Tend garden" | "Carry aphid", "Collect fungus" |
| 6 Nestmate adult | 4 | worker, queen | "Groom nestmate" | — (G: "Share food" / "Beg food") |
| 7 Item (non-food) | 3 | pellet, corpse, chaff, pebble, seed | "Pick up <soil pellet>" | — |
| 8 Structure | 2 | plug, entrance, opening | "Block opening" | — |
| 9 Self / ground | 1 | nothing else in reach | Queen in a chamber: "Lay egg"; carrying: "Put down <item>"; else "Groom yourself" | Queen: "Groom yourself" |

Independent of E, up to two further lines show other keys valid for the same target: F ("Dig", "Cut leaf", "Chew wood", "Tear off a piece"), G ("Share food"/"Beg food"), Space ("Let go"/"Drop <item>"), T ("Inspect"). When the possessed ant is the queen after hand-over, one of the two lines is always "I  Colony orders" (target-independent; §2); it compacts with the other prompts under `promptsMode` but is never removed by `compact`.

### 9.3 Text patterns and states

| Pattern | Example |
| --- | --- |
| `<glyph>  <Verb> <object>` | "E  Pick up larva" |
| Hold form | "Hold E  Carry aphid" |
| Disabled (greyed) + reason | "E  Drink sugar — crop full"; "E  Pick up beetle — too heavy (needs about 3)"; "F  Dig — concrete cannot be dug"; "E  Lay egg — no strength left today" |
| Progress | A thin ring around the glyph fills for timed actions (dig bite, drink, lay). |
| Object names | Plain nouns: egg, larva, pupa, soil pellet, crumb, sugar, honeydew, nectar, dew, seed, leaf piece, aphid, nestmate, queen, corpse, frass, chaff. Foreign ants: "stranger". |

Prompt display setting `promptsMode`: `full` (default) / `compact` (after `PROMPT_LEARN_COUNT` 3 successful uses of an action, only glyph + object) / `off`. Learned counts are stored in the save. `controls-reminder` always shows the full list. Prompts never take focus, never block input.

---

## 10. Inspect read-outs (T1 unless tagged)

Opened by `inspect` (tap T) in possession for the current target, or by clicking in Observer/Colony view. A card has a header (what it is), a "senses" block (what an ant can perceive) and a "colony" block (game abstraction, e.g. task). Values show a word and a number; setting `showPreciseValues` (default on) hides numbers when off. Cards update live at 2 Hz and close on T/Esc or after `CARD_TTL_S` 8 real s without the target in reach (possession only).

| Target | Senses block | Colony block |
| --- | --- | --- |
| Ground / surface | Material (`loam` etc.) and diggability ("easy", bite time ×); moisture (dry/damp/wet/waterlogged, %); temperature °C at surface and estimated at 10 BU depth; cover (open / partly covered / under an object); scent present: trail strength and colony (ours/foreign), home marks (ours/foreign/none), alarm. | Queen in founding: site assessment (diggability, moisture, warmth/cover, flood risk, rival scent, exposure, overall poor/fair/good/excellent) per the opening chapter. |
| Food source / item | Kind (food kind id in words), taste ("sweet", "protein-rich", "mixed"), amount left (loads), state (fresh/drying/rotting), carry: "one ant" / "needs about n" / "too large: tear pieces". Bait (T2): "sweet; faint unfamiliar odour". | Ants of ours currently using it; rival ants present; known to the colony (yes/no). |
| Ant (ours) | Nestmate odour; caste; age class (callow/young/mature/old) and age in game days; health %; crop C/P (loads); carrying. | Task, behaviour state, target, reason; last 5 decisions with winning reason (T2); possessed flag. Queen (after hand-over): a "Colony orders" button that opens Directives (GDD 08 §4.2) without possessing her (§2). |
| Ant (foreign) | "Stranger"; species; size relative to us (×L); behaviour visible (foraging, fighting, carrying). | Colony label (e.g., "Neighbouring colony 2"), hostility (T2). |
| Brood | Stage; hunger (fed/hungry/starving); temperature and humidity felt vs. preferred. | Progress % of stage, ETA in game days at current conditions, destined caste if known (worker / sexual, T2). |
| Creature (T2) | Kind; activity (feeding, hunting, resting, fleeing); size (×L); danger (harmless / dangerous to a lone ant / dangerous to many). | Food value if dead (loads, C/P), herd size and honeydew output for aphids. |
| Chamber (Colony/Observer, or possession inside it) | Temperature °C, humidity %, depth (BU), crowding feel (roomy/crowded). | Type, volume (BU³), capacity vs occupancy (ants, brood, food loads), connections (entrances, tunnels), flood risk, issues with "why" links (T2). |
| Entrance | Open / plugged / sealed; traffic per game hour; mound size. | Mound pellets; linked chambers. |

---

## 11. New canonical identifiers added by this chapter

- **Screens**: `boot`, `unsupported`, `title`, `new-game`, `load`, `lineage`, `settings`, `codex`, `loading`, `playing`, `epitaph`.
- **Views**: `possession`, `observer`, `colony`, `photo`, `timelapse`.
- **Camera states**: `open`, `chamber`, `tunnel`, `crevice`, `falling`, `flight`. Cutaway modes: `off`, `slice`, `xray`.
- **Input contexts**: `G`, `P`, `O`, `C`, `Ph`, `TL`, `UI`.
- **Input action ids**: all ids in 5.1-5.5 (`move`, `hurry`, `orbit`, `zoom`, `recentre`, `interact`, `cycle-target`, `dig`, `inspect`, `bite`, `special`, `trail-toggle`, `share-food`, `foot`, `release`, `menu`, `pause-toggle`, `speed-1`, `speed-2`, `speed-4`, `speed-8`, `speed-up`, `speed-down`, `hide-hud`, `quick-save`, `quick-load`, `colony-view`, `scent-view`, `photo-mode`, `journal`, `why-view`, `roster`, `controls-reminder`, `alert-jump`, `skip-ahead`, `pointer-lock-toggle`, `possess-next`, `possess-prev`, `possess-last`, `possess-forager`, `possess-digger`, `possess-nurse`, `possess-queen`, `obs-*`, `cv-*`, `ph-*`, `tl-*`).
- **Action primitive ids**: `move`, `let-go`, `grip`, `pick-up`, `put-down`, `drop`, `dig-bite`, `seal-entrance`, `unseal-entrance`, `lay-egg`, `feed-larva`, `trophallaxis-give`, `trophallaxis-receive`, `groom`, `antennate`, `sniff`, `lay-trail`, `harvest-liquid`, `harvest-solid`, `tend-aphid`, `carry-aphid`, `bite`, `bite-hold`, `spray-acid`, `sting`, `release-alarm`, `drag`, `fly`, `dealate`, `mate`, `cut-leaf`, `stridulate`, `mill-seed`, `gnaw-radicle`, `tend-fungus`, `eject-frass`, `block-opening`, `hitchhike`.
- **Action phases**: `requested`, `validating`, `windup`, `active`, `recovery`, `done`, `failed`, `cancelled`. Failure reasons: listed in 7.2.
- **Item kinds assumed** (owned by the items/nest/ecology chapters; added here if absent): `soil-pellet`, `frass`, `chaff`, `corpse`, `food-piece`, `seed`, `seed-paste`, `leaf-fragment`, `leaf-pulp`, `staphylae`, `pebble`; brood and aphids are carried as their own entities.
- **Pose ids** `pose.*` and **sound cue ids** `sfx.*` as listed in 7.3.

---

## Appendix A — State required

| Name | Type sketch | Purpose | Persisted |
| --- | --- | --- | --- |
| `state.player.possessedAntId` | `number` (−1 none) | Current possession | yes |
| `state.player.previousAntId` | `number` | Backspace target | yes |
| `state.player.returnAntId` | `number` | Soft release return (colony/time-lapse) | yes |
| `state.player.intent` | `{ dir: [x,y,z]; mag: number; hurry: boolean; grip: boolean; held: { dig, bite, special, interact, inspect: boolean }; flight?: { thrust, brake, bank, climb, descend: number } }` | Latest player intent consumed by the player-control system; world-space desired direction already projected by the game layer | yes (for replay) |
| `state.player.lastInputTick` | `number` | AFK release | no (reset on load) |
| `state.player.promptLearned` | `Record<actionId, number>` | Prompt compaction | yes |
| `state.time.speed` / `state.time.paused` | `1\|2\|4\|8`, `boolean` (part of the GDD 06 `state.time` record; `setSpeed {speed: 0}` sets `paused`) | Time control | yes |
| `ant.flags` bit `POSSESSED` ("controlled" in the text) | flag bit | Excludes from allocation; switches behaviour to player control | yes |
| `ant.suspendedTask` | task id | Resume rule 15 | yes |
| `ant.action` | `{ id: ActionId; phase; startTick: number; durationTicks: number; target: EntityRef \| SurfaceRef \| null; repeat: boolean; reason?: string }` or `null` (durations in this chapter are written in game s; code stores ticks = s × 10) | Shared action lifecycle | yes |
| `ant.flags` bit `TRAIL_ON` | flag bit | lay-trail toggle | yes |
| `ant.acid` | `number` (0..ACID_MAX), `ant.acidRegenTick` (absolute tick of the next regen step) | spray-acid reserve | yes |
| `ant.layCooldownUntilTick` (queen) | `number` absolute tick | lay-egg cooldown (possessed queen only; the AI queen's laying is GDD 02 §3) | yes |
| `ant.dirt` | `number` 0..1 | groom target value (shared with hygiene) | yes |
| Game-side `view` | view id + origin view | View machine | saved as `meta.view` for resume |
| Game-side camera rig | per view: pose, yaw, pitch, distance per state, breadcrumb buffer, latch | Camera | `meta.camera` pose only |
| Game-side input | bindings, active device, held set, autoPaused | Input | bindings in localStorage |
| Settings | camera/controls/prompts/gameplay settings above | Presentation | localStorage |

Contract forms fixed by the consistency pass (`00-index.md` §D2.8, D2.10, D2.11, D1.7; the table above is written in them): no `controlled`/`trailOn` booleans (flag bits); `ant.action` in ticks; cooldowns as absolute ticks; `state.time` is the GDD 06 record `{ speed, paused, requested, autoSlow, cooldowns, skipUntil, commandSeq }`.

## Appendix B — Commands

Command `type` names are camelCase (consistency pass, `00-index.md` §D); the earlier kebab-case names are listed in brackets.

| Command | Payload | From | Notes |
| --- | --- | --- | --- |
| `possess` | `{ antId } \| { role: 'forager' \| 'digger' \| 'nurse' \| 'queen', nearPos: Vec3 }` | UI, input, debug | Rejected reasons in 3.3. A `role` is resolved by the sim with the quick-key rule of 3.2, nearest to `nearPos` (the camera target, filled by the game). |
| `release` | `{ reason: 'player' \| 'afk' \| 'colony-view' \| 'timelapse' }` | UI, input, game | |
| `setIntent` [`set-intent`] | `PlayerIntent` | Game each frame (logged on change) | Applied through `sim.setPlayerIntent`; logged as a command only for deterministic replay. |
| `action` [`act`] | `{ actionId; target?: EntityRef \| SurfaceRef; secondary?: boolean; phase: 'start' \| 'stop' }` | Input, debug `__game.act()` | `stop` ends hold-type actions. Target is the prompt's target; the sim re-validates. |
| `setTrail` [`set-trail`] | `{ on: boolean }` | Input | |
| `setSpeed` [`set-speed`] | `{ speed: 0\|1\|2\|4\|8 }` | Input, UI | Clamped by view rules (8) and GDD 06 §4.2; 0 = pause. |
| `skipToNextEvent` [`skip-ahead`] (T2) | `{}` | Input | Executed by the game loop (GDD 06 §4.6); not a tick command. |
| Game-level (not sim) | `view.set`, `camera.recentre`, `camera.setPose`, `photo.capture`, `bindings.set`, `bindings.reset`, `settings.set` | UI | |

## Appendix C — Events

| Event | Payload | Consumers |
| --- | --- | --- |
| `possession-started` | antId, caste, viaMethod | HUD, audio (soft tone), journal stats |
| `possession-ended` | antId, reason (`release`, `switch`, `death`, `afk`, `colony-view`, `timelapse`), resumedTask | HUD, journal |
| `possess-rejected` | antId, reason | UI toast |
| `possessed-ant-died` | antId, cause | Camera, HUD, audio, journal |
| `action-started` / `action-completed` | antId, action, target, (result: loads moved, voxels carved) | Render pose, audio, prompt progress, journal (first-time actions -> codex unlocks) |
| `action-failed` / `action-cancelled` | antId, action, reason | Prompt greying, HUD hint (player ant only) |
| `trail-toggled` | antId, on | HUD indicator, audio |
| `speed-changed` / `speed-refused` | level, reason | HUD, toast |
| `ant-unstuck` | antId, from, to | Debug, QA logs |
| Game-level: `view-changed`, `camera-state-changed`, `input-device-changed`, `pointer-lock-changed` (state, refused), `gamepad-connected/disconnected`, `photo-captured`, `inspect-opened` | — | UI, audio, tests |

## Appendix D — Diagnostics ("why" view)

| Subject (id; ids fixed by the consistency pass) | Status | Limiting factors (weighted) | Remedies |
| --- | --- | --- | --- |
| Possessed ant movement (`diag-possessed-movement`) | "Moving at 55 % of normal" | cold (tempFactor'), injury (healthFactor), load, grip held, uphill on loose sand | "Wait for warmth / move into sun", "Put down the load", "Release grip" |
| Possessed ant action (`diag-possessed-action`) | "Can't dig here" (last failure reason) | the failure code with its explanation | "Find soil: loam, sand, clay", "Put down your pellet first" |
| Possession availability (`diag-possession-availability`) | "No foragers right now" | task counts | "Possess any worker (Tab)", "Raise foraging in Directives" |
| Input (merged into GDD 08 `diag-input`) | "Mouse look unavailable", "Controller layout unrecognised", "Bindings could not be saved" | environment cause | "Drag with the right button", "Check bindings", "Settings are kept for this session only" |
| Time speed (merged into GDD 08 `diag-perf`) | "Running at 5.6× (requested 8×)" | sim cost per tick, ant count | "Lower quality preset" (perf chapter) |
| Released ant (`diag-released-ant`, info) | "Returned to work: hauling soil" | rule number in 3.5 that matched | — |

## Appendix E — Acceptance checks (debug API, `?test=1&seed=1&quality=low&autostart=1`)

1. **Given** a new game with the founding queen possessed at speed 1x, **when** `__game.command({type:'setSpeed', speed:8})`, **then** `summary().time.speed` is 1 and a `speed-refused` event with reason `possession` was emitted.
2. **Given** Observer at 8x, **when** `__game.possess('forager')` and `step(1)`, **then** `summary().possessed.id` is that ant, `controlled` is true and speed is 1.
3. **Given** a possessed worker carrying a `soil-pellet` 20 BU below the surface in a nest with one open entrance, **when** `release()` and `step(1)`, **then** its task is `haul`; **and after** `step(1200)` (120 game s) the pellet item lies within 6 BU horizontally of that entrance at the surface.
4. **Given** a possessed worker 100 BU outside the nest with crop 0.8 C, **when** released, **then** within 1 tick its task is `forage` (return leg) and within 3000 ticks its crop is ≤ 0.05 and the colony's in-nest C stock (social stomach + stores) rose by ≥ 0.7 load.
5. **Given** a possessed worker carrying a larva in a tunnel, **when** released, **then** task is `nurse` and within 900 ticks the larva lies inside a chamber registered for brood.
6. **Given** a possessed worker facing a loam wall, **when** `act({action:'dig-bite', phase:'start'})`, `step(100)` (10 game s at 22 °C, workRate 1), `act({...phase:'stop'})`, **then** 10 ± 1 `action-completed` dig events occurred, carve open volume grew by 5-10 BU³ (spheres overlap), the number of pellets on the floor equals completed bites − 1, and 1 pellet is in the mandibles.
7. **Given** a possessed worker with empty crop in reach of a sugar source holding 5 loads, **when** `act harvest-liquid start` and `step(200)`, **then** crop = 1.00 ± 0.01 load and the source holds 4.00 ± 0.01.
8. **Given** donor (possessed) crop 1.0 C facing a nestmate with empty crop, **when** `act trophallaxis-give` and `step(50)`, **then** donor crop = 0.50 ± 0.02 and receiver = 0.50 ± 0.02.
9. **Given** the queen in a chamber with ≥ 0.04 P available and budget left, **when** `act lay-egg` and `step(61)`, **then** egg count is +1 and queen P (or reserves) decreased by 0.04; **when** `act lay-egg` again at `step(5)` later, **then** `action-failed` with reason `cooldown`.
10. **Given** a possessed worker, **when** `act lay-egg`, **then** `action-failed` reason `caste` and no egg is created.
11. **Given** a possessed worker 0.5 BU from a crumb and 0.6 BU from a larva, both inside the cone, **when** the prompt is queried (`__game.query.prompt()`), **then** primary is "Pick up larva" (class 3 beats class 4).
12. **Given** a possessed ant in a 2 BU wide tunnel walking at cruise speed, **when** 60 frames are rendered, **then** `camera.state()` is `tunnel`, camera–ant distance ≤ 4 L, and `f(cameraPos) ≥ CAM_RADIUS/2` on every frame.
13. **Given** a scripted 60 game s walk from flat ground up a vertical wall onto an overhang ceiling, **when** rendering every frame, **then** no frame has `f(cameraPos) < CAM_RADIUS/2` and the ant is never occluded for more than 0.5 real s (occlusion test 6.5 rule 3).
14. **Given** the possessed ant's up changes by 90° in one tick, **when** 0.35 real s pass, **then** the angle between camera up and ant up is 33° ± 4°; **after** 1.5 real s it is ≤ 2°.
15. **Given** intent W held at full magnitude while the ant crosses a 90° convex edge, **when** stepping 20 ticks, **then** the ant's displacement along its path increases every tick (no reversal) and it ends on the new face.
16. **Given** `mouseLook='locked'` and `requestPointerLock` stubbed to fire `pointerlockerror`, **when** the canvas is clicked, **then** the effective mode is `drag`, exactly one toast appears, and an RMB drag of 100 px rotates yaw by 25° ± 1°.
17. **Given** W held and sim running, **when** a `blur` event is dispatched, **then** within one frame all held inputs are released, `paused` is true and `autoPaused` is true; after `step(10)` the ant's speed is 0.
18. **Given** default bindings, **when** binding `trail-toggle` to F, **then** a conflict with `dig` (context P) is reported; **choosing** Swap results in F = `trail-toggle` and R = `dig`.
19. **Given** a gamepad is the last-used device and the sim runs at 1x, **when** `gamepaddisconnected` fires, **then** the sim is paused and `input-device-changed` reports `kbm`.
20. **Given** 5 colony ants within 40 BU of the possessed ant, **when** Tab is pressed 6 times within 2 s, **then** the first 5 presses possess 5 distinct ants and the 6th returns to the first of the list.
21. **Given** a possessed worker, **when** M is pressed, **then** view is `colony`, the ant's `controlled` is false and it has a task; **when** M is pressed again, **then** view is `possession` of the same ant and speed is 1.
22. **Given** photo mode entered from Observer at 4x, **when** 5 real s pass, **then** the tick counter is unchanged; **on exit** speed is 4 and the camera pose equals the pre-entry pose.
23. **Given** a possessed ant and no input, **when** 120 real s pass with the sim running, **then** `possession-ended` reason `afk` is emitted and view is `observer` following that ant.
24. **Given** a possessed worker killed by `cheat.kill(id)`, **when** 3.5 real s pass, **then** `possessedAntId` is −1, view is `observer`, and a `possessed-ant-died` event was emitted once.
25. **Given** a possessed Lasius worker on flat loam whose `tempFactor` is 0.4 (about 12 °C) on difficulty `naturalist`, **when** W is held for 10 game s on flat loam, **then** distance travelled is 30 ± 2 BU (6 BU/s × 0.5 floor).

## Appendix F — Cross-chapter assumptions

1. **Locomotion** (there is no separate locomotion chapter; consistency pass: the walker and player locomotion are this chapter's §4, AI speed multipliers GDD 02 §1.4, `tempFactor` = GDD 06 §2.6 `speedMult(Tb)`, grip and slope limits GDD 04 §3, nest walking and clearance GDD 03 §5) provides a pure surface-walker step usable by both the sim and the game-side predictor, ballistic falling and re-attachment, the `STUCK_RESCUE` relocation, and species cruise speeds (Lasius 6 BU/s at 22-28 °C) plus `tempFactor(T)` per species.
2. **Colony/allocation chapter** honours `ant.controlled` (never reassigns), exposes the allocation stimulus scale to which `RESUME_LOCALITY_BONUS` adds, chooses the brood chamber per stage, sets the queen's daily egg budget, and decides when an AI ant accepts a trophallaxis beg.
3. **Nest chapter** owns dig rates per material (`DIG_BITE_S` factor table), carve sphere size, pellet clutter, entrance throat detection, plugs, mounds and the `fSubstrate < 0` underground test; it may tune the defaults here without renaming.
4. **Economy (GDD 02 §1, §5)** owns crop capacity (1 load for the standard worker), upkeep and hurry cost; there are no per-agent weights (directions K) and all quantities shown to the player are per simulated ant.
5. **Pheromone chapter** defines the deposit scale for `TRAIL_DEPOSIT_PLAYER` and `ALARM_PUFF`.
6. **Ecology chapter** defines source amounts, aphid droplet buffers, hardness, item `bulk`; T1 worldgen places at least basic food sources (crumbs, sugar, carrion) so T1 foraging verbs have targets.
7. **Combat chapter** owns damage, pair locks, fight/flee thresholds and the outcome of `bite`, `bite-hold`, `spray-acid`, `sting`, `release-alarm`.
8. **Opening chapter** owns the founding script (founding-queen autonomy, site assessment via `sniff`/`antennate` on ground, first-brood time-lapse with drop-out beats) and starts the game in possession of the queen.
9. **Reproduction (GDD 06 §11)** owns flight permission, flight physics constants (ascend 40 BU/s, forward 80 BU/s), mating, dispersal off-map and dealation.
10. **Environment chapter** supplies temperatures for `tempFactor`, overwintering time-lapse entry/exit, and heat damage.
11. **Directives/markers chapter** owns marker tools inside the colony view; this chapter only supplies the camera, cutaway, confirm/cancel/delete inputs.
12. **Render chapter** implements the depth strategy for near/far ratios here, dithered fades, cutaway capping, grass parting, exposure adaptation, and reports "region ready" for transitions.
13. **UI chapter** implements screens, toasts, cards, prompts anchoring, roster and the HUD possessed-ant panel (health, crop C/P, carrying, trail indicator, hurry/grip state).
14. **Alerts/progression chapter** provides alert severity for `autoSlow` and the notable-event predicate for `skip-ahead`, and unlocks codex entries from `action-completed` events.
15. **Architecture/TDD** accepts zero-time command application while paused (section 8) and intent logging for deterministic replay; `__game.query.prompt()` and `camera.state()` are added to the debug API.
16. **Directives/markers chapter** (GDD 02 §12 semantics, GDD 08 §4.3 tools) does not claim digit keys 1-8 or E/R/F/G/Q in the colony view (they are taken by speed, role possession, rotation, slicing and cutaway mode); marker tool hotkeys are Shift+1..7 or the palette. One declared exception (second consistency pass): while the dig-planner tool holds a ghost, Q/E rotate the ghost in 15° steps and Shift+Wheel changes its size (GDD 08 §4.3) instead of `cv-rotate` and the Shift+Wheel slice binding; R/F still move the slice.
17. **Debug API** additionally exposes `cheat.kill(id)`, `query.prompt()`, `camera.state()`, `camera.pose()`, and input simulation for keys/gamepad events (used by checks 16-20).
18. **Species data** carry per caste: `L`, `carryCap`, which primitives are enabled (the "Who" column), acid availability, trail-laying castes.

## Open risks

- F5/Tab interception may fail in some embeddings; a reload can lose up to `QUIT_CONFIRM_UNSAVED_S` of play unless autosave cadence is short (save chapter).
- Tunnel state detection by 8 rays may misclassify irregular player-dug tunnels (wide stubs, junctions); needs tuning on the nest spike geometry.
- Prediction/reconciliation of the possessed ant can show visible correction on wall/edge transitions if the game-side walker and the sim diverge (must call the identical function with identical inputs).
- Player comfort exceptions (temperature floor, hurry) slightly break "exactly the same as AI"; they are named constants and Harsh lowers the floor.
- Large size spread (Atta minim 0.35 BU to queen 2.6 BU) stresses camera near-plane and collision radius choices; verify on T3.
