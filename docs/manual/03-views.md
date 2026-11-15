# Views and screens

## The screen heads-up display

The heads-up display (HUD) shows at most six things, and each can be hidden. `H`<!--key:hide-hud--> hides all of them at once; only critical alerts stay. A number that can be read off an ant or a chamber is not repeated here.

| Part | Where | What it shows |
| --- | --- | --- |
| Time cluster | top left | The season and date ("Spring · Day 3 · Year 1"), the clock, the weather, the surface air temperature, and the speed control. |
| Colony pulse | top right | Workers, brood (eggs, larvae, pupae), stores of C and P with trend arrows, and an overall status. Hover or focus it to see workers by task, the queen's state and the worst problem. Before the first egg it shows only the queen's reserves. |
| Alerts feed | right, under the pulse | Up to three cards. A card has a title, a cause line and a jump button. Click a card to open the colony health view at its cause and move the camera to the place. |
| Context prompts | next to the controlled ant | The actions available now, as a key cap and a verb: `[E] Pick up crumb`. Up to three at a time. |
| Possessed-ant panel | bottom left | While you control an ant: its identity and age, health, crop (C and P), what it carries, the acid reserve of formicine species, and a compass arrow to the nearest entrance. |
| Focus line | under the time cluster | The current aim, during the first two game days. |

<!-- verify-at-release -->
### The minimap

An optional minimap, off by default, can show a top-down window around the camera with zones, entrances, markers and the controlled ant. It is turned on in Settings, on the Gameplay tab.

## Controlling an ant: possession view

In this view you are one ant. The camera follows behind it and adapts to its surroundings: it pulls in and widens in tunnels, and keeps clear of walls. Ants walk on any surface that gives them a grip, so you can walk up a wall, across a ceiling or along a stem; the camera and the controls follow the surface you are on.

Move with `W A S D`<!--key:move--> and hurry with `Shift`<!--key:hurry-->. The ant keeps its own mind in one respect: it keeps its biology. It gets hungry, tires, can overheat and can die. When it dies the camera stays on the body for a moment and then becomes the observer; `Tab`<!--key:possess-next--> takes another ant.

If you do nothing for two minutes of running time, the ant is released and goes back to its work.

Actions are the same ones the colony's ants use: pick up and put down, feed larvae, groom, drink liquid food, tear a piece from a solid food, stroke an aphid, seal or open an entrance, lay an egg, drag, dig, bite, share food, and antennate. Which of them an ant can do depends on its caste and species. A prompt explains why an action is not available ("not for this ant", "crop full", "cannot be dug").

## Observing: observer view

`X`<!--key:release--> releases the ant. The camera stays where it was and becomes a free camera that can follow an ant. Fly with `W A S D`<!--key:obs-move-->. Click an ant, brood, chamber, food source or creature to inspect it; hover shows a card that you can pin with a click. To take an ant, press `E`<!--key:possess-target-->, hold the left mouse button on it for a moment, or double-click it.

`N`<!--key:skip-ahead--> runs the game at the highest allowed speed until something worth a look happens: an alert of notice level or above, or a milestone. It stops after one game day at most.

## Colony view

`M`<!--key:colony-view--> raises the camera to look at the whole colony. If you were controlling an ant, it goes back to its work, and `M` again returns you to it.

- Pan with `W A S D`<!--key:cv-pan-->, rotate with `Q` and `E`, zoom with the wheel.
- The cutaway slices the ground at a depth you choose: `R`<!--key:cv-slice-up--> and `F`<!--key:cv-slice-down--> move it, `G`<!--key:cv-cutaway-mode--> changes between off, slice and x-ray.
- The marker palette places markers and plans digs. See [The colony](04-the-colony.md) and [The nest](05-the-nest.md).
- The overlays, `O`<!--key:overlay-cycle--> cycles them, show temperature, moisture, threats and dig plans, and `V`<!--key:scent-view--> shows scent.

<!-- verify-at-release -->
### Overlays and scent view

The scent view draws the trails and the colony's home-range scent as a faint glow over the ground, so that you can see where food has been found and where trails are strong. The other overlays use colours from a palette that stays legible for colour-blind players, with patterns in addition to colour. The overlay legend appears at the bottom left while an overlay is on.

<!-- verify-at-release -->
## Photo mode

`F2`<!--key:photo-mode--> freezes the game and hides the HUD, and gives a free camera with a focal length from 24 to 200 mm, an aperture, a focus distance, exposure, roll and a look. Enter captures a PNG at the size of the window, or twice that when the graphics card allows. Esc or `F2` returns to the view you left.

## Time-lapses

<!-- verify-at-release -->
### First brood and winter

Two periods are played as time-lapses. The first brood plays when the queen has laid her first eggs and lasts about a minute and a quarter. A stage bar shows egg, larva, pupa and worker with counts, a gauge shows the queen's reserves, and a column shows losses. Winter is a time-lapse of about three quarters of a minute. It shows temperature by day, the stores draining and the workers lost to cold or hunger, and ends in a Winter Report that explains what happened. Both can be skipped by holding `Space`<!--key:tl-skip--> for a second, and the result of skipping is the result of watching. In the first brood, the lapse can stop and ask you to step in, with `E`<!--key:tl-dropout-->, or to let it play.

## Pausing and speed

`P`<!--key:pause-toggle--> pauses; `1`<!--key:speed-1-->, `2`<!--key:speed-2-->, `3`<!--key:speed-4--> and `4`<!--key:speed-8--> set 1x, 2x, 4x and 8x. 8x is for watching: it is not available while you control an ant, and taking an ant at 8x returns the game to 1x. While the queen is in danger in the opening, time runs at 2x at most. If the computer cannot keep up, the game steps the speed down and says so. Opening a book page, the settings or the pause menu pauses the game; panels in the right-hand drawer do not.

## Every screen

Each screen of the game has an identifier. This table lists all of them.

| Screen | Id | What it is |
| --- | --- | --- |
| Boot gate | `boot` | A dark page that waits for a click or key, then goes to the title. |
| Unsupported browser | `unsupported` | A plain page that says the game needs WebGL 2 and what to try (see [Troubleshooting](08-troubleshooting.md)). |
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
