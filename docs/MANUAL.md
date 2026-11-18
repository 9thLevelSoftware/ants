# FOUNDRESS player's manual

This manual describes the game as it is at commit `fb15f3d` on 2026-11-18. It says what the game does today. Where something is unfinished or not in the game yet, it says so. The game is a first playable and has known problems: they are listed in section 15.

An earlier draft is in `docs/manual/`. It was written before the game was finished and has not been checked against it. Where the two disagree, this file is the one that was checked.

## 0. Conventions

- **Body length (BU).** Distances are given in body lengths of the standard worker of the species you play. For the black garden ant one BU is 4 mm.
- **Game day.** One game day is 10 minutes at normal speed (1x). A year has four seasons of 7 days each (the season length can be set to 5, 7 or 10 days when you start a game, section 1.5). Ants walk at real speed; growth, ageing and the seasons run on the game calendar.
- **C and P.** The colony tracks two kinds of food: carbohydrate (C: sugars, honeydew, nectar) and protein (P: insects and carrion).
- **Possess.** To take control of an ant is to possess it.
- **Key names** are the defaults. Every key can be changed in Settings > Controls. The tables in section 13 are generated from the bindings in the code.

## 1. Starting a game

### 1.1 The title screen

When the game has loaded, it may ask for a click or a key press. This lets the browser play sound. A gamepad button does not count, so with a gamepad the game starts without sound until you click or press a key. The menu offers:

| Item | What it does |
| --- | --- |
| Continue | Loads the newest save. Disabled when there is no save. |
| New colony | Opens the setup page (section 1.2). |
| Load | Opens the save page on its Load tab. |
| Lineage | Opens the record of colonies you founded and their daughters. **Shown only when there are lineage records.** |
| Codex | Opens the field notes. |
| Settings | Opens settings (section 12). |
| Credits | Lists the sound, texture, font and library credits. |

### 1.2 The setup page

New colony opens one page with three columns: Species, Locality and Rules. Begin starts generating the world. The page keeps your choices if you cancel.

### 1.3 Species

| Species | Common name | Playable now | Natural start season | The card says |
|---|---|---|---|---|
| *Lasius niger* (`lasius-niger`) | Black garden ant | yes | spring | A generalist of soil and paving that ranches aphids for honeydew. Founding: Dig, seal, lay, wait. |
| *Camponotus pennsylvanicus* (`camponotus-pennsylvanicus`) | Black carpenter ant | no: "Not yet available" | spring | Nests in damp wood and works by night along trunk trails. Slow to grow. Founding: Find damp wood, chew a cell, seal. |
| *Messor barbarus* (`messor-barbarus`) | Harvester ant | no: "Not yet available" | autumn | Gathers seed, mills it into paste and keeps granaries through the dry months. Founding: Dig deep in dry ground after autumn rain. |
| *Atta texana* (`atta-texana`) | Texas leafcutter ant | no: "Not yet available" | spring | Cuts leaves to grow a fungus garden; the fungus is all the brood eats. Founding: Dig, plant the fungus pellet, tend it. |

Only the black garden ant can be started. The other three cards are greyed with the words "Not yet available". Their simulation modules exist, but their colonies did not meet the survival bar in the test runs (README, "State of the game today"). Starting one by URL flag is not supported.

### 1.4 Locality

Choose Woodland Edge, Suburban Garden, Playground Park, Car Park Verge, Kitchen Door or Random. Each card shows up to four kinds of ground it contains and a word for how well it suits the species: Good, Fair or Poor. Random picks one for your species from the seed.

- **Size:** Compact (3000 BU across), Standard (4000) or Large (5000).
- **Seed:** any text up to 32 characters. An eight-digit hexadecimal code such as `4F7A-21C9` is used as the seed itself; any other text is hashed. The page shows the seed code it turns into. The same seed with the same settings gives the same locality. Randomise fills in a new one.

### 1.5 Starting season

Natural, Spring, Summer or Autumn. Winter is greyed out. Natural is the species' own founding day: for the black garden ant, day 5 of the year, in spring. (The help text under the control says "on day 3"; that is a wrong string, see section 15.) The other choices start on day 3 of the chosen season.

### 1.6 Difficulty and rules

Gentle, Naturalist (the default) and Harsh are presets. Under each card, "What ... changes" lists every parameter the preset sets. Changing any custom rule turns the card into Custom.

The table below is generated from `src/sim/config/presetDisplay.ts` (`PRESET_ROWS`, `presetCard`). A row marked **not in effect** is shown on the New Game screen as "Not in this build": nothing in the game reads that value yet.

| Group | Parameter | Gentle | Naturalist | Harsh |
|---|---|---|---|---|
| Founding | Exposure to the sun while founding | x0.5 | x1 | x1.3 |
| Founding | Brood losses in the founding chamber | x0.7 | x1 | x1.3 |
| Founding | Queen reserves burned | x0.85 | x1 | x1.15 |
| Founding | Threats during the opening (at most) **(not in effect)** | 0 | 2 | 4 |
| Founding | Interruptions of the first-brood time-lapse (at most) | 0 | 2 | 3 |
| Founding | Grace period before threats **(not in effect)** | 0.6 days | 0.3 days | 0.15 days |
| Founding | Tries at another site | 3 | 1 | 0 |
| Founding | Brood forecast | shown | shown | hidden |
| Weather and climate | Rain | x0.8 | x1 | x1.2 |
| Weather and climate | Storms | x0.5 | x1 | x1.6 |
| Weather and climate | Heat waves | x0.7 often, x0.7 hot | x1 often, x1 hot | x1.3 often, x1.25 hot |
| Weather and climate | Frost | x0.7 | x1 | x1.3 |
| Weather and climate | Chance of a dry spell each summer | 25% | 50% | 70% |
| Weather and climate | Raindrop hits on exposed ants | x0.6 | x1 | x1.3 |
| Weather and climate | Rain running into the nest | x0.7 | x1 | x1.4 |
| Weather and climate | Heat tolerance of ants | +2 C | 0 C | -1 C |
| Threats, rivals, humans | Predators | x0.4 | x1 | x1.6 |
| Threats, rivals, humans | Hunters settling by a growing colony | from 20 workers, all by 60 | from 10 workers, all by 40 | from the first workers, all by 20 |
| Threats, rivals, humans | Rival colonies | 1 young colonies nearby | 2 young colonies nearby | 3 young colonies nearby |
| Threats, rivals, humans | Rival aggression | x0.7 | x1 | x1.2 |
| Threats, rivals, humans | Rival colony size | x0.6 | x1 | x1.3 |
| Threats, rivals, humans | Time between raids on you | 4 days | 2 days | 1 day |
| Threats, rivals, humans | Quiet days between major threats | 1 day, 75% quiet daytime | 0.5 days, 60% quiet daytime | 0.25 days, 40% quiet daytime |
| Threats, rivals, humans | Human activity | x0.5 | x1 | x1.5 |
| Threats, rivals, humans | Danger from human events | x0.4 | x1 | x1.2 |
| Threats, rivals, humans | Warning before footsteps arrive | x1.5 | x1 | x0.75 |
| Threats, rivals, humans | Bait stations | none | indoors | indoors and garden |
| Food | Food on the ground | x1.3 | x1 | x0.75 |
| Food | Honeydew from aphids | x1.2 | x1 | x0.85 |
| Colony | Brood survival | x1.15 | x1 | x0.85 |
| Colony | Worker lifespan | x1.2 | x1 | x0.85 |
| Colony | Time ants endure hunger | x1.3 | x1 | x0.8 |
| Colony | Queen lifespan **(not in effect)** | x1.5 | x1 | x0.7 |
| Colony | Winter losses | x0.5, queen dies 0% | x1, queen dies 3% | x1.5, queen dies 6% |
| Colony | Decline of a queenless colony | x0.7 | x1 | x1.3 |
| Colony | Damage to the ant you play | x0.75 | x1 | x1 |
| Colony | Speed of the ant you play when cold (floor) | x0.6 | x0.5 | x0.3 |
| Progression | Size needed for each colony stage | x0.8 | x1 | x1.2 |
| Progression | Winged queens and males reared | x1.2 | x1 | x0.9 |
| Progression | Losses on the nuptial flight | x0.7 | x1 | x1.25 |
| Progression | Predator events on the flight **(not in effect)** | 0-1 | 1-3 | 3-5 |
| Time and interface | Automatic slow-down at an alert | pause | slow | slow |
| Time and interface | Warnings before trouble **(not in effect)** | strong | normal | minimal |

Custom rules. The New Game screen offers the seven rules marked "on screen" below. The two rules marked "greyed" are listed on the screen with the words "Not in this build". The rules marked "not on screen" exist in the game's rule table (`src/sim/config/presetDisplay.ts`, `RULE_DISPLAY`) but the New Game screen has no control for them. Season length and the number of rivals are fixed when the world is made.

| Rule | Choices | Gentle | Naturalist | Harsh | New Game screen | In effect |
|---|---|---|---|---|---|---|
| Predators (`predators`) | Off, Few, Normal, Many | few | normal | many | on screen | yes |
| Rival colonies (`rivals`, fixed at world generation) | 0, 1, 2, 3, 4 | 2 | 3 | 4 | on screen | yes |
| Human activity (`humanActivity`) | Off, Low, Normal, High | low | normal | high | on screen | yes |
| Weather severity (`weatherSeverity`) | None, Mild, Normal, Severe | normal | normal | normal | on screen | yes |
| Season length (`seasonLengthDays`, fixed at world generation) | 5 days, 7 days, 10 days | 7 | 7 | 7 | on screen | yes |
| Starting season (`startSeason`, fixed at world generation) | Natural, Spring, Summer, Autumn | Natural | Natural | Natural | on screen (Starting season, in the Locality column) | yes |
| Founding leniency (`foundingLeniency`) | Lenient, Normal, Strict | lenient | normal | strict | on screen | yes |
| Winter (`winterMode`) | Time-lapse, Real time | - | - | - | not on screen | yes |
| Founding assist (`foundingAssist`) | On, Off | - | - | - | greyed: "Not in this build" | **no** |
| Queen ageing (`queenSenescence`) | On, Off | - | - | - | greyed: "Not in this build" | **no** |
| Nest collapse (`collapse`) | On, Off | off | on | on | on screen | yes |
| Extinction ends the game (`extinctionEndsGame`) | On, Off | - | - | - | not on screen | yes |

A value for `rivals: 0` also removes the young conspecific colonies of the preset (ruling R23 in `docs/design/gdd/DEVIATIONS.md`).

"Hints" switches the quiet teaching hints of the first days on or off.

### 1.7 Loading

Making the world takes some seconds. The loading page shows the stages. If generation fails the page says so and offers another seed. Cancel returns to the setup page.

## 2. The opening, step by step

You begin as a single founding queen, playing by hand. The game teaches one verb at a time with a prompt near the queen. A prompt stops showing once you have used its verb a few times. The key on the prompt is the key you have bound. The journal's focus line (top left) asks one question at a time ("Where is the ground sheltered, warm and diggable?"). These aims never block play.

The steps (hint and aim wording: `src/content/text/hints.ts`):

1. **Search.** Walk with `W A S D`; look around by dragging with the right or middle mouse button (or the arrow keys). Antennate the ground with `T` (Inspect) to read the soil. Sheltered ground that is neither dry nor flooded is better than open lawn. The speed is limited to 2x in the search, dig, seal and lay phases.
2. **Dig.** Hold `F` on diggable ground. The queen carries the soil out as pellets and drops them beside the shaft. A readiness bar shows when the shaft is deep enough and the chamber large enough.
3. **Seal.** At the shaft, hold `E` to plug the entrance with soil. From then on the queen lives on her own reserves, and a gauge shows how much is left.
4. **Lay.** In the chamber, press `E` to lay the first eggs.
5. **First brood.** A time-lapse shows the eggs become larvae, pupae and workers while her reserves fall. It can be skipped by holding the skip key (Space or A). It can stop for a choice: step in (`E`) or let it play.
6. **Hand-over.** The first workers open the plug. The game offers a worker (`Tab`) or stays with the queen. The workers are small first-brood workers; the queen's remaining reserve is passed to the colony as a provision (ruling R2).

If the founding fails, a card says why and, depending on the difficulty, offers another site (Gentle: 3 tries, Naturalist: 1, Harsh: 0).

## 3. The views

There are three views and a photo screen.

| View | What it is | How to get there |
| --- | --- | --- |
| Possess (third person) | The camera follows one ant from behind. You steer it. | `Tab`, `5`, `6`, `7`, `8`, or `E` on a selected ant in the observer view. |
| Observer | A free camera you fly. Click an ant to select it; the card shows what it is doing. | `X` from a possessed ant. |
| Colony view | A view from above with a cutaway of the nest, for markers and dig plans. | `M` toggles it. |
| Photo mode | A frozen picture with camera controls (section 11). | `F2`. |

Moving between them:

- `X` releases the ant you control; it goes back to its own work and you are in the observer view.
- `Tab` and `Shift+Tab` possess the next or previous nearby ant. `Backspace` returns to the previous ant.
- `5` forager, `6` digger, `7` nurse, `8` the queen: possess the nearest ant of that job (any play view).
- In the observer view: `E`, holding the left mouse button, or a double click possesses the selected ant; `F` follows it; right click deselects.
- Possessing changes who you control, not the biology: the ant still ages and can die. If your ant dies, the camera stays on the body and the prompt offers `Tab` to take another ant; or the game takes over a nestmate if you set "Take over a nestmate when your ant dies" (section 12).

The nest cutaway in colony view has a slice: `R` and `F` (or `Shift` with the mouse wheel) move it up and down; `G` changes the cutaway mode. In colony view `W A S D` pan, `Q` and `E` rotate, the wheel zooms.

## 4. Controlling an ant

The prompt near the ant names what the primary key (`E`) will do to the selected target. Holding `E` is the secondary action. The verbs below are the ones the prompt code can name (`src/sim/ants/player/prompt.ts`); which of them appear depends on the ant, the target and the situation. A greyed line gives the reason ("crop full", "out of reach", "not here", "no strength left today" and so on).

| Key | Action | What it does |
| --- | --- | --- |
| `W A S D` | Move | Walks the ant over any surface it can cling to: ground, walls, ceilings, stems. |
| `Shift` | Hurry | Runs faster. |
| `E` | Interact | Pick up or put down an item; feed a larva; groom; drink liquid food; tear a piece off solid food; stroke an aphid; seal or open the entrance; lay an egg (queen); pull a heavy item. |
| `F` (hold) | Dig / cut / chew | Digs soil. Pellets are carried out and dropped. |
| `T` | Inspect | Antennates the target; hold for a longer antennal sweep. |
| Left mouse or `Q` | Bite | Bite a target; hold to bite and hold on. |
| Right click or `C` | Species special | Sprays acid for species that have it (uses a charge, short cooldown); hold to release alarm pheromone. |
| `R` | Lay trail on / off | Switches your pheromone trail on or off. A trail home lets nestmates follow. |
| `G` | Share food | Passes food from your crop to a nestmate. |
| `Space` | Let go / drop | Drops what you carry; hold to grip. |
| `B` | Next target | Cycles the selected target. |
| `Z` or middle click | Camera behind the ant | Recentres the camera. |
| `X` | Release | Back to the observer view. |

The panel for the ant you control shows what it is and what it is doing.

## 5. Colony orders (the queen's priorities)

`I` opens **Colony orders**. The ants still choose for themselves; the orders shift how many go where. The panel has five sections (`src/ui/panels/directives/`):

- **Workforce.** Sliders for four groups: Forage (scouting, foraging, tending aphids), Nurse (feeding and warming brood, attending the queen, storing food), Dig (excavating and hauling soil) and Defend (guarding entrances, patrolling). "Auto" lets the colony set targets from need; moving a slider turns Auto off; the lock button fixes one group. With fewer than four workers the panel says the priorities hardly matter.
- **Brood production.** Workers only, Balanced or Raise alates (winged queens and males), with a setting for what to do when alates are ready: release when ready, ask first, or hold. The Raise alates choices are greyed, with the reason, when the colony cannot raise them yet.
- **Diet emphasis.** Auto, or a slider from carbohydrate to protein. It tilts which food the foragers favour; larvae and the queen still need what they need.
- **Stores and safety.** Stock target (Low, Normal, High), "Keep foragers in" and the stance toward rivals (Cautious, Defensive, Aggressive).
- **Nest.** The nest architect: Auto or Off ("Suggest" is shown greyed: "Suggestions arrive with the full sandbox"), and "Seal entrances in cold weather".

Orders and panels work while the game is paused.

## 6. Markers and dig plans

In colony view the marker palette offers seven tools, chosen with the palette or `Shift+1` to `Shift+7` (`src/ui/panels/markers/model.ts`):

| Key | Tool | What a click does |
| --- | --- | --- |
| `Shift+1` | Dig | Point at a nest wall to plan a chamber, tunnel or shaft; click to confirm. A chamber has a type and a size (S, M, L) and a priority. |
| `Shift+2` | Forage | Foragers favour this area. Drag to set the radius. |
| `Shift+3` | Avoid | Workers keep out of this area. |
| `Shift+4` | Rally | Workers gather here (defend or attack). |
| `Shift+5` | Entrance | Plan a new way out from the surface above a tunnel or chamber. |
| `Shift+6` | Move brood | The brood is carried to the chamber you click. |
| `Shift+7` | Move queen | The queen is escorted to the chamber you click. |

Each tool has a cap on how many may exist; the palette shows the count ("3/8"). With no tool active, click a marker or a dig plan to select it; `Delete` removes it and `Ctrl+Z` undoes the last placement. Markers are a game abstraction: the ants carry them out by themselves, so the result is not instant. Dig plans are drawn in the nest in every view; Photo mode can hide them.

## 7. Scent view and overlays

- `V` toggles the **scent view**: the pheromone trails (chevrons show direction, also up walls), home range, alarm and food odour plumes.
- `O` cycles the other overlays: **temperature**, **moisture**, **threats** and **dig plans**. Only one of these is on at a time; the scent view can be on together with any one. Each overlay has a legend.
- Settings > Accessibility > Overlay palette: Okabe-Ito colours, high contrast, or pattern only. Every overlay channel also has its own pattern, so colour is not the only cue.

## 8. Alerts and auto-slow

Alerts come in four levels: info, notice, warning and critical. The feed at the screen edge shows up to three cards with the level word, a title and a cause, and a "+n more" chip. Clicking a card opens **Colony health** (`Y`) at the diagnostic that raised it, or jumps to the place. `Backquote` moves the keyboard focus into the feed. `Enter` goes to the newest alert.

**Colony health** lists every diagnostic worst first with a value, a trend and a chain of causes ("why") and, where one exists, a remedy button. This is the place to ask why food intake fell or brood slowed.

**Auto-slow.** When a critical alert is raised, the game drops the speed to 1x (or pauses). The setting `gameplay.autoSlowCritical` has three values (`pause`, `slow`, `off`); `autoSlowWarning` has two (`slow`, `off`). Default: critical slows, warnings do nothing. The winter warning and the flight weather prompt slow time whatever their level. There is one slow-down per alert kind and level per 0.25 game days, never while paused, and never a speed increase. The game flashes the speed control once when it acts. **These two settings are in the settings file but have no control in the Settings screen in this build.**

## 9. Time controls

- `P` or `Pause` pauses. `1`, `2`, `3`, `4` set 1x, 2x, 4x and 8x. `=` and `-` step the speed up and down.
- While you control an ant the speed is limited to 4x (8x is for the observer and colony views). With "Return to 1x when taking control" on (the default), taking control sets 1x.
- During the opening's search, dig, seal and lay phases the limit is 2x.
- Photo mode, the pause menu, the title and loading screens stop the simulation. Time-lapses (first brood, winter) set their own rate.
- Other settings: "Pause when the window loses focus" (on), "Pause after loading" (off), "Pause while a panel is open" (off).

One game day is 10 minutes at 1x: 6000 simulation ticks of 0.1 s.

## 10. Saving and loading

- Autosave runs every 5 minutes of real play by default (Settings > Gameplay: Off, 2, 5 or 10 minutes) and when the season changes.
- `F5` saves to the quick slot; `F9` loads it.
- The Save and Load page (from the pause menu or the title) has the autosave ring, the quick slot and five manual slots. Each slot can be exported; manual slots can be deleted.
- Export writes a `.foundress` file. If the browser blocks downloads, the page offers the save as text to copy; Import takes a file or pasted text (it starts with `FOUNDRESS1:`).
- If the browser does not allow storage, the game still runs. Use Export to keep a colony.
- Saved games keep the world seed and its changes (digging, markers, stores); the static world is regenerated on load.

## 11. Photo mode

`F2` opens Photo mode from a play view. The simulation stops while it is open. The panel on the right sets (`src/ui/screens/photo/ControlsPanel.tsx`):

- Subject (click an ant or creature to pick one; Frame puts it in view; Orbit subject).
- Focal length, aperture, focus distance and focus mode (Subject, Centre, Manual), exposure, roll.
- Look (the presets listed in the panel), guides, the scent view and one other overlay, and "Hide markers and outlines".
- Capture at the screen size or at 2x if the graphics card allows it. A preview card shows the result.

`Enter` captures; `F2` or the exit control leaves. Keys are in section 13.

## 12. Settings and accessibility

Settings has five tabs: Graphics, Audio, Controls, Accessibility, Gameplay. The saved settings file is validated on load (`src/game/settings/schema.ts`): a value out of range is clamped and an unknown field is dropped. The name in brackets is the field in that file.

**Graphics.** Quality preset (Auto, Low, Medium, High, Ultra), resolution scale, dynamic resolution, target frame rate (30 or 60), depth of field (off, subtle, full), haze, shadows (off, low, high), grass and litter density, field-of-view offset (`camera.fovOffset`), fullscreen. Quality `test` is only for scripted runs.

**Audio.** Master volume (`audio.master`), volume for the Ambience, Effects, Giant sounds, Interface and Music buses, mute (`muted`), music (`musicMode`: off, sparse, frequent), distant voices, mute when the tab is hidden (`muteWhenHidden`), mono (`mono`), alarm shimmer (`alarmShimmer`, the audible stand-in for alarm pheromone). Sound starts only after a click or key press.

**Controls.** Mouse look (`mouseLook`: drag or locked), left mouse button (`leftButton`: bite or orbit), mouse sensitivity, invert vertical look, gamepad dead zone, hold duration (`holdMs`, 300 to 1500 ms: all hold-and-tap thresholds stretch together), orbit by drag toggle (`orbitToggle`), and every key and pad binding (rebindable; each action has two keyboard/mouse slots and one pad slot). The game refuses to close Settings while a required action (menu, interact, release, movement keys) has no binding.

**Accessibility** (`accessibility.*`):

| Setting | Values |
| --- | --- |
| UI scale (`uiScale`) | 80 to 150 %, steps of 10 |
| Text size (`textScale`) | 100, 115, 130 % |
| Font (`font`) | Standard or Atkinson Hyperlegible |
| High contrast (`highContrast`) | on / off |
| Reduced motion (`reducedMotion`) | system, on, off |
| Camera shake and sway (`shake`) | 0 to 100 % |
| Camera horizon (`camera.worldUpLock`) | follow the ant, or keep the horizon level |
| Spider comfort (`spiderComfort`) | off, softened, abstract, marker; "Also apply to mites and centipedes" (`comfortMites`, `comfortCentipedes`) |
| Overlay palette (`overlayPalette`) | Okabe-Ito, high contrast, pattern only |
| Sound-cue indicators (`soundCues`) | on-screen pips with icons for sounds |
| Flash reduction (`flashReduction`) | on by default: lightning becomes a soft glow |

**Gameplay** (`gameplay.*`): autosave, prompts (always, while learning, never), hints and aims, minimap, focus line (auto, always, never), milestone notices (full, quiet, off), return to 1x when taking control (`dropTo1xOnPossess`), take over a nestmate when your ant dies (`autoRepossessOnDeath`), pause when the window loses focus (`pauseOnBlur`), pause after loading (`pauseOnLoad`), pause while a panel is open (`pauseWhenPanelOpen`), camera follow (`camera.autoFollow`: off, gentle, strong). The two auto-slow fields have no control (section 8). Settings > Gameplay also has a "Reset hints" button.

## 13. Keyboard, mouse and gamepad

The tables are generated by `controlsMarkdown()` in `src/content/text/controls.ts` from the default bindings in `src/input/actions.ts` (button actions `BUTTON_ACTIONS`, axes `AXES` and their components), with pad glyph names from `src/input/glyphs.ts`. Default values from `src/input/defaults.ts`: stick dead zone 0.15, trigger threshold 0.3, hold-and-tap threshold 250 ms, interact hold 400 ms, alarm hold 500 ms.

Notation: `LMB`, `RMB`, `MMB` are the left, right and middle mouse buttons; "tap" and "hold" are pad gestures; `LB+Dpad up` means hold LB and press the D-pad up. In menus the pad uses A to confirm, B to go back, LB and RB to change tabs. Pad buttons are written as Xbox letters; with a PlayStation pad the game prints the PlayStation shapes.

#### Anywhere in play

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Pause menu / back | Esc | Start tap |
| Pause / resume | P or Pause | LB+Dpad up |
| Speed 1x | 1 | none |
| Speed 2x | 2 | none |
| Speed 4x | 3 | none |
| Speed 8x | 4 | none |
| Speed up | = | LB+Dpad right |
| Speed down | - | LB+Dpad left |
| Hide / show HUD | H | LB+Dpad down |
| Dismiss the hint on screen | Shift+H | RB+View |
| Focus the alert feed | Backquote | LB+View |
| Quick save | F5 | none |
| Quick load | F9 | none |
| Colony orders | I | RB+Dpad up |
| Nest overview | U | RB+Dpad left |
| Codex | K | RB+Y |
| Journal | J | RB+X |
| Colony health | Y | RB+Dpad right |
| Roster | L | RB+Dpad down |
| Show controls | Shift+/ | Start hold |
| Go to newest alert | Enter | LB+RB |

#### In every play view

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Colony view | M | View hold |
| Scent overlay | V | Dpad left |
| Photo mode | F2 or LS+RS | RS+LS |
| Cycle overlays | O | RB+B |
| Possess a forager | 5 | LB+X |
| Possess a digger | 6 | LB+A |
| Possess a nurse | 7 | LB+B |
| Possess the queen | 8 | LB+Y |

#### Controlling an ant or observing

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Mouse look: drag or captured | F8 | none |
| Next nearby ant | Tab | RB tap |
| Previous nearby ant | Shift+Tab | LB tap |
| Back to previous ant | Backspace | none |

#### Controlling an ant

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Hurry | Shift or Right Shift | LS |
| Camera behind the ant | Z or MMB click | RS |
| Interact (hold: secondary) | E | A |
| Next target | B | Dpad right |
| Dig / cut / chew | F | X |
| Inspect (hold: antennal sweep) | T | Y |
| Bite (hold: bite and hold) | LMB or Q | RT |
| Species special (hold: alarm) | RMB click or C | LT |
| Lay trail on / off | R | Dpad up |
| Share food | G | Dpad down |
| Let go / drop (hold: grip) | Space | B |
| Release to observer | X | View tap |
| Move | W A S D | Left stick |
| Orbit camera | Up Left Down Right; RMB drag or MMB drag | Right stick |
| Camera distance | in [ or Wheel up, out ] or Wheel down | in LB+right stick up, out LB+right stick down |

#### Observer view

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Skip to next event | N | LB+LS |
| Fly up | Space | RT |
| Fly down | C | LT |
| Fly fast | Shift or Right Shift | LS |
| Select | LMB click | A |
| Possess | E or LMB hold or LMB double-click | X |
| Follow | F | Y |
| Deselect | RMB click | B |
| Fly | W A S D | Left stick |
| Look | Up Left Down Right; RMB drag | Right stick |
| Pan | MMB drag | none |
| Follow distance | in [ or Wheel up, out ] or Wheel down | in LB+right stick up, out LB+right stick down |

#### Colony view

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Cutaway up | R or Shift+Wheel up | Dpad up |
| Cutaway down | F or Shift+Wheel down | Dpad down |
| Cutaway mode | G | Y |
| Select / place | LMB click | A |
| Cancel tool / deselect | RMB click | B |
| Delete marker | Delete | X |
| Pan | W A S D; MMB drag | Left stick |
| Rotate | left Q, right E; RMB drag | Right stick |
| Zoom | in Wheel up, out Wheel down | in RT, out LT |

#### Photo mode

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Photo: up | Space | RT |
| Photo: down | C | LT |
| Photo: focus here | LMB click | A |
| Photo: aperture smaller | [ | Dpad down |
| Photo: aperture wider | ] | Dpad up |
| Photo: exposure down | - | LB+Dpad down |
| Photo: exposure up | = | LB+Dpad up |
| Photo: roll left | , | Dpad left |
| Photo: roll right | . | Dpad right |
| Photo: guides | H | Y |
| Photo: capture | Enter | X |
| Photo: exit | none | B |
| Photo: move | W A S D | Left stick |
| Photo: look | Up Left Down Right; RMB drag | Right stick |
| Photo: focal length | in Wheel up, out Wheel down | in LB+right stick up, out LB+right stick down |
| Photo: focus distance | in Shift+Wheel up, out Shift+Wheel down | none |

#### During a time-lapse

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Skip time-lapse (hold) | Space | A |
| Step in | E | X |

#### Menus and panels

| Action | Keyboard and mouse | Gamepad |
| --- | --- | --- |
| Menu up | Up | Dpad up |
| Menu down | Down | Dpad down |
| Menu left | Left | Dpad left |
| Menu right | Right | Dpad right |
| Menu confirm | Enter or Space | A |
| Menu back | none | B |
| Previous tab | Q | LB |
| Next tab | E | RB |
| Menu secondary action | Shift+Enter | X |
| Menu tertiary action | none | Y |
| Scroll up | PageUp | LT |
| Scroll down | PageDown | RT |

## 14. What the colony needs

This section follows the rules as built; the numbers live in `src/sim/balance/` and the species file `src/sim/species/data/lasius-niger.ts`. The design chapters are `docs/design/gdd/02`, `03`, `05` and `06`; where the game differs, see `docs/design/gdd/DEVIATIONS.md`.

**Food.** Two kinds are tracked, carbohydrate (C) and protein (P). Adults live mostly on C. Larvae need protein. The queen needs both to lay.

- C comes from honeydew (aphid herds that ants tend), nectar (flowers and extrafloral nectaries), fruit, sugary spills and crumbs.
- P comes from small prey (patches of springtails and similar, which foragers hunt) and carrion (dead insects). Seeds are a food for the seed-harvesting species. Human food (crumbs, pet food) and bait stations exist in some localities; bait can poison.
- Sources run out and refill on their own schedule. Aphid herds decline late in the season. Foragers who know a source of what the colony lacks go out sooner, and scouts look for what is not known.
- Solid food (prey, carrion) is carried in pieces. A nest with no food chamber piles it in the chamber the brood lives in, up to about a day's need; the first food chamber is planned when a delivery is refused for lack of space.
- Stores are shown in Colony orders (Diet emphasis section) and Colony health. A colony short of one kind shows an alert (`food-c-low`, `food-p-low`).

**Brood.** The queen lays eggs; eggs become larvae, then pupae, then workers. Development is faster in a warm chamber. Brood is lost to: being left untended too long, a chamber with too much waste, dry air, cold or heat, flooding, exposure outside a chamber, and starvation (larvae). Nurses feed larvae from the colony's stores and carry brood between chambers. A queen lays only while protein is available to her; late in the season a small colony stops laying protein-costly eggs unless it has carbohydrate to last until winter.

**Waste.** Dead ants and waste are carried by haulers to the midden. Waste lying among brood past a tolerance kills brood. A nest with few workers may have no hauler free; Colony orders > Workforce > Nurse and Dig affect this.

**Digging.** Workers dig the plans you place and, with the architect on, the chambers the nest needs. Soil becomes pellets carried out to a mound. Soil, wet weather and water matter: a chamber can flood in heavy rain, and ants flee rising water; a site read as "flood-safe" at the start is lower risk.

**Winter.** The year has four seasons. Host plants (and so aphid herds) decline from about day 10 of the 28-day year, and cold slows the brood. A winter warning appears about 1.5 game days before the winter banner. Winter is resolved as a time-lapse that can be skipped. (The rule table has a real-time winter option, but no screen offers it.) The lapse loses workers by cold, disease, flooding and old age, and the colony needs stores that cover its carbohydrate need through winter plus a few days of spring (ruling R27). The queen stops laying in the cold. A colony without stores starves in the lapse.

**Other threats.** Predators (spiders, beetles, centipedes and others, scaled by difficulty and by the size of your colony), rival colonies, birds, weather (rain, heat, frost) and humans (feet, mowers, brooms, hoses, cars) change what is safe. Alerts name the cause.

**Succession.** If the queen dies the colony declines and lays nothing more; winged brood can still fly. The game ends when no living ant is left; an epitaph screen shows the history. Winged queens that fly in a nuptial flight start a lineage; you can found a new colony as a daughter queen in a new locality.

## 15. Known problems

From `docs/STATUS.md` and the application gate report (`docs/design/tasks/gate-close-app-report.md`, section 7), as of 2026-11-18. These may change while the work goes on.

**Simulation.**

- **Colonies do not reliably grow.** In unattended test runs, few colonies met the survival bar at the first winter, and growth in the second year was not shown. The first workers often live on the queen's provision; protein intake is low. A colony you play may stagnate or die in the first year.
- Foragers often wait at the entrance ("waiting to leave - timeout") and few ants are on the surface.
- Predation was recalibrated on 2026-11-17 and is lower for small colonies; the stop-gap values are in force.
- Death causes in the epitaph are sometimes "unknown".
- The entrance can stay in a "reopening" state for days after a pad-played opening, which keeps the hints silent.
- Three rulings are not built: reopening time after hand-over (R14), stacked-rain flooding on a safe site (R13) and the "loud hour" definition (R28). See `docs/design/gdd/DEVIATIONS.md`.

**Not available.** The carpenter, harvester and leafcutter species (section 1.3). Five difficulty parameters and two custom rules have no effect (section 1.6). Winter and "extinction ends the game" are rules with no control on the New Game screen. The nest architect's "Suggest" mode, thief ants and some human-event effects are not built.

**Settings.** The auto-slow settings have no control (section 8). The New Game help text for the natural start says day 3; it is day 5.

**Look and feel (render).** Night at ground level reads like an overcast day; leaves read as flat decals; the entrance mound has square edges at its foot; the follow camera can tip toward the sky on a slope; ants can look pale or milky at night and in night rain; chamber labels in colony view are sometimes smeared; a pale strip shows at the horizon at night. A look pass (look-pass-3) is in progress and some of these may change.

**Performance.** Frame time has not been measured on a real GPU. All rendering tests used software rendering. 

**Browsers.** Only Chromium has been tested. The game works inside a sandboxed iframe, where pointer lock, fullscreen and sound may be refused; the game then carries on without them.

If something is wrong that is not listed here, the debug flags in README.md (`?test=1` and the `window.__game` API) can reproduce a state quickly.

Footer: written at commit `fb15f3d`, 2026-11-18. The controls tables in section 13 were generated on that day by `node tools/sim/run-ts.mjs` over `controlsMarkdown()`; if the bindings change, regenerate them (or run `src/content/text/controls.test.ts`).
