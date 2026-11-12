# Troubleshooting

## The game does not start

**"This browser cannot run the game."** FOUNDRESS draws its world with WebGL 2. Use a current Chrome, Edge, Firefox or Safari, and turn on hardware acceleration in the browser's settings. If the game is embedded in another page, open it in its own tab; some embedding pages block graphics, storage or sound.

**"Window too small."** Make the window larger. The game is paused meanwhile.

**"This locality could not be completed."** A very few seeds do not make a world that is fit to play. Choose Try another seed, which moves to the next seed, or enter a different one.

**"Something went wrong."** The game stopped unexpectedly. Reload the page. Your last save is intact, and the error text on the page shows what happened if you wish to report it.

## It runs slowly

1. Lower the quality preset on the Graphics tab, or leave it on Auto.
2. Lower the resolution scale on the Graphics tab; the game draws fewer pixels and scales the picture up.
3. Turn depth of field to Subtle or Off, and shadows to Low.
4. Close other tabs and programs. A game with a large mature colony costs more than a young one.

If the simulation cannot keep up at a high speed, the game steps the speed down and says so. This is the game protecting its timekeeping, not a fault.

## There is no sound

Browsers allow sound only after you click or press a key on the page, so the first page asks for one. A gamepad button does not count. If an alert says "Sound is off", click anywhere. Check the volume sliders and the Mute settings, and whether the browser or the tab is muted.

## Saving does not work

- **"Saving to this browser is not available here. Use Export to keep your colony."** The browser blocks storage, which happens in private windows and in some embedded pages. Export a colony to a file, or as text that you copy, and import it later.
- **"The browser storage is full."** Delete an old save or export your colony.
- **"The pasted text is incomplete or damaged."** Copy the whole text again, from the first letter of `FOUNDRESS1:` to the end.
- **"This save is from a newer version of FOUNDRESS."** Update the game to open it.
- **Quick save or quick load does nothing.** `F5` and `F9` are sometimes swallowed by the browser or the page that embeds the game. Use Save and Load from the pause menu.

The game saves again by itself, and it tells you if it had to switch autosave off because saving failed twice.

## The mouse and keys

- **The camera does not turn.** Drag with the right mouse button. Mouse capture is optional, and the game says so when the browser refuses it.
- **A key does nothing.** The browser may reserve it, or the page that embeds the game may swallow it. Function keys are the usual cases. Every action that has a function key can also be reached from a menu. Check Settings, Controls, to see if the key was rebound.
- **Two actions share a key.** The same key can be used in different layers, such as possession and colony view. Within one layer, the game asks whether to swap the two bindings.
- **A controller is not recognised.** The game uses the standard gamepad mapping. A controller that reports another mapping is shown as non-standard and may not work.

## The game seems stuck

- **An ant will not move.** Soil too hard to dig, a surface with too little grip, or a space smaller than the ant can stop it. A prompt gives the reason. Try the other way, or take another ant with `Tab`<!--key:possess-next-->.
- **Nothing is happening.** The game may be paused: `P`<!--key:pause-toggle--> resumes. Opening a book page, the settings or the pause menu pauses the game.
- **The colony has gone quiet.** In heat, cold or rain, ants stay in. This is the biology. Open the colony health view, or wait for the weather to change.

## Reporting a problem

Give the version shown on the title screen, the seed code of the locality (it is displayed on the setup and loading pages), the species and difficulty, and what you were doing. A saved colony or an export lets the problem be reproduced exactly, because the simulation is deterministic: the same seed and the same commands give the same result.
