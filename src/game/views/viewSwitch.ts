// Player view switches (GDD 01 §2 hand-over matrix): colony view with soft release and return, photo mode with
// the origin view restored, observer / possession requests. Works on a small host interface so Game stays lean.
import type { Command, PossessRole } from '@/sim/types';
import type { GameSession } from '../session';
import type { GameMode, ViewId } from '../time/speedRules';

export interface ViewSwitchHost {
  readonly session: GameSession | null;
  readonly mode: GameMode;
  command(cmd: Command): void;
  possess(target: number | PossessRole, via?: 'command' | 'role-key' | 'cycle' | 'last'): void;
  release(): void;
  /** The view changed: input contexts and redraw. */
  viewChanged(): void;
  /** The views layer; its photo controller opens and closes with the photo view (optional: tests pass bare hosts). */
  readonly viewsLayer?: { readonly photo: { sync(s: GameSession): void } };
}

/**
 * Leaving the colony view for the observer (look pass 3): an ant released from underground is followed by an orbit camera
 * that ends up inside the nest looking at soil (gate-close-app check4/rain-pip.png). The observer then stays free at the
 * colony camera's pose, above the nest it was just studying; a followed ant on the surface is followed as before.
 */
function observerAfterColony(s: GameSession): void {
  const a = s.followId >= 0 ? s.sim.stores.ants.get(s.followId) : undefined;
  if (a && s.sim.field.substrate(a.pos) < 0) { s.followId = -1; s.followItemId = -1; s.views.unfollow(); }
  s.setView('observer');
}

/** M: possession / observer -> colony (soft release, return ant stored by the sim); colony -> back. */
export function toggleColonyView(h: ViewSwitchHost): void {
  const s = h.session;
  if (!s || h.mode !== 'playing' || s.view === 'photo') return;
  if (s.view !== 'colony') {
    if (s.possessedId >= 0) { s.followId = s.possessedId; h.command({ type: 'release', reason: 'colony-view' }); }
    s.setView('colony');
  } else {
    const ret = s.sim.state.player.returnAntId;
    if (ret >= 0 && s.sim.stores.ants.get(ret)) h.possess(ret, 'last');
    if (s.view === 'colony') observerAfterColony(s); // nothing to return to, or the possession waits for the next tick
  }
  h.viewChanged();
}

/** F2: freeze into photo mode, and back to the origin view with the same pose and possession. */
export function togglePhoto(h: ViewSwitchHost): void {
  const s = h.session;
  if (!s || h.mode !== 'playing') return;
  s.setView(s.view === 'photo' ? s.views.photoOrigin : 'photo');
  h.viewsLayer?.photo.sync(s); // enter / leave at once, not at the next rendered frame
  h.viewChanged();
}

/**
 * UI / debug view request: ends in the requested view (possession goes through the sim, and the view follows its
 * possession-started event, so in real time it lands one tick later). Photo mode is left to its origin first.
 * Only a request for the colony view's origin uses the M toggle: an explicit 'observer' leaves the colony view
 * without re-possessing the return ant.
 */
export function requestView(h: ViewSwitchHost, view: ViewId): void {
  const s = h.session;
  if (!s || view === s.view) return;
  if (s.view === 'photo') {
    togglePhoto(h);
    if (s.view !== 'photo' && s.view !== view) requestView(h, view);
    return;
  }
  if (view === 'photo') { togglePhoto(h); return; }
  if (s.view === 'colony') {
    if (view === 'possess') { possessReturnOrFollowed(h, s); return; }
    observerAfterColony(s); // follows a released ant on the surface, stays free over the nest for one underground
    h.viewChanged();
    return;
  }
  if (view === 'colony') { toggleColonyView(h); return; }
  if (view === 'observer') {
    h.release();
    if (s.possessedId === -1 && s.view !== 'observer') { s.setView('observer'); h.viewChanged(); }
    return;
  }
  h.possess(s.followId >= 0 ? s.followId : 'queen');
}

/** Possession requested from the colony view: the return ant (soft release) if alive, else the followed ant or the queen. */
function possessReturnOrFollowed(h: ViewSwitchHost, s: GameSession): void {
  const ret = s.sim.state.player.returnAntId;
  if (ret >= 0 && s.sim.stores.ants.get(ret)) { toggleColonyView(h); return; }
  h.possess(s.followId >= 0 && s.sim.stores.ants.get(s.followId) ? s.followId : 'queen');
}
