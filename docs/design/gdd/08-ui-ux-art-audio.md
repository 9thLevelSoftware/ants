# GDD Chapter 08 — Interface, experience, art direction and audio

Status: design, binding for `src/ui/**`, `src/input/**`, `src/audio/**`, the presentation parts of `src/render/**`, and `src/game/` (settings, saves UI, debug UI hooks).
Sources: `00-original-brief.md`, `01-design-seed.md` (seed), `02-design-directions.md` (directions; section J identifiers), `03-architecture.md`, `docs/design/tdd/00-contracts-guidance.md`, research `genre-ux.md`, `tech-stack.md`, `ecology-habitats.md`, `bio-*.md`, asset manifests `public/assets/manifest.json` and `assets-src/MANIFEST.md`. The look-dev and ant-rendering spike reports (`spike-look.md`, `spike-ants.md`) did not exist when this chapter was written; section 11 defines targets that those spikes must meet, not results taken from them.

Tone: a naturalist's field notebook. Calm, precise, restrained. No dialogue, no characters, no jokes, no exclamation marks.

---

## 0. Scope, tiers and conventions

| Feature | Tier | Notes |
|---|---|---|
| Boot gate, Title, New Game (species = Lasius only), Loading, HUD core (time, speed, colony pulse, possessed-ant panel, context prompts, alerts feed), Pause menu, Directives, Marker tool + dig planner + cutaway, Roster, Nest overview, Settings (graphics, audio, controls with keyboard rebinding, gameplay), Save/Load with export/import and copy/paste fallback, inspect cards (ant) | T1 | Seed tier 1: HUD/menus/settings, time controls, save/load, directives. |
| Colony health ("why"), alert click-through to causes, Journal (aims, milestones, graphs, event log), onboarding hints and aims, scent view overlay, temperature/moisture/threats/dig-plan overlays, Epitaph, Lineage, Photo mode, founding and overwintering time-lapse overlays, audio (all of it), minimap, inspect cards for chambers, sources and creatures, locality preview map | T2 | Seed tier 2. |
| Species cards 2-4, Codex breadth (all entries, search, manual pages), difficulty presets + custom rules UI, gamepad (play and menu navigation), accessibility set (UI scale 80-150 %, text size, high contrast, reduced motion, spider comfort ladder, alternative overlay palettes, hold-to-toggle per action, sound-cue indicators), quality presets UI incl. auto-detect, generative music | T3 | Seed tier 3. A Codex shell with the onboarding entries listed in 9.4 is T2. |

Conventions used in this chapter:
- Design pixels (dp): sizes are specified at the reference viewport 1280 x 720 at UI scale 100 %; 1 rem = 16 dp. Section 2.3 defines scaling.
- Time: "game h" = game hour (25 real s at 1x), "game min" = 1/60 game h, "real s" = wall-clock seconds. Alert cooldowns are given in both where both apply.
- All named constants below live in `src/ui/tokens.ts` (design tokens), `src/ui/balance.ts` (UI behaviour constants), `src/audio/balance.ts` and `src/render/look.ts`. They are presentation constants and may live outside `src/sim/balance` because they never affect simulation results.

**Performance contract (binding; brief §7-8, seed §1).** Target hardware is an integrated-GPU laptop at 1920 x 1080: the game holds 60 fps at the Medium preset there. Quality presets Low / Medium / High / Ultra plus Auto (auto-detection T3) and dynamic resolution (target 60 or 30 fps) are the levers (7.4). The measurable gate is `diag-perf` (Appendix D): frame time p95 <= 18 ms is `ok` (warn <= 33 ms). The simulation's share is `SIM_FRAME_BUDGET_MS` 10 real ms per rendered frame (GDD 06 §4.3; when it cannot keep up, GDD 06 §4.4 steps the speed down rather than exceed it), and the agent ceiling is under 2500 live ants of all colonies (directions K: 1500 player workers, fielded rival agents inside the remainder). Chapter budgets that must fit inside this contract: GDD 02 Appendix F item 10 (colony systems per tick), GDD 03 §16 (carve, remesh and nest fields), GDD 04 §4.1 (generation time and world memory). Profiling runs use the reference machine class at Medium with a mature colony (1200+ workers) in a Standard locality.

---

## 1. Information hierarchy

| Layer | What | Where | Visibility control |
|---|---|---|---|
| A. Always visible (max 6 elements, each hideable individually, all hidden with H) | 1 Time cluster (date, season glyph, clock, weather glyph, speed control). 2 Colony pulse (workers, brood, C and P stores with trend arrows, overall status pip). 3 Alerts feed (max 3 cards). 4 Context prompts near the possessed ant. 5 Possessed-ant panel (only while possessing). 6 Focus line (current aim; default on for the first 2 game days, then off). | HUD regions (3.4) | Settings > Interface > per-element: Always / When relevant / Never. "When relevant" rules are in 3.4. |
| B. Diegetic | Carried item in mandibles; crop fullness as translucent abdomen swelling; founding queen's abdomen thins with reserves; brood restlessness; trail brightness in scent view; giant shadows before footfalls. | World | Not hideable (they are the world). |
| C. Peek | Inspect cards: ant, brood, chamber, food source, creature, marker, dig plan. | Hover (observer/colony views) or T (antennate) while possessing; card anchored beside the target. | Card auto-hides 0.4 real s after hover ends; pin with click. |
| D. On demand | Panels: Directives (I; also "Colony orders" on the queen, 4.2), Markers (colony view), Colony health (Y), Roster (L), Nest overview (U), Journal (J), Codex (K), Settings, Save/Load. Overlays (V, O). Minimap. | Drawers and book screens | One key each, Esc closes. |
| E. Codex | Field notes, plates, glossary, controls manual. | Codex book | Unlocks on observation. |

Rule: if a number can be read off an ant or a chamber, it does not appear in layer A.

---

## 2. Design system

### 2.1 Colour tokens (light-on-dark panels over a live 3D scene)

Panels are semi-opaque so the scene stays present. Contrast values were computed against the panel colour composited at its alpha over pure white (the worst case: a bright sky behind the panel), written "worst". Requirement: body text >= 4.5:1 worst, large text and UI boundaries >= 3:1 worst.

| Token | Hex | Use | Contrast on solid panel / worst |
|---|---|---|---|
| `--c-panel` | `#16130F` at alpha 0.90 | Drawers, cards, book pages | — |
| `--c-panel-raised` | `#221D17` at alpha 0.94 | Inputs, hovered rows, nested cards | — |
| `--c-scrim` | `#16130F` at alpha 0.80 | Chips floating over the scene (prompts, labels) | — |
| `--c-text` | `#EEE7D7` | Primary text ("paper") | 15.0 / 11.5 |
| `--c-text-2` | `#BDB29C` | Secondary text, units, labels | 8.8 / 6.7 |
| `--c-text-3` | `#A39884` | Tertiary, timestamps, hints | 6.5 / 5.0 |
| `--c-disabled` | `#6E6556` | Disabled text (exempt from contrast) | 3.2 / 2.5 |
| `--c-border` | `#4A4136` | Hairline dividers (decorative only) | 1.9 |
| `--c-border-strong` | `#8A7C66` | Input and control boundaries | 4.6 / 3.5 |
| `--c-accent` | `#E2B04A` | Ochre ink: selected tab, primary button fill, slider thumb | 9.3 / 7.1 |
| `--c-on-accent` | `#16130F` | Text on accent fill | 9.3 |
| `--c-link` | `#E8C46A` | Links, "Why?" affordances | 11.1 / 8.4 |
| `--c-focus` | `#F6D36B` | Focus ring (2 dp) with 2 dp `#16130F` outer halo | 12.7 / 9.7 |
| `--c-status-ok` | `#8CBF6E` | Diagnostic `ok`, alert `info` accent | 8.6 / 6.6 |
| `--c-status-watch` | `#E3C04D` | Alert `notice`, trend caution | 10.5 / 8.0 |
| `--c-status-warn` | `#EE8A4A` | Diagnostic `warn`, alert `warning` | 7.4 / 5.6 |
| `--c-status-bad` | `#F06A5A` | Diagnostic `bad`, alert `critical` | 6.1 / 4.7 |
| `--c-info` | `#7FB8E0` | Neutral informational accents, water/moisture glyphs | 8.7 / 6.6 |
| `--c-nutrient-c` | `#E3C04D` | Carbohydrate glyph and bars (always paired with the letter C) | 10.5 / 8.0 |
| `--c-nutrient-p` | `#C99AD6` | Protein glyph and bars (always paired with the letter P) | 7.6 / 5.8 |

Status is never shown by colour alone: every status carries a shape (2.6) and a word.

High-contrast mode (T3) replaces: panel `#000000` alpha 1.0, text `#FFFFFF`, text-2 `#E6E6E6`, borders `#FFFFFF`, accent `#FFD400`, focus `#FFD400` 3 dp; scrim alpha 0.95.

### 2.2 Typography

All fonts are SIL Open Font Licence, installed from npm and bundled (no CDN; the game must run offline and in sandboxed iframes). Only the `latin` and `latin-ext` subsets are bundled.

| Role | Family | Package | Weights / styles |
|---|---|---|---|
| Headings, screen titles, codex titles, epitaph | Source Serif 4 (variable) | `@fontsource-variable/source-serif-4` | 400-700, italic for binomials |
| Body, UI, numbers | Inter (variable) | `@fontsource-variable/inter` | 400, 500, 600; `font-feature-settings: "tnum" 1` for all numeric readouts |
| Optional legibility face (Settings > Accessibility > Font) | Atkinson Hyperlegible | `@fontsource/atkinson-hyperlegible` | 400, 700 |
| Key and code glyphs, seed codes | JetBrains Mono | `@fontsource/jetbrains-mono` | 500 |

Fallback stacks: serif `"Source Serif 4 Variable", Georgia, serif`; sans `"Inter Variable", system-ui, sans-serif`. Fonts load with `font-display: swap`; the UI must be usable before they load.

Type scale (dp at 100 %; line height in brackets):

| Token | Size | Family / weight | Use |
|---|---|---|---|
| `--t-display` | 44 (52) | Serif 500 | Title wordmark, epitaph heading |
| `--t-h1` | 28 (34) | Serif 500 | Screen titles |
| `--t-h2` | 22 (28) | Serif 500 | Panel titles, codex entry titles |
| `--t-h3` | 17 (24) | Sans 600 | Section labels |
| `--t-body` | 15 (22) | Sans 400 | Default text |
| `--t-small` | 13 (18) | Sans 400 | Secondary text, table cells |
| `--t-caption` | 12 (16) | Sans 500, letter-spacing 0.02 em | Units, axis labels, key captions |
| `--t-numeric-l` | 20 (24) | Sans 600 tnum | Headline numbers in the colony pulse |

Rendered text never goes below 11 px regardless of scaling (clamp). Binomials are always italic with genus capitalised (*Lasius niger*). Numbers: loads with one decimal below 10 and integers above (`7.4 C`, `126 C`); temperatures as integers with unit (`21 °C`); times as 24 h `14:20`; dates as `Spring · Day 3 · Year 1`.

### 2.3 Spacing, layout scale, radii, elevation

| Token set | Values |
|---|---|
| Spacing `--s-*` | 0, 2, 4, 8, 12, 16, 24, 32, 48, 64 dp (`--s-0` .. `--s-9`) |
| Radii `--r-*` | `--r-xs` 2, `--r-s` 4 (inputs, chips), `--r-m` 8 (cards, drawers), `--r-pill` 999 (key caps, toggles) |
| Elevation | `--e-0` none (HUD chips); `--e-1` `0 2px 8px rgba(0,0,0,.35)` + 1 dp `--c-border` (cards, drawers); `--e-2` `0 8px 28px rgba(0,0,0,.5)` (modals, book screens); `--e-3` modal backdrop `rgba(10,8,6,.55)` |
| Backdrop blur | `backdrop-filter: blur(6px)` on `--c-panel` surfaces only at High/Ultra quality; off at Low/Medium (cost) |

Scaling rule (all sizes in rem):
- `autoScale = clamp(min(viewportW / 1280, viewportH / 720), 0.75, 2.5)`
- `uiScale` = user setting 0.80-1.50 in steps of 0.10 (default 1.00, T3; T1 ships with 1.00 fixed)
- `textScale` = user setting 1.00 / 1.15 / 1.30 (T3), applied to type tokens only
- Root font size = `16px * autoScale * uiScale`; type tokens are additionally multiplied by `textScale`.
- Layout modes: **standard** when the scaled viewport is >= 960 x 540 dp; **compact** below that (drawers become full width, alerts max 2, colony pulse stays collapsed, minimap hidden); below 640 x 360 dp a "Window too small" notice covers the HUD and the game auto-pauses until the window grows.

### 2.4 Motion

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--m-instant` | 0 ms | — | Reduced-motion substitute |
| `--m-micro` | 90 ms | `cubic-bezier(0.2,0,0,1)` | Hover, press |
| `--m-fast` | 160 ms | `cubic-bezier(0.2,0,0,1)` | Toggles, chips, card enter |
| `--m-standard` | 240 ms | `cubic-bezier(0.2,0,0,1)` enter, `cubic-bezier(0.4,0,1,1)` exit | Drawers, tabs, alert cards |
| `--m-slow` | 400 ms | `cubic-bezier(0.3,0,0,1)` | Book screens, overlay fades |
| `--m-scene` | 800 ms | `cubic-bezier(0.45,0,0.2,1)` | Camera transitions (possession swap, jump-to-cause) |

Reduced motion: all UI transitions become opacity fades of 120 ms; camera transitions become a 200 ms crossfade cut; no parallax, no bobbing, no pulsing. Nothing in the UI loops faster than 1 Hz; no flashing (maximum 3 luminance flashes per second anywhere, including lightning, see 11.4).

### 2.5 Icons

Style: line icons on a 24 dp grid, 1.5 dp stroke, round caps and joins, `currentColor`, no fills except status shapes; drawn as an inline SVG sprite (`src/ui/icons.svg`). Silhouettes of organisms are drawn from above or in profile as a field sketch would, never with faces. Icons always have an accessible name.

Required icons (id: meaning): `pause`, `speed-1`, `speed-2`, `speed-4`, `speed-8`, `next-event`, `season-spring`, `season-summer`, `season-autumn`, `season-winter`, `weather-clear`, `weather-overcast`, `weather-rain`, `weather-storm`, `weather-heat`, `weather-frost`, `sun`, `moon`, `thermometer`, `droplet`, `ant-worker`, `ant-minor`, `ant-media`, `ant-major`, `ant-queen`, `ant-gyne`, `ant-male`, `egg`, `larva`, `pupa`, `nutrient-c`, `nutrient-p`, `crop`, `carry`, `health`, `reserves`, `acid`, `task-idle`, `task-rest`, `task-nurse`, `task-queen-care`, `task-scout`, `task-forage`, `task-tend`, `task-store`, `task-dig`, `task-haul`, `task-guard`, `task-patrol`, `task-fight`, `task-flee`, `task-garden`, `task-cut`, `task-mill`, `marker-dig`, `marker-forage`, `marker-avoid`, `marker-rally`, `marker-entrance`, `marker-move-brood`, `marker-move-queen`, `chamber-founding`, `chamber-royal`, `chamber-nursery`, `chamber-food`, `chamber-granary`, `chamber-fungus`, `chamber-midden`, `chamber-rest`, `chamber-general`, `overlay-scent`, `overlay-temperature`, `overlay-moisture`, `overlay-threats`, `overlay-dig-plans`, `cutaway`, `xray`, `why`, `jump-to`, `possess`, `release`, `follow`, `journal`, `codex`, `lineage`, `settings`, `save`, `load`, `export`, `import`, `copy`, `camera`, `photo`, `trend-up`, `trend-up-strong`, `trend-down`, `trend-down-strong`, `trend-flat`, `status-ok`, `status-watch`, `status-warn`, `status-bad`, `close`, `back`, `search`, `pin`, `lock`, `undo`, `trash`, `sound-on`, `sound-off`, `gamepad`, `keyboard`, `spider` (used only in the comfort setting row), `footfall`, `wheel`, `broom`, `mower`, `water-can`.

### 2.6 Status shapes

| Status | Shape | Colour | Word |
|---|---|---|---|
| Diagnostic `ok` / alert `info` | Circle outline | `--c-status-ok` | "Good" / "Note" |
| Alert `notice` | Filled circle | `--c-status-watch` | "Notice" |
| Diagnostic `warn` / alert `warning` | Upward triangle | `--c-status-warn` | "Strained" / "Warning" |
| Diagnostic `bad` / alert `critical` | Octagon with bar | `--c-status-bad` | "Failing" / "Critical" |

### 2.7 Component inventory

Every interactive component has these states unless stated: default, hover, focus-visible (2 dp focus ring + 2 dp dark halo, offset 2 dp), active/pressed (translate 1 dp down, `--c-panel-raised`), disabled (`--c-disabled`, `aria-disabled`, still focusable when it carries an explanatory tooltip), busy (spinner replaced by a static ellipsis in reduced motion).

| Component | Variants / special states | Notes |
|---|---|---|
| Button | primary (accent fill), secondary (outline `--c-border-strong`), ghost, danger (outline `--c-status-bad`; confirm required) | Min hit area 32 x 32 dp; text buttons min width 88 dp. |
| IconButton | with tooltip | 32 x 32 dp; tooltip after 500 ms hover or on focus. |
| Toggle | on / off | Track 36 x 20 dp. |
| SegmentedControl | 2-6 segments | Arrow keys move selection. |
| Slider | with value field; with target/actual twin markers | Thumb 16 dp; arrow = 1 step, PageUp/PageDown = 10 steps, Home/End = ends. |
| LinkedSliderGroup | locked member, sum indicator | See 4.6. |
| Select | listbox popover | Type-ahead. |
| TextField | error, read-only | Seed field uses JetBrains Mono. |
| KeyCap glyph | keyboard key, mouse button, gamepad button (Xbox-style letters by default; PlayStation shapes if the pad id contains "054c") | Shows the CURRENT binding, never a hard-coded key. |
| Tabs | horizontal (drawers), vertical rail (book screens) | Q/E or LB/RB switch tabs inside book screens and drawers when no text field has focus. |
| Card | static, selectable, pinned | Inspect cards and slot cards. |
| Drawer | right-docked | 4.x panels. |
| BookScreen | left tab rail + page | Journal, Codex, Lineage, Settings, Save/Load. |
| Modal | confirm, prompt, text-export | Focus trapped; Esc = cancel. |
| AlertCard | info/notice/warning/critical; resolved; collapsed "+n more" | 6.2. |
| Tooltip | plain, rich (term + one-line definition + "Open in codex") | Never contains the only copy of essential information. |
| ProgressBar | determinate, staged (loading, founding readiness) | |
| Meter | single, stacked C/P (crop), reserve (queen) | |
| Sparkline | 72 x 20 dp, 3 game days | No axis; tooltip shows min/max. |
| Chart | line, stacked area | 7.8 graph rules. |
| StatusChip | ok/watch/warn/bad | Shape + word. |
| Badge | count | Max "99+". |
| ContextPrompt | action, teaching, compact (key only) | 5. |
| VirtualTable | sortable columns, filters, row actions | Roster (up to 2500 rows). |
| TreeView | lineage | Arrow-key navigation. |
| KeybindRow | listening, conflict, reset | 7.5. |
| Legend | per overlay | 10. |

---

## 3. Screen map and HUD

### 3.1 App flow

`boot` -> `title` -> (`new-game` | `save-load` | `lineage` | `settings` | `codex` | `credits`) -> `loading` -> playing (`hud` + views `possess` / `observer` / `colony` / `photo`; overlays `pause`, drawers, book screens, `timelapse-founding`, `timelapse-winter`) -> `epitaph` -> `title` or `lineage` or `new-game`.

Game modes from the contracts (`title | loading | playing | paused | epitaph`) map as: `pause`, book screens and `settings` opened in play set mode `paused` (simulation does not tick); drawers do not pause.

| Screen id | Tier | Pauses sim |
|---|---|---|
| `boot` | T1 | n/a |
| `title`, `new-game`, `loading`, `credits` | T1 | n/a |
| `hud` | T1 | no |
| `pause` | T1 | yes |
| `directives`, `roster`, `nest` (drawers) | T1 | no |
| `colony-health` (drawer) | T2 | no |
| `markers` (colony-view toolbar) | T1 | no |
| `journal`, `codex`, `lineage` (book) | T2 (codex breadth T3) | yes |
| `settings`, `save-load` (book) | T1 | yes |
| `epitaph` | T2 | n/a (game over) |
| `photo` | T2 | yes (time frozen) |
| `timelapse-founding`, `timelapse-winter` | T2 | no (the time-lapse is the sim running) |

### 3.2 Boot gate (`boot`, T1)

Purpose: obtain the first user gesture (audio, fullscreen) and show load progress of the shell.
Layout: full-screen dark (`#0E0C0A`), centred wordmark FOUNDRESS (`--t-display`), subtitle "A naturalistic ant colony sandbox" (`--t-body`, `--c-text-2`), below it "Click or press any key" (`--t-small`). Bottom-right: version string. Shell-asset progress as a 240 x 2 dp line under the subtitle.
Behaviour: first trusted `pointerdown` or `keydown` creates the audio context (13.1) and proceeds to `title`. Gamepad buttons do not count as a user activation in browsers; a gamepad press shows "Press any key or click to enable sound" and proceeds without audio after 1 real s. `?test=1` skips this screen.

### 3.3 Title (`title`, T1)

Layout (1280 x 720): background is a live render of a calm generated vignette (seed `TITLE_SEED`, Low quality cap, 3 idle ants, slow drift of 0.5 BU/s; replaced by a still frame at Low quality or with reduced motion). Left column x 96, y 200, width 360: wordmark (`--t-display`), subtitle, then a vertical menu with 44 dp rows: Continue, New colony, Load, Lineage, Codex, Settings, Credits. Bottom-left: storage status line if saving is unavailable (7.6). Bottom-right: version and "Assets: CC0, see Credits".

| Item | Content / action | Disabled when |
|---|---|---|
| Continue | Subtitle shows newest save: species, `Spring · Day 3 · Year 1`, population, real date. Loads it. | No saves or storage unavailable. |
| New colony | Opens `new-game`. | — |
| Load | Opens `save-load` on the Load tab. | — |
| Lineage | Opens `lineage`. | No lineage records (hidden, not disabled). |
| Codex | Opens `codex` (only unlocked entries + manual pages). | — |
| Settings | Opens `settings`. | — |
| Credits | Scrollable list generated from `public/assets/CREDITS.md` + fonts and libraries. | — |

Focus order: Continue (or New colony if Continue disabled) first, then down the list. Arrow keys / D-pad move; Enter / A activates; Esc does nothing on the title.

### 3.4 HUD (`hud`, T1; parts T2)

Regions at 1280 x 720 (x, y, w, h in dp; margins 16 dp):

| Region | Box | Content | Visible ("When relevant" rule) |
|---|---|---|---|
| Time cluster | 16, 16, 304, 56 | Line 1: season glyph + `Spring · Day 3 · Year 1` (`Day n` is the day of the season, GDD 06 `dayOfSeason`, 1..season length); line 2: clock `14:20`, sun/moon glyph, weather glyph + word, surface air temperature `21 °C`. Right part: speed control (5.1). Autosave indicator (14 dp save glyph) at the right edge while a save is in progress. | Always. |
| Focus line (T2) | 16, 76, 304, 24 | Current top aim, e.g. "Aim: find a sheltered place to dig". Click opens Journal > Aims. | During the first 2 game days of a new colony, then only when a new aim opens (shown 30 real s). |
| Colony pulse | 928, 16, 336, 56 collapsed; 336 x 208 expanded | Collapsed: overall status shape, `Workers 34`, `Brood 12 · 20 · 8` (egg · larva · pupa glyphs), `C 7.4 ↑`, `P 1.2 ↓`. Expanded (hover or keyboard focus): workers by task group with 4 mini bars (forage, nurse, dig, defend), queen state (`laying`, `founding`, `absent`), stores with 3-game-day sparklines, intake per game day, worst diagnostic line with "Why?" link. | Always (from first egg; before that it shows the queen's reserves only). |
| Alerts feed | 928, 84, 336, up to 208 | Up to 3 AlertCards (64 dp each, 8 dp gap); "+n more" chip opens the Journal event log. | When there is at least one card. |
| Possessed-ant panel | 16, 592, 304, 112 | 6.1. | While possessing. |
| Overlay legend | 16, above ant panel (or at 16, 608 when no ant panel), 304 x <= 96 | Legend of active overlay(s) (10). | While an overlay is on. |
| Context prompts | World-anchored (5); fallback 400, 664, 480, 40 | Action and teaching prompts. | While possessing and something is actionable. |
| Minimap (T2, default Never) | 1088, 528, 176, 176 | Top-down, north-up, 256 x 256 BU window around the camera target; zones as flat tints, entrances as rings, markers as icons, the possessed ant as an arrow, trails when scent view is on. Click: observer camera pans there. | Setting. |
| Edge pips | screen edges | Direction pips for off-screen critical alerts and, with sound-cue indicators on, for audible cues (12, sound-cue indicators). | When applicable. |

Trend arrows: computed by the UI from the stores time series: delta over the last 3 game h relative to the current value; `trend-flat` if |delta| < 2 %, `trend-up`/`trend-down` if 2-10 %, `-strong` variants beyond 10 %. Constant `TREND_WINDOW_GAME_H = 3`, `TREND_FLAT_PCT = 2`, `TREND_STRONG_PCT = 10`.

H hides all layer-A elements (critical edge pips remain). Hiding persists until H again; it is not saved. With the HUD hidden (H, photo mode excepted, or GDD 01 §6.6 ambient watch) only `critical` alerts show, as a single pinned card plus the edge pip; `notice` and `warning` alerts, milestone toasts and codex toasts go to the journal log only (their sounds follow `milestoneNotices`, 7.4). This keeps quiet observation quiet (seed pillar 6).

Milestone and codex notices follow the setting `milestoneNotices` (7.4): `full` (default: the `info` toast of 7.3 and 6.5 plus the milestone motif of 13.8), `quiet` (no toast; a 14 dp book glyph at the right edge of the time cluster for 30 real s and the motif at -12 dB), `off` (no toast, no dot, no motif). The journal always records every milestone and codex unlock, whatever the setting.

### 3.5 Pause menu (`pause`, T1)

Opened with Esc (gamepad Start). P is the speed pause (5.1) and does not open this menu.
Layout: modal backdrop `--e-3`; centred card 360 x auto at y 160; title "Paused" (`--t-h1`), current date line, then rows: Resume, Watch the colony (T3: closes the menu, restores the previous speed and starts GDD 01 §6.6 ambient watch), Save, Load, Settings, Journal, Codex, Controls (opens Settings > Controls), Return to title. Bottom: last-saved line "Saved 3 min ago (autosave)".
Rules: the simulation does not tick while open. Return to title asks to confirm when the last save is older than `UNSAVED_WARN_REAL_S = 60` real s ("Leave without saving? Progress since 14:20 will be lost." Save and leave / Leave / Cancel). Resume restores the speed in effect before opening. Focus starts on Resume.

### 3.6 Loading (`loading`, T1)

Layout: full-screen; centre-left a field plate (a still render or line sketch of the chosen species, 480 x 320); right column 400 dp: locality summary (archetype, size, seed code, season), a staged progress bar, current stage label, and a rotating field note (one sentence + source line, changes every `LOADING_NOTE_S = 8` real s, drawn from unlocked-or-basic codex facts). Bottom-right: Cancel.

| Stage (from worldgen pipeline) | Weight % |
|---|---|
| Zone layout | 5 |
| Heightfield | 15 |
| Large structures | 15 |
| Props and plants | 15 |
| Resources and creature territories | 5 |
| Rival colony sites | 5 |
| Pre-existing cavities | 10 |
| Validation | 5 |
| Terrain and cavity meshes | 15 |
| Textures, shaders, audio beds | 10 |

Failure handling: when validation fails and the generator retries, the label reads "Regenerating locality (attempt 2 of 5)" and the bar returns to the start of "Zone layout". If generation ultimately fails: message "This locality could not be completed." with buttons Try another seed (increments seed by 1) and Back. WebGL2 unavailable or context lost during load: "Your browser could not start 3D graphics." with a Try again button and a Settings > Graphics > Low shortcut. Cancel aborts generation and returns to `new-game` with all fields preserved.

### 3.7 New Game setup (`new-game`, T1; parts T2/T3)

BookScreen layout, 1120 x 640 centred; three columns.

| Column | Box (dp) | Content |
|---|---|---|
| Species | 80, 64, 360, 560 | Species cards stacked (each 360 x 128). Card: plate (turntable render, 0.1 rev/s, still with reduced motion), common name (`--t-h2`), binomial (italic), playstyle line, founding style, castes (icons), complexity (1-3 filled dots; Lasius 1, Messor 2, Camponotus 2, Atta 3). Species with `SpeciesDef.available` are selectable (T1: Lasius only). Species not yet released (GDD 07 §1 build and release order: Camponotus, then Messor, then Atta) are shown as greyed cards below the available ones with the label "Not yet available", not focusable and not selectable; a build may hide them entirely with the flag `showUnreleasedSpecies` (default on). |
| Locality | 456, 64, 360, 560 | Archetype list (radio cards 360 x 56): Woodland Edge, Suburban Garden, Playground Park, Car Park Verge, Kitchen Door, Random. Each shows zone chips (`forest`, `lawn`, ...) and a nesting-suitability word for the selected species (Good / Fair / Poor). Below: Size segmented (Compact 3000 / Standard 4000 / Large 5000 BU, default Standard), Seed field + Randomise button, Starting season segmented. T2: a 160 x 160 locality preview (zone layout only, recomputed 300 ms after the last change). |
| Rules | 832, 64, 360, 560 | Difficulty cards: Gentle / Naturalist (default) / Harsh, each with a two-line description. "Custom rules" expander (T3, see table). Hints toggle (default on). Big primary button "Begin" at the bottom (360 x 48). |

Season rules: options Natural (default: the species' natural founding day of GDD 06 §1.6, e.g. Lasius Summer 3 afternoon), Spring, Summer, Autumn (custom rule `startSeason`: the game starts on day 3 of that season, GDD 06 §1.6); Winter is shown disabled with tooltip "Queens do not found in frost." The Natural option's label shows the season from `SpeciesDef.foundingSeason` (Lasius: Summer, after the July-August flights; Camponotus: Spring; Messor: Autumn; Atta: Spring).

Seed: the field accepts any text up to 32 characters. An 8-hex-digit code (`4F7A21C9`, displayed `4F7A-21C9`, case-insensitive, hyphen optional) is used directly as a uint32; any other text is hashed with 32-bit FNV-1a. The resolved code is always displayed under the field. Randomise draws from `crypto.getRandomValues` (UI layer, outside the sim).

Custom rules (T3); the preset cards set these values, editing any value switches the selected card to "Custom":

| Rule | Options | Gentle | Naturalist | Harsh |
|---|---|---|---|---|
| Predators | Off / Few / Normal / Many | Few | Normal | Many |
| Rival colonies | 0-4 | 2 | 3 | 4 |
| Human activity | Off / Low / Normal / High | Low | Normal | High |
| Weather severity | None / Mild / Normal / Severe (GDD 06 §14.1) | Mild | Normal | Severe |
| Season length (game days) | 5 / 7 / 10 | 7 | 7 | 7 |
| Founding leniency | Lenient / Normal / Strict | Lenient | Normal | Strict |
| Nest collapse | On / Off (GDD 03 §12) | Off | On | On |

The semantics of these rules belong to the environment, ecology and progression chapters; this chapter only presents them. Difficulty can be changed mid-game from Settings > Gameplay (all rules except season length and rival count, which are fixed at generation).

Focus order: species cards, archetypes, size, seed field, Randomise, season, difficulty cards, Custom rules, Hints, Begin. Enter on Begin starts `loading`. Esc returns to `title`.

### 3.8 Lineage, Epitaph, Credits

Specified in 7.7 (Lineage), 7.8 (Epitaph) and 3.3 (Credits).

---

## 4. Colony management panels

### 4.1 Drawers (shared rules)

Right-docked, x 864, y 16, w 400, h 688 dp (compact: full width). Header 48 dp: title, status chip where relevant, close button. Opening a drawer hides the HUD right column (pulse and alerts move into a 40 dp strip at the top of the drawer showing the pulse one-liner and an alert count badge). Only one drawer at a time; opening another replaces it (`--m-standard` slide, fade in reduced motion). Drawers do not pause. Esc closes the drawer before anything else.

### 4.2 Directives (`directives`, key I, T1)

Available in any view (I). The queen is the entry point, not a requirement: while she is possessed after hand-over the possessed-ant panel shows "Colony orders (I)" and a context line offers the same (5.2; GDD 01 §2), and her inspect card has a "Colony orders" button (GDD 01 §10); the panel is equally reachable without possessing her (pillar 3: the player's leverage must not require a walk). Opening it from the queen keeps her possessed and changes nothing until a control is moved.

Panel title: "Colony orders" (screen id stays `directives`). Hovering or focusing the title's info glyph shows a rich Tooltip (2.7) "Ants have no commander. These orders stand for many local decisions; read why in the codex." with a link that opens codex entry `cx-interface-orders` (GDD 06 §10; GDD 02 §0.3 D10).

| Section | Controls | Data shown |
|---|---|---|
| Workforce | LinkedSliderGroup with 4 groups: Forage (`scout`, `forage`, `tend`, `cut`), Nurse (`nurse`, `queen-care`, `store`, `garden`, `mill`), Dig (`dig`, `haul`), Defend (`guard`, `patrol`). A species' `directiveTasks` (GDD 07 §3.14) appear as sub-share sliders inside their group (`setDirectives.taskShares`). `raid` (GDD 05) is never allocated by sliders. Each slider 0-100 % in steps of 5; sum fixed at 100 %. "Auto" toggle per colony (default on) lets the colony set targets from need; touching any slider turns Auto off. | Per group: target % (thumb), actual % (a thin tick under the track, from per-task headcounts), headcount. |
| Brood production | Segmented: Workers only / Balanced / Raise alates = `setDirectives.alateInvestment` 0 / 0.5 / 1.0 (GDD 06 §11.3; a fine slider 0-100 % under "More"), plus `alatePolicy` (auto-release / ask / hold) and, T3, `gyneShare`. Disabled with reason until the colony qualifies ("Alates need a mature colony in the right season"). Polymorphic species (T3): `casteEmphasis` slider −1..+1 (GDD 07 §2.6). | Current brood by destined caste. |
| Diet emphasis | Slider C <-> P (-100..+100, default 0 = colony decides). Auto toggle. | Current stores and 1-game-day intake of C and P; protein demand from larvae. |
| Nest | Nest architect: Auto / Suggest (T2) / Off (default Auto), sent as GDD 03 `setAutoExpand {nestId, mode}`. Seal entrances in cold weather (T2, GDD 03 §4.2 winter auto-seal): On / Off, sent as `setDirectives.sealInCold`. | Number of open architect plans. |

LinkedSliderGroup rule: when one slider moves by d, the unlocked others change in proportion to their current values so the sum stays 100 %; a slider can be locked (padlock IconButton) to exclude it; if all others are locked the moved slider cannot change. Each committed change (pointer up, or 300 ms after the last key step) sends one `setDirectives` command; directives apply at the next tick even while paused.

Edge cases: the colony has fewer than 4 workers -> show "Too few workers for priorities to matter" but allow edits. Queen dead -> Brood production shows "No queen: no new eggs" and is disabled.

### 4.3 Colony view, Marker tool and dig planner (`markers`, key M, T1)

Colony view is a strategic camera (directions A.3). Entering it from possession keeps the possessed ant in autonomy-paused-intent (the ant continues its current action under AI) and returns to it on M again.

Layout at 1280 x 720:

| Region | Box (dp) | Content |
|---|---|---|
| Marker palette | 360, 16, 560, 48 | 7 tool buttons in this order: `dig`, `forage`, `avoid`, `rally`, `entrance`, `move-brood`, `move-queen`, then Select (pointer). Shift+1..7 select tools. Each shows its icon, name on hover, and a count `3/8` of active markers versus the cap. |
| Overlay toggles | 16, 120, 48, 5 x 48 | Scent, Temperature, Moisture, Threats, Dig plans. |
| Cutaway control | 1216, 160, 48, 400 (moves to x 816 when a drawer is open) | Vertical slider from Surface (0) to the deepest carved point of the player's nests + 4 BU, step 1 BU; mode switch Off / Slice / X-ray (GDD 01 `cv-cutaway-mode`, G). R / F (GDD 01 `cv-slice-up` / `-down`) and, as secondary bindings, PageUp/PageDown or [ and ] move it. |
| Tool options | 360, 72, 560, 40 (appears under the palette) | Context options of the active tool (below). |
| HUD | Time cluster and pulse remain; possessed-ant panel hidden. | |

Camera in colony view (GDD 01 §6.7 owns the rig): WASD pan (speed proportional to height), Q/E rotate (90°/s while held), wheel zoom from 30 BU to 1500 BU (default 200), middle-drag orbit, Home recentres on the nest's main entrance.

Cutaway: **Slice** clips terrain, primitives and cavity meshes above a horizontal plane at depth d below the local ground surface; cavity walls cut by the plane get a cross-section cap in `#3A2A1E`, and the cut edge shows a 0.25 BU line in `--c-text-3`. **X-ray** renders the ground translucent (alpha 0.15, depth-faded) and all cavities as solid lit volumes, so the whole nest reads at once. Ants, brood and items inside cavities are drawn in both modes.

Tools:

| Tool | Placement | Options | Cancel / edit |
|---|---|---|---|
| `forage`, `avoid` | Click on any surface point; drag to set radius (10-80 BU, default 30; GDD 02 §12.2). | Radius; priority (normal / high) for forage. | Select tool + Delete; Ctrl+Z undoes the last placement or removal (stack of 10). |
| `rally` | Click surface or cavity point; radius 8-32 BU (default 15). | Mode: "Defend" / "Attack" (GDD 05 §3.7 `params.mode` `defend` / `attack`). | Same. |
| `entrance` | Click a surface point above an existing tunnel or chamber within 12 BU; shows a ghost shaft from surface to the nearest cavity; red ghost with reason if invalid ("Concrete cannot be dug", "Too far from the nest"). | — | Same. |
| `move-brood`, `move-queen` | Click a registered chamber in cutaway. Invalid targets show the reason ("Flooded", "Not connected"). | — | Same; only one active marker of each. |
| `dig` (dig planner) | 1 choose a template: Chamber (type: `nursery`, `food`, `rest`, `general`, `midden`, plus `granary` / `fungus` when the species has the module), Tunnel, Shaft (to surface), Entrance. 2 hover an existing cavity wall in cutaway: a ghost of the template appears anchored on the wall with its outward normal. 3 Q/E rotate the ghost about the wall normal in 15° steps (in this tool Q/E do not rotate the camera); wheel+Shift changes size (Small / Medium / Large = GDD 03 sizes `s` / `m` / `l`, read from the species template: Lasius long axis 8 / 12 / 16 BU); Tunnel: click start, click end, ghost follows a straight or 1-bend path. 4 click to place. | Template, size, priority (normal / high). | Plans are listed in the dig-plans overlay legend with status; select + Delete cancels (`cancelPlan`). |

Ghost validity colours use pattern as well as colour: valid = dashed `#F0E442` outline, invalid = cross-hatched `#D55E00` with reason text; reasons come from the nest chapter (`blockedReason`).

Dig plan states shown in the UI (data from `Nest.digPlans[].status`):

| Status | Visual | Entry | Exit |
|---|---|---|---|
| proposed (architect) | Dotted `#56B4E9` outline, label "Architect" | Architect creates a plan | Accepted automatically (Auto) or cancelled by player |
| queued | Dashed `#F0E442` outline | Player places, or architect plan enters queue | Diggers assigned -> active |
| active | Solid `#F0E442` outline, carved fraction filled | Diggers working | All spheres done -> complete; blocked -> stalled |
| stalled | Cross-hatched `#D55E00`, "!" glyph, reason line | Nest chapter sets `blockedReason` | Reason clears -> active |
| complete | Brief 2 real s outline fade | Done | Removed from overlay |
| paused | Dashed grey outline, pause glyph | Player pauses the plan (`pausePlan`) | `resumePlan` -> queued |
| cancelled | Outline fades out | `cancelPlan` | Removed from overlay |

Marker caps are owned by the markers chapter; the UI reads them from balance (`MARKER_CAP[kind]`) and shows `n/cap`; at cap, placement shows "Limit reached (8). Remove a marker first."

### 4.4 Colony health — the "why" view (`colony-health`, key Y, T2)

Purpose: readable causality (pillar 4). Data: the sim's `Diagnostic` records `{ id, system, status: 'ok'|'info'|'warn'|'bad', label, value, factors: {cause, weight, detail}[], remedies, sinceTick }`.

Drawer layout: header with overall status (worst of all). List of diagnostic rows (56 dp each), sorted bad -> warn -> ok, then by `sinceTick` (newest first). Row: status shape + word, label ("Brood growth"), value with unit ("0.6 of normal rate"), 3-game-day sparkline, "since Day 4, 09:00", chevron.

Expanded row (cause chain):

| Element | Rule |
|---|---|
| Factors | Ranked by weight; each shows a horizontal bar (width = weight, 0-100 %, label "60 %"), the cause text, and a detail line. Max 5 factors shown, rest under "Other (8 %)". |
| Chain | A factor whose `cause` refers to another diagnostic (e.g. "protein intake" -> `diag-food-intake-p`) gets a nested sub-list, indented 16 dp. Depth limit 3; cycles are cut at the first repeat. |
| Show | `jump-to` IconButton per factor with entity refs: the camera moves (`--m-scene`) to the entity or area, and the entities pulse with a 1 Hz outline for 4 real s (static outline with reduced motion). In possession view the jump switches to observer first. |
| Remedies | Each remedy renders as a link button. A remedy that maps to a UI control opens it with the suggested control highlighted (2 dp accent outline for 4 real s), e.g. "Raise Nurse to 30 %" opens Directives with the Nurse slider highlighted. Remedies never apply changes silently. |

Diagnostic subjects expected (every id carries the `diag-` prefix, GDD 06 scheme; the full registry is `00-index.md` §B): `diag-food-intake-c`, `diag-food-intake-p`, `diag-stores`, `diag-brood-growth`, `diag-egg-laying`, `diag-queen-condition`, `diag-nest-space`, `diag-nest-climate`, `diag-dig-progress`, `diag-workforce`, `diag-foraging-trails`, `diag-defence`, `diag-overwinter-readiness`, plus the presentation diagnostics of Appendix D. Statuses are `ok` ("Good"), `info` ("Note", never alerts), `warn` ("Strained") and `bad` ("Failing").

Wording of factors (pattern): `<cause in plain words> — <measured detail with unit>`. Example: "Nursery too cold — 14 °C, best 24-27 °C"; "Few nurses — 3 of 12 wanted".

### 4.5 Roster (`roster`, key L, T1)

Drawer with: quick buttons row ("A forager", "A digger", "A nurse", "The queen"; each possesses the nearest suitable living ant to the camera, disabled when none exists), filter chips (caste, task group, location: In nest / Outside), a search box (matches id number), and a VirtualTable.

| Column | Data |
|---|---|
| Ant | Caste icon + "Worker 0412" (id zero-padded to 4) |
| Age | game days, 1 decimal |
| Task | task icon + canonical task word (`forage` shown as "Forage") |
| Where | chamber type + id, or zone type outside ("Lawn") |
| Health | 48 dp bar |
| Crop | stacked C/P mini meter |
| Carrying | item word or "—" |
| Actions | Follow (observer camera follows), Possess |

Sort by any column (click header; keyboard: focus header + Enter). Rows are virtualised (row height 32 dp). The list updates at most 2 times per real second; sort order is stable between updates to avoid rows jumping under the pointer (a "Re-sort" chip appears when order is stale).
Brood summary footer: eggs, larvae, pupae with their destined castes.

### 4.6 Nest overview (`nest`, key U, T1)

Drawer with a schematic side elevation (368 x 300 dp canvas): chambers drawn as rounded rectangles at their real (horizontal distance along the nest's main axis, depth) positions, scaled to fit; tunnels as 2 dp lines between them; entrances as notches on the ground line; mounds as humps. Chamber fill uses its type icon and a 4-step occupancy shading (pattern dots density, not colour). Below: chamber table.

| Column | Data |
|---|---|
| Chamber | type icon + type word + id |
| Volume | in BU³, integer |
| Occupancy | ants / brood / food loads vs capacity (e.g. "14 / 30") |
| Temperature | °C, with comfort mark (within / outside the species' brood range) |
| Humidity | % RH |
| Risk | flooded / flood risk / dry / crowded (words + shapes) |

Actions: click a chamber -> colony view, cutaway at its depth, camera focused. Change type: Select with valid types (sends `designateChamber`); invalid choices (e.g. `granary` without the module) are not listed. Entrances list: open / sealed state, mound size, traffic per game h.

---

## 5. Play controls, possession and context prompts

### 5.1 Time controls (T1; next-event T2)

| Control | Key | Gamepad (T3) | Rule |
|---|---|---|---|
| Pause / resume | P | D-pad left hold 0.5 s | Orders, markers, directives and panels all work while paused. |
| 1x / 2x / 4x / 8x | 1 / 2 / 3 / 4 | D-pad left / right step | 8x disabled while possessing (button shows lock + tooltip "8x only while observing"). Possessing at 8x drops to 1x (directions A). |
| Next event | N | — | Runs at the highest allowed speed until an alert of level `notice` or higher is raised, a milestone is recorded, or `NEXT_EVENT_MAX_GAME_H = 24` passes; then returns to 1x. Disabled while possessing. |
| Auto-slow | — | — | Settings > Gameplay: on `critical` alert: Pause / Slow to 1x (default) / Off; on `warning`: Slow to 1x / Off (default). |

Speed buttons sit in the time cluster as a SegmentedControl of 6 icons (pause, 1, 2, 4, 8, next), 28 x 28 dp each.

### 5.2 Possessed-ant panel (T1)

Box 16, 592, 304, 112 dp.

| Row | Content |
|---|---|
| Identity | caste icon, "Worker 0412", age in game days, task word, behaviour state word ("returning home") |
| Health | bar with value; a `thermometer` warning glyph when body heat stress applies (from environment chapter) |
| Crop | stacked meter C and P against crop capacity, labels "C 0.6 · P 0.1" (loads) |
| Carrying | item icon + word ("soil pellet", "seed", "larva") or "—" |
| Species extra | formicines: acid reserve meter; founding queen: Reserves meter replaces Crop |
| Colony orders | queen after hand-over only: a ghost Button "Colony orders (I)" (KeyCap from the current binding) at the right of the Identity row; click or I opens Directives (4.2) without releasing her |
| Home | a 16 dp compass arrow toward the nearest own entrance (surface only) with distance in BU |

### 5.3 Context prompts (T1; teaching mode T2)

A prompt is a chip on `--c-scrim`: KeyCap + verb + object, e.g. `[E] Pick up crumb`, `[hold F] Dig`, `[G] Share food`. Anchored at the screen projection of a point 1.2 BU above the possessed ant's head, offset 48 dp up; clamped to 16 dp inside the viewport; when the anchor is off-screen or behind the camera the fallback box is used. Up to 3 action prompts stack vertically (8 dp gap), ordered by the action priority from the possession chapter. Prompts never take focus and never block input.

Prompt display setting (Settings > Gameplay > Prompts): Always / While learning (default) / Never. "While learning": a verb shows full text until it is learned (`HINT_LEARN_USES = 3` successful uses), then compact (KeyCap only, 60 % opacity).

### 5.4 Default bindings (all rebindable)

Directions A bindings are kept. Additions made by this chapter:

| Action | Key | Gamepad (standard mapping, T3) |
|---|---|---|
| Move | WASD | Left stick |
| Orbit camera | Mouse drag | Right stick |
| Zoom | Wheel | LB (held > 250 ms) + right stick vertical in possession and observer (a tap of LB is still previous ant); RT in / LT out in colony view |
| Interact | E | A |
| Dig (hold) | F | X (hold) |
| Toggle trail laying | R | D-pad up |
| Bite | Left click / Q | RT |
| Special (spray etc.) | Right click / C | LT |
| Antennate / inspect | T | Y |
| Share food | G | D-pad down |
| Let go / drop | Space | B |
| Release to observer | X | View (Back) tap |
| Cycle ant | Tab / Shift+Tab | RB / LB |
| Possess a forager / a digger / a nurse / the queen (quick keys, directions A) | 5 / 6 / 7 / 8 (GDD 01 §5.1; Shift+1..7 are the colony-view marker tools) | LB+X / LB+A / LB+B / LB+Y |
| Focus the alert feed | ` (backquote) | LB+View |
| Colony view | M | View hold 0.5 s |
| Scent view | V | D-pad left (possession), D-pad up (observer) |
| Overlay cycle (temperature -> moisture -> threats -> dig plans -> off) | O | — (colony-view buttons) |
| Pause / speeds / next event | P / 1-4 / N | LB+D-pad up / LB+D-pad right, left (step) / LB+left stick click |
| Hide HUD | H | LB+D-pad down |
| Quick save / quick load | F5 / F9 | — |
| Menu | Esc | Start |
| Directives / Colony health / Roster / Nest overview | I / Y / L / U (B is GDD 01 `cycle-target`) | via pause menu "Colony" submenu |
| Journal / Codex | J / K | via pause menu |
| Photo mode | F2 | LS+RS click together |
| Remind me of controls | ? (Shift+/) | via pause menu "Controls" |
| Dismiss teaching hint | Shift+H (Backspace is GDD 01 `possess-last`) | RB+View |
| Marker tools (colony view) | Shift+1..7 | — |
| Cutaway depth (colony view) | [ / ] and PageUp / PageDown | — |

Browser-reserved keys (F5, F9, F2, Tab, Backspace) call `preventDefault` only while the game canvas or HUD has focus and no text field is focused. If the browser does not deliver a key (some embedding hosts swallow F-keys), the action stays reachable from a menu.

---

## 6. Alert system (T1 feed; click-through T2)

### 6.1 Levels

| Level | Meaning | Toast | Sound (13.8) | Lifetime on screen | Auto-slow default |
|---|---|---|---|---|---|
| `info` | A notable event, no action needed (autosave done, chamber completed) | No toast; journal log only, except during the first game day when `info` toasts are shown for 6 real s | none | — | — |
| `notice` | Worth a look (new food source found, rain coming) | Yes | soft tick | `ALERT_NOTICE_REAL_S = 12` | none |
| `warning` | Something is going wrong (protein low, nest crowded) | Yes | two-note | until resolved, max `ALERT_WARNING_REAL_S = 30` then collapses to the "+n" chip | none (setting) |
| `critical` | Act now (queen attacked, nest flooding, possessed ant in lethal heat) | Yes, pinned | low three-note | until resolved or acknowledged | Slow to 1x |

### 6.2 Card anatomy and click-through

AlertCard 336 x 64 dp: status shape (left, 20 dp), title line (`--t-small` 600, max 48 characters), cause line (`--t-caption`, max 72 characters), right side: count badge ("x3") and `jump-to` button. Click anywhere on the card: opens Colony health with the linked diagnostic expanded (if `diagnosticId` is set) AND moves the camera to the alert's focus (entity or position) using the same rules as 4.4 Show. Right-click (or gamepad X while the card is focused): context menu with Acknowledge, Snooze this kind for 1 game day, Open in journal. Acknowledging a critical alert unpins it (it stays in the log).

Keyboard: the backquote key (`` ` ``, rebindable) moves focus into the feed (arrow keys move between cards, Enter opens, Shift+Enter opens the context menu, Esc returns focus to the game); gamepad: LB+View does the same (View hold is GDD 01 `colony-view`). Alt+number and Ctrl+number are never used (browsers reserve them for tab switching).

### 6.3 Throttling

The simulation owns raising and clearing (deterministic, game-time hysteresis per alert kind, defined by the owning chapter); the UI owns presentation throttling:

| Constant | Value | Rule |
|---|---|---|
| `ALERT_MAX_VISIBLE` | 3 | More cards collapse into "+n more". Order: level (critical first), then newest. |
| Dedupe key | `kind + ':' + subjectId` | A repeat of an active key updates the card (count, timestamp, cause line) without a new toast or sound; an escalation (level increase) re-toasts with sound. |
| `ALERT_COOLDOWN_GAME_H` | notice 3, warning 1, critical 0 | After a key clears, its next raise within the cooldown goes to the log only. |
| `ALERT_COOLDOWN_REAL_S` | 20 | Same key may not toast twice within 20 real s regardless of speed (prevents spam at 8x). |
| `ALERT_RATE_MAX` / window | 4 toasts per 30 real s | Excess toasts go to the log with the "+n" chip incremented. Critical alerts are exempt. |
| `ALERT_RESOLVED_REAL_S` | 4 | On clear, the card shows "Resolved" (ok shape) for 4 s, then leaves. |
| Snooze | 1 game day per kind | Session only (not saved). Snoozed kinds still log. Critical alerts cannot be snoozed. |
| HUD hidden | — | Only `critical` alerts show (one pinned card and an edge pip, 3.4); `critical` sounds still play; lower levels go to the log silently. |

### 6.4 Wording patterns

Title: `<Subject> <state>` in sentence case, present tense, no exclamation marks, no second person. Cause line: `<main cause> — <number with unit>` or `<where>`. Numbers always carry units.

Conflict wording (all player-facing text: alerts, inspect cards, journal, milestones, codex titles, epitaph; brief §1). Conflict between colonies is described as an ecological contest, never as a human institution. Rival relation states display as: `peace` "Neutral", `tension` "Wary", `skirmish` "Clashing", `war` "Territorial dispute", `truce` "Lull" (the ids, GDD 05 §3.7, are unchanged). Use "overcome" or "driven off", never "defeated" or "conquered"; "opponent" or "rival workers", never "enemy" or "soldiers" (except the caste term "major"); "boundary dispute" or "contest", never "war", "battle", "army", "victory" or "truce". Ids and code may keep their names; the rule governs display strings only.

### 6.5 Alert catalogue (presentation contract)

Kinds are canonical ids added by this chapter; the trigger conditions and hysteresis belong to the named owner chapter. The UI must handle unknown kinds by showing the event's `title`/`cause` strings as given.

| Kind | Level | Title / cause pattern | Focus | Owner |
|---|---|---|---|---|
| `queen-reserves-low` | warning | "Queen's reserves low" / "38 % left — founding chamber 21 °C" | queen | founding |
| `queen-in-danger` | critical | "Queen under attack" / "wolf spider, royal chamber" | queen | combat |
| `queen-died` | critical | "The queen has died" / "cause; colony is now orphaned" | corpse position | colony |
| `food-c-low` | warning | "Carbohydrate stores low" / "1.2 C — about 0.5 game days left" | food chamber | colony economy |
| `food-p-low` | warning | "Protein short for the larvae" / "18 larvae, 0.3 P stored" | nursery | colony economy |
| `brood-stalled` | warning | "Brood growth slowed" / "protein short; nursery 16 °C" | nursery | brood |
| `nest-crowded` | notice | "Nest crowded" / "general chamber at 140 % capacity" | chamber | nest |
| `nest-flooding` | critical | "Nest flooding" / "lower chambers taking water" | chamber | nest + weather |
| `dig-stalled` | notice | "Dig plan stalled" / reason from `blockedReason` | plan | nest |
| `trail-lost` | notice | "Trail broken" / "rain washed out the trail to the aphids" | trail midpoint | foraging |
| `source-found` | notice | "New food found" / "honeydew, 140 BU north-east" | source | foraging |
| `source-exhausted` | info | "Food source used up" / kind | source | ecology |
| `nest-attacked` | critical | "Nest under attack" / "rival workers at the east entrance" | entrance | rivals |
| `raid-seen` | warning | "Rival scouts near the nest" / count | position | rivals |
| `predator-near` | warning | "Predator near foragers" / creature kind | creature | ecology |
| `human-event-warning` | warning | "Ground is trembling" / "footsteps approaching the lawn" (pattern per human event kind) | event area | environment |
| `weather-change` | notice | "Rain coming" / "within 2 game hours" | none | environment |
| `heat-danger` | warning | "Surface too hot to cross" / "asphalt 52 °C" | area | environment |
| `possessed-danger` | critical | "Overheating" / "find shade — body 39 °C" (or "drowning", "pinned") | possessed ant | possession |
| `possessed-died` | warning | "Worker 0412 died" / cause; camera returns to observer | corpse | possession |
| `winter-coming` | notice | "Winter approaches" / "stores cover 6 of 7 days" | food chamber | environment |
| `alates-ready` | notice | "Winged queens and males are ready" / count | nest | reproduction |
| `flight-weather` | notice | "Flying weather" / "warm, light wind" | entrance | reproduction |
| `milestone` | info | "<milestone title>" / date | varies | progression |
| `save-failed` | warning | "Save failed" / "storage refused; use Export" | none | UI (12) |
| `storage-unavailable` | notice | "Saving unavailable here" / "export to keep this colony" | none | UI (12) |
| `audio-blocked` | info | "Sound is off" / "click anywhere to enable" | none | UI (14) |
| `colony-starving` | critical | "The colony is starving" / "stores empty; brood being eaten" | food chamber | colony economy (GDD 02 §5.7, S3) |
| `stores-full` | notice | "Stores are full" / "foragers are resting with full crops" | food chamber | colony economy (GDD 02) |
| `nest-collapse-risk` | warning | "Ceiling may collapse" / "dry sand, wide room" | chamber | nest (GDD 03 §12) |
| `entrance-breached` | notice | "A new opening" / "a tunnel broke through to the surface" | entrance | nest (GDD 03 §4) |
| `last-ants` | critical | "Only {n} ants remain" / cause | colony | progression (GDD 06 §13.4) |
| `garden-failing` | warning (critical when the last garden dies) | "Fungus garden failing" / state and cause | chamber | species module (GDD 07 §6.4) |
| `granary-spoiling` | warning | "Seeds are sprouting or rotting" / humidity | granary | species module (GDD 07 §6.3) |
| `wood-drying` | warning | "The nest wood is drying" / moisture % | nest site | species module (GDD 07 §6.2) |

---

## 7. Book screens and overlays of time

### 7.1 Book screen frame (T1/T2)

Centred 1120 x 640 dp (max 92 % of viewport), `--e-2`, vertical tab rail 200 dp on the left (tab rows 40 dp), page area 920 dp with 32 dp padding. Title in the rail head (`--t-h1`). Q/E (or LB/RB) switch tabs; Esc closes; opening pauses the sim, closing restores the previous speed.

### 7.2 Journal (`journal`, key J, T2)

| Tab | Content |
|---|---|
| Aims | "Current focus": up to 3 open aims (9.2), each with a one-line hint and an "Open codex" link; below, completed aims with dates. |
| Milestones | Horizontal timeline, one tick per game day, season bands shaded by season (with season glyphs, not colour alone); milestone pins with title; click a pin -> detail card with date, short description, optional thumbnail (captured automatically at the moment, 256 x 144 JPEG data URL, stored in the save; `MILESTONE_THUMBS_MAX = 40`). |
| Graphs | Chart page with a series picker: population by caste (stacked area), brood by stage (stacked area), stores C and P (lines), intake C and P per game day (lines), deaths by cause (stacked bars per day), nest volume (line), nest temperature vs surface (lines). Ranges: last 3 days / last 28 days (year) / all. |
| Event log | Rolling list of the last `EVENT_LOG_MAX = 200` entries (alerts of every level, milestones, possessions, deaths of named-role ants such as the queen); each row: time, level shape, text, `jump-to`. |

Graph rules: x axis in game days with season bands; y axis with units; series colours from the Okabe-Ito set (10.1) plus distinct dash patterns per series; hovering shows a vertical cursor and a value table; keyboard: arrow keys move the cursor by one sample. Data from the progression chapter's statistics time series (assumed hourly samples for the last 7 game days, daily samples for all time).

### 7.3 Codex (`codex`, key K; shell T2, breadth T3)

Layout: rail with categories: Species, Castes and anatomy, Behaviours, Creatures, Plants and food, Habitats and materials, Weather and seasons, Human activity, Interface (manual). Page: search box (filters titles and glossary terms), entry list (left 280 dp), entry page (right 600 dp).

Entry page: plate (512 x 288 dp: a generated render of the subject in a neutral studio setting, or a line drawing for behaviours), title (`--t-h2`), binomial if any, "Observed: Spring · Day 2 · Year 1" (or "Not yet observed"), Field note (2-4 sentences of real biology), Source line (`--t-caption`, citation as in the research dossiers), "In this colony" (1-2 sentences on the game rule), Related entries, and "Controls" (current bindings for related verbs, Interface entries only).
Locked entries show the title and a silhouette plate with "Not yet observed"; category headers show "12 / 30 observed".
Unlocks are triggered by the sim's `codex.unlocked` events (GDD 06 §10; Appendix C) and stored both in the save's progression state (`progression.codexSeen`) and in the profile (so entries stay unlocked across games). A new unlock shows a 4 real s `info` toast "Codex: Trophallaxis" with a book glyph; it does not pause.
Comfort mode applies to plates (spider entries use the chosen comfort rendering).

### 7.4 Settings (`settings`, T1 with T3 items)

BookScreen with tabs. Every change applies immediately and persists to `localStorage` key `foundress.settings.v1` (try/catch; if unavailable, settings last for the session and the Settings header shows "Settings cannot be stored in this browser context").

| Tab | Setting | Values (default) | Tier |
|---|---|---|---|
| Graphics | Quality preset | Auto / Low / Medium / High / Ultra (Auto) | T1 (Auto detection T3) |
| | Resolution scale | 50-100 % step 5 (100) | T1 |
| | Dynamic resolution | On / Off (On), target 60 or 30 fps (60) | T1 |
| | Depth of field | Off / Subtle / Full (Full at High+) | T1 |
| | Haze | On / Off (On) | T1 |
| | Shadows | Off / Low / High (preset) | T1 |
| | Grass and litter density | 25-100 % (preset) | T1 |
| | Field of view offset (possession) | GDD 01 `fovOffset` −10..+20° added to the per-state FOV (0) | T1 |
| | Fullscreen | button; shows "Not allowed here" when refused | T1 |
| Audio | Master, Ambience, Effects, Giant sounds, Interface, Music | 0-100 % (100, 80, 90, 90, 60, 50) | T2 |
| | Music | Off / Sparse / Frequent (Sparse) | T3 |
| | Distant voices (playground bed) | On / Off (Off). Off plays the voice-less synth murmur (13.7); On is opt-in and plays `playground_distant` only if that file passed the intelligibility check of 13.7, otherwise the option is hidden | T2 |
| | Mute when the tab is hidden | On / Off (On) | T2 |
| | Mono | On / Off (Off) | T3 |
| | Status line | "Sound running" / "Sound blocked by the browser — click to enable" | T2 |
| Controls | Keyboard binding table (7.5) | — | T1 |
| | Gamepad binding table | — | T3 |
| | Mouse sensitivity | 0.2-3.0 (1.0) | T1 |
| | Invert vertical look | On / Off (Off) | T1 |
| | Mouse look | Drag (default) / Captured (pointer lock; falls back to Drag when refused) | T1 |
| | Hold or toggle | per action: Dig, Antennate, Orbit-drag, Bite (Hold) | T3 |
| | Hold duration for hold-activated buttons | 300-1500 ms (600) | T3 |
| | Gamepad dead zone | 0.05-0.35 (0.15) | T3 |
| Accessibility | UI scale | 80-150 % step 10 (100) | T3 |
| | Text size | 100 / 115 / 130 % (100) | T3 |
| | Font | Standard / Hyperlegible | T3 |
| | High contrast | On / Off | T3 |
| | Reduced motion | System (follows `prefers-reduced-motion`) / On / Off (System) | T3 |
| | Camera horizon | Follow surface / Keep level (world-up lock) | T3 |
| | Camera shake and sway | 0-100 % (100; 0 when reduced motion) | T3 |
| | Spider comfort | Off / Softened / Abstract / Marker only (Off), live preview 320 x 180 | T3 |
| | Also apply to: mites, centipedes | toggles (Off) | T3 |
| | Overlay palette | Okabe-Ito / High contrast / Pattern only (Okabe-Ito) | T3 |
| | Sound-cue indicators | On / Off (Off) | T3 |
| | Flash reduction | On / Off (On) | T3 |
| Gameplay | Difficulty (mid-game change) | preset + rules except fixed-at-generation ones | T3 |
| | Prompts | Always / While learning / Never | T2 |
| | Hints and aims | On / Off; button "Reset hints" (confirm) | T2 |
| | Auto-slow on critical / warning | 5.1 | T2 |
| | Autosave interval | 2 / 5 / 10 real min / Off (5) | T1 |
| | Minimap | Never / Always (Never) | T2 |
| | Focus line | Auto / Always / Never (Auto) | T2 |
| | Milestone notices (`milestoneNotices`) | Full / Quiet / Off (Full); 3.4. The journal always records | T2 |

### 7.5 Keyboard rebinding (`KeybindRow`, T1)

Each action row: action name, primary binding, secondary binding, reset. Click a binding -> "Press a key (Esc to cancel)" listening state; mouse buttons and wheel are accepted for the actions that allow them. On conflict: inline message "D is already Move right. Swap / Cancel." Swap exchanges the two bindings. Some keys cannot be bound: Esc (menu fallback), F11/F12 (browser), and any key the browser does not deliver. Reset all to defaults (confirm). Bindings persist with settings. The context-sensitive layers (possession, observer, colony view, photo, menus) may reuse the same key in different layers; conflicts are checked within a layer and against the global layer (Esc, P, 1-4, H, F5, F9).

### 7.6 Save/Load (`save-load`, T1)

Tabs: Save (only in play), Load, Import/Export. Slots: `auto` (autosave ring of 3 generations, each labelled with its trigger, GDD 06 §15), `quick` and `slot-1`..`slot-5`. Quick save (F5) writes `quick`; quick load (F9) loads `quick` (or the newest `auto` generation if `quick` is empty) (confirm if unsaved > 60 real s).

Slot card (880 x 96 dp): thumbnail 160 x 90 (captured from the renderer at save time, JPEG q0.7 data URL), slot name, species binomial, archetype + seed code, `Summer · Day 5 · Year 2`, population, real date-time saved, play time, version. Empty slot card: "Empty".
Actions: Save here (overwrite confirm), Load (confirm if unsaved progress > 60 real s), Delete (danger, confirm), Export.

Export: build the `.foundress` binary (architecture: binary + gzip). Try download via Blob + `<a download>`; if the download throws, is blocked by sandbox flags, or the host is known to block it (`?nodownload=1`), open the text-export modal: a read-only TextArea (720 x 240 dp, JetBrains Mono 12) containing `FOUNDRESS1:` + base64 of the same bytes, a Copy button (`navigator.clipboard.writeText`; if refused, select-all and show "Press Ctrl+C to copy"), and the size in KB.
Import: file picker (`.foundress`); fallback/alternative "Paste text" TextArea that accepts the `FOUNDRESS1:` form. Validation order: header magic, format version (migrate if older, refuse if newer: "This save is from a newer version"), checksum, decode. Errors are shown inline in plain words; nothing is overwritten until the player picks a target slot or "Load now".

Storage unavailable (IndexedDB open fails or throws): Save tab shows "Saving to this browser is not available here. Use Export to keep your colony." and save buttons are disabled; Export and Import remain. Autosave is skipped silently except one `storage-unavailable` notice per session.
Save failure (quota or transaction error): `save-failed` alert; the previous generation stays intact (write to a temporary key, then swap).

Autosave triggers: every autosave interval of real play time (not counted while paused or in menus), on season change, immediately before a time-lapse starts, and on returning to title. Autosave never runs during the possession of an ant in combat (deferred up to 30 real s).

### 7.7 Lineage (`lineage`, T2)

Tree of colonies (TreeView, root at left). Node card (240 x 72 dp): species icon, archetype, founded date, fate (Living / Ended Year 3 · cause word), peak population, daughters count. Daughter nodes from nuptial flights are listed under their mother with state "Founded (unplayed)". Selecting an unplayed daughter enables "Found as this daughter": opens New Game with species locked to the daughter's species and a fresh seed derived from (mother seed, daughter index); other fields editable. Lineage records persist in the profile store (IndexedDB `profile`, with a localStorage fallback) independent of saves; deleting a save never deletes lineage.

### 7.8 Epitaph (`epitaph`, T2)

Entry: the sim reports no living ants of the player's colony (game over). The view fades to the last camera position held for 3 real s, then the epitaph page fades in (`--m-slow`).
Layout: full screen, centred column 720 dp. Heading (`--t-display`): binomial in italic. Lines: "<Archetype>, seed 4F7A-21C9"; "Founded Summer · Day 1 · Year 1 — ended Winter · Day 4 · Year 3"; a population-over-life chart (720 x 160, stacked area by caste, season bands); key figures row (peak population, ants reared, food gathered C and P, chambers dug, daughters founded); milestones list with dates; "How it ended": the final cause chain from the progression chapter, rendered as 2-4 indented lines (e.g. "The queen died, aged 2 years 31 days — wolf spider, royal chamber. / No eggs followed. / The last workers died of cold in winter."). Buttons: Lineage, New colony, Title. The record is added to the lineage automatically; the last autosave is kept so the player can still load an earlier state.
Queen death alone does not show the epitaph; it raises `queen-died` and the pulse shows "Orphaned".

### 7.9 Photo mode (`photo`, key F2, T2)

Entering freezes simulation time (mode `paused`), hides all HUD, keeps world animation frozen (render time stops; foliage wind and particles freeze) and starts a free camera at the current camera pose.

| Control | Input | Range / rule |
|---|---|---|
| Move | WASD, Q/E down/up | `PHOTO_SPEED_BU_S = 4`, Shift x5, Ctrl x0.2; collision keeps the camera `0.3 BU` from any surface; max `PHOTO_MAX_RADIUS_BU = 400` from the entry point |
| Look | drag (or captured mouse), right stick | — |
| Focal length | wheel | 24-200 mm equivalent; vertical FOV = 2·atan(12 / f) |
| Aperture | slider | f/1.4-f/22; `bokehScale = PHOTO_BOKEH_K / N` with `PHOTO_BOKEH_K = 9` (f/2.8 -> 3.2, the look-dev default) |
| Focus | click on scene sets focus distance by sphere trace; slider 0.5-200 BU; "Auto" follows the screen centre | — |
| Exposure | slider | -3 to +3 EV |
| Roll | slider | -45° to +45° |
| Look grade | segmented | Natural / Warm / Cool / Plate (desaturated sepia, slight vignette) |
| Guides | toggle | Rule-of-thirds lines (not captured) |
| Hide markers and outlines | toggle (on) | — |
| Capture | Enter / button | PNG at render size or 2x (2x only if within `MAX_TEXTURE_SIZE`); file name `foundress-<seed>-y<year>-<season>-d<day>-<hhmm>.png`; download fallback: open the image in a new tab, or show it in a modal with "Right-click to save" |
| Exit | Esc / F2 | Restores camera, view and previous speed |

Controls panel: 280 dp wide on the left, collapsible with Tab; hidden automatically during capture.

### 7.10 Time-lapse overlays (`timelapse-founding`, `timelapse-winter`, T2)

Both read `PlayerState.timelapse` (`{ kind, startTick, endTick, progress 0..1, stage, counters, interrupt }`, written by GDD 06's opening and overwinter systems) and send `skipTimelapse` / `timelapseRespond {interruptId, response: 'step-in'}` commands. Camera: a slow orbit (0.02 rev per real s) around the founding chamber or the main overwintering chamber in X-ray cutaway; with reduced motion the camera is static and the view crossfades between stills every 3 real s.

| Element | Founding | Winter |
|---|---|---|
| Caption (top centre, `--t-h2`) | "First brood" | "Overwintering" |
| Date line | advancing date | advancing date |
| Stage bar (centre bottom, 640 x 56) | egg -> larva -> pupa -> worker segments with counts under each icon | 7 day segments with temperature per day |
| Gauge (left) | Queen's reserves % (draining) | Stores C and P (draining) |
| Losses (right) | eggs eaten by the queen, brood lost | workers lost by cause (cold, starvation), brood lost |
| Controls | Skip (hold Enter or A for 600 ms; or click), Step in (only when the sim flags an interruption) | Skip, Step in |
| Outcome card (end) | "First workers: 4. Queen's reserves: 38 %." + Continue | "Winter survived. Lost 12 workers (cold 8, starvation 4). Stores used: 9.4 C, 1.1 P." + Continue |

Step in: appears for `TIMELAPSE_INTERRUPT_REAL_S = 10` real s when the sim raises an interruption (damp spell, intruder); choosing it pauses the time-lapse and returns to normal play at 1x with a HUD chip "Resume time-lapse". If ignored, the time-lapse continues and the sim resolves the interruption itself. Skipping must yield the same outcome as watching (the UI never computes outcomes). Target real durations: founding `TIMELAPSE_FOUNDING_REAL_S = 75`, winter `TIMELAPSE_WINTER_REAL_S = 45`; how the sim fills that time (ticking or analytic resolution) belongs to the founding and environment chapters.

---

## 8. Input navigation for menus (T1 keyboard, T3 gamepad)

| Context | Keyboard | Gamepad |
|---|---|---|
| Move focus | Tab / Shift+Tab between groups; arrow keys within a group (roving tabindex) | D-pad / left stick: spatial navigation to the nearest focusable in that direction |
| Activate | Enter / Space | A |
| Back / close | Esc | B |
| Switch tabs | Q / E (no text field focused) | LB / RB |
| Scroll / page | PageUp / PageDown | LT / RT |
| Secondary action (e.g. Possess in Roster, Why? on a pulse row) | Shift+Enter | X |
| Tertiary action (e.g. Follow) | Ctrl+Enter | Y |

Rules: every screen has a defined initial focus (listed per screen); focus is restored to the opener when a drawer, modal or book closes; focus never lands on hidden elements; the HUD is not in the tab order during play; the alert feed is entered with the backquote key (6.2) and the speed control is operated by its keys (5.1). All interactive elements have accessible names; panels are ARIA landmarks; live regions announce new `warning` and `critical` alerts politely.

---

## 9. Onboarding without dialogue (T2)

### 9.1 Principles

Teach by doing, in the order the queen's body needs the verbs. One teaching prompt at a time. Prompts never block, never pause, never take focus. Aims are naturalist questions in the journal. The codex explains; it never interrupts.

Hint lifecycle: `pending` -> (trigger true for `HINT_DELAY_REAL_S`) -> `shown` -> learned (completion condition met `HINT_LEARN_USES` times, default 3 unless stated) or dismissed (Shift+H / gamepad RB+View / Settings > Hints off; Backspace is GDD 01 `possess-last`) -> never shown again. Hint state is stored in the profile (`foundress.profile.v1.hints`) so it persists across colonies and is mirrored into the save. "Reset hints" clears it. A shown hint that is not completed within `HINT_IDLE_REAL_S = 60` fades to compact form; after another 120 real s without completion it returns to full form once. While a critical alert is active, teaching prompts are suppressed. At most `HINT_MAX_PER_MINUTE = 2` new teaching prompts per real minute.

### 9.2 First 15 minutes (Lasius niger; claustral founding)

Times are targets for a first-time player at 1x.

| # | Hint id | Trigger | Prompt (KeyCap from current binding) | Completes when | Aim opened / closed |
|---|---|---|---|---|---|
| 0 | — | Game start | Intro card, 6 real s, centred, no input needed: "*Lasius niger* · Suburban Garden · Summer · Day 3" (the natural founding day, GDD 06 §5.3). Fades on any input. | — | opens `aim-find-site` |
| 1 | `hint-move` | 2 real s without movement | `[W A S D] Walk` | 3 real s of cumulative movement | — |
| 2 | `hint-look` | `hint-move` learned and no camera drag for 5 real s | `[Drag] Look around` | 2 drags | — |
| 3 | `hint-antennate` | 10 real s after start, on diggable ground | `[T] Antennate the ground` | 2 uses (a site assessment card appears each time) | — |
| 4 | `hint-dig` | A site assessment was shown and the queen faces diggable substrate | `[hold F] Dig` | Shaft depth >= founding minimum (founding chapter) | closes `aim-find-site`, opens `aim-dig-chamber` |
| 5 | `hint-readiness` | Digging started | No glyph: the founding readiness bar (shaft depth + chamber volume, 240 x 8 dp, under the possessed-ant panel title) appears and stays until sealed | Readiness 100 % | closes `aim-dig-chamber`, opens `aim-seal` |
| 6 | `hint-seal` | Readiness 100 % and queen inside the chamber | `[E] Seal the entrance` | Entrance sealed | closes `aim-seal`, opens `aim-first-clutch` |
| 7 | `hint-lay` | Sealed | `[E] Lay eggs` | First clutch laid (1 use) | — |
| 8 | `hint-timelapse` | First clutch complete | Time-lapse begins; Skip control visible | Time-lapse ends | closes `aim-first-clutch`; at end closes `aim-first-workers` |
| 9 | `hint-cycle` | First nanitic exists | `[Tab] Next ant` | 2 uses | opens `aim-nest-open`, `aim-first-food` |
| 10 | `hint-observer` | `hint-cycle` learned | `[X] Watch the colony` | 1 use | — |
| 11 | `hint-pickup` | Possessed worker within reach of a carriable item | `[E] Pick up <item>` | 3 uses | — |
| 12 | `hint-trail` | Possessed worker outside carrying food | `[R] Lay a trail home` | 2 uses | — |
| 13 | `hint-share` | Possessed worker with crop > 0 meets a hungry nestmate | `[G] Share food` | 2 uses | — |
| 14 | `hint-colony-view` | First food delivered | `[M] Survey the colony` | 1 use | closes `aim-first-food`, opens `aim-first-trail` |
| 15 | `hint-marker` | In colony view for the first time | Palette pulses once (static outline in reduced motion); chip `[Shift+1] Plan a chamber` | First marker or dig plan placed | opens `aim-second-chamber` |
| 16 | `hint-speed` | 30 real s with no alert active and not possessing | `[1-4] Change speed` | 2 speed changes | — |
| 17 | `hint-scent` | First trail exists | `[V] Scent view` | 1 use | — |
| 18 | `hint-why` | First diagnostic turns `warn` | `[Y] Why?` chip attached to the pulse's worst line | 1 use | — |
| 19 | `hint-directives` | First possession of the queen after hand-over (GDD 01 §2); fallback 3 game days after first workers if she has not been possessed | `[I] Colony orders` (attached to the possessed-ant panel's "Colony orders (I)" button when the queen is possessed; otherwise a chip by the time cluster) | Directives opened once (1 use) | — |

Aims (journal "Current focus", max 3 open, oldest first):

| Aim id | Text | Done when |
|---|---|---|
| `aim-find-site` | Where is the ground sheltered, warm and diggable? | Founding shaft started |
| `aim-dig-chamber` | Dig a chamber for the first brood | Readiness 100 % |
| `aim-seal` | Close the nest against the outside | Entrance sealed |
| `aim-first-clutch` | Lay the first eggs | First clutch laid |
| `aim-first-workers` | Raise the first workers | First nanitic ecloses |
| `aim-nest-open` | Open the nest again | An entrance is reopened |
| `aim-first-food` | Bring food home | First delivery |
| `aim-first-trail` | Where does the food lie, and can others follow? | Milestone "first trail" |
| `aim-first-protein` | The larvae need protein. Where can it be found? | First P delivery (opens when larvae > 0 and P stores < 0.5) |
| `aim-second-chamber` | Make room for a growing brood | Chamber count >= 2 |

After hand-over GDD 06 §5.13 opens its own aims (`aim-first-food`, `aim-second-chamber`, `aim-first-protein`, `aim-first-trail`, `aim-stores-winter`, `aim-midden`, the species aims `aim-nest-open`, `aim-garden`, `aim-satellite`, `aim-trunk-trail`, and the continuing aims for growing and mature colonies `aim-second-entrance`, `aim-cross-zone`, `aim-herd`, `aim-alates`, `aim-flight`; at most 3 are shown at once, oldest first, the rest wait); the union of both tables is the aim id set (`00-index.md` §B). Species variants (T3): Camponotus replaces `aim-find-site` with `aim-find-wood` ("Where is the wood soft and damp?"); Atta adds `aim-plant-garden` ("Plant the fungus brought from the mother nest") before `aim-first-clutch`; Messor replaces `aim-find-site` text with "Where is the ground open, dry and deep?". New aims follow the same table format in the species chapters.

### 9.3 Site assessment card (T1 data, T2 presentation)

Shown for 6 real s (or while T is held) beside the queen: rows Diggability, Moisture, Warmth, Cover, Flood safety, Rival scent, Exposure (the seven factors of GDD 06 §5.7), each as a 5-step dotted scale with a word (e.g. "Moisture ●●●○○ damp"), plus an overall word (Poor / Fair / Good / Excellent). Values from the founding chapter's site evaluation.

### 9.4 Codex as teacher (T2 entries)

Each entry unlocks on observation and adds a toast. Codex ids are GDD 06 §10's `cx-*` ids (consistency pass). Minimum T2 set and triggers: `cx-species-lasius-niger` (game start), `cx-claustral-founding` (seal), `cx-brood-stages` (first pupa; one entry covers egg, larva and pupa), `cx-callow` (first eclosion), `cx-antennation` (first T), `cx-trophallaxis` (first observed or performed), `cx-trail-pheromone` (first trail), `cx-route-memory` (first breadcrumb retrace of possessed ant), `cx-necrophoresis` (first corpse to midden), `cx-nursing` (first larva fed), `cx-honeydew`, `cx-aphid-tending`, `cx-springtail`, `cx-material-loam`, `cx-habitat-<zone>` (first entry into each zone type), `cx-raindrops` (first rain hit), `cx-footfall` (first footsteps survived), `cx-interface-why`, `cx-interface-markers`, `cx-interface-time`, `cx-interface-orders` (first `setDirectives` or marker, or the Directives title tooltip link, 4.2: "Orders without a commander", GDD 06 §10). Interface entries are always unlocked and form the manual, except `cx-interface-orders`, which unlocks on first use so that its toast arrives when the player first gives an order.

---

## 10. Overlays (T2; alternative palettes T3)

### 10.1 Palette

Default overlay palette: Okabe-Ito (colour-universal): orange `#E69F00`, sky blue `#56B4E9`, bluish green `#009E73`, yellow `#F0E442`, blue `#0072B2`, vermillion `#D55E00`, reddish purple `#CC79A7`, black `#000000`. Every channel also has a unique pattern and motion so hue is never required.

| Overlay | Key | Data source | Encoding (default palette) | Pattern / motion (always present) | Legend |
|---|---|---|---|---|---|
| Scent view `scent` | V | pheromone field, player colony; rival colonies' channels | `trail` orange; `home` sky blue; `alarm` vermillion; food odour (source plumes) bluish green; rival channels reddish purple outline | trail = chevrons flowing along the gradient toward the source at 2 BU/s (static chevrons in reduced motion); home = sparse dot stipple; alarm = zigzag rings expanding (static double ring in reduced motion); food odour = concentric thin rings; rival = diagonal hatching over the same glyphs | channel name + glyph sample + "intensity: opacity and density" |
| Temperature `temperature` | O cycle | surface and cavity temperature (environment chapter) | diverging: `#0072B2` (cold) -> `#F2EFE6` (species optimum) -> `#D55E00` (hot) | isotherm contour lines every 5 °C with labels every 10 °C | scale bar with °C ticks and the species' comfort band marked |
| Moisture `moisture` | O cycle | soil moisture and cavity humidity | sequential `#F3E3C3` (dry) -> `#56B4E9` -> `#0072B2` (saturated); flooded voxels solid `#0072B2` + wave hatching | contour lines at 25 / 50 / 75 % | scale bar |
| Threats `threats` | O cycle | creatures' territories, antlion pits, rival territories, hot surfaces, scheduled human events | predator areas: vermillion hatching + creature icon; rival territory: reddish purple outline; hot surface: orange stipple; human event forecast: dashed white outline + countdown label "in 2 h" | each threat class has its own pattern | list of active threats |
| Dig plans `dig-plans` | O cycle (and always on in colony view while the dig tool is active) | dig plans | per 4.3 status table | per 4.3 | plan list with status and reason |

Alternative palettes (Settings > Accessibility): High contrast (all channels white or `#FFD400` on darkened scene, patterns carry identity); Pattern only (monochrome `--c-text`, patterns only). Overlays darken the scene by 25 % (`OVERLAY_SCENE_DIM = 0.25`) to raise contrast. Only one of temperature / moisture / threats / dig plans is active at a time; scent can combine with any one of them.

### 10.2 Inspect cards (peek)

| Card | Fields | Tier |
|---|---|---|
| Ant | caste, id, age, task, state, target ("aphid herd #23"), carrying, crop C/P, health; "Last decisions" list of up to 5 entries with reason words ("following trail: stronger than remembered route"); buttons Possess, Follow | T1 (last decisions T2) |
| Brood | stage, destined caste, progress %, hunger, chamber | T1 |
| Chamber | type, volume, occupancy vs capacity, temperature, humidity, flood risk | T2 |
| Food source | kind, nutrient (C/P), amount, renewal, discovered state, ants using it, guarded/tended | T2 |
| Creature | kind (comfort-mode name for spiders), state word ("hunting"), threat level, codex link | T2 |
| Marker / dig plan | kind, radius or template, status, reason, remove | T1 |

Cards are 280 dp wide, placed beside the target's screen projection on the side with more room, never covering the target. Foreign ants and rival colonies show their relation with the display words of 6.4 ("Neighbouring colony 2 · Wary"; ids `peace`, `tension`, `skirmish`, `war`, `truce` are never shown), and every card, codex page and journal line follows the conflict wording rule of 6.4.

---

## 11. Art direction

### 11.1 The look

Macro photography of a real place: a lens close to the ground, shallow depth of field, warm daylight, air you can see. Everything is at true scale in millimetres; the camera behaves as a 100 mm macro lens at the ant's eye height, so the world looks the way a patient photographer lying in the grass would see it.

| Constant | Value | Notes |
|---|---|---|
| `LOOK_CAMERA_HEIGHT_BU` | 1.5-4 (possession), 30-600 (colony view) | — |
| `LOOK_DOF_FOCUS` | distance camera -> possessed ant (observer: -> followed entity; otherwise screen-centre sphere trace, eased over 300 ms) | Instant in reduced motion |
| `LOOK_DOF_RANGE` | 0.6 x focus distance | |
| `LOOK_BOKEH` | Low 0 (off), Medium 2.0 at half res, High 3.2 at half res, Ultra 3.2 full res | matches the tech spike default |
| `LOOK_TONEMAP` | ACES Filmic | tech spike |
| `LOOK_VIGNETTE` | offset 0.28, darkness 0.5 (0.62 in photo "Plate") | |
| `LOOK_BLOOM` | threshold 0.9, intensity 0.6 (dew, wet highlights, sun through blades only) | |

### 11.2 Light by time of day (surface)

Lighting is driven by sun elevation from the environment chapter, not by the clock.

| Sun elevation | Sun colour (approx. K / hex) | Sun intensity (relative) | Sky ambient | Haze colour | Exposure |
|---|---|---|---|---|---|
| > 30° (day) | 5600 K `#FFF4E5` | 1.0 | `#9DB4CC` at 0.35 | `#D9DEE2` | 0 EV |
| 6-30° (low sun) | 4200 K `#FFE2BF` | 0.8 | `#A9B4C0` at 0.30 | `#E8D9C4` | 0 |
| -6-6° (dawn, dusk) | 3000 K `#FFC08A` | 0.45 | `#7E8AA6` at 0.25 | `#E3B98F` | +0.3 |
| < -6° (night) | moon 7500 K `#C9D6FF` | 0.06 | `#28324A` at 0.15 | `#1E2433` | +1.2 (night must stay readable; ants get a faint cool rim light 0.15) |

### 11.3 Palette and light per habitat

| Zone | Dominant palette (hex) | Light character | Haze visibility `HAZE_VIS_BU` (63 % extinction) |
|---|---|---|---|
| `forest` | humus `#3B2C20`, litter ochre `#8A6A3E`, moss `#5B6B2E`, bark `#4A3B2E` | Dappled: a moving leaf-shadow pattern on the sun light (period 4-8 real s, amplitude 0 in reduced motion); cool green bounce | 220 |
| `lawn` | blade green `#5E8A3A`, thatch `#9C8B5A`, soil `#4A3A2A` | Blades translucent when backlit (subsurface tint `#B7D46A`); bright and airy | 300 |
| `garden-bed` | loam `#3E2F24`, mulch `#6B4A30`, flower accents sparse (one hue per bed) | Warm; flowers glow when backlit | 280 |
| `pavement` | flag grey `#A39E95`, joint sand `#B59B72`, lichen `#9FA46A` | Hard light, crisp shadows, warm bounce from stone | 400 |
| `asphalt` | charcoal `#2E2D2B`, aggregate `#6E6A64`, paint line `#D8D3C4` | Glare at low sun; heat shimmer (screen-space distortion near surfaces > 45 °C, off in reduced motion) | 450 (250 in heat) |
| `sand` | play sand `#CDB58A`, damp sand `#9E8460` | High bounce, low contrast, bright | 380 |
| `rubber` | muted red `#7A3B32`, black `#232220` | Matte, hot-looking | 380 |
| `interior` | tile `#D8D2C4`, floor wood `#8B6544`, plinth shadow `#1B1714` | Warm tungsten 2700 K `#FFB46B` from above; window daylight shaft; fridge kick-space glow cool `#BFD4E6` at 0.1 | 600 |

### 11.4 Weather looks

| Weather | Look |
|---|---|
| `clear` | As 11.2. |
| `overcast` | Sun intensity x 0.35, shadows soft (penumbra x 4), contrast lower, haze +20 % denser. |
| `rain` | Wet darkening: albedo x 0.7, roughness x 0.4 on exposed surfaces; drop impacts as small crown splashes; droplets bead on leaves; puddles in hollows (flat reflective). |
| `storm` | Rain look + sky darkening (exposure -0.7 EV); lightning as a soft sky brightening of at most +1.5 EV over 150 ms, max 1 per 4 real s; with Flash reduction on, +0.5 EV over 400 ms. Never a full-screen white flash. |
| `heat` | Bleached highlights, haze warmer `#EADBC0`, shimmer near hot surfaces, curled leaf edges. |
| `frost` | Rime sparkle on blades and leaf edges (small specular points), desaturation 30 %, blue shadows `#5A6E8C`, breath-like still air (no wind sway). |

### 11.5 Underground

Dim and warm, "scent-lit". There is no physical light underground; the game uses an explicit abstraction: a soft "sense light" centred near the camera (warm `#FFB775`, radius 12 BU, falloff squared) plus an ambient `#2A1F17`. Fog `#1E1712` with visibility 30 BU. Daylight shafts fall 3-4 BU into tunnels from open entrances during the day. Scent motes: sparse drifting particles (0.05 BU, 1 per 8 BU³ near traffic), colourless by default and tinted by channel only in scent view. Chamber walls show soil strata and root ends; freshly carved walls are darker and damper-looking for 1 game h.

### 11.6 Materials

| Subject | Notes |
|---|---|
| Ant cuticle | Glossy chitin: base roughness 0.35, clearcoat 0.6 with clearcoat roughness 0.2; fine erect hairs as a soft rim term on legs and scapes; Lasius dark brown-black with a greyish sheen; Camponotus dull black with whitish gaster hairs; Messor black with reddish-headed majors (unverified tint, keep subtle); Atta rust-brown, matte, spiny. Callow workers render pale amber and darken to full colour over `CALLOW_DARKEN_GAME_H = 6` (Lasius callows harden over 3-4 days; compressed). |
| Brood | Eggs: translucent white ellipsoids, slight subsurface. Larvae: creamy, segmented, matte-moist. Pupae: Lasius and Camponotus in tan silk cocoons; Messor and Atta naked (myrmicines), pale and sculpted. |
| Soil | Loam with visible grain at 0.1 BU; wet soil darker; pellets match source substrate colour. |
| Water | Droplets: high specular, refraction approximated by screen-space offset; surface tension rounding at edges; ants carrying a droplet in mandibles show it as a bead. |
| Human objects | Real material textures at true scale: concrete grain is coarse boulders to an ant; painted metal flakes; rubber has crumb granules the size of an ant's head. No logos, no text, no brand marks anywhere. |
| Plants | Translucent leaves when backlit; stems with fine hairs on some species; aphids soft green or black with cornicles visible at close range. |

### 11.7 Selling the scale

- Depth of field and haze calibrated in millimetres, never in "human" metres.
- Human artefacts enter from out of frame and are never shown whole: a shoe sole, a tyre tread, a broom head, a mower deck, a watering-can spout. They move slowly relative to their size and cast huge soft shadows first.
- Dust and soil grains drift in light shafts; dew drops are boulders of water.
- Everyday textures (paving, tile grout, asphalt aggregate) are recognisable at the wrong size.
- Sound (13) carries weight: giant events are low, slow and felt.

### 11.8 Never in the game

Faces with expressions, pupils or eyebrows on any creature; humans or human body parts other than footwear soles; speech, text bubbles, emoji-like icons; cartoon outlines, cel shading, saturated "power-up" colours, glowing collectibles, floating numbers; health hearts, coins, XP; blood-red gore (haemolymph is colourless to pale yellow; corpses do not splatter; dead bodies stay intact and are carried); brand names or logos; full-screen white flashes; anything recognisable from another game's art, UI layout, logos or music (seed section 0). Recorded beds must contain no discernible speech: human activity is heard only as unintelligible distant texture (13.7 checklist), and any voice-bearing recording is opt-in (Distant voices, off by default).

### 11.9 Animation (T1 ants; T2 creatures, brood and alates)

Ants and creatures are animated procedurally (seed §4; architecture: ants instanced with vertex-shader animation). There are no authored skeletal clips, no keyframed animation files and no motion capture.

| Rule | Specification |
|---|---|
| Body | One procedurally built, anatomically plausible mesh per species × caste × size class (GDD 07 §3.15 `appearance`), drawn instanced. Legs, antennae, mandibles, gaster and (alates) wings are animated in the vertex shader. |
| Per-instance attributes | Written by the render layer each frame from the sim snapshot: gait phase, speed, pose id, carried item kind, colour (including callow darkening, 11.6), plus heading and surface normal. The gait phase advances with distance walked (tripod gait: two alternating leg triplets), so feet do not slide at any speed or time scale; antenna sweep rate follows the behaviour state (fast while searching or antennating, slow at rest). |
| Pose ids | The `pose.*` ids of GDD 01 §7.3 (`pose.walk`, `pose.hurry`, `pose.grip`, `pose.fall`, ...) are blend targets: the shader blends from the current pose to the requested one over 80-150 ms, and gait is layered on top. An unknown pose id falls back to `pose.walk` (logged once in dev). |
| Creatures | Same method: procedural meshes and vertex-shader gaits (spiders 8 legs, alternating tetrapods; caterpillars and earthworms peristaltic waves; aphids mostly still with slow leg and cornicle motion). Spider comfort variants (12) swap mesh and gait, never the sim. |
| Brood, items | Larvae show a slow peristaltic flex and a begging head-lift when hungry; pupae and eggs are static; carried items are attached to the mandible socket of the carrier's pose. |
| Level of detail | Beyond about 60 BU from the camera, leg and antenna motion reduce to a two-frame shimmer; beyond about 250 BU ants are impostors without limb motion. Thresholds scale with the quality preset (Low halves them). |
| Reduced motion | No camera bob or sway; ants keep their real gaits (they are information), but idle antenna flicks and larval begging motion are damped to half amplitude; wing flutter of alates in the nest is shown as a still pose. |
| Determinism | Animation is presentation only: render never writes sim state, and nothing in the sim reads animation phase. A test run with `quality=low` and the same seed produces the same sim results whatever is drawn. |

---

## 12. Accessibility requirements (summary; T3 unless marked)

| Requirement | Rule |
|---|---|
| Contrast (T1) | Text tokens >= 4.5:1 over the worst-case panel; UI component boundaries and focus ring >= 3:1 (2.1). Text on the 3D scene always sits on `--c-scrim`. |
| Focus (T1) | Visible focus on every interactive element; logical order (8); initial focus defined per screen; restore on close. |
| UI scale | 80-150 %; text size 100-130 % separately; layout modes (2.3). |
| Reduced motion | UI fades only; no camera bob, shake or sway; DOF focus changes instant; heat shimmer, leaf dapple motion and haze parallax off; scent chevrons static; time-lapses crossfade stills. |
| Spider comfort | Off; Softened (no hair, eyes not detailed, leg motion amplitude 50 %, never auto-framed by the camera); Abstract (legless smooth ovoid body, same size, shadow and hazard ring); Marker only (no body: a ring on the ground with the label "Spider"). Applies to `jumping-spider`, `wolf-spider`, `ant-spider` in world, plates, codex and photo mode; optional for `mite` and `centipede`. Behaviour and sound unchanged. |
| Remapping (T1 keyboard) | All actions; conflict handling (7.5); gamepad remapping T3. |
| Hold-to-toggle | Per action (Dig, Antennate, Orbit-drag, Bite, Skip hold); hold duration setting. |
| Pause anywhere (T1) | P works in every play view; orders work while paused. |
| Information not by colour alone (T1) | Shapes, words, patterns (2.6, 10.1). |
| Sound cues | No speech, so no subtitles; information-bearing sounds (tremor warning, alarm, drumming, nest crackle, rain onset) have visual equivalents: edge pips with an icon when "Sound-cue indicators" is on, and diegetic visuals always (dust shiver before a footfall, alarm posture). |
| Photosensitivity (T2) | No more than 3 flashes per second; lightning per 11.4. |

---

## 13. Audio design (T2; music T3)

### 13.1 Engine and the gesture rule

- One `AudioContext`, created inside the first trusted `pointerdown` or `keydown` handler (boot gate, or any later gesture if the first failed). `?test=1` never creates it.
- After `resume()`, if `state !== 'running'` within 1 real s, audio status = `blocked`; retry on each of the next 3 gestures; then stop trying until the player presses the Settings > Audio status button. The game is fully playable silent; the audio module is a no-op facade when blocked or unsupported.
- Asset loading: SFX (small) are fetched and decoded after the context starts; ambience beds are decoded on demand with at most `AUDIO_BEDS_RESIDENT = 4` decoded at once (LRU). Any failed fetch or decode marks that asset missing and its cue switches to the synthesised fallback (13.7). Loading never blocks gameplay.
- Tab hidden: master fades to silence over 300 ms if "Mute when tab hidden" is on; context is suspended after 5 real s hidden and resumed on return.

### 13.2 Buses and mix

| Bus | Default gain | Contents | Ducking |
|---|---|---|---|
| `master` | 0 dB (limiter at -1 dBFS true peak) | everything | — |
| `ambience` | -10 dB | beds and synthesised layers | -6 dB under giant events (attack 0.3 s, release 2 s) |
| `effects` | -4 dB | ant-scale foley, creatures, weather impacts | — |
| `giants` | -3 dB | human events, thunder | — |
| `ui` | -14 dB | UI and alert sounds | — |
| `music` | -18 dB | generative music | -8 dB while a critical alert is active; -4 dB under giant events |

Slider mapping: amplitude = (slider / 100)² (perceptual), 0 = mute. Target loudness of a calm surface scene: about -23 LUFS integrated; asset normalisation as delivered (beds -24 LUFS, SFX peaks -3 dBFS).

### 13.3 Listener, distance and occlusion

- Listener position: the possessed ant's head; orientation: the camera. Observer and colony views: the camera position, but distance for ant-scale foley is measured from the camera's focus point (so a zoomed-out colony view still hears the ants it looks at, quietly).
- Distance model (Web Audio `inverse`): ant-scale foley `refDistance 3 BU`, `maxDistance AUDIO_FOLEY_MAX_BU = 40`, rolloff 1.2; creatures `ref 4 BU`, max 60 BU; giant events `ref 150 BU`, max 3000 BU, rolloff 0.8; weather impacts are non-positional within 20 BU of the listener (granular layer), positional beyond.
- Surface-to-underground occlusion: for listener depth d (BU below local ground), surface beds and surface sources get a low-pass at `cutoff = max(250, 6000 · 2^(-d / 6)) Hz` and gain `max(-24, -1.5 · d) dB`. At d = 12 BU: 1500 Hz and -18 dB.
- Line-of-sight occlusion between a source and listener in different cavities or across solid: one sphere trace per voice, refreshed every 0.25 real s, at most 8 traces per frame; if blocked: low-pass 1200 Hz and -9 dB, smoothed over 150 ms.
- Voice limits: `AUDIO_MAX_VOICES = 24` positional voices; per-cue caps (step 4, dig 3, bite 4, drop 3, rain impacts 6); priority: possessed ant > giant events > creatures near listener > others; quietest-farthest voice is stolen first.

### 13.4 Ambience matrix

Habitat groups: Woodland (`forest`), Open green (`lawn`, `garden-bed`), Hard ground (`pavement`, `asphalt`), Play ground (`sand`, `rubber`), Interior (`interior`). The listener's zone (from the zone map at the listener's xz) selects the group; at zone borders the two groups crossfade over 32 BU.

| Group | Dawn | Day | Dusk | Night |
|---|---|---|---|---|
| Woodland | `birdsong_day` 0.8 + synth leaf rustle | `birdsong_day` 0.6 + `wind_leaves` 0.5 + leaf rustle | `birdsong_day` 0.3 + `crickets_night` 0.3 | `crickets_night` 0.7 + synth low wind |
| Open green | `birdsong_day` 0.7 | `birdsong_day` 0.5 + `wind_leaves` 0.4 + `street_suburban` 0.2 | `crickets_night` 0.4 + `street_suburban` 0.2 | `crickets_night` 0.8 |
| Hard ground | `traffic_distant` 0.4 + `birdsong_day` 0.3 | `street_suburban` 0.6 + `traffic_distant` 0.5 | `traffic_distant` 0.5 | `traffic_distant` 0.3 + `crickets_night` 0.3 |
| Play ground | `birdsong_day` 0.5 | synth distant murmur 0.5 by default, or `playground_distant` 0.5 low-passed at 900 Hz when Distant voices is on (only during the children human-event windows; never any discernible speech, 13.7) + `birdsong_day` 0.3 + `wind_leaves` 0.3 | `street_suburban` 0.3 | `crickets_night` 0.6 |
| Interior | `room_fridge_hum` 0.6 | `room_fridge_hum` 0.5 + muffled `street_suburban` 0.2 (low-pass 800 Hz) | `room_fridge_hum` 0.6 | `room_fridge_hum` 0.7 (house quiet) |

Numbers are linear layer gains within the ambience bus. Time-of-day segments crossfade over 1 game h.

Weather modifiers:

| Weather | Change |
|---|---|
| `clear` | none |
| `overcast` | birds x 0.6 |
| `rain` | add `rain_light` 0.8; birds x 0.2; crickets x 0.3; add synth near-field droplet impacts (granular, 3-12 per real s) |
| `storm` | add `rain_heavy` 1.0; remove birds and crickets; synth thunder (13.7) on `giants` bus; wind layer x 1.5 |
| `heat` | birds x 0.4 at day; add synth dry high-frequency ticking (expansion ticks of hot surfaces) only on Hard ground |
| `frost` | all beds x 0.6, crickets off, synth sparse ice ticks |

Underground (listener in a cavity):

| Depth | Layers |
|---|---|
| 0-4 BU | surface matrix with occlusion (13.3) |
| 4-16 BU | occluded surface + `underground_rumble` 0.4 + synth nest murmur (granular soft ticks whose density follows the number of ants within 16 BU: 0 ants silent, 50+ ants dense) + `water_drip_01/02` sparse when chamber humidity > 85 % |
| > 16 BU | `underground_rumble` 0.6 + nest murmur; surface almost inaudible |
| Camponotus wood nests | add synth wood creak (`wood_creak_01-03` sparse, one every 20-60 real s) and the nest crackle (granular `crunch_03` slices at -18 dB) whose density follows colony size |

### 13.5 Foley and effects mapped to simulation cues

The sim emits `{ type: 'cue', cue: CueId, pos, strength }` (contracts). Cue ids added by this chapter:

| Cue id | Sim event | Sound | Source |
|---|---|---|---|
| `step` | possessed ant gait cycle (and ants within 6 BU of the listener, sampled) | synth: 2-4 ms filtered click, band 3-8 kHz, pitch by substrate; -30 dB; gravel uses `gravel_grit_*` slices at -24 dB | synth + file |
| `dig-bite` | carve bite (soil / sand / clay) | `soil_dig_01`, `soil_scrape_01/02` pitched up +12 to +19 semitones, 120-300 ms slices | file |
| `wood-chew` | carve bite in wood (Camponotus) | synth gnaw (manifest recipe: noise bursts at 8-25 Hz rate, 1-4 kHz band-pass, crackle impulses); `wood_rasp_01/02` as layer | synth + file |
| `pellet-drop` / `frass-drop` | pellet or frass dropped | synth: tiny grain trickle (noise burst, 40 ms, 2-6 kHz) | synth |
| `pick-up` / `drop` | item picked up / dropped | synth mandible click (1.5 ms pulse pair, 6 kHz) | synth |
| `bite` | bite action | synth click + `crunch_01/02` slice when the target is hard prey | synth + file |
| `grapple` | two ants lock | synth scuffle (filtered noise, 200 ms) | synth |
| `acid-spray` | formicine spray | synth hiss (white noise, high-pass 5 kHz, 250 ms envelope) | synth |
| `trophallaxis` | food transfer | synth soft liquid tick (sine 1.2 kHz with fast decay, 3 pulses) | synth |
| `antennate` | T action | synth soft brush (pink noise 80 ms, band 4-9 kHz, -32 dB) | synth |
| `lay-egg` / `eclosion` | egg laid / adult emerges | synth soft membranous pop (-30 dB) | synth |
| `alarm-burst` | alarm pheromone release | no literal sound (chemical); a short rising synth shimmer on the UI bus only when the possessed ant is within the plume (diegetic proxy, Settings can disable) | synth |
| `drum` | Camponotus alarm drumming | synth: low knocks 60-120 Hz bursts at 8-12 Hz rate on wood resonance; `wood_creak` layer | synth + file |
| `stridulate` | Messor / Atta stridulation (cutting, recruitment, rescue) | `stridulation_grasshopper_01` pitched up +7 semitones, -12 dB, plus synth rasp (comb-filtered noise 6-9 kHz at 40-60 Hz pulse rate) | file + synth |
| `leaf-cut` | Atta cutting | synth fine tearing (granular noise, 2-6 kHz) + stridulate layer | synth |
| `seed-crack` | Messor milling | `crunch_01-03` slices pitched up +5 | file |
| `death` | ant dies | none for ants (no death sound); the camera does not linger | — |
| `prey-struggle` | prey thrashing | synth flutter (amplitude-modulated noise 15 Hz) | synth |
| `creature-step` | large creature gait (spider, beetle, centipede) | synth soft taps, slower and heavier than ants; spiders use the same sound in all comfort modes | synth |
| `wing-buzz` | flying insects, alates in flight | `insect_wing_buzz_01/02` for swarms; synth sawtooth 150-300 Hz with FM jitter for single flies | file + synth |
| `bird-strike` | bird event at a mound | synth low wing whoosh + peck thuds; `birdsong_day` short call slice | synth + file |
| `antlion-flick` | sand thrown by an antlion | synth sand spray (noise grains 3-8 kHz) | synth |
| `raindrop-hit` | drop impact within 20 BU | `wet_splat_01/02` pitched by drop size (drizzle +12, downpour -5 semitones) | file |
| `drip` | water drip in damp cavities | `water_drip_01/02` | file |
| `flood` | water entering a tunnel | synth low gurgle (filtered brown noise with 2-6 Hz bubbles) + `wet_splat` layer | synth + file |
| `collapse` | sand collapse | synth grain slide (noise 400 ms, low-pass sweep) | synth |
| `cricket-call` | cricket creature near | `cricket_chirp_01/02` | file |

### 13.6 Giant human sounds (human events)

| Human event | Warning phase (diegetic, starts with the sim's warning) | Main sound | Source |
|---|---|---|---|
| `footsteps` | sub-bass tremor: synth 30-60 Hz sine with rising amplitude over the warning time; ground dust shiver visual | `thud_giant_step_01/02` + synth sub thump (sine sweep 80 -> 35 Hz, 300 ms) + `underground_rumble` swell | file + synth |
| `mowing` | distant engine rising (`lawnmower_loop` low-passed 400 Hz at -18 dB) | `lawnmower_loop` (engine) or `lawnmower_push_loop` (reel), positional, Doppler off | file |
| `sweeping` | bristle swish far away | `broom_sweep_01/02` | file |
| `vacuum` | rising motor whine | synth: band-passed noise roar + motor tone 120-180 Hz with slow pitch drift | synth |
| `car` | tyre rumble approach | `car_pass_01/02` low-passed by distance; synth tyre roll (brown noise with 8-20 Hz texture) under | file + synth |
| `watering` | hiss of a hose | `rain_light` used as spray, band-passed 1-6 kHz, positional; `wet_splat` impacts | file |
| `children` | — | synth distant murmur (default), or `playground_distant` low-passed at 900 Hz when Distant voices is on (opt-in, 7.4; file must pass the 13.7 intelligibility check); sand thumps for play nearby (synth) | synth / file |
| `food-drop` | — | `crunch_*` pitched -12 + synth thud | file + synth |
| `spill` | — | `wet_splat_02` pitched -10 + synth slow glug | file + synth |
| `bait-station` | — | synth plastic clack (two filtered clicks 800 Hz / 1.2 kHz) | synth |
| thunder (weather) | — | synth: noise burst low-passed 120-300 Hz with long rumbling tail (3-8 s), distance-delayed after the lightning brightening by 1-6 real s | synth |

### 13.7 Synthesised sounds (no acquired file)

From the asset manifest's gap list plus this chapter's needs: wood gnaw, leaf rustle grains, single-fly buzz, underground tone (fallback for `underground_rumble`: brown noise below 120 Hz with 0.05 Hz modulation), giant footstep sub layer, all ant-scale clicks and ticks (step, pick-up, drop, bite, antennate, trophallaxis), acid hiss, drumming, stridulation rasp layer, leaf tearing, nest murmur, flood gurgle, collapse slide, vacuum, tyre roll, thunder, plastic clack, ice ticks, heat ticks, voice-less distant murmur, all alert tones and the journal page turn. Every file-based cue also has a synth fallback used when its file is missing. Synth voices are built from Web Audio nodes (oscillators, noise buffers generated once at start, biquad filters, gain envelopes); no AudioWorklet is required (it may be refused in sandboxed frames).

Acquired files (from `public/assets/manifest.json`): ambience `birdsong_day`, `crickets_night`, `rain_light`, `rain_heavy`, `wind_leaves`, `street_suburban`, `traffic_distant`, `playground_distant`, `room_fridge_hum`, `underground_rumble`; SFX `soil_dig_01`, `soil_scrape_01/02`, `gravel_grit_01-03`, `wood_creak_01-03`, `wood_rasp_01/02`, `crunch_01-03`, `water_drip_01/02`, `wet_splat_01/02`, `thud_giant_step_01/02`, `lawnmower_loop`, `lawnmower_push_loop`, `car_pass_01/02`, `broom_sweep_01/02`, `insect_wing_buzz_01/02`, `cricket_chirp_01/02`, `stridulation_grasshopper_01`, `ui_click_01-03`, `ui_hover_01`, `ui_switch_01`. Several are provenance tier B (archive.org, uploader-asserted CC0); the manifest marks them; the audio code must not depend on any single file existing.

Asset acquisition checklist (every acquired audio file, recorded in `assets-src/MANIFEST.md`): licence and provenance tier; loudness normalised; loop seam checked; **no discernible speech** (11.8). For any bed recorded near people (`playground_distant`, `street_suburban`, `traffic_distant`) the check is a listen-through by two reviewers after the runtime chain (low-pass 900 Hz, at the gain used in play): no word, name or phrase may be recognisable, and the result reads as an unintelligible texture of distant activity. The current `playground_distant` excerpt (low-passed at 4.2 kHz in the manifest) contains audible children's voices and does not pass as delivered; until it is reprocessed or replaced and re-checked, the Distant voices option is hidden and only the synth murmur plays. The synth distant murmur is band-limited noise (200-900 Hz) with slow amplitude swells (0.3-1.5 Hz) and sparse soft transients, never formant-shaped.

### 13.8 UI and alert sounds

| UI event | Sound |
|---|---|
| Button activate | `ui_click_01` (primary), `ui_click_02` (secondary), `ui_click_03` (tab) |
| Hover / focus move | `ui_hover_01` at -10 dB relative, max 1 per 80 ms |
| Toggle, segmented change | `ui_switch_01` |
| Alert `notice` | synth soft wooden tick (sine 880 Hz + 1760 Hz, 60 ms) |
| Alert `warning` | synth two notes (660 Hz then 495 Hz, 120 ms each) |
| Alert `critical` | synth three low notes (392, 330, 262 Hz, 160 ms each), repeated once after 4 real s if unacknowledged, never more |
| Milestone | 3-note rising motif in the current music mode's scale (even when music is off, on the UI bus) |
| Journal / codex page | synth page turn (noise swish 180 ms, band 1-5 kHz) |

### 13.9 Generative music (T3, optional)

Sparse, quiet, never continuous. Synthesised soft voices (FM bell-marimba, bowed pad, low wooden pulse). Mode by season: spring D Dorian, summer F Lydian, autumn A Aeolian, winter E Phrygian at half density. Phrases of 3-9 notes, tempo 54-66 bpm, separated by silences of `MUSIC_GAP_REAL_S = 90-360`. Triggers that can start a phrase: dawn, dusk, entering colony view, a milestone, the end of a time-lapse, 2 real minutes of calm (no warning/critical alerts). Never plays during combat involving the possessed ant or during giant events. "Frequent" halves the gaps. All music content is generated at runtime; no recorded music ships.

---

## 14. Edge cases and failure handling (presentation)

| Situation | Handling |
|---|---|
| Possessed ant dies | Camera holds 1.5 real s, then eases to observer over the corpse (`--m-scene`); `possessed-died` alert; possessed-ant panel fades; speed stays as it was. |
| Queen possessed when colony view requested | Colony view opens; queen continues under AI; M returns to her. |
| No living ant for a quick-possess button | Button disabled with reason "No foragers alive". |
| WebGL context lost in play | Sim pauses; overlay "Graphics were interrupted. Restoring..."; on restore continue; if restore fails within 10 real s: offer Save (export) and Reload. |
| Window resize | Layout recomputes within one frame; drawers clamp; open tooltips close. |
| Pointer lock refused | Mouse look stays Drag; no message unless the player chose Captured (then a 4 s `info` toast). |
| Fullscreen refused | Settings button shows "Not allowed here". |
| Clipboard refused | Text export modal selects all text and shows "Press Ctrl+C to copy". |
| Downloads refused | Text export modal (7.6); photo capture fallback (7.9). |
| Storage refused | 7.6 and settings session-only notice. |
| Font load fails | System fallbacks; no layout breakage (all containers tolerate +10 % text width). |
| Very many alerts (e.g. a territorial dispute) | Throttle (6.3); critical cards are capped at 3 pinned, oldest critical collapses into "+n". |
| 2500-ant roster | Virtualised list; updates <= 2 Hz; sorting done off the hot path (every update, not every frame). |
| Unknown cue or alert kind from sim | Cue ignored silently (logged once in dev); alert displayed with sim-provided strings. |

---

## Appendix A — State required

Simulation state (persisted in saves; owners noted; this chapter only reads unless marked "UI-owned"):

| Name | Type sketch | Purpose |
|---|---|---|
| `progression.alerts` | `ActiveAlert[]` = `{ id: number, kind: AlertKind, level: 'info'|'notice'|'warning'|'critical', subjectId: number, title: string, cause: string, focus: TargetRef|null, diagnosticId: string|null, raisedTick, updatedTick, count, acknowledged: boolean }` | Active alerts with sim-side hysteresis. Acknowledged is set by the `acknowledgeAlert` command. |
| `progression.aims` | `{ id: AimId, state: 'open'|'done'|'dismissed', openedTick, doneTick }[]` | Journal current focus. Opened/closed by the onboarding rules (9.2); evaluated in the progression system. |
| `progression.hintsMirror` | `Record<HintId, { uses: number, state: 'pending'|'shown'|'learned'|'dismissed' }>` | Copy of profile hint state for this save (used when the profile is unavailable). |
| `progression.codexSeen` | `Record<CodexId, number /* tick */>` | Per-game codex observations (contracts guidance). |
| `progression.eventLog` | ring buffer of `{ tick, kind, level, text, focus }`, capacity `EVENT_LOG_MAX = 200` | Journal event log. |
| `progression.milestoneThumbs` | `{ milestoneId, dataUrl }[]` max 40 | Journal thumbnails (UI-owned data stored via a `storeThumbnail` command, not affecting sim results). |
| `player.timelapse` | `{ kind: 'founding'|'winter', startTick, endTick, progress, stage, counters: Record<string, number>, interrupt: { id, kind }|null } | null` | Time-lapse overlay data (owner: founding/environment). |
| `progression.diagnostics` | `Diagnostic[]` (contracts shape) | Colony health view. |
| `progression.history` (was `progression.stats`; GDD 06 §9.2 record with GDD 02 §13.2 series ids) | time series (hourly ring of 168 = 7 days, daily all) | Graphs, sparklines, trend arrows, epitaph chart. |

Profile and settings (outside saves):

| Name | Store | Type sketch | Purpose |
|---|---|---|---|
| `foundress.settings.v1` | localStorage | `Settings { graphics, audio, controls { keyboard: Record<ActionId, [Binding, Binding|null]>, gamepad, sensitivity, invertY, mouseLook, holdToggle: Record<ActionId,'hold'|'toggle'>, holdMs, deadZone }, accessibility { uiScale, textScale, font, highContrast, reducedMotion, horizon, shake, spiderComfort, comfortAlso, overlayPalette, soundCues, flashReduction }, gameplay { prompts, hints, autoSlowCritical, autoSlowWarning, autosaveMin, minimap, focusLine, milestoneNotices: 'full'|'quiet'|'off' } }` | All settings. |
| `foundress.profile.v1` | IndexedDB `profile` store (localStorage fallback) | `{ hints: Record<HintId, {uses, state}>, codex: Record<CodexId, {tick, doy, year, species, firstSeenIso}>, lineage: {colonies, flights, daughters, settings} }` (codex and lineage record shapes are GDD 06 §10 and §12; one profile store, consistency pass) | Cross-game progress. |
| Save `meta` | IndexedDB `saves` | `{ slot, generation, species, archetype, seedCode, dateLabel, population, savedAtIso, playTimeS, version, generatorVersion, thumbnail }` | Slot cards. |

Runtime UI state (never persisted): `UiSnapshot` (refreshed 4 times per real second: time, weather, speed, pulse numbers, possessed-ant fields, prompts, alerts, diagnostics summary), open screen stack, focus stack, toast queue with real-time cooldown table, snoozes, roster sort state, overlay selection, cutaway depth/mode, photo camera state, audio voices and status.

## Appendix B — Commands

Simulation commands (names follow the contracts guidance; payloads sketched):

| Command | Payload | From |
|---|---|---|
| `possess` | `{ antId }` or `{ role: 'forager'|'digger'|'nurse'|'queen', nearPos }` (`nearPos` = camera target; GDD 01) | Roster, quick keys, observer click, Tab |
| `release` | `{ reason: 'player' \| 'afk' \| 'colony-view' \| 'timelapse' }` (GDD 01) | X, possession end |
| `action` | `{ actionId, target?, secondary?, phase: 'start' \| 'stop' }` (GDD 01) | possession input |
| `setDirectives` | GDD 02 App B payload: `{ allocation?, taskShares?, diet?, alateInvestment?, gyneShare?, alatePolicy?, stockTarget?, stayIn?, sealInCold?, stance?, casteEmphasis?, …species extras }` (the former `production` / `casteRatio` / `architect` fields are replaced by `alateInvestment` / `casteEmphasis` / `setAutoExpand`) | Directives |
| `placeMarker` / `removeMarker` | `{ kind: MarkerKind, pos, radius, chamberIds?, params? }` (rally: `params.mode`) / `{ markerId }` | Marker tool |
| `planDig` / `cancelPlan` / `pausePlan` / `resumePlan` | GDD 03 App B payload: `{ nestId, kind, chamberType?, size?, anchor: {pos, normal}, end?, bend?, length?, yawDeg?, surfacePoint?, priority, confirmWarnings }` / `{ planId }` | Dig planner |
| `designateChamber` | `{ chamberId, type: ChamberType }` | Nest overview |
| `setAutoExpand` | `{ nestId, mode: 'auto' \| 'suggest' \| 'off' }` (GDD 03) | Directives |
| founding steps | `{ step: 'seal'|'lay'|... }` via `action` | Onboarding flow |
| `skipTimelapse` | — | Time-lapse overlay |
| `timelapseRespond` (was `timelapseStepIn`; shared with GDD 06) | `{ interruptId, response: 'step-in' \| 'let-it-play' }` | Time-lapse overlay |
| `acknowledgeAlert` (new) | `{ alertId }` | Alert card |
| `storeThumbnail` (new) | `{ milestoneId, dataUrl }` | Journal (presentation data only) |
| `setDifficulty` (GDD 06) | `{ preset?, custom? }` | Settings > Gameplay |
| `setSpeed` / `togglePause` / `skipToNextEvent` | GDD 01 / GDD 06 App B (sim commands; `state.time` is persisted) | Time controls |

Game / UI intents (handled by `Game`, not the sim): `openScreen(id)`, `closeScreen()`, `setView('possess'|'observer'|'colony'|'photo')`, `setOverlay(id|null)`, `setCutaway({depthBU, mode})`, `cameraJumpTo(TargetRef)`, `save(slot)`, `load(slot, generation?)`, `exportSave(slot) -> bytes|text`, `importSave(bytes|text)`, `deleteSave(slot)`, `capturePhoto(scale)`, `setSetting(path, value)`, `rebind(action, slotIndex, binding)`, `resetHints()`, `foundDaughter(lineageId)`, `newGame(config)`, `audioEnable()`.

Debug API additions (`window.__game.ui`): `open(id)`, `close()`, `screen()` (current stack), `focus()` (focused element id), `hud()` (region boxes in dp and visible flags), `alerts()` (visible cards, log), `prompts()`, `hints()`, `settings.get/set`, `audio.status()`, `audio.cueLog()` (last 50 cues played with bus and gain), `look()` (active look parameters: DOF, haze, exposure, comfort variants), `contrastReport()` (computed token contrasts).

## Appendix C — Events

Consumed from the simulation event bus:

| Event | Used for |
|---|---|
| `alert` `{ op: 'raise'|'update'|'clear', alert: ActiveAlert }` (emitted by the progression alert system) | Feed, sounds, auto-slow, log |
| `milestone.reached` `{ id, tick, title }` (GDD 06; was assumed `milestone`) | Journal, toast, milestone motif, thumbnail capture |
| `cue` `{ cue: CueId, pos, strength }` | Audio (13.5-13.6) and small visual effects |
| `codex.unlocked` `{ id }` (GDD 06; was assumed `observe`) | Codex unlocks and toasts |
| `hint-trigger` `{ hintId }` (new; for triggers that depend on sim facts, e.g. first trail, food delivered) | Onboarding |
| `aim.opened` / `aim.completed` `{ id }` (GDD 06; was assumed `aim`) | Journal, focus line |
| `possession-started` / `possession-ended` (GDD 01; was assumed `possession`) | HUD, camera, prompts |
| `ant-died` `{ antId, colonyId, caste, cause, pos, task }` (possessed or queen) | Camera, alerts |
| `human.telegraph` / `human.start` / `human.end` (GDD 04; was assumed `human-event`) | Giant sounds, threat overlay countdown, edge pips |
| `weather.changed` `{ from, to, intensityClass }` (GDD 06; was assumed `weather`) | Ambience modifiers, look |
| `opening.timelapse` and `overwinter.*` (GDD 06; was assumed `timelapse`) | Time-lapse overlays |
| `colony.extinct` `{ cause, causeChain }` and `epitaph.ready` (GDD 06; was assumed `game-over`) | Epitaph |
| `carve-chunks-dirty`, `breach` (GDD 03; was `chunk-dirty`) | Cutaway caps (render) |

Emitted by the UI/game layer (not sim; for analytics-free local logging, the debug API and the journal): `ui-screen` `{ id, op }`, `hint-shown` / `hint-learned` / `hint-dismissed` `{ hintId }`, `save-result` `{ slot, ok, error? }`, `export-result` `{ method: 'download'|'text', ok }`, `audio-status` `{ status: 'off'|'running'|'blocked'|'unsupported' }`, `photo-captured` `{ width, height, method }`, `settings-changed` `{ path }`.

## Appendix D — Diagnostics

This chapter renders every subsystem's diagnostics (4.4) and publishes four presentation diagnostics of its own (`diag-storage` also absorbs GDD 06's former `diag-autosave`) (shown in Colony health under "System", collapsed by default):

| Id | Status rule | Limiting factors (weights from measured shares) | Remedies |
|---|---|---|---|
| `diag-perf` | ok if frame time p95 <= 18 ms; warn <= 33 ms; bad above | GPU fill (dynamic-resolution scale at minimum), post-processing cost, instance counts (ants/grass), simulation time per frame | "Lower quality preset", "Reduce grass density", "Turn off depth of field", "Lower speed (simulation cost rises at 8x)" |
| `diag-audio` | ok when running or when switched off by the player (detail line says which); warn when blocked by the browser or when more than 5 files failed to decode | browser gesture policy, decode failures (n files missing, synth fallbacks in use) | "Click to enable sound", "Check the tab is not muted" |
| `diag-storage` | ok if IndexedDB available and last save succeeded; warn if last save failed; bad if unavailable | quota, private-mode refusal, sandbox | "Export the colony", "Free space in the browser" |
| `diag-input` | ok; warn if a bound key was never delivered by the host after being pressed in rebinding test | host swallowing keys, gamepad without standard mapping | "Rebind the action", "Use the menu entry" |

## Appendix E — Acceptance checks

All checks run through `tools/harness/play.mjs` with `?test=1&seed=7&quality=low` at a 1280 x 720 viewport unless stated, using `window.__game`.

1. Given a new game at 1280 x 720 and UI scale 100 %, when `__game.ui.hud()` is read, then the time cluster box is (16, 16, 304, 56) ± 2 dp, the colony pulse is (928, 16, 336, 56) ± 2 dp, and no HUD region overlaps another.
2. Given UI scale set to 150 % at 1280 x 720, when the HUD is read, then the root font size is 24 px ± 0.5, every HUD region lies fully inside the viewport, and the layout mode is `standard` if the scaled viewport is >= 960 x 540 dp, otherwise `compact` (expected: compact, since 1280/1.5 = 853 dp).
3. Given `__game.ui.contrastReport()`, when computed, then `--c-text`, `--c-text-2`, `--c-text-3` and all status colours are >= 4.5:1 against `--c-panel` composited at 0.90 over `#FFFFFF`, and `--c-border-strong` and `--c-focus` are >= 3:1.
4. Given 5 `food-c-low` raises for the same subject within 10 game minutes at 1x, when the feed is read, then exactly 1 card is visible with count 5 and the UI bus played the warning sound exactly once (`audio.cueLog()` in a non-test audio run, or the toast log in test mode).
5. Given 6 distinct `notice` alerts raised within 10 real s, when the feed is read, then 3 cards are visible and the "+n more" chip shows 3, and at most 4 toasts were emitted in the 30 real s window.
6. Given speed 8x and no possession, when a `critical` alert is raised with default settings, then speed is 1x within 1 frame of the alert dispatch.
7. Given speed 8x, when `possess({role: 'forager'})` succeeds, then speed is 1x; when the 8x key is pressed while possessing, then speed stays <= 4x and the 8x button is disabled.
8. Given the pause menu is opened at tick T, when 5 real s pass, then the tick is still T; when Resume is chosen, then the speed equals the speed before opening.
9. Given a fresh profile and a new Lasius game, when no input is given for 2.5 real s after the intro card ends, then the `hint-move` prompt is visible; when movement intent is applied for 3 real s cumulative, then the prompt is gone and `hints()['hint-move'].state === 'learned'`; when a second new game is started, then `hint-move` never appears within 30 real s.
10. Given `resetHints()`, when a new game starts, then `hint-move` appears again under the condition of check 9.
11. Given an active `brood-stalled` alert linked to diagnostic `diag-brood-growth` with focus chamber id C, when the card is clicked, then `ui.screen()` contains `colony-health` with `diag-brood-growth` expanded, and the camera target equals chamber C's centre within 1 BU after `--m-scene` (800 ms) + 100 ms.
12. Given the founding time-lapse started for seed 7, when `skipTimelapse` is sent, then within 1 real s the overlay shows the outcome card, and the number of first workers equals the number obtained by running the same seed without skipping (compare `summary()` population by caste).
13. Given `?nodownload=1`, when Export is chosen for a slot, then the text-export modal opens with content starting `FOUNDRESS1:`; when that text is pasted into Import and "Load now" is chosen, then `summary()` after load equals `summary()` at export time (same tick, population, stores).
14. Given IndexedDB is made to throw on open, when a game is played for 6 real minutes with autosave at 5 minutes, then no exception reaches the console, one `storage-unavailable` notice was raised, Save buttons are disabled and Export works.
15. Given `?test=1`, when the game runs for 60 real s, then no `AudioContext` has been constructed (`audio.status() === 'off'`); given a run without `test=1` and no user gesture, when 10 real s pass, then no `AudioContext` exists; after one synthetic click, `audio.status()` is `running` or `blocked`, never an exception.
16. Given a listener at depth 12 BU below the local ground, when the surface bed filter is read via `audio.cueLog()` / bus state, then its low-pass cutoff is 1500 Hz ± 1 % and its gain -18 dB ± 0.5.
17. Given spider comfort `abstract` and a spawned `wolf-spider` within 20 BU of the camera, when `ui.look()` is read, then the creature's render variant is `abstract`; given `marker`, then no spider mesh instance is drawn and a ring marker with label "Spider" is.
18. Given reduced motion on, when possession switches between two ants, then the camera transition completes in <= 200 ms as a crossfade, camera sway amplitude is 0, and the founding time-lapse uses still crossfades every 3 real s.
19. Given the scent overlay on, when the legend is read, then each of `trail`, `home`, `alarm` and food odour has a distinct pattern id (chevron, stipple, zigzag, rings) independent of colour, and the palette setting `pattern-only` leaves all four distinguishable.
20. Given the Title screen with no saves and no lineage, when it opens, then initial focus is on New colony (Continue is disabled and not focusable, Lineage is hidden); when Tab is pressed 5 times, then focus visits Load, Codex, Settings, Credits and returns to New colony.
21. Given keyboard rebinding of Dig to D, when confirmed, then a conflict message names "Move right"; choosing Swap results in Dig = D and Move right = F, persisted in `foundress.settings.v1` after reload.
22. Given photo mode entered at tick T at speed 4x, when 10 real s pass and a PNG is captured at 1x, then the tick is still T, the capture is 1280 x 720 pixels, and on exit the speed is 4x and the camera pose equals the pre-entry pose.
23. Given the player colony reduced to 0 living ants via `cheat`, when 3 real s pass after the `colony.extinct` event, then `ui.screen()` is `epitaph`, the page shows the cause chain lines from the event, and the lineage store contains a record for this colony with fate "Ended".
24. Given a roster of 2500 ants (cheat spawn), when the Roster drawer is open for 10 real s, then the DOM row count stays <= 60, the list updates at most 2 times per real second, and frame time p95 rises by no more than 2 ms compared with the drawer closed.
25. Given storm weather with flash reduction on, when 20 real s of storm are rendered, then no frame-to-frame exposure increase exceeds +0.5 EV and no more than 5 brightening events occur.
26. Given a Lasius game after hand-over (opening phase `done`) with the queen possessed, when `ui.prompts()` and `ui.hud()` are read, then a prompt "Colony orders" bound to `directives` and the possessed-ant panel button "Colony orders (I)" are present; when I is pressed, then `ui.screen()` contains `directives`, the queen is still possessed (`possessedAntId` unchanged), the speed is unchanged, and the player colony's `directives` record (GDD 02 App A `colonies[]`) and `alloc.target` deep-equal their values before the key press; it changes only after a slider is moved and committed. Given a worker possessed instead, the "Colony orders" prompt is absent and I still opens `directives`.
27. Given `milestoneNotices` = `off` and the HUD hidden with H, when a milestone fires and a `warning` alert is raised, then no toast is shown and no milestone motif or warning sound plays, the journal milestone list and event log contain both entries, and a subsequently raised `critical` alert shows one pinned card and plays its sound.
28. Given default audio settings and an active `children` human event in a Play ground zone, when `audio.cueLog()` is read, then the playground bed source is the synth murmur, not `playground_distant`; the Distant voices row in Settings > Audio is hidden while the asset manifest marks `playground_distant` as not having passed the intelligibility check (13.7).

## Appendix F — Cross-chapter assumptions

1. Progression chapter provides `Diagnostic` records (contracts shape, statuses `ok|warn|bad`), the ids listed in 4.4, cause references between diagnostics for chaining, entity refs for "Show", remedy ids mappable to UI controls; statistics time series hourly for 7 days and daily for all time; milestones; event log; final cause chain on game over.
2. The sim raises and clears alerts with game-time hysteresis and sets `kind`, `level`, `subjectId`, `title`, `cause`, `focus`, `diagnosticId`; trigger thresholds for each alert kind in 6.5 are defined by the owner chapter named there.
3. Colony chapter defines allocation as four groups (forage, nurse, dig, defend) mapping to the canonical tasks as in 4.2, "auto" allocation, production modes, diet emphasis -100..+100, and accepts `setDirectives` while paused. If it uses different groups, the Directives layout follows its groups with the same control rules.
4. Markers chapter defines marker caps (`MARKER_CAP[kind]`), radius ranges compatible with 8-64 BU, and validity reasons; nest chapter defines dig templates (chamber, tunnel, shaft, entrance; sizes 8 / 12 / 16 BU), wall anchoring, `status` values compatible with 4.3 (proposed, queued, active, stalled, complete) and `blockedReason` strings.
5. Founding chapter (GDD 06 §5) provides site assessment values (seven factors), readiness (shaft depth + chamber volume), seal and lay steps, reserves 0..1, nanitic outcome, and interruption events; the time-lapse is driven by the sim with `player.timelapse` as described in Appendix A.
6. Environment chapter provides sun elevation, surface temperature per point, soil moisture, cavity humidity, weather states, human-event warnings with a warning phase and an area, and the winter time-lapse data.
7. Possession chapter provides action availability per frame (for prompts) with priorities, crop capacity, acid reserve, heat stress, and possessed-ant death handling.
8. Ecology chapter provides creature kinds for comfort mode, territories for the threat overlay, and cue emission for creature actions.
9. Worldgen chapter: archetype ids `woodland-edge`, `suburban-garden`, `playground-park`, `car-park-verge`, `kitchen-door`; world size ids `compact`, `standard`, `large`; uint32 seeds; staged progress reporting matching 3.6; a cheap zone-layout-only entry point for the locality preview; up to 8 generation attempts (GDD 04 `WORLDGEN_MAX_ATTEMPTS`).
10. Species data provides `available`, `foundingSeason`, plate/turntable model, complexity rating, founding style word, and per-species cue choices (drum vs stridulate).
11. Persistence chapter stores saves in IndexedDB with `auto` (2 generations) + 5 slots, provides the binary export with a magic header, version and checksum, and accepts `FOUNDRESS1:` + base64 text.
12. Rendering supports clip-plane cutaway with cross-section caps, X-ray mode, overlay passes driven by sim fields, creature render variants for comfort mode, and a photo camera with sphere-traced collision.
13. Custom rule "season length" is honoured by the calendar (`DAYS_PER_SEASON` becomes a game-config value rather than a constant); if not, the option is hidden.

---

### New identifiers added by this chapter

- Screen ids: `boot`, `title`, `new-game`, `loading`, `credits`, `hud`, `pause`, `directives`, `markers`, `colony-health`, `roster`, `nest`, `journal`, `codex`, `settings`, `save-load`, `lineage`, `epitaph`, `photo`, `timelapse-founding`, `timelapse-winter`.
- Alert levels: `info`, `notice`, `warning`, `critical`. Alert kinds: all ids in 6.5.
- Overlay ids: `scent`, `temperature`, `moisture`, `threats`, `dig-plans`. Overlay palettes: `okabe-ito`, `high-contrast`, `pattern-only`.
- Spider comfort levels: `off`, `softened`, `abstract`, `marker`.
- Quality presets: `auto`, `low`, `medium`, `high`, `ultra`.
- Settings `milestoneNotices` (`full`, `quiet`, `off`; 3.4, 7.4) and build flag `showUnreleasedSpecies` (3.7). Codex entry `cx-interface-orders` (owned by GDD 06 §10; tooltip link 4.2).
- Hint ids (9.2), aim ids (9.2 including `aim-find-wood`, `aim-plant-garden`), codex entry ids and categories (9.4, 7.3).
- Cue ids (13.5) and audio bus ids (`master`, `ambience`, `effects`, `giants`, `ui`, `music`); audio status values `off`, `running`, `blocked`, `unsupported`.
- Save slot ids `auto`, `slot-1`..`slot-5`; export text prefix `FOUNDRESS1:`.
- Archetype ids and world size ids (Appendix F 9) if not already defined by the worldgen chapter.
- Commands `acknowledgeAlert`, `storeThumbnail` (`timelapseStepIn` became the shared `timelapseRespond`; `setDifficulty` is GDD 06's); event `hint-trigger` (`observe` and `aim` became GDD 06's `codex.unlocked` and `aim.opened` / `aim.completed`).

### Deviation notes

- **Stridulation by species.** Directions I list "stridulation" as generic ant foley. *Lasius* and *Camponotus* (Formicinae) have no stridulatory organ; *Messor* and *Atta* (Myrmicinae) do (bio-messor, bio-atta). *Camponotus* alarms by drumming on wood (bio-camponotus). Audio uses `stridulate` only for Messor and Atta and `drum` for Camponotus; Lasius has neither.
- **Pupae.** Formicine pupae (Lasius, Camponotus) are in cocoons; myrmicine pupae (Messor, Atta) are naked. Brood rendering follows this.
- **Callow darkening.** genre-ux says "about an hour"; the verified Lasius dossier says 3-4 days. The render uses the dossier value compressed to `CALLOW_DARKEN_GAME_H = 6`.
- **UI scale range.** genre-ux proposed 75-200 %; the task and seed scope say 80-150 %. The game uses 80-150 % plus a separate text size up to 130 %, giving text up to 195 % of default.
- **Default founding season.** Lasius mating flights are in July-August (ecology dossier); the New Game default for Lasius is Summer rather than Spring.
