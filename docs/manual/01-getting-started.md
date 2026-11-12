# Getting started

## The title screen

When the game has loaded it asks for a click or a key press. This gives the browser permission to play sound. A gamepad button does not count as a click, so with a gamepad the game continues without sound until you click or press a key. After that the title menu offers:

| Item | What it does |
| --- | --- |
| Continue | Loads the newest save. Disabled when there is none, or when saving is not available in this browser. |
| New colony | Opens the setup page for a new game. |
| Load | Opens the save page on its Load tab. |
| Lineage | Opens the record of colonies you have founded and their daughters. |
| Codex | Opens the field notes. |
| Settings | Opens settings. |
| Credits | Lists the sound, texture, font and library credits. |

<!-- verify-at-release -->
### Lineage and Codex

At the time of writing the Lineage and Codex pages show a short empty state ("No colonies recorded yet", "No field notes yet"). The Lineage page will list the colonies you found, and daughters from nuptial flights that you can found later. The Codex page will list every field note by category, with plates, and unlocks entries as you observe things in the game.

## A new colony

New colony opens one page with three columns.

- **Species.** One card per species. The black garden ant (*Lasius niger*) is the species to start with. The other three show "Not yet available" until they are released.
- **Locality.** Where the game takes place: Woodland Edge, Suburban Garden, Playground Park, Car Park Verge, Kitchen Door, or Random. A locality is generated from a seed, and the same seed gives the same place. The seed field accepts any text up to 32 characters. An eight-digit hexadecimal code such as `4F7A-21C9` is used directly. The size can be Compact, Standard or Large. The starting season defaults to the species' natural founding day. Winter is not offered, because queens do not found in frost.
- **Rules.** Difficulty: Gentle, Naturalist (the default) or Harsh. Gentle has fewer predators and rivals, kinder weather and a lenient first season. Naturalist stays close to the biology: the first season is risky and the colony is yours to keep alive. Harsh has dense predators and rivals, severe weather and a strict founding, and losing colonies is the usual outcome. The hints toggle controls the quiet suggestions in the first days. Begin starts the game.

Rival count and season length are fixed when the world is generated. Other rules can be changed later in Settings.

### Loading

Generating the locality takes a few seconds. The page shows the stages (zone layout, heightfield, large structures, props and plants, resources, rival colony sites, pre-existing cavities, validation, meshes, textures) and a short note about ants. If generation fails the page says so and offers Try another seed. Cancel returns to the setup page with everything you chose.

<!-- verify-at-release -->
## The opening

The first minutes are played by hand with the founding queen. They teach the verbs in the order her body needs them. Prompts appear near the queen, one at a time, never block, and disappear once you have used a verb three times. They show the key that is currently bound.

1. **An intro card** names the species, the locality, the season and the day, and fades on any input.
2. **Search.** The queen has just shed her wings and walks with her reserves counting down. Move her with `W A S D`<!--key:move--> and look around by dragging with `RMB drag`<!--key:orbit-->. Antennate the ground with `T`<!--key:inspect--> to read the soil: diggability, moisture, warmth, cover, flood safety, rival scent and exposure, each with a word from Poor to Excellent. Ground sheltered by a stone, a slab edge or a log, and neither dry nor flooded, is better than open lawn.
3. **Dig.** Hold `F`<!--key:dig--> on diggable ground. Soil is carried out as pellets and dropped beside the shaft. A readiness bar under the possessed-ant panel shows when the shaft is deep enough and the chamber large enough.
4. **Seal.** At the shaft, hold `E`<!--key:interact--> to plug the entrance with soil. From here the queen will not feed; her body is the only store.
5. **Lay.** In the chamber, press `E`<!--key:interact--> to lay the first eggs.
6. **First brood.** A time-lapse shows the eggs become larvae, pupae and workers while the queen's reserves fall. It can be skipped, and the result is the same as watching it. Now and then it stops and offers a choice: step in, or let it play.
7. **Hand-over.** The first workers open the plug. The game offers a worker (`Tab`<!--key:possess-next-->) or stays with the queen.

If the founding fails, a card says why in plain words and offers to try another site, depending on the difficulty, or to let it end.

## Your first day as a colony

- Press `Tab`<!--key:possess-next--> to take a worker. Possessing changes who you control, not the biology: the ant still gets hungry, ages and can die.
- Press `X`<!--key:release--> to let go and watch the colony. In observer view you can fly, click an ant to inspect it, and take control of any ant of your colony.
- Press `M`<!--key:colony-view--> to survey the colony from above, with a cutaway of the nest, and to place markers.
- Press `I`<!--key:directives--> to open Colony orders, the priorities of the whole colony.
- Press `P`<!--key:pause-toggle--> to pause. Orders, markers and panels all work while the game is paused.
- Press `Esc`<!--key:menu--> for the pause menu, which has Save, Load, Settings and Controls.

The journal asks one question at a time, such as "Where does the nearest sugar lie?" These aims never gate play and carry no reward.

## Saving

The game saves by itself on a timer, when the season changes and before each time-lapse. `F5`<!--key:quick-save--> saves quickly and `F9`<!--key:quick-load--> loads that save. The Save and Load page has an autosave slot, a quick slot and five manual slots, and can export a colony to a `.foundress` file or as text to paste back in. If your browser does not allow storage, use Export to keep a colony. See [Troubleshooting](08-troubleshooting.md).
