# FOUNDRESS player's manual

This manual describes the game as it is on 2026-11-24. It says what the game does today. Where something is unfinished or not in the game yet, it says so. The game is a first playable and has known problems: they are listed in section 20.

This is the only manual. An older draft that lived in `docs/manual/` has been merged into this file (sections 15 to 19 and the notes in section 13) and removed. The tables marked "generated" are written by `tests/docs/regen-manual.mjs` from the code that the game reads (section 20 says how to run it); `tests/docs/docs-final.test.ts` fails when they drift.

## 0. Conventions

- **Body length (BU).** Distances are given in body lengths of the standard worker of the species you play. For the black garden ant one BU is 4 mm.
- **Game day.** One game day is 10 minutes at normal speed (1x). A year has four seasons of 7 days each (the season length can be set to 5, 7 or 10 days when you start a game, section 1.5). Ants walk at real speed; growth, ageing and the seasons run on the game calendar.
- **C and P.** The colony tracks two kinds of food: carbohydrate (C: sugars, honeydew, nectar) and protein (P: insects and carrion).
- **Possess.** To take control of an ant is to possess it.
- **Key names** are the defaults. The keys in the tables of section 13 can be changed in Settings > Controls; those tables are generated from the bindings in the code. A few keys are fixed and cannot be changed: they are listed in section 6 (marker tools, undo, plan rotation and resize) and are not in section 13.

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

<!-- generated:species:start -->
| Species | Common name | Playable now | Natural start season | The card says |
|---|---|---|---|---|
| *Lasius niger* (`lasius-niger`) | Black garden ant | yes | spring | A generalist of soil and paving that ranches aphids for honeydew. Founding: Dig, seal, lay, wait. |
| *Camponotus pennsylvanicus* (`camponotus-pennsylvanicus`) | Black carpenter ant | no: "Not yet available" | spring | Nests in damp wood and works by night along trunk trails. Slow to grow. Founding: Find damp wood, chew a cell, seal. |
| *Messor barbarus* (`messor-barbarus`) | Harvester ant | no: "Not yet available" | autumn | Gathers seed, mills it into paste and keeps granaries through the dry months. Founding: Dig deep in dry ground after autumn rain. |
| *Atta texana* (`atta-texana`) | Texas leafcutter ant | no: "Not yet available" | spring | Cuts leaves to grow a fungus garden; the fungus is all the brood eats. Founding: Dig, plant the fungus pellet, tend it. |
<!-- generated:species:end -->

Only the black garden ant can be started. The other three cards are greyed with the words "Not yet available". Their simulation modules exist, but their colonies did not meet the survival bar in the test runs (README, "State of the game today"). The `species=` URL flag starts one of them only in test mode (`?test=1&species=<id>`); on an ordinary page the flag is ignored. Those games are not playable in the sense of this manual: the colonies did not survive the test runs.

### 1.4 Locality

Choose Woodland Edge, Suburban Garden, Playground Park, Car Park Verge, Kitchen Door or Random. Each card shows up to four kinds of ground it contains and a word for how well it suits the species: Good, Fair or Poor. Random picks one for your species from the seed.

- **Size:** Compact (3000 BU across), Standard (4000) or Large (5000).
- **Seed:** any text up to 32 characters. An eight-digit hexadecimal code such as `4F7A-21C9` is used as the seed itself; any other text is hashed. The page shows the seed code it turns into. The same seed with the same settings gives the same locality. Randomise fills in a new one.

### 1.5 Starting season

Natural, Spring, Summer or Autumn. Winter is greyed out. Natural is the species' own founding day, read from the species data: for the black garden ant, day 5 of spring (ruling R20), at 7-day seasons; the day moves with the season length. The other choices start on day 3 of the chosen season. The help text under the control names the season and the day of the choice you have made.

### 1.6 Difficulty and rules

Gentle, Naturalist (the default) and Harsh are presets. Under each card, "What ... changes" lists every parameter the preset sets. Changing any custom rule turns the card into Custom.

The text of each card says what the preset changes (it is `PRESET_SUMMARY` in `src/sim/config/presetDisplay.ts`; it makes no claim about how a game goes). The table below is generated from the same file (`PRESET_ROWS`, `presetCard`). A row marked **not in effect** has no consumer in the game: nothing reads that value. The New Game screen greys out every such row and labels it "Not in this build". The row "Automatic slow-down at an alert" is in effect: when a new game begins, its value (pause for Gentle, slow for the others) becomes the starting value of Settings > Gameplay > "Slow down at a critical alert" (section 8). The row "Grace period before threats" is in effect too: for that long at the start of a game no human event and no predator (ants' predators, bird visits) is spawned.

<!-- generated:presets:start -->
| Group | Parameter | Gentle | Naturalist | Harsh |
|---|---|---|---|---|
| Founding | Exposure to the sun while founding | x0.5 | x1 | x1.3 |
| Founding | Brood losses in the founding chamber | x0.7 | x1 | x1.3 |
| Founding | Queen reserves burned | x0.85 | x1 | x1.15 |
| Founding | Threats during the opening (at most) **(not in effect)** | 0 | 2 | 4 |
| Founding | Interruptions of the first-brood time-lapse (at most) | 0 | 2 | 3 |
| Founding | Grace period before threats | 0.6 days | 0.3 days | 0.15 days |
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
| Threats, rivals, humans | Rival colonies | 1 young rival nearby | 2 young rivals nearby | 3 young rivals nearby |
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
<!-- generated:presets:end -->

Custom rules. Eight rules are offered under "Custom rules" on the New Game screen (predators, rival colonies, human activity, weather severity, season length, founding leniency, winter and nest collapse), and a ninth, Starting season, sits in the Locality column: these are the nine rows marked "on screen" below. The three rules marked "greyed" are listed on the screen with the words "Not in this build": two because nothing reads them, and "Extinction ends the game" because the game could not be ended once the last ant has died (no screen retires a colony). Each rule has a one-line help text; where the effect it names includes a part that nothing reads yet (predators: threats during the opening and predator events on the nuptial flight; founding leniency: threats during the opening), the text says "Not in this build" for that part. Season length, starting season and the number of rivals are fixed when the world is made.

The Gentle, Naturalist and Harsh columns show the value each preset sets (`presetRuleValues` in `src/sim/balance/difficulty.ts`). Season length is 7 days and starting season is Natural in all three presets. The `rivals` rule counts established rival colonies. It is not the same as the preset row "Rival colonies" in the table above, which counts the young rival colonies nearby (1, 2 or 3): the rule value 0 removes both (ruling R23).

<!-- generated:rules:start -->
| Rule | Choices | Gentle | Naturalist | Harsh | New Game screen | In effect |
|---|---|---|---|---|---|---|
| Predators (`predators`) | Off, Few, Normal, Many | few | normal | many | on screen | yes |
| Rival colonies (`rivals`, fixed at world generation) | 0, 1, 2, 3, 4 | 2 | 3 | 4 | on screen | yes |
| Human activity (`humanActivity`) | Off, Low, Normal, High | low | normal | high | on screen | yes |
| Weather severity (`weatherSeverity`) | None, Mild, Normal, Severe | normal | normal | normal | on screen | yes |
| Season length (`seasonLengthDays`, fixed at world generation) | 5 days, 7 days, 10 days | 7 | 7 | 7 | on screen | yes |
| Starting season (`startSeason`, fixed at world generation) | Natural, Spring, Summer, Autumn | Natural | Natural | Natural | on screen (Starting season, in the Locality column) | yes |
| Founding leniency (`foundingLeniency`) | Lenient, Normal, Strict | lenient | normal | strict | on screen | yes |
| Winter (`winterMode`) | Time-lapse, Real time | time-lapse | time-lapse | time-lapse | on screen | yes |
| Founding assist (`foundingAssist`) | On, Off | on | on | off | greyed: "Not in this build" | **no** |
| Queen ageing (`queenSenescence`) | On, Off | off | off | on | greyed: "Not in this build" | **no** |
| Nest collapse (`collapse`) | On, Off | off | on | on | on screen | yes |
| Extinction ends the game (`extinctionEndsGame`) | On, Off | on | on | on | greyed: "Not in this build" | yes |
<!-- generated:rules:end -->

The ruling R23 is in `docs/design/gdd/DEVIATIONS.md`.

"Hints" switches the quiet teaching hints of the first days on or off.

### 1.7 Loading

Making the world takes some seconds. The loading page shows the stages. If generation fails the page says so and offers another seed. Cancel returns to the setup page.

## 2. The opening, step by step

You begin as a single founding queen, playing by hand. The game teaches one verb at a time with a prompt near the queen. A prompt stops showing once you have used its verb a few times. The key on the prompt is the key you have bound. The journal's aims ask one question at a time ("Where is the ground sheltered, warm and diggable?"). The **Focus line** under the clock shows the current top aim ("Aim: ..."); a click on it opens Journal > Aims (`J`). In Settings > Gameplay > Focus line, Auto shows it through the first 2 game days of a colony and for 30 real seconds each time a new aim opens, Always keeps it on, Never hides it. The aims also appear on the hand-over banner. They never block play.

The steps (hint and aim wording: `src/content/text/hints.ts`). First an intro card names the species, the locality, the season and the day; it fades on any input, and no prompt is drawn over it.

1. **Search.** Walk with `W A S D`; look around by dragging with the right or middle mouse button (or the arrow keys). Antennate the ground with `T` (Inspect) to read the soil. Sheltered ground that is neither dry nor flooded is better than open lawn. The speed is limited to 2x in the search, dig, seal and lay phases.
2. **Dig.** Hold `F` on diggable ground. The queen carries the soil out as pellets and drops them beside the shaft. A readiness bar shows when the shaft is deep enough and the chamber large enough.
3. **Seal.** At the shaft, hold `E` to plug the entrance with soil. From then on the queen lives on her own reserves, and a gauge shows how much is left.
4. **Lay.** In the chamber, press `E` to lay the first eggs.
5. **First brood.** A time-lapse shows the eggs become larvae, pupae and workers while her reserves fall. The camera leaves the queen's back and looks down into her cell through a cut in the ground, turning slowly (not at all with reduced motion). It can be skipped by holding the skip key (Space or A). The time-lapse does not stop for choices in this build (the interrupt beats of the design are not raised yet). With reduced motion the camera does not turn: it holds one still view and retakes it, with a short crossfade, every 3 seconds.
6. **Hand-over.** The result card ("First workers: N" and the queen's reserves) stands over the same view of the cell, with the queen and her first workers in the upper part of the screen; Continue closes it and the camera comes back to the queen. The first workers open the plug. A hint offers `Tab` to possess a worker; you may stay with the queen. The workers are small first-brood workers; the queen's remaining reserve is passed to the colony as a provision (ruling R2).

If the founding fails, a card ("The founding did not succeed" and the reason) stands over the same view of the cell and, depending on the difficulty, offers another site ("Try another site"; Gentle: 3 tries, Naturalist: 1, Harsh: 0) or "Let it end".

After the hand-over:

- `Tab`<!--key:possess-next--> takes a worker. Possessing changes who you control, not the biology: the ant still gets hungry, ages and can die.
- `X`<!--key:release--> lets go and lets you watch the colony. In the observer view you can fly, click an ant to inspect it, and take control of any ant of your colony.
- `M`<!--key:colony-view--> surveys the colony from above, with a cutaway of the nest, and places markers. `I`<!--key:directives--> opens Colony orders, the priorities of the whole colony.
- `P`<!--key:pause-toggle--> pauses. Orders, markers and panels work while the game is paused. `Esc`<!--key:menu--> opens the pause menu, which has Save, Load, Settings and Controls.

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
- `5` forager, `6` digger, `7` nurse, `8` the queen: possess an ant with that job (any play view).
- In the observer view: `E`, holding the left mouse button, or a double click possesses the selected ant; `F` follows it; right click deselects.
- Possessing changes who you control, not the biology: the ant still ages and can die. If your ant dies, the camera stays on the body and the prompt offers `Tab` to take another ant; or the game takes over a nestmate if you set "Take over a nestmate when your ant dies" (section 12).

The nest cutaway in colony view has a slice: `R` and `F` (or `Shift` with the mouse wheel) move it up and down; `G` changes the cutaway mode. In colony view `W A S D` pan, `Q` and `E` rotate the camera, the wheel zooms. While the Dig or Entrance tool is active, `Q` and `E` rotate the plan instead of the camera (section 6).

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

**Fixed keys.** These keys are read directly and cannot be changed in Settings > Controls, so they are not in the tables of section 13 (`src/game/views/colony/colonyControl.ts`, `colonyKeys`):

| Key | What it does |
| --- | --- |
| `Shift+1` to `Shift+7` | Select a marker tool, as in the table above. |
| `Ctrl+Z` (or `Cmd+Z`) | Undo the last marker placement. |
| `Q` and `E` with the Dig or Entrance tool active | Rotate the plan. They do not turn the camera while the tool is active. |
| `Shift` + mouse wheel with the Dig or Entrance tool active | Make the plan larger or smaller. With another marker tool active it changes that marker's radius. With no tool it moves the cutaway slice. |

Each tool has a cap on how many may exist; the palette shows the count ("3/8"). With no tool active, click a marker or a dig plan to select it; `Delete` removes it and `Ctrl+Z` undoes the last placement. Markers are a game abstraction: the ants carry them out by themselves, so the result is not instant. Dig plans are drawn in the nest in every view; Photo mode can hide them.

## 7. Scent view and overlays

- `V` toggles the **scent view**: the pheromone trails (chevrons show direction, also up walls), home range, alarm and food odour plumes.
- `O` cycles the other overlays: **temperature**, **moisture**, **threats** and **dig plans**. Only one of these is on at a time; the scent view can be on together with any one. Each overlay has a legend.
- Settings > Accessibility > Overlay palette: Okabe-Ito colours, high contrast, or pattern only. Every overlay channel also has its own pattern, so colour is not the only cue.

## 8. Alerts and auto-slow

Alerts come in four levels: info, notice, warning and critical. The feed at the screen edge shows up to three cards with a shape for the level (screen readers read the level word), a title and a cause, and a "+n more" chip. A notice leaves after 12 seconds and a warning collapses into the chip after 30; a critical card stays until the alert clears or you acknowledge it. When an alert clears its card shows "Resolved" for 4 seconds and then leaves; while a card that takes the middle of the screen is up (the opening's intro card, the first-brood time-lapse and its result and failure cards, the winter time-lapse and its report) a Resolved card leaves at once, since nobody can read it there. The hand-over banner, the winter banner and the flight prompts do not count: play goes on under them and alerts behave as usual. Alerts that are still active stay. Clicking a card opens **Colony health** (`Y`) at the diagnostic that raised it, or jumps to the place. `Backquote` moves the keyboard focus into the feed. `Enter` goes to the newest alert.

**Colony health** lists every diagnostic worst first with a value, a trend and a chain of causes ("why") and, where one exists, a remedy button. This is the place to ask why food intake fell or brood slowed.

**Auto-slow.** When a critical alert is raised, the game drops the speed to 1x (or pauses). Settings > Gameplay has the two controls: "Slow down at a critical alert" (`gameplay.autoSlowCritical`: Pause, Slow to 1x, Off) and "Slow down at a warning" (`gameplay.autoSlowWarning`: Slow to 1x, Off). The values start at critical slows, warnings do nothing. A new game takes its preset's row "Automatic slow-down at an alert" (section 1.6) as the starting value of the critical choice: Gentle pauses, Naturalist and Harsh slow. A choice of Off is kept. You can change it at any time; it stays until the next new game. The winter warning and the flight weather prompt slow time whatever their level, by the critical choice. There is one slow-down per alert kind and level per 0.25 game days, never while paused, and never a speed increase. The game flashes the speed control once when it acts.

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

**Gameplay** (`gameplay.*`): autosave, prompts (always, while learning, never), hints and aims, minimap (`gameplay.minimap`: never or always, section 15), focus line (`gameplay.focusLine`: auto, always, never, section 2), milestone notices (full, quiet, off), slow down at a critical alert and at a warning (`gameplay.autoSlowCritical`, `gameplay.autoSlowWarning`, section 8), return to 1x when taking control (`dropTo1xOnPossess`), take over a nestmate when your ant dies (`autoRepossessOnDeath`), pause when the window loses focus (`pauseOnBlur`), pause after loading (`pauseOnLoad`), pause while a panel is open (`pauseWhenPanelOpen`), camera follow (`camera.autoFollow`: off, gentle, strong). Settings > Gameplay also has a "Reset hints" button. Every setting in this tab has a control and is read by the game.

## 13. Keyboard, mouse and gamepad

The tables are generated by `controlsMarkdown()` in `src/content/text/controls.ts` from the default bindings in `src/input/actions.ts` (button actions `BUTTON_ACTIONS`, axes `AXES` and their components), with pad glyph names from `src/input/glyphs.ts`. Default values from `src/input/defaults.ts`: stick dead zone 0.15, trigger threshold 0.3, hold-and-tap threshold 250 ms, interact hold 400 ms, alarm hold 500 ms.

Notation: `LMB`, `RMB`, `MMB` are the left, right and middle mouse buttons; "tap" and "hold" are pad gestures; `LB+Dpad up` means hold LB and press the D-pad up. In menus the pad uses A to confirm, B to go back, LB and RB to change tabs. Pad buttons are written as Xbox letters; with a PlayStation pad the game prints the PlayStation shapes.

The Photo mode row lists `F2` for the keyboard and two chords for the gamepad: press both sticks in, in either order (`LS+RS` or `RS+LS`).

### The essentials

| To do this | Press |
| --- | --- |
| Walk | `W A S D`<!--key:move--> |
| Look around | `RMB drag`<!--key:orbit--> (or the arrow keys) |
| Hurry | hold `Shift`<!--key:hurry--> |
| Interact: pick up, put down, feed a larva, seal, lay | `E`<!--key:interact--> |
| Dig, cut, chew | hold `F`<!--key:dig--> |
| Antennate: read what is in front of the ant | `T`<!--key:inspect--> |
| Bite | `Q`<!--key:bite--> |
| Lay or stop laying a trail | `R`<!--key:trail-toggle--> |
| Share food with a nestmate | `G`<!--key:share-food--> |
| Let go or drop | `Space`<!--key:foot--> |
| Let go of the ant and watch | `X`<!--key:release--> |
| Take the next ant near you | `Tab`<!--key:possess-next--> |
| Take a forager, a digger, a nurse, the queen | `5`<!--key:possess-forager--> `6`<!--key:possess-digger--> `7`<!--key:possess-nurse--> `8`<!--key:possess-queen--> |
| Colony view | `M`<!--key:colony-view--> |
| Colony orders | `I`<!--key:directives--> |
| Pause, or resume | `P`<!--key:pause-toggle--> |
| Speed 1x, 2x, 4x, 8x | `1`<!--key:speed-1--> `2`<!--key:speed-2--> `3`<!--key:speed-4--> `4`<!--key:speed-8--> |
| Pause menu | `Esc`<!--key:menu--> |

Pressing a key twice within a short time, or holding it, can mean a different thing: tap `E`<!--key:interact--> to pick up, hold it for the second action. Hold `T`<!--key:inspect--> for an antennal sweep. A prompt near the ant always names the action that is available.


### Looking around without pointer lock

By default you turn the camera by dragging with the right mouse button; the middle button also drags in the observer and colony views. Nothing needs the mouse to be captured. Pointer lock is an option (`F8`<!--key:pointer-lock-toggle--> toggles it): if the browser refuses it, the game says so and the drag controls keep working.

### Browser keys

`F5`<!--key:quick-save--> and `F9`<!--key:quick-load--> are quick save and quick load, and `F2`<!--key:photo-mode--> is photo mode. The game stops the browser from acting on these keys only while the game itself has focus and no text field is active. Some pages that embed the game swallow function keys. Every one of those actions is also in a menu.

### Rebinding

Select a binding in Settings > Controls, press the new key, and the game tells you if the key is already in use in the same layer. Escape, F11 and F12 cannot be bound, and neither can Ctrl, Alt or Meta; Shift can. Reset all returns every key to its default and keeps your other settings. `Shift+/`<!--key:controls-reminder--> shows a reminder of the controls at any time, and the pause menu has a Controls item.

### Gamepad

Every action can be played from a gamepad with the standard mapping, and every menu can be used with it: the D-pad or left stick moves between controls, A chooses, B goes back, LB and RB switch tabs, LT and RT scroll, X and Y are the second and third action of a row (for example Possess and Follow in the roster). The key hints in the game switch to controller glyphs (letters on an Xbox-style pad, shapes on a PlayStation pad) as soon as you use the pad, and back to keys when you use the keyboard or mouse again. The gamepad column of the tables below is the standard mapping; it was not checked against a real controller.

### Every control

The tables below are generated from the bindings (section 20 says how to regenerate them).

<!-- controls-table:start -->
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
| Photo mode | F2 | RS+LS or LS+RS |
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
<!-- controls-table:end -->

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

**Winter.** The year has four seasons. Host plants (and so aphid herds) decline from about day 10 of the 28-day year, and cold slows the brood. A winter warning appears about 1.5 game days before the winter banner. Winter is resolved as a time-lapse that can be skipped. (New colony > Custom rules > Winter can turn the time-lapse off and play every winter day instead; a run of this option was checked in a browser on 2026-11-18: no banner, no time-lapse, the days pass at the chosen speed.) The lapse loses workers by cold, disease, flooding and old age, and the colony needs stores that cover its carbohydrate need through winter plus a few days of spring (ruling R27). The queen stops laying in the cold. A colony without stores starves in the lapse.

**Other threats.** Predators (spiders, beetles, centipedes and others, scaled by difficulty and by the size of your colony), rival colonies, birds, weather (rain, heat, frost) and humans (feet, mowers, brooms, hoses, cars) change what is safe. Alerts name the cause.

**Succession.** If the queen dies the colony declines and lays nothing more; winged brood can still fly. The game ends when no living ant is left; an epitaph screen shows the history. Winged queens that fly in a nuptial flight start a lineage; you can found a new colony as a daughter queen in a new locality.

## 15. The screen and its parts

### 15.1 The heads-up display

The heads-up display (HUD) shows a few small panels at the edges of the screen; the middle of the screen stays free. `H`<!--key:hide-hud--> hides all of them at once; only critical alerts stay. A number that can be read off an ant or a chamber is not repeated here.

| Part | Where | What it shows |
| --- | --- | --- |
| Time cluster | top left | The season and date ("Spring · Day 3 · Year 1"), the clock, the weather, the surface air temperature, and the speed control. |
| Focus line | under the time cluster | The current top aim ("Aim: ..."). Click it to open Journal > Aims. Settings > Gameplay > Focus line: Auto (the first 2 game days of a colony, then 30 real seconds whenever a new aim opens), Always, Never. |
| Colony pulse | top right | Workers, brood (eggs, larvae, pupae), stores of C and P with trend arrows, and an overall status. Hover or focus it to see workers by task, the queen's state and the worst problem. Before the first egg it shows only the queen's reserves. |
| Alerts feed | right, under the pulse | Up to three cards. A card has a title, a cause line and a jump button. Click a card to open the colony health view at its cause and move the camera to the place. |
| Context prompts | next to the controlled ant | The actions available now, as a key cap and a verb: `[E] Pick up crumb`. Up to three at a time. They are not drawn while a card that waits for you (the intro card, a time-lapse, the winter or flight cards) is on screen. |
| Possessed-ant panel | bottom left | While you control an ant: its identity and age, health, crop (C and P), what it carries, the acid reserve of formicine species, and a compass arrow to the nearest entrance. |
| Minimap | bottom right | Optional; see below. |

### 15.2 The minimap

Settings > Gameplay > Minimap (Never or Always, Never by default) shows a 176 x 176 dp square at the bottom right. It is a top-down map, north up, of a window 256 body lengths wide round the camera target (round the ant while you control one):

- the ground as flat tints: forest and lawn greens, garden-bed brown, pavement grey, asphalt dark grey, sand tan, rubber red-brown, interior beige; the area outside the locality is black;
- your colony's entrances as rings (a dashed ring is an entrance that is sealed or being sealed);
- your markers as the palette's icons;
- the ant you control as a yellow arrow that points the way it faces;
- with the scent view on (`V`), your colony's trail cells as amber squares.

A click on the map moves the observer camera there (in the colony view it moves the view's target). The minimap is hidden in the compact layout (a small window or a large UI scale), while a drawer is open and while the HUD is hidden. Its data is read from the game four or five times a second; nothing about it is saved.

### 15.3 Skipping ahead and time-lapses

In the observer and colony views `N`<!--key:skip-ahead--> runs the game at the highest allowed speed until something worth a look happens: an alert of warning level or above, a milestone, dawn or dusk or a change of weather or season. It stops after one game day at most and does not run while you control an ant or while a critical alert is active.

Two periods are played as time-lapses. The first brood plays when the queen has laid her first eggs and lasts about a minute and a quarter; the camera looks down into the queen's cell through a cut in the ground. A stage bar shows egg, larva, pupa and worker with counts, a gauge shows the queen's reserves, and a column shows losses. Winter is a time-lapse that shows temperature by day, the stores draining and the workers lost to cold or hunger, and ends in a Winter Report that explains what happened. Both can be skipped by holding `Space`<!--key:tl-skip--> for a second, and the result of skipping is the result of watching. In the first brood the lapse can stop and ask you to step in, with `E`<!--key:tl-dropout-->, or to let it play.

### 15.4 Every screen

Each screen of the game has an identifier. This table lists all of them.

| Screen | Id | What it is |
| --- | --- | --- |
| Boot gate | `boot` | A dark page that waits for a click or key, then goes to the title. |
| Unsupported browser | `unsupported` | A plain page that says the game needs WebGL 2 and what to try (see section 19). |
| Title | `title` | The main menu. |
| New colony | `new-game` | Species, locality, rules. |
| Loading | `loading` | Generation progress. |
| Credits | `credits` | Assets, fonts and libraries. |
| HUD | `hud` | The heads-up display described above. |
| Pause menu | `pause` | Resume, Save, Load, Settings, Journal, Codex, Controls, Return to title. |
| Colony orders | `directives` | The colony's priorities, in a drawer. Opened with `I`<!--key:directives-->. |
| Markers | `markers` | The marker palette and dig planner of colony view. |
| Roster | `roster` | A list of the colony's ants, in a drawer. Opened with `L`<!--key:roster-->. |
| Colony health | `colony-health` | The "why" view, in a drawer. Opened with `Y`<!--key:why-view-->. |
| Nest overview | `nest` | A side view of the nest and a table of chambers, in a drawer. Opened with `U`<!--key:nest-overview-->. |
| Journal | `journal` | Aims, milestones, graphs and the event log. Opened with `J`<!--key:journal-->. |
| Codex | `codex` | Field notes. Opened with `K`<!--key:codex-->. |
| Settings | `settings` | Graphics, audio, controls, accessibility, gameplay. |
| Load | `load` | The Load tab of the save page, opened from the title. |
| Save and load | `save-load` | Slots, export and import. |
| Lineage | `lineage` | Colonies you have founded, and their daughters. |
| Epitaph | `epitaph` | The record of a colony that has ended. |
| Photo mode | `photo` | A free camera for pictures. |
| First brood time-lapse | `timelapse-founding` | The first brood. |
| Winter time-lapse | `timelapse-winter` | Overwintering. |

Drawers open on the right, one at a time, and `Esc` closes them before anything else. Book pages (journal, codex, lineage, settings, save and load) pause the game, and `Q` and `E` change tabs in them.

## 16. The colony in more detail

### 16.1 Who does what

A colony is made of a queen, workers, brood (eggs, larvae and pupae) and, in season, winged queens and males. Workers change task as they age and as the colony's needs change. The tasks fall into four groups.

| Group | Work |
| --- | --- |
| Forage | Scouting, foraging, tending aphids and, for leafcutters, cutting. |
| Nurse | Feeding and warming brood, attending the queen, storing food. |
| Dig | Excavating chambers and tunnels, and hauling the soil out. |
| Defend | Guarding the entrances and patrolling the edge of the nest. |

Routine work goes on without you. Your leverage is threefold: priorities (Colony orders, section 5), markers (places, section 6), and doing any job yourself by taking control of an ant.

No ant is in command of a real colony. A colony coordinates through each ant's local encounters and chemical cues, and the queen has little part in it beyond laying the eggs. Colony orders and markers are therefore a simplification for play, and the codex says so (see "Orders without a commander"). Each worker still decides, one at a time, whether to take up the work.

### 16.2 The roster

`L`<!--key:roster--> lists the colony's ants. Filter by caste, task group or whether they are in the nest, search by ant number, sort any column, and Follow or Possess a row. The quick buttons take the nearest forager, digger, nurse or the queen.

### 16.3 The journal

`J`<!--key:journal--> opens the journal: the current aims, a timeline of milestones with dates, graphs of population, brood, stores, intake, deaths, nest volume and temperature, and an event log. A milestone records a moment, with a line of text, and nothing else; there is no score. Examples are the first egg, the first worker, the first food brought home, a second chamber, and the first winter survived. Entries are dated from the calendar tick they were written at, so an entry from before a winter keeps its own day (section 20 lists what is still wrong with the dates).

### 16.4 The colony health view

`Y`<!--key:why-view--> opens the colony health view, the answer to "why?". It lists parts of the colony (food intake, stores, brood growth, egg laying, the queen, workforce, foraging trails, defence, nest space, nest climate, digging) ranked Failing, Strained, Note or Good. Open a line to see its causes, ranked by weight, each with its measurement and unit. A cause may lead to another line, and the Show button moves the camera to the place concerned. Remedies are links that open the control that would help. They never change anything by themselves.

### 16.5 Seasons, weather and heat

The year begins at the spring equinox and has four seasons of seven game days (section 0). A day has dawn, midday, dusk and night, and ants are affected by temperature: they slow in the cold, shelter from heat, and stop foraging on ground that is too hot to cross. Weather has states (clear, overcast, rain, storm, heat, frost) and brings dew, wind and puddles. Rain washes trails and can flood a nest. Shade, stone and soil keep temperatures moderate.

### 16.6 People, predators and rivals

People are never shown. Their activity arrives as events at ant scale: a shoe, a mower, a broom, a sprinkler, a car. A tremor and a shadow come first, then the event. Predators include spiders, antlions, birds and parasitic flies. Rival colonies of other species hold their own ground. Contests between colonies are described as boundary disputes, never as human conflicts, and a rival that is driven off is "repelled".

### 16.7 Winged ants, lineage and the end of a colony

A mature, well-fed colony can rear winged queens and males in its species' season. A flight leaves on a day with the right weather: warm, with light wind. An alert says when. Queens that land and found a nest are recorded in your lineage as daughter colonies, and you can later found a new colony as a daughter in a freshly generated locality.

The death of the queen does not end the game: the colony is orphaned and declines, because no new eggs are laid, but brood already in the nest will mature, and winged ants can still fly. The game ends when no ants of your colony are alive. The epitaph page then records the colony: its species and locality, when it was founded and ended, a chart of its population, the main figures, the milestones with dates, and how it ended, as a short chain of causes. The record is added to your lineage, and the last autosave is kept, so an earlier state can still be loaded.

## 17. The nest

### 17.1 Digging

Ants dig the nest by taking a bite of soil at a time. Hold `F`<!--key:dig--> on diggable ground to dig. The soil becomes pellets, which a worker carries out and drops beside the entrance, where they build a mound. The possessed ant digs exactly as the colony's diggers do, and the colony can also dig by itself from dig plans and from the nest architect.

How fast a bite goes depends on the material and on its moisture. The table is relative to loam at middling damp, which has speed 1.

| Material | Dig speed | Roof it can hold | Notes |
| --- | --- | --- | --- |
| Loam | 1 | about 16 body lengths | The reference soil. |
| Humus | 1.3 | about 10 | Soft, holds only short roofs. |
| Sand | 1.6 | about 8, only 2.5 when dry | Fast to dig, slumps when dry or saturated. |
| Clay | 0.45 | about 24 | Slow, holds water. |
| Gravel | 0.35 | about 12 | Drains freely. |
| Decayed wood | 1 | never falls | Carpenter ants; the black garden ant digs it at half speed. |
| Sound wood | 0.4 | never falls | Carpenter ants only. Half speed again when dry. |
| Insulation | 1.5 | about 12 | Carpenter ants, and the black garden ant at half speed. |
| Concrete, asphalt, stone, brick, tile, glass, metal, plastic, rubber, plaster, mortar and similar | not diggable | never falls | Ants use the joints and cracks, not the material. |

Moisture matters: loam digs at 60 percent of the usual speed when dry and 80 percent when saturated, and sand hardly changes. A wet clay surface is slippery. A crust of hard soil at the surface digs at a fraction of the speed of what lies under it.

The codex has a note for every material.

### 17.2 Chambers

A chamber is a registered room of the nest. Each has a type, a size, a temperature and a humidity, and the nest overview lists them.

| Type | Used for |
| --- | --- |
| Nursery | Brood. The colony keeps it in the warmest chamber. |
| Food | Stores of C and P. |
| Rest | Resting workers and the queen's retinue. |
| General | Everything else, and the default. |
| Midden | Waste, corpses and refuse. |
| Granary | Seed stores (harvester ants). |
| Fungus | The fungus garden (leafcutters). |

A chamber that holds more than it was made for is crowded, and the colony alerts you. A second chamber lets brood be kept apart from stores.

### 17.3 The dig planner

In colony view, the Dig marker opens the planner.

1. Choose a template: Chamber (with a type), Tunnel, Shaft to the surface, or Entrance.
2. Hover a wall of the nest in cutaway. A ghost of the template appears anchored on the wall.
3. Rotate the ghost with `Q` and `E` in steps of 15 degrees, and change its size with Shift and the wheel (Small, Medium or Large; for the black garden ant, 8, 12 or 16 body lengths on the long axis). For a tunnel, click the start and the end.
4. Click to place it.

A valid ghost is drawn with a dashed outline and an invalid one is cross-hatched, with the reason beside it. Reasons include "Concrete or stone cannot be dug", "Too wide a ceiling for this soil", "Leaves too thin a wall", "Would break into a neighbouring nest" and "Too deep or too far from the nest". Plans are shown in the dig-plans overlay with their status: proposed (by the architect), queued, active, stalled (with the reason), complete, paused or cancelled. Select a plan and press `Delete`<!--key:cv-delete--> to cancel it.

The nest architect proposes and digs rooms and tunnels itself when it is on: Auto digs without asking, Suggest is greyed in this build (section 5), and Off leaves digging to you.

### 17.4 Entrances and sealing

An entrance is a shaft to the surface with a mound of the dug soil beside it. A founding queen seals her entrance with a plug of soil, and the first workers open it. A second entrance makes the nest harder to block. An entrance can close without a plug when soil piles over the opening or loose soil slumps into the passage, and the colony alerts you when that happens. Workers dig the way out again.

### 17.5 Water, heat and collapse

- **Temperature.** Soil lags behind the air: a chamber deep in the ground barely feels the day. Brood is kept in the warmest chamber the nest has, and a stone over a nest warms the soil beneath it in the sun.
- **Humidity.** Brood needs high humidity. A dry brood chamber slows its development. In wood nests the wood's moisture matters: carpenter ant eggs and young larvae need damp wood.
- **Flooding.** Rain can flood a nest, lower chambers first. An alert says so, and workers carry brood uphill. A nest in free-draining gravel floods less than one in clay.
- **Collapse.** A ceiling that is too wide for its soil can fall, and the game warns of this as "Ceiling may collapse". Dry sand with a wide room is the usual case. Rock, concrete and wood roofs never fall.

### 17.6 The nest overview

`U`<!--key:nest-overview--> opens a drawer with a side view of the nest: chambers as rounded rectangles at their depth and distance, tunnels as lines, entrances as notches on the ground line and mounds as humps. Under it a table lists each chamber with its type, volume, occupancy, temperature, humidity and risk (flooded, flood risk, dry, crowded). Click a chamber to open colony view at its depth. You can change a chamber's type there.

## 18. Species

FOUNDRESS has four playable species. Each has its own biology, and the four are different ways to play. Only the black garden ant can be chosen; the other three appear on the setup page as "Not yet available" (section 1.3).

Real colonies are larger than the game's. One simulated ant is one ant, and the game caps a colony at 1,500 workers (1,200 for the carpenter ant) so that the whole colony can be simulated. The codex gives the real sizes.

### Black garden ant (*Lasius niger*)

**Playstyle.** A generalist of soil and paving that ranches aphids for honeydew. This is the reference species, and the one to begin with. **Complexity:** 1 of 3. **Founding:** dig, seal, lay, wait. **Natural founding day:** day 5 of spring (ruling R20).

Workers are about 4 mm long and come in one size. A queen founds alone in a sealed chamber, from her own reserves (claustral founding), and may live many years. The colony nests under stones, paving and wood that the sun warms, or builds a mound in soil or turf. Food is aphid honeydew and nectar for carbohydrate, and insects and carrion for protein. It forages along scent trails and remembers routes. In defence a worker bites and sprays formic acid; it has no sting.

### Black carpenter ant (*Camponotus pennsylvanicus*)

**Playstyle.** Nests in damp wood and works by night along trunk trails. Slow to grow. **Complexity:** 2 of 3. **Founding:** find damp wood, chew a cell, seal. **Natural founding day:** spring.

The queen picks moist, softened wood and raises a first brood of small workers. Larger workers appear only from the third season. The ants chew wood and carry the shavings out; they do not eat it. The shavings gather below the openings and are also the colony's midden. A colony lives in a damp parent nest with the queen, and in drier, warmer satellite nests where older brood develops faster. Foraging is mostly at night. Carpenter ants alarm by drumming on the gallery walls, and phorid flies are a danger.

### European harvester ant (*Messor barbarus*)

**Playstyle.** Gathers seed, mills it into paste and keeps granaries through the dry months. **Complexity:** 2 of 3. **Founding:** dig deep in dry ground after autumn rain. **Natural founding day:** autumn.

Workers vary continuously in size, and the game uses three bins: minors, media and majors. Media lay and follow trails and do most foraging, minors carry small seeds, and majors take big seeds and crack hard ones. Seed is stored in granary chambers, and empty husks go to a refuse pile by each entrance. Permanent trunk trails lead out from the nest. The colony needs a little animal protein, so someone has to bring in insects. Granary humidity has to be managed: damp seed sprouts or rots. Workers are hybrids between two lineages, and winged queens and males carry a lineage tag.

### Texas leafcutter ant (*Atta texana*)

**Playstyle.** Cuts leaves to grow a fungus garden; the fungus is all the brood eats. **Complexity:** 3 of 3. **Founding:** dig, plant the fungus pellet, tend it. **Natural founding day:** spring.

The queen carries a pellet of her mother's fungus and plants it in her chamber. The workers do not eat leaves: they cut them and carry them home to feed the fungus, and larvae and the queen eat only the fungus. The garden is a living chamber with its own health: too much protein in the leaves, heat, or contamination can make it fail, and a colony without a garden starves. Workers are strongly polymorphic. Minims tend the fungus and can ride on carried leaves to ward off flies; larger workers cut and carry; the largest dig and guard. Foraging is mostly at night in summer.

### Field notes in the codex

Each species has a field note, and the codex has notes on the behaviours that set them apart: claustral founding, trophallaxis, trail pheromones, route memory, polyethism, nuptial flights, satellite nests, trunk trails, seed size, hybridogenesis, the fungus garden, cutting and hitchhikers. The notes state what the research supports, and say where it is silent.

## 19. Troubleshooting

### The game does not start

**"This browser cannot run the game."** FOUNDRESS draws its world with WebGL 2. Use a current Chrome, Edge, Firefox or Safari, and turn on hardware acceleration in the browser's settings. If the game is embedded in another page, open it in its own tab; some embedding pages block graphics, storage or sound.

**"Window too small."** Make the window larger. The game is paused meanwhile.

**"This locality could not be completed."** A very few seeds do not make a world that is fit to play. Choose Try another seed, which moves to the next seed, or enter a different one.

**"Something went wrong."** The game stopped unexpectedly. Reload the page. Your last save is intact, and the error text on the page shows what happened if you wish to report it.

### It runs slowly

1. Lower the quality preset on the Graphics tab, or leave it on Auto.
2. Lower the resolution scale on the Graphics tab; the game draws fewer pixels and scales the picture up.
3. Turn depth of field to Subtle or Off, and shadows to Low.
4. Close other tabs and programs. A game with a large mature colony costs more than a young one.

If the simulation cannot keep up at a high speed, the game steps the speed down and says so. This is the game protecting its timekeeping, not a fault.

### There is no sound

Browsers allow sound only after you click or press a key on the page, so the first page asks for one. A gamepad button does not count. If an alert says "Sound is off", click anywhere. Check the volume sliders and the Mute settings, and whether the browser or the tab is muted.

### Saving does not work

- **"Saving to this browser is not available here. Use Export to keep your colony."** The browser blocks storage, which happens in private windows and in some embedded pages. Export a colony to a file, or as text that you copy, and import it later.
- **"The browser storage is full."** Delete an old save or export your colony.
- **"The pasted text is incomplete or damaged."** Copy the whole text again, from the first letter of `FOUNDRESS1:` to the end.
- **"This save is from a newer version of FOUNDRESS."** Update the game to open it.
- **Quick save or quick load does nothing.** `F5` and `F9` are sometimes swallowed by the browser or the page that embeds the game. Use Save and Load from the pause menu.

The game saves again by itself, and it tells you if it had to switch autosave off because saving failed twice.

### The mouse and keys

- **The camera does not turn.** Drag with the right mouse button. Mouse capture is optional, and the game says so when the browser refuses it.
- **A key does nothing.** The browser may reserve it, or the page that embeds the game may swallow it. Function keys are the usual cases. Every action that has a function key can also be reached from a menu. Check Settings, Controls, to see if the key was rebound.
- **Two actions share a key.** The same key can be used in different layers, such as possession and colony view. Within one layer, the game asks whether to swap the two bindings.
- **A controller is not recognised.** The game uses the standard gamepad mapping. A controller that reports another mapping is shown as non-standard and may not work.

### The game seems stuck

- **An ant will not move.** Soil too hard to dig, a surface with too little grip, or a space smaller than the ant can stop it. A prompt gives the reason. Try the other way, or take another ant with `Tab`<!--key:possess-next-->.
- **Nothing is happening.** The game may be paused: `P`<!--key:pause-toggle--> resumes. Opening a book page, the settings or the pause menu pauses the game.
- **The colony has gone quiet.** In heat, cold or rain, ants stay in. This is the biology. Open the colony health view, or wait for the weather to change.

### Reporting a problem

Give the version shown on the title screen, the seed code of the locality (it is displayed on the setup and loading pages), the species and difficulty, and what you were doing. A saved colony or an export lets the problem be reproduced exactly, because the simulation is deterministic: the same seed and the same commands give the same result.

## 20. Known problems

From `docs/STATUS.md` and the application gate report (`docs/design/tasks/gate-close-app-report.md`, section 7), as of 2026-11-23 (the list of what a first-hour play still shows is in `docs/design/tasks/look-pass-5-report.md`). These may change while the work goes on.

**Simulation.**

- **Colonies do not reliably grow.** In unattended test runs, few colonies met the survival bar at the first winter, and growth in the second year was not shown. The first workers often live on the queen's provision; protein intake is low. A colony you play may stagnate or die in the first year.
- Foragers often wait at the entrance ("waiting to leave - timeout") and few ants are on the surface.
- Predation was recalibrated on 2026-11-17 and is lower for small colonies; the stop-gap values are in force.
- Death causes in the epitaph are sometimes "unknown" (the test cheat `cheat.killAll` books every death as unknown; `tests/e2e/lifecycle.mjs` now ends its colony with `cheat.kill` and a cause per ant).
- The entrance can stay in a "reopening" state for days after a pad-played opening, which keeps the hints silent. At the first test seed the first workers did not walk out of a hand-dug nest in the browser for this reason.
- The opening can fail by flood: at the second test seed rain filled the founding chamber during the first brood and the card read "Water filled the burrow", although the site read-out had called the flood safety good.
- In one test run a possessed forager's delivery added less to the stores than she carried (seed 1, the first day of the colony); the colony-orders screen could not place a dig plan off the founding cell ("anchor not in nest"). Both are listed in `docs/design/tasks/look-pass-5-report.md`.
- Three rulings are not built: reopening time after hand-over (R14), stacked-rain flooding on a safe site (R13) and the "loud hour" definition (R28). See `docs/design/gdd/DEVIATIONS.md`.

**Not available.** The carpenter, harvester and leafcutter species (section 1.3). Four difficulty parameters and two custom rules have no effect: the New Game screen greys them and labels them "Not in this build" (section 1.6). The rule "Extinction ends the game" works in the simulation but is listed greyed on the screen: no screen retires a colony, so a game that does not end when the last ant dies could not be ended. The nest architect's "Suggest" mode, thief ants and some human-event effects are not built. The minimap and the focus line show only what the simulation reports; they have no keyboard control, and the minimap is a pointer affordance.

**Settings and strings.** The wrong strings listed in the first version of this manual (the "day 3" help text, the preset descriptions that claimed outcomes, the Photo mode row, the "1 young rivals" plural) were corrected on 2026-11-18. The README line about the `species=` flag was corrected on 2026-11-22: the flag works only in test mode, and both documents now say so.

**Rendering.** Leaves read as flat decals; the entrance mound has square edges at its foot; the follow camera can tip toward the sky on a slope; ants can look pale or milky at night and in night rain; chamber labels in colony view are sometimes smeared. Look pass 6 (`docs/design/tasks/look-pass-6-report.md`, which lists what it fixed and what still reads as unfinished, with pictures) changed these: night is brighter (the ground reads at about a fifth of the display range, cool and low in saturation, in clear weather, overcast and rain: it was almost black), a possessed ant in a room barely larger than she is (the founding cell, the throat of the shaft) is seen by a "cell camera" that cuts the soil between camera and ant away instead of backing into her (so the queen is whole, not dithered), the first-brood time-lapse and the result card show the queen whole, the standing water of a flooded shaft is a cool blue-green sheet, clover heads and the title screen's horizon are smoother, and the light fades over about a second when the time-lapse starts and ends. Still unfinished: ants that walk between the camera and a possessed ant are dithered (a screen-door pattern, GDD 01 6.5 rule 2), so a crowded chamber shows hatched ants near the camera; the flood sheet is a flat sheet cut by the carve cells and reads as a blocky pale shape; the weep vents of the kitchen-door wall are white ticks (their bar colour is in the world catalogue); buildings far away at overcast are pale grey shapes (the haze follows the design's +20 % at overcast); the time-lapse light is a constant 17:30 behind the lapse and fades back into the world's own. The colony view at its closest zoom shows a single egg as a few pixels, so a pinned egg is marked with a ring.

**Performance.** Frame time has not been measured on a real GPU. All rendering tests used software rendering. 

**Browsers.** Only Chromium has been tested. The game works inside a sandboxed iframe, where pointer lock, fullscreen and sound may be refused; the game then carries on without them.

If something is wrong that is not listed here, the debug flags in README.md (`?test=1` and the `window.__game` API) can reproduce a state quickly.

**Regenerating the tables.** Section 1.3 (species), section 1.6 (the preset and rule tables) and section 13 (the controls) sit between `<!-- generated:... -->` comments and are written from the code by `npm run sim -- tests/docs/regen-manual.mjs`. Run it after a change to the species cards, `src/sim/config/presetDisplay.ts` or the bindings; `tests/docs/docs-final.test.ts` and `src/content/text/controls.test.ts` fail while the file is out of date.
