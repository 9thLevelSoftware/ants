import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { UiSnapshot } from '@/ui/api';
import { buildSnapshot } from '../uiBridge';
import { OnboardingController } from './controller';
import type { UiFacts } from './facts';
import { MemoryHintStore } from './store';
import type { ViewIdLike } from './testkit';

// The controller on a real small sim and the real snapshot builder: events, facts and UI changes teach.
function rig(workers = 4) {
  const sim: Sim = makeTestSim({ nest: 'small', workers });
  sim.state.player.opening = null; // a colony past its opening (the test sim starts in the intro card)
  const game = { session: { sim } as { sim: Sim } | null, getSettings: () => ({ gameplay: { hints: true } }) };
  const ui: UiFacts = { drawer: null, overlayScent: false, overlayOther: false, foundingShown: [] };
  let view: ViewIdLike = 'observer';
  let mode: 'playing' | 'paused' = 'playing';
  const snap = (): UiSnapshot => buildSnapshot({
    sim: game.session?.sim ?? null, mode, view, loading: null, speed: null, manualClock: true, toasts: [], hudHidden: false,
    underground: false, error: null, epitaph: null,
  }, 0);
  const store = new MemoryHintStore();
  let current = snap();
  const ctl = new OnboardingController({ game, snapshot: () => current, ui: () => ui, store, manual: true });
  const refresh = () => { current = snap(); };
  return { sim, game, ui, ctl, store, setView: (v: ViewIdLike) => { view = v; refresh(); }, setMode: (m: typeof mode) => { mode = m; refresh(); }, refresh };
}

const worker = (sim: Sim) => sim.state.ants.find((a) => a.caste === 'worker')!;

describe('OnboardingController on a real sim', () => {
  it('learns hint-move from movement intent of the possessed ant, in real seconds, only while possessing', () => {
    const r = rig();
    r.sim.state.player.possessedAntId = worker(r.sim).id;
    r.sim.state.player.intent.dir.x = 1;
    r.setView('observer');
    r.ctl.advance(5);
    expect(r.ctl.engine.state('hint-move')).not.toBe('learned'); // not steering an ant in the observer view
    r.setView('possess');
    r.ctl.advance(2.5);
    expect(r.ctl.engine.state('hint-move')).not.toBe('learned');
    r.ctl.advance(1);
    expect(r.ctl.engine.state('hint-move')).toBe('learned');
  });

  it('turns sim events of the possessed ant into uses, and ignores other ants', () => {
    const r = rig();
    const w = worker(r.sim);
    r.sim.state.player.possessedAntId = w.id;
    r.setView('possess');
    r.ctl.advance(0.5);
    r.sim.events.emit('trail-toggled', { type: 'trail-toggled', antId: w.id + 999, on: true });
    expect(r.ctl.engine.uses()['trail']).toBeUndefined();
    r.sim.events.emit('trail-toggled', { type: 'trail-toggled', antId: w.id, on: true });
    r.sim.events.emit('possession-started', { type: 'possession-started', antId: w.id, caste: 'worker', via: 'cycle' });
    expect(r.ctl.engine.uses()).toMatchObject({ trail: 1, cycle: 1 });
  });

  it('counts the colony view, the scent view, a drawer and a new marker from changes of state', () => {
    const r = rig();
    r.ctl.advance(0.5);
    r.setView('colony');
    r.ctl.advance(0.5);
    expect(r.ctl.engine.uses()['colony-view']).toBe(1);
    r.ui.overlayScent = true;
    r.ui.drawer = 'health';
    r.ctl.advance(0.5);
    expect(r.ctl.engine.uses()).toMatchObject({ scent: 1, why: 1 });
    r.ui.drawer = 'directives';
    r.ctl.advance(0.25);
    expect(r.ctl.engine.uses()['directives']).toBe(1);
    r.ctl.advance(0.25); // a drawer that stays open counts once
    expect(r.ctl.engine.uses()['directives']).toBe(1);
  });

  it('gives a card for hint-colony-view after the first delivery event, and the card goes when the view changes', () => {
    const r = rig();
    r.setView('observer');
    r.ctl.advance(3); // the controller listens to the sim from its first step on
    expect(r.ctl.view()?.id).not.toBe('hint-colony-view');
    r.sim.events.emit('delivery', { type: 'delivery', antId: 1, colonyId: r.sim.state.player.colonyId, sourceId: 1, kind: 'sugar', c: 1, p: 0, toxin: 0 });
    const seen: (string | null)[] = [];
    r.ctl.subscribe((v) => seen.push(v?.id ?? null));
    r.store.learn('hint-cycle'); // the Tab hint came first; it is learned, the quiet gap passes, the next one shows
    r.ctl.advance(8);
    expect(r.ctl.view()?.id).toBe('hint-colony-view');
    r.setView('colony');
    r.ctl.advance(0.5);
    expect(r.ctl.engine.state('hint-colony-view')).toBe('learned');
    expect(r.ctl.view()).toBeNull();
    expect(seen.slice(-2)).toEqual(['hint-colony-view', null]);
  });

  it('keeps the clock still behind the pause menu and ignores the wall clock in manual mode', () => {
    const r = rig();
    r.setMode('paused');
    r.ctl.advance(30);
    expect(r.ctl.engine.clock).toBe(0);
    r.setMode('playing');
    r.ctl.tick();
    r.ctl.tick();
    expect(r.ctl.engine.clock).toBe(0);
    r.ctl.advance(2);
    expect(r.ctl.engine.clock).toBeCloseTo(2, 5);
  });

  it('starts a fresh game state when the sim changes (flags clear) but keeps what was learned', () => {
    const r = rig();
    r.ctl.advance(0.1);
    r.sim.events.emit('delivery', { type: 'delivery', antId: 1, colonyId: r.sim.state.player.colonyId, sourceId: 1, kind: 'sugar', c: 1, p: 0, toxin: 0 });
    r.ctl.advance(0.5);
    expect(r.ctl.engine.flagList()).toContain('firstDelivery');
    r.store.learn('hint-look');
    const next = makeTestSim({ nest: 'small', workers: 2 });
    next.state.player.opening = null;
    r.game.session = { sim: next };
    r.refresh();
    r.ctl.advance(0.5);
    expect(r.ctl.engine.flagList()).not.toContain('firstDelivery');
    expect(r.ctl.engine.state('hint-look')).toBe('learned');
  });
});
