// Gamepad reach for the HUD outside a drawer (GDD 08 5.4, 6.2, task acceptance 5). Pause, the speeds and hide-HUD already
// have pad bindings in the game's input layer, and the shell's gamepad navigation does the D-pad (arrows between alert
// cards) and A (activate) once focus is inside the feed. What is added here:
//  - LB + View enters the alert feed (the same as the backquote key);
//  - inside the feed or the pulse: X opens the card's menu (Shift+Enter), B returns the focus to the game;
//  - a pad button the player has bound to the `directives` or `roster` action toggles that drawer (no default: GDD 08 5.4
//    reaches them through the pause menu).
// The poller that used to call these is gone: src/ui/nav drives the pad now (one reader for every layer). `boundPadFires`
// and `stepHudPad` stay as pure helpers with their tests.
import { PAD } from '@/input/defaults';
import type { Binding } from '@/input';
import { currentBindings } from '../components';
import { isEntered } from './focusPolicy';
import { enterFeed } from './hotkeys';
import { togglePanel, type DrawerId } from './state';

const BOUND: readonly DrawerId[] = ['directives', 'roster'];

interface PadButtons { down: (i: number) => boolean; edge: (i: number) => boolean }

/** A pad binding of a drawer action fires when its button has an edge and its modifier (if any) is held. */
export function boundPadFires(b: Binding | null | undefined, pad: PadButtons): boolean {
  if (!b || b.kind !== 'pad' || b.gesture) return false;
  return pad.edge(b.button) && (b.mod === undefined || pad.down(b.mod));
}

/** One poll step on the current pad state; exported for the unit test. */
export function stepHudPad(pad: PadButtons, playing: boolean, active: HTMLElement | null): void {
  if (!playing) return;
  if (pad.down(PAD.LB) && pad.edge(PAD.VIEW)) { enterFeed(); return; }
  for (const id of BOUND) if (boundPadFires(currentBindings.value.pad[id], pad)) { togglePanel(id); return; }
  if (!active || !isEntered(active) || active.closest('.fd-drawer')) return;
  if (pad.edge(PAD.X)) active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
  if (pad.edge(PAD.B)) active.blur();
}
