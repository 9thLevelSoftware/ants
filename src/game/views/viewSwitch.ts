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
    if (s.view === 'colony') s.setView('observer'); // nothing to return to, or the possession waits for the next tick
  }
  h.viewChanged();
}

/** F2: freeze into photo mode, and back to the origin view with the same pose and possession. */
export function togglePhoto(h: ViewSwitchHost): void {
  const s = h.session;
  if (!s || h.mode !== 'playing') return;
  s.setView(s.view === 'photo' ? s.views.photoOrigin : 'photo');
  h.viewChanged();
}

/** UI / debug view request. Possession goes through the sim (the view follows its possession-started event). */
export function requestView(h: ViewSwitchHost, view: ViewId): void {
  const s = h.session;
  if (!s || view === s.view) return;
  if (view === 'photo' || s.view === 'photo') { togglePhoto(h); return; }
  if (view === 'colony' || s.view === 'colony') { toggleColonyView(h); return; }
  if (view === 'observer') {
    h.release();
    if (s.possessedId === -1 && s.view !== 'observer') { s.setView('observer'); h.viewChanged(); }
    return;
  }
  h.possess(s.followId >= 0 ? s.followId : 'queen');
}
