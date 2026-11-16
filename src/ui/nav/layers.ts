// The navigation layers: every screen and panel that the pad can move around in, in one table, plus the call other
// screens use to register themselves (see the header of ./index.ts). This table IS the focus-order audit's list of
// what exists: a screen that is not here is invisible to the gamepad.
//
// A layer has a root element, a rank (the highest ranked layer that is on screen wins) and a claim:
//   'always'  the layer owns the pad whenever it is on screen (a screen, a book, a dialog: the game is not played
//             while it is open, or it must be dealt with first);
//   'focus'   the layer owns the pad only while keyboard/pad focus is inside it (a drawer, the alert feed, the
//             colony view's tool UI, a card over the play view): otherwise the pad plays the game.
export type LayerClaim = 'always' | 'focus';

export interface NavLayerSpec {
  id: string;
  /** CSS selector of the root (built-in layers); the first match that is on screen is the root. */
  selector?: string;
  /** Alternative to `selector`: the root element, or null while the layer is not on screen. */
  root?: () => HTMLElement | null;
  /** Higher wins when several layers are on screen. Screens 50, books 60, dialogs 100, drawers 30, regions 20. */
  rank: number;
  claim: LayerClaim;
  /** Selector of the control that gets focus when the pad first needs it (default: the first focusable control). */
  initial?: string;
  /** B / Start. Return true when handled; default is the shell's back stack (`handleBack`). */
  onBack?: () => boolean | void;
  /** LB / RB inside the layer (tab switching). Return true when handled; default sends Q / E to the page. */
  onTab?: (dir: -1 | 1) => boolean | void;
  /** Who this layer is for in the audit's report ("screen", "book", "drawer", ...). */
  kind: 'screen' | 'book' | 'dialog' | 'drawer' | 'region' | 'overlay';
}

/** The built-in layers: every screen and panel of the shell, the HUD and the views (the task's focus-order audit list). */
export const BUILTIN_LAYERS: readonly NavLayerSpec[] = [
  { id: 'error', selector: '.ui-error', rank: 110, claim: 'always', kind: 'dialog' },
  { id: 'dialog', selector: '.ui-modal', rank: 100, claim: 'always', kind: 'dialog' },
  { id: 'select-list', selector: '.ui-select-list', rank: 95, claim: 'always', kind: 'dialog' },
  // book screens: Settings, Save/Load, New game, Credits, Codex, Journal (GDD 08 7.1)
  { id: 'book', selector: '.ui-book', rank: 60, claim: 'always', kind: 'book' },
  { id: 'lineage', selector: '.li-root', rank: 58, claim: 'always', kind: 'screen' },
  { id: 'epitaph', selector: '.ep-root', rank: 56, claim: 'always', kind: 'screen' },
  { id: 'screen', selector: '.ui-screen', rank: 50, claim: 'always', kind: 'screen' },
  // overlays that sit over play: the pad belongs to them only once focus is in them
  { id: 'founding', selector: '.fo-root', rank: 40, claim: 'focus', kind: 'overlay' },
  { id: 'winter', selector: '.wi-root', rank: 40, claim: 'focus', kind: 'overlay' },
  { id: 'flight', selector: '.fl-root', rank: 40, claim: 'focus', kind: 'overlay' },
  { id: 'alert-menu', selector: '.fd-alert-menu', rank: 35, claim: 'focus', kind: 'region' },
  { id: 'drawer', selector: '.fd-drawer', rank: 30, claim: 'focus', kind: 'drawer' },
  { id: 'photo', selector: '.ph-root', rank: 25, claim: 'focus', kind: 'region' },
  { id: 'tools', selector: '.pn-panel, .ov-controls', rank: 20, claim: 'focus', kind: 'region' },
  { id: 'feed', selector: '.fd-alerts, .fd-pulse', rank: 20, claim: 'focus', kind: 'region' },
];

const registered: NavLayerSpec[] = [];

/**
 * Registers a layer of your own (a new screen or panel). Returns the function that removes it again.
 * One line is enough: `registerNavLayer({ id: 'overwinter', selector: '.wi-root', rank: 50, claim: 'always', kind: 'screen' })`.
 */
export function registerNavLayer(spec: NavLayerSpec): () => void {
  registered.push(spec);
  return () => {
    const i = registered.indexOf(spec);
    if (i >= 0) registered.splice(i, 1);
  };
}

/** Built-in layers and registered ones (a registered layer with the id of a built-in one replaces it). */
export function allLayers(): NavLayerSpec[] {
  const ids = new Set(registered.map((l) => l.id));
  return [...BUILTIN_LAYERS.filter((l) => !ids.has(l.id)), ...registered];
}

/** A layer that is on screen, with its resolved root. */
export interface LiveLayer { spec: NavLayerSpec; root: HTMLElement }

function isOnScreen(el: HTMLElement): boolean {
  if (el.closest('[inert], [hidden]')) return false;
  return el.getClientRects().length > 0;
}

/** Every layer whose root exists and is visible and not inert. */
export function liveLayers(doc: Document = document): LiveLayer[] {
  const out: LiveLayer[] = [];
  for (const spec of allLayers()) {
    const roots = spec.root ? [spec.root()] : spec.selector ? Array.from(doc.querySelectorAll<HTMLElement>(spec.selector)) : [];
    for (const root of roots) if (root && isOnScreen(root)) out.push({ spec, root });
  }
  return out;
}

/** Pure choice among candidates (testable without a DOM): index of the highest rank that claims the pad, or -1. */
export interface Candidate { rank: number; claim: LayerClaim; focusInside: boolean }

export function pickLayerIndex(cands: readonly Candidate[]): number {
  let best = -1;
  cands.forEach((c, i) => {
    if (c.claim === 'focus' && !c.focusInside) return;
    if (best < 0 || c.rank > cands[best].rank) best = i;
  });
  return best;
}

/** The layer that owns the pad right now, or null (then the game owns it). */
export function activeLayer(doc: Document = document): LiveLayer | null {
  const live = liveLayers(doc);
  const focus = doc.activeElement;
  const i = pickLayerIndex(live.map((l) => ({ rank: l.spec.rank, claim: l.spec.claim, focusInside: !!focus && l.root.contains(focus) })));
  return i < 0 ? null : live[i];
}
