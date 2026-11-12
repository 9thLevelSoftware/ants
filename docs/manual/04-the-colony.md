# The colony

## Who does what

A colony is made of a queen, workers, brood (eggs, larvae and pupae) and, in season, winged queens and males. Workers change task as they age and as the colony's needs change. The tasks fall into four groups.

| Group | Work |
| --- | --- |
| Forage | Scouting, foraging, tending aphids and, for leafcutters, cutting. |
| Nurse | Feeding and warming brood, attending the queen, storing food. In the fuller game also tending a fungus garden or milling seed. |
| Dig | Excavating chambers and tunnels, and hauling the soil out. |
| Defend | Guarding the entrances and patrolling the edge of the nest. |

Routine work goes on without you. Your leverage is threefold: priorities (Colony orders), markers (places), and doing any job yourself by taking control of an ant.

No ant is in command of a real colony. A colony coordinates through each ant's local encounters and chemical cues, and the queen has little part in it beyond laying the eggs. Colony orders and markers are therefore a simplification for play, and the codex says so (see "Orders without a commander"). Each worker still decides, one at a time, whether to take up the work.

## Colony orders

`I`<!--key:directives--> opens Colony orders from any view. The panel does not pause the game, and opening it from the queen keeps her under your control. Nothing changes until you move a control, and each change takes effect at the next tick, even while the game is paused.

| Section | What it controls |
| --- | --- |
| Workforce | Four sliders (Forage, Nurse, Dig, Defend) that always add up to one hundred percent. Moving one moves the others in proportion; a padlock holds one still. Each slider shows its target and, as a small tick, the share actually working. The Auto switch lets the colony set the targets from need, and it turns off when you touch a slider. |
| Brood production | Workers only, Balanced, or Raise winged queens and males, with a policy for when the winged ants are ready (release, ask, hold). It is disabled with a reason until the colony is mature and the season is right. |
| Diet emphasis | A slider between carbohydrate and protein. Centred, the colony decides. |
| Stores and safety | A stock target (low, normal, high), a switch to keep foragers in for a day, and a stance toward rivals: Cautious, Defensive or Aggressive. The relation with each neighbour is shown in words: Neutral, Wary, Clashing, Territorial dispute or Lull. |
| Nest | The nest architect: Auto, Suggest or Off, and whether entrances are sealed in cold weather. |

A colony of fewer than four workers shows "Too few workers for priorities to matter". Without a queen the brood section says "No queen: no new eggs".

## Markers

In colony view, markers ask the colony to put effort somewhere. They are placed with the palette or with `Shift+1` to `Shift+7`, and each kind has a limit. A marker raises the chance that ants take up work near it. It does not give an ant an order.

| Marker | Effect |
| --- | --- |
| Dig | Plans a chamber, tunnel, shaft or entrance; see [The nest](05-the-nest.md). |
| Forage | Asks for food to be collected in an area, with a radius and a priority. |
| Avoid | Asks workers to keep out of an area. |
| Rally | Draws workers to a place to defend it or to press an attack, with a radius. |
| Entrance | Opens a new way to the surface above a tunnel or chamber. |
| Move brood | Moves the brood to a chamber you choose. |
| Move queen | Moves the queen to a chamber you choose. |

Select a marker and press `Delete`<!--key:cv-delete--> to remove it. Ctrl+Z undoes the last placement or removal.

## Food

A colony tracks two stores: carbohydrate (C) and protein (P). Carbohydrate fuels adult activity and lifespan; protein is needed for larval growth and for the queen's eggs. Honeydew from aphids, nectar and the sugar of human food are mostly C. Insects, carrion and some seeds bring P. A colony that has larvae needs more protein.

Workers carry liquid food in the crop and share it by mouth, which is called trophallaxis. While you control an ant, `G`<!--key:share-food--> shares your crop with a nestmate. Solid food is picked up with `E`<!--key:interact--> and carried or dragged home, and a heavy item may need several ants.

Foragers lay trails of scent on the way home. A trail needs to be walked to last, and rain washes unsheltered trails away. `R`<!--key:trail-toggle--> lays or stops a trail while you control a forager. A route you walk is remembered like any other ant's, so others can follow it after you let go.

## Brood

An egg becomes a larva, then a pupa in a cocoon, then an adult. Brood develops faster when warm and not at all in the cold. Larvae are fed by the youngest workers. A nursery is the warmest chamber the nest has, and the nurses move brood to keep it comfortable. If brood is hungry, too cold, or too crowded, the colony health view says which.

## Alerts

Alerts are short cards: a title, a cause with a number and its unit, and a jump button. They come in four levels.

| Level | Meaning |
| --- | --- |
| Info | Worth knowing, no action needed. Recorded in the journal; during the first game day also shown briefly. |
| Notice | Worth a look: a new food source, rain on the way. |
| Warning | Something is going wrong: protein short, nest crowded. |
| Critical | Act now: the queen is attacked, the nest is flooding. Pinned until resolved or acknowledged. |

Right-click a card to acknowledge it, snooze that kind for a game day, or open it in the journal. Critical alerts cannot be snoozed. The backquote key moves the keyboard focus into the feed. Auto-slow, a setting, can pause the game or slow it to 1x when a critical alert arrives.

<!-- verify-at-release -->
## The colony health view

`Y`<!--key:why-view--> opens the colony health view, the answer to "why?". It lists parts of the colony (food intake, stores, brood growth, egg laying, the queen, workforce, foraging trails, defence, nest space, nest climate, digging) ranked Failing, Strained, Note or Good. Open a line to see its causes, ranked by weight, each with its measurement and unit. A cause may lead to another line, and the Show button moves the camera to the place concerned. Remedies are links that open the control that would help, with the control highlighted. They never change anything by themselves.

## The roster

`L`<!--key:roster--> lists the colony's ants. Filter by caste, task group or whether they are in the nest, search by ant number, sort any column, and Follow or Possess a row. The quick buttons take the nearest forager, digger, nurse or the queen.

<!-- verify-at-release -->
## The journal

`J`<!--key:journal--> opens the journal: the current aims, a timeline of milestones with dates, graphs of population, brood, stores, intake, deaths, nest volume and temperature, and an event log of the last two hundred events. A milestone records a moment, with a plate and a line of text, and nothing else; there is no score. Examples are the first egg, the first worker, the first food brought home, a second chamber, and the first winter survived.

## Seasons, weather and heat

The year begins at the spring equinox and has four seasons of seven game days. A day has dawn, midday, dusk and night, and ants are affected by temperature: they slow in the cold, shelter from heat, and stop foraging on ground that is too hot to cross. Weather has states (clear, overcast, rain, storm, heat, frost) and brings dew, wind and puddles. Rain washes trails and can flood a nest. Shade, stone and soil keep temperatures moderate.

<!-- verify-at-release -->
## Overwintering

In the cold season the colony withdraws to the deep chambers. Winter is a time-lapse that can be skipped, and it ends in a Winter Report listing the workers lost and the stores used. Queens stop laying before winter, and brood overwinters as larvae. Stores matter: an alert warns when they do not cover the winter.

<!-- verify-at-release -->
## People, predators and rivals

People are never shown. Their activity arrives as events at ant scale: a shoe, a mower, a broom, a sprinkler, a car. A tremor and a shadow come first, then the event. Predators include spiders (jumping, wolf, ant-eating), antlions, birds and parasitic flies. Rival colonies of other species hold their own ground. Contests between colonies are described as boundary disputes, never as human conflicts, and a rival that is driven off is "repelled".

## Reproduction and lineage

<!-- verify-at-release -->
### Winged ants and the nuptial flight

A mature, well-fed colony can rear winged queens and males in its species' season. A flight leaves on a day with the right weather: warm, with light wind. An alert says when. Queens that land and found a nest are recorded in your lineage as daughter colonies, and you can later found a new colony as a daughter in a freshly generated locality.

## When a colony fails

The death of the queen does not end the game: the colony is orphaned and declines, because no new eggs are laid, but brood already in the nest will mature, and winged ants can still fly. The game ends when no ants of your colony are alive. The epitaph page then records the colony: its species and locality, when it was founded and ended, a chart of its population, the main figures, the milestones with dates, and how it ended, as a short chain of causes. The record is added to your lineage, and the last autosave is kept, so an earlier state can still be loaded.
