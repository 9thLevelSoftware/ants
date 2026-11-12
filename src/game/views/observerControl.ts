// Observer clicks and keys (GDD 01 §3.2, §5.3, §6.6): hover highlight under the cursor, LMB click selects (inspect
// card; repeated clicks on one spot cycle overlapping candidates), click-hold 400 ms / double-click / E possesses
// the ant under the cursor (or the selected one), F follows or stops following, RMB click / Esc deselects.
import type { InputState } from '@/input';
import type { PickHit, PickTarget } from './picking/entityPick';
import type { ViewsState } from './viewsState';

export interface ObserverHost {
  possess(antId: number): void;
  /** Follow an ant or creature with the observer camera (null: stop following, free fly from here). */
  follow(t: PickTarget | null): void;
  /** Currently followed target, null none. */
  following(): PickTarget | null;
  /** The player colony id (only its ants can be possessed). */
  colonyId(): number;
  antColony(id: number): number;
}

/** Handles one frame of observer input on the current pick; updates hover / selection in `st`. */
export function observerInput(input: InputState | null, hits: readonly PickHit[], st: ViewsState, h: ObserverHost, nowS: number, cursor: { x: number; y: number }): void {
  st.hover = hits[0] ?? null;
  if (!input) return;
  if (input.pressed('select')) {
    st.selected = st.cycler.choose(hits, cursor.x, cursor.y, nowS);
  }
  if (input.pressed('possess-target')) {
    const t = possessTarget(hits, st, h);
    if (t) h.possess(t.id);
  }
  if (input.pressed('follow-toggle')) {
    const f = h.following();
    const want = followable(st.selected) ?? followable(st.hover);
    if (f && (!want || (want.kind === f.kind && want.id === f.id))) h.follow(null);
    else if (want) h.follow(want);
  }
  if (input.pressed('deselect')) st.selected = null;
}

/**
 * E / click-hold (GDD 01 §3.2 "the selected or hovered ant"): the selection when it is under the cursor (click
 * cycling chose it among overlapping ants), else the hovered ant, else the selection.
 */
export function possessTarget(hits: readonly PickHit[], st: ViewsState, h: ObserverHost): PickTarget | null {
  const sel = possessable(st.selected, h);
  if (sel && hits.some((x) => x.kind === sel.kind && x.id === sel.id)) return sel;
  return possessable(st.hover, h) ?? sel;
}

function possessable(t: PickTarget | null, h: ObserverHost): PickTarget | null {
  return t && t.kind === 'ant' && h.antColony(t.id) === h.colonyId() ? t : null;
}

function followable(t: PickTarget | null): PickTarget | null {
  return t && (t.kind === 'ant' || t.kind === 'creature') ? t : null;
}
