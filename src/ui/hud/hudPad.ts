// Gamepad reach for the HUD outside a drawer (GDD 08 5.4, 6.2, task acceptance 5). Pause, the speeds and hide-HUD already
// have pad bindings in the game's input layer, and the shell's gamepad navigation does the D-pad (arrows between alert
// cards) and A (activate) once focus is inside the feed. What is added here:
//  - LB + View enters the alert feed (the same as the backquote key);
//  - inside the feed or the pulse: X opens the card's menu (Shift+Enter), B returns the focus to the game;
//  - a pad button the player has bound to the `directives` or `roster` action toggles that drawer (no default: GDD 08 5.4
//    reaches them through the pause menu).
// Polls only while a pad is connected, so a keyboard-only session never runs a loop.
import { PAD } from '@/input/defaults';
import type { Binding } from '@/input';
import { currentBindings } from '../components';
import { snapshot } from '../store';
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

/** Starts the poller; returns the uninstaller. */
export function startHudPad(): () => void {
  if (typeof window === 'undefined' || !('getGamepads' in navigator)) return () => {};
  let raf = 0;
  let prev: boolean[] = [];
  const poll = () => {
    const pad = Array.from(navigator.getGamepads?.() ?? []).find((p): p is Gamepad => !!p && p.connected);
    if (!pad) { raf = 0; return; }
    const now = pad.buttons.map((b) => b.pressed);
    const mode = snapshot.peek().mode;
    stepHudPad({ down: (i) => !!now[i], edge: (i) => !!now[i] && !prev[i] }, mode === 'playing', document.activeElement as HTMLElement | null);
    prev = now;
    raf = requestAnimationFrame(poll);
  };
  const start = () => { if (!raf) { prev = []; raf = requestAnimationFrame(poll); } };
  window.addEventListener('gamepadconnected', start);
  if (Array.from(navigator.getGamepads?.() ?? []).some((p) => p?.connected)) start();
  return () => { window.removeEventListener('gamepadconnected', start); if (raf) cancelAnimationFrame(raf); raf = 0; };
}
