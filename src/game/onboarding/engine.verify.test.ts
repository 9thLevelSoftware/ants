// Reviewer tests (onboarding verify): try to break the hint engine's rules (GDD 08 §9.1, §9.2, App E 9-10).
// Tests that fail here demonstrate a real defect and are left for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import type { HintId } from '@/sim/types';
import { ProfileStore } from '../profile/profile';
import { HINT_EXPIRY_REAL_S, HINT_MAX_PER_MINUTE, HINT_RATE_WINDOW_REAL_S } from './balance';
import { HintEngine } from './engine';
import { noFacts } from './facts';
import { MemoryHintStore, ProfileHintStore, type HintProfileLike } from './store';
import type { Facts, HintStore } from './types';

const worker = { isQueen: false, underground: false, carryingFood: false, trailOn: false, colonyOrders: false };

/** A colony after the hand-over: a worker possessed on the surface, no alerts, HUD visible. */
function facts(over: Partial<Facts> = {}): Facts {
  return { ...noFacts(true), active: true, view: 'possess', workers: 5, possessed: { ...worker }, ...over };
}

function rig(store: HintStore = new MemoryHintStore()) {
  const engine = new HintEngine({ store });
  let clock = 0;
  const run = (s: number, f: Facts) => { for (let t = 0; t < s - 1e-9; t += 0.25) { engine.update(f, 0.25); clock += 0.25; } };
  /** Engine clock times of fresh first shows by the card. */
  const shows = () => engine.log.filter((l) => l.event === 'shown' && l.presenter === 'engine');
  return { engine, store, run, shows, now: () => clock };
}

describe('rate limit: at most HINT_MAX_PER_MINUTE new teaching prompts per real minute', () => {
  it('holds when every hint is new', () => {
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    // trail (carrying food), then colony view (first delivery flag), then speed (observer): three hints the player meets in a row
    r.run(3, facts({ possessed: { ...worker, carryingFood: true } }));
    r.engine.use('trail', 2);
    r.run(6, facts({ possessed: { ...worker, carryingFood: false }, firstFood: true }));
    r.engine.use('colony-view');
    r.run(45, facts({ view: 'observer', possessed: null }));
    const s = r.shows();
    const firstMinute = s.filter((l) => l.at < s[0]!.at + HINT_RATE_WINDOW_REAL_S);
    expect(firstMinute.length).toBeLessThanOrEqual(HINT_MAX_PER_MINUTE);
  });

  it('holds when the verb of the third hint was used once before the hint ever appeared', () => {
    // A single speed change before hint-speed ever shows (1 of 2 uses) makes the profile store the hint as 'shown'
    // (ProfileStore.recordHintUse: pending -> shown). The engine then treats it as not new and skips the rate limit.
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    r.engine.use('speed', 1);
    expect(r.engine.log.some((l) => l.id === 'hint-speed' && l.event === 'shown')).toBe(false); // never on screen
    r.run(3, facts({ possessed: { ...worker, carryingFood: true } }));
    r.engine.use('trail', 2);
    r.run(6, facts({ possessed: { ...worker, carryingFood: false }, firstFood: true }));
    r.engine.use('colony-view');
    // The run must outlast the one-minute window, or the third hint could not show at all (the first form of this
    // test ran only 54 s in total and asked for three shows and at most two in the first minute at once).
    r.run(45 + HINT_RATE_WINDOW_REAL_S, facts({ view: 'observer', possessed: null }));
    const s = r.shows();
    expect(s.map((l) => l.id)).toEqual(['hint-trail', 'hint-colony-view', 'hint-speed']);
    const firstMinute = s.filter((l) => l.at < s[0]!.at + HINT_RATE_WINDOW_REAL_S);
    expect(firstMinute.length, `new prompts at ${s.map((l) => `${l.id}@${l.at}`).join(', ')}`).toBeLessThanOrEqual(HINT_MAX_PER_MINUTE);
  });
});

describe('GDD 08 §9.2 triggers', () => {
  it('hint-directives shows on the first possession of the queen even when Tab (hint-cycle) was never used', () => {
    // GDD 08 §9.2 #19 / E-100: the trigger is the first queen possession after the hand-over, with no prerequisite. The
    // table adds `after: ['hint-cycle']`; a player who possesses by click or the 8 key never learns hint-cycle, and once
    // hint-cycle has retired HINT_MAX_FULL_SHOWS times the Colony orders hint is blocked for the rest of the game.
    const r = rig();
    const queen = facts({ possessed: { ...worker, isQueen: true, colonyOrders: true } });
    r.run(4 * (HINT_EXPIRY_REAL_S + 200), queen);
    const ids = r.shows().map((l) => l.id);
    expect(ids, `shown: ${ids.join(', ')}`).toContain('hint-directives');
  });

  it('hint-move: 3 s of cumulative movement teaches it, in pieces too (App E 9)', () => {
    const r = rig();
    const search = facts({ foundingInProgress: true, openingPhase: 'search', externalShown: ['hint-move'] });
    r.run(1, { ...search, moving: true });
    r.run(5, search);
    r.run(1, { ...search, moving: true });
    expect(r.engine.state('hint-move')).not.toBe('learned');
    r.run(1.25, { ...search, moving: true });
    expect(r.engine.state('hint-move')).toBe('learned');
    expect(r.engine.allows('hint-move')).toBe(false);
  });

  it('draws nothing but opening hints while the opening runs, even with every colony trigger true', () => {
    const r = rig();
    r.store.learn('hint-move'); r.store.learn('hint-look');
    r.run(120, facts({
      foundingInProgress: true, openingPhase: 'dig', firstFood: true, firstTrail: true, diagWarn: true, view: 'possess',
      possessed: { ...worker, isQueen: true, carryingFood: true, colonyOrders: true },
    }));
    expect(r.shows()).toEqual([]);
  });
});

describe('quiet rules', () => {
  it('a critical alert hides the card at once and nothing new appears while it lasts', () => {
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    r.run(3, facts({ possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-trail');
    r.run(0.25, facts({ possessed: { ...worker, carryingFood: true }, criticalAlert: true }));
    expect(r.engine.view()).toBeNull();
    r.run(120, facts({ possessed: { ...worker, carryingFood: true }, firstFood: true, criticalAlert: true }));
    expect(r.engine.view()).toBeNull();
  });

  it('a time-lapse silences every hint that is not about it; a hidden HUD and photo mode too', () => {
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    const base = { possessed: { ...worker, carryingFood: true }, firstFood: true };
    r.run(60, facts({ ...base, timelapse: true }));
    r.run(60, facts({ ...base, hudHidden: true }));
    r.run(60, facts({ ...base, view: 'photo' }));
    expect(r.shows()).toEqual([]);
  });

  it('hints off: nothing shows and other presenters are told not to draw; turning them on again resumes', () => {
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    r.run(30, facts({ possessed: { ...worker, carryingFood: true }, hintsOn: false }));
    expect(r.shows()).toEqual([]);
    expect(r.engine.allows('hint-move')).toBe(false);
    r.run(5, facts({ possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-trail');
  });

  it('NaN, zero and negative time steps do not move or poison the clock; huge ones are capped', () => {
    const r = rig();
    const f = facts();
    r.engine.update(f, Number.NaN);
    r.engine.update(f, -5);
    r.engine.update(f, 0);
    expect(r.engine.clock).toBe(0);
    r.engine.update(f, Number.POSITIVE_INFINITY);
    expect(r.engine.clock).toBe(1);
    expect(Number.isFinite(r.engine.clock)).toBe(true);
  });
});

describe('once only, over a long play', () => {
  it('a learned hint never shows again however often its trigger flaps; an unlearned one comes back only a few times', () => {
    const r = rig();
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) r.store.learn(id);
    for (let i = 0; i < 40; i++) {
      r.run(20, facts({ possessed: { ...worker, carryingFood: true } }));
      r.run(20, facts({ possessed: { ...worker, carryingFood: false } }));
    }
    const trailShows = r.shows().filter((l) => l.id === 'hint-trail').length;
    expect(trailShows).toBeGreaterThan(0);
    expect(trailShows).toBeLessThanOrEqual(3);
    r.engine.use('trail', 2);
    const before = r.shows().length;
    for (let i = 0; i < 20; i++) r.run(30, facts({ possessed: { ...worker, carryingFood: i % 2 === 0 } }));
    expect(r.shows().slice(before).filter((l) => l.id === 'hint-trail')).toEqual([]);
  });
});

describe('persistence through the real profile store (the Settings path when the profile is registered)', () => {
  it('a learned hint stays learned for a new engine; profile.resetHints() (Settings > Reset hints) brings it back', async () => {
    const profile = new ProfileStore({ setTimer: () => 0, clearTimer: () => {} });
    await profile.load();
    const store = new ProfileHintStore(profile as unknown as HintProfileLike);
    const a = rig(store);
    for (const id of ['hint-cycle', 'hint-observer'] as HintId[]) a.engine.learn(id);
    a.run(3, facts({ possessed: { ...worker, carryingFood: true } }));
    expect(a.engine.view()?.id).toBe('hint-trail');
    a.engine.use('trail', 2);
    expect(a.engine.view()).toBeNull();
    a.engine.dispose();

    const b = rig(new ProfileHintStore(profile as unknown as HintProfileLike));
    b.run(60, facts({ possessed: { ...worker, carryingFood: true } }));
    expect(b.shows()).toEqual([]);

    profile.resetHints();
    expect(b.engine.state('hint-trail')).toBe('pending');
    b.run(10, facts({ possessed: { ...worker, carryingFood: false }, workers: 5 }));
    expect(b.engine.view()?.id).toBe('hint-cycle'); // the earliest hint again, as in a fresh profile
  });
});
