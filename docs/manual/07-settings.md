# Settings

Every change applies at once and is stored in the browser. If the browser refuses to store settings, the page says "Settings cannot be stored in this browser context", and the settings last until you close the page. Settings are not part of a save.

## Graphics

| Setting | Values | What it does |
| --- | --- | --- |
| Quality preset | Auto, Low, Medium, High, Ultra | Auto picks a preset for your device when the game starts. Choosing a preset resets the individual settings below it. |
| Resolution scale | 50 to 100 percent | Renders fewer pixels and scales up. Lower it if the game stutters. |
| Dynamic resolution | On, Off | Lowers the resolution briefly when the frame rate drops. |
| Target frame rate | 60 fps, 30 fps | The rate dynamic resolution aims for. |
| Depth of field | Off, Subtle, Full | The soft focus that gives the scene its sense of scale. |
| Haze | On, Off | Distance haze. |
| Shadows | Off, Low, High | Shadow quality. |
| Grass and litter density | 25 to 100 percent | How much ground cover is drawn. |
| Field of view offset | minus 10 to plus 20 degrees | Added to the camera's field of view while you control an ant. |
| Fullscreen | button | Shows "Not allowed here" when the browser or the page refuses. |

The game targets 60 frames a second at Medium on a laptop with an integrated graphics card at 1920 by 1080.

## Audio

| Setting | What it does |
| --- | --- |
| Master volume, Mute everything | The overall level and a mute switch. |
| Ambience, Effects, Giant sounds, Interface, Music volume | One level for each group of sounds. Giant sounds are the sounds of human activity at ant scale. |
| Music | Off, Sparse or Frequent. |
| Mute when the tab is hidden | Silences the game when the page is in the background. |
| Mono | Plays the left and right channels as one. |

A status line says whether sound is running or blocked by the browser. Browsers allow sound only after a click or key press, and the game asks for one on its first page.

## Controls

| Setting | What it does |
| --- | --- |
| Mouse sensitivity | How far a drag turns the camera. |
| Invert vertical look | Reverses the vertical camera movement. |
| Mouse look | Drag (the default) or Captured. Captured locks the pointer to the game, and falls back to Drag when the browser refuses. |
| Left mouse button | Bite, or Orbit. With Orbit, a left drag turns the camera and biting stays on `Q`<!--key:bite-->. |
| Gamepad dead zone | How far a stick must move before it counts. |
| Keyboard and mouse | The binding table: select a binding, press the new key. Delete clears a binding, and Reset all returns every key to its default. |

## Accessibility

<!-- verify-at-release -->
### Display and text

UI scale (80 to 150 percent), text size (100, 115 or 130 percent), a font choice (Standard or Hyperlegible), high contrast (black panels, white text, a thicker focus ring) and reduced motion (System follows the device setting, On, Off) change how the interface looks. Reduced motion replaces transitions with short fades and stops camera sway. A camera horizon setting chooses between a camera that follows the surface and one that keeps level.

<!-- verify-at-release -->
### Spiders and overlays

Spider comfort (Off, Softened, Abstract, Marker only) changes how spiders are drawn; their behaviour and sound stay the same. A second switch applies it also to mites and centipedes. The overlay palette (Okabe-Ito, High contrast, Pattern only) keeps every overlay readable without colour. Sound-cue indicators show an edge marker for sounds that carry information, and flash reduction removes full-screen flashes.

## Gameplay

| Setting | What it does |
| --- | --- |
| Autosave | Off, or every 2, 5 or 10 minutes of real play. Autosaves also happen when the season changes. |
| Prompts | Always, While learning (the default), or Never. While learning, a verb shows its full text until it has been used three times. |
| Hints and aims | Quiet suggestions during your first days. A button resets the hints you have learned. |
| Minimap | A small top-down map, off by default. |
| Focus line | Auto, Always or Never. The current aim, shown at the top left. |
| Milestone notices | Full, Quiet or Off. The journal always records every milestone. |
| Return to 1x when taking control | Possessing an ant sets the speed to 1x. Off keeps up to 4x. |
| Take over a nestmate when your ant dies | Takes another worker after the camera has stayed on the body. |
| Pause when the window loses focus, Pause after loading, Pause while a panel is open | Three ways to keep the game still while you are elsewhere. |
| Camera follow | How strongly the camera swings round behind the ant you control when it turns: Off, Gentle (the default) or Strong. |

<!-- verify-at-release -->
### Auto-slow and difficulty

Auto-slow, set on this tab, chooses what happens to the game speed when a critical or warning alert arrives. Difficulty and its custom rules can be changed here too, except the season length and the rival count, which are fixed when the world is generated.
