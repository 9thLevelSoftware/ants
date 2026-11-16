// Navigation layer for the gamepad and the keyboard in every screen and panel (task input-gamepad-a11y).
//
// WHAT IT DOES
//   One poller (controller.ts) reads the pad through `readGamepads()` of src/input (a test overrides the browser's
//   `navigator.getGamepads` and nothing else) and decides each frame who owns the pad: a menu layer or the game.
//   A menu layer gets the GDD 08 section 8 vocabulary: D-pad / left stick move focus, A activates, B backs out,
//   Start backs out of everything, LB / RB switch tabs, LT / RT scroll, X / Y are the secondary / tertiary action.
//   It also tracks the last-used device (device.ts: `inputDevice`, `padStyle`) so key hints print pad glyphs, and runs
//   the pad shortcuts that open panels from play (shortcuts.ts).
//
// HOW A NEW SCREEN OR PANEL JOINS (one line)
//   Give the root element a class and add it to the BUILTIN_LAYERS table in layers.ts, or register it where it is made:
//
//     registerNavLayer({ id: 'overwinter', selector: '.wi-root', rank: 50, claim: 'always', kind: 'screen' });
//
//   or, in a component with a ref:
//
//     useNavLayer(ref, { id: 'overwinter', rank: 50, claim: 'always', kind: 'screen' });
//
//   rank   higher wins when several layers are on screen (dialogs 100, books 60, screens 50, drawers 30, regions 20).
//   claim  'always': the layer owns the pad whenever it is on screen (the game is not played meanwhile);
//          'focus' : it owns the pad only while focus is inside it (cards over play, drawers).
//   Optional: `initial` (selector of the first control), `onBack` (B / Start), `onTab` (LB / RB).
//   What a layer must provide for the audit (window.__nav.audit()): every control reachable by Tab has an accessible
//   name, a logical order (reading order), a defined first control, and focus returns to the opener when it closes.
//   Controls that handle arrow keys themselves (sliders, segmented controls, tabs, listboxes) get the arrow first.
import { startNavController } from './controller';
import { installNavDebug } from './debug';
import { startKbmWatch } from './device';
import { installNavStyles } from './style';

export { registerNavLayer, BUILTIN_LAYERS, activeLayer, liveLayers, type NavLayerSpec, type LayerClaim } from './layers';
export { useNavLayer } from './useNavLayer';
export { inputDevice, padStyle, setInputDevice } from './device';
export { padCaptureHolds, swallowGamePad, showControlsReminder } from './controller';
export { auditLayer, reachOrderIssues, accessibleName, type FocusAudit } from './audit';

let users = 0;
let stopAll: (() => void) | null = null;

/**
 * Starts the navigation layer for the page. Reference counted: the shell's ScreenRouter and the HUD both call it (the
 * HUD demo has no shell), the second call shares the first one's poller. Returns the uninstaller.
 */
export function installNav(win: Window = window): () => void {
  if (users++ === 0) {
    installNavStyles(win.document);
    const stops = [startKbmWatch(win), startNavController(win)];
    if (new URLSearchParams(win.location.search).get('test') === '1') stops.push(installNavDebug(win));
    stopAll = () => stops.forEach((s) => s());
  }
  return () => {
    if (--users === 0) { stopAll?.(); stopAll = null; }
  };
}
