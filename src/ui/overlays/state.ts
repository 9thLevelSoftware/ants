// Overlay state of the UI (which overlays are on) and the seam to whoever draws them. The scent-fx task draws the 3D
// overlays and exposes `setOverlay(kind, on)`; the game registers that as the host once it exists. Until a host is
// registered the state still changes (the controls and legends work), and nothing is drawn.
import { signal } from '@preact/signals';
import { applyOverlay, cycleOverlay, isActive, type OverlayId, type OverlaySet } from './catalogue';

export const overlays = signal<OverlaySet>({ scent: false, other: null });

export interface OverlayHost {
  setOverlay(id: OverlayId, on: boolean): void;
}

let host: OverlayHost | null = null;

/** Registers the drawer of the 3D overlays; returns the unregister function. */
export function registerOverlayHost(h: OverlayHost): () => void {
  host = h;
  // bring a late host up to date with what the player already switched on
  const s = overlays.peek();
  if (s.scent) h.setOverlay('scent', true);
  if (s.other) h.setOverlay(s.other, true);
  return () => { if (host === h) host = null; };
}

function push(prev: OverlaySet, next: OverlaySet): void {
  overlays.value = next;
  if (!host) return;
  if (prev.other !== next.other) {
    if (prev.other) host.setOverlay(prev.other, false);
    if (next.other) host.setOverlay(next.other, true);
  }
  if (prev.scent !== next.scent) host.setOverlay('scent', next.scent);
}

export function setOverlay(id: OverlayId, on: boolean): void {
  const prev = overlays.peek();
  push(prev, applyOverlay(prev, id, on));
}

export function toggleOverlay(id: OverlayId): void {
  setOverlay(id, !isActive(overlays.peek(), id));
}

/** The O key. */
export function cycleOtherOverlay(): void {
  const prev = overlays.peek();
  push(prev, cycleOverlay(prev));
}

/** Everything off (a new game or the end of one). */
export function clearOverlays(): void {
  push(overlays.peek(), { scent: false, other: null });
}
