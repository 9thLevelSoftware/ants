// Reviewer tests (F3b): the view machine and possession plumbing on the real sim through the same host interface
// Game uses (manual clock: commands apply at once, like ?test=1). GDD 01 §2, §3.2, §3.6, App. E 20/21/22.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { AntFlag, type Command, type PossessRole } from '@/sim/types';
import { GameSession } from './session';
import type { GameMode, ViewId } from './time/speedRules';
import { requestView, toggleColonyView, togglePhoto, type ViewSwitchHost } from './views/viewSwitch';

const cam = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

/** The parts of Game the view switches use, with Game's own rules (manual clock). */
class Host implements ViewSwitchHost {
  mode: GameMode = 'playing';
  constructor(readonly session: GameSession) {}
  command(cmd: Command): void {
    this.session.driver.enqueue(cmd);
    this.session.driver.applyCommandsNow();
    this.session.update(0);
  }
  possess(target: number | PossessRole): void {
    if (this.session.view === 'photo') return;
    this.command(this.session.possessCommand(target, true));
  }
  release(): void {
    if (this.session.possessedId !== -1) this.command({ type: 'release', reason: 'player' });
  }
  viewChanged(): void {}
}

function setup(workers = 5) {
  const s = new GameSession(makeTestSim({ nest: 'small', workers }), cam);
  const h = new Host(s);
  return { s, h, sim: s.sim };
}

const isControlled = (s: GameSession, id: number) => ((s.sim.stores.ants.get(id)!.flags & AntFlag.POSSESSED) !== 0);

describe('view machine (reviewer)', () => {
  it('E21: M from possession soft-releases into colony; M again re-possesses the same ant at 1x', () => {
    const { s, h, sim } = setup();
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    h.possess(w.id);
    expect(s.view).toBe('possess');
    h.command({ type: 'setSpeed', speed: 4 });
    toggleColonyView(h);
    expect(s.view).toBe('colony');
    expect(s.possessedId).toBe(-1);
    expect(isControlled(s, w.id)).toBe(false);
    expect(sim.state.player.returnAntId).toBe(w.id);
    toggleColonyView(h);
    expect(s.view).toBe('possess');
    expect(s.possessedId).toBe(w.id);
    expect(sim.state.env.time.speed).toBe(1);
  });

  it('colony view entered from the observer returns to the observer', () => {
    const { s, h } = setup();
    expect(s.view).toBe('observer');
    toggleColonyView(h);
    expect(s.view).toBe('colony');
    toggleColonyView(h);
    expect(s.view).toBe('observer');
  });

  it('E22 (game side): photo from possession freezes and returns to the same possession', () => {
    const { s, h, sim } = setup();
    h.possess('queen');
    const id = s.possessedId;
    togglePhoto(h);
    expect(s.view).toBe('photo');
    h.possess(sim.state.ants.find((a) => a.caste === 'worker')!.id); // refused in photo mode
    expect(s.possessedId).toBe(id);
    togglePhoto(h);
    expect(s.view).toBe('possess');
    expect(s.possessedId).toBe(id);
  });

  it('E20: Tab x6 within 2 s possesses 5 distinct nearby ants, then the first again', () => {
    const { s, h } = setup(5);
    h.possess('queen');
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      const id = s.tab.next(s.sim, s.focus(), s.possessedId, 1, i * 0.3);
      h.possess(id);
      expect(s.possessedId).toBe(id);
      seen.push(id);
    }
    expect(new Set(seen.slice(0, 5)).size).toBe(5);
    expect(seen[5]).toBe(seen[0]);
  });

  it('a followed ant that dies leaves the observer free (no stale follow id)', () => {
    const { s, h, sim } = setup();
    const w = sim.state.ants.find((a) => a.caste === 'worker')!;
    h.possess(w.id);
    h.release();
    expect(s.view).toBe('observer');
    expect(s.followId).toBe(w.id);
    h.command({ type: 'cheat.kill', id: w.id, cause: 'test' });
    s.driver.step(1);
    s.update(0);
    expect(s.currentSubject(1)).toBeNull();
    expect(s.followId).toBe(-1);
  });

  it('a UI / debug request for a view ends in that view (observer requested from the colony view)', () => {
    // requestView routes every request that touches the colony view through the M toggle, so asking for the
    // observer while a return ant exists re-possesses that ant instead (debug camera.set('observer') -> 'possess').
    const { s, h } = setup();
    h.possess('queen');
    toggleColonyView(h);
    expect(s.view).toBe('colony');
    const want: ViewId = 'observer';
    requestView(h, want);
    expect(s.view).toBe(want);
  });
});
