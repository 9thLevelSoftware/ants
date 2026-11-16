import { describe, expect, it } from 'vitest';
import { HINT_IDS, type HintId } from '@/sim/types';
import { hintText } from '@/content/text';
import { HINT_DELAY_REAL_S, HINT_GAP_REAL_S, HINT_IDLE_REAL_S, HINT_MAX_PER_MINUTE, HINT_RETURN_REAL_S } from './balance';
import { HintEngine } from './engine';
import { noFacts } from './facts';
import { MemoryHintStore } from './store';
import { HINT_TABLE } from './table';
import type { Facts } from './types';

/** Facts of a worker outside carrying food, no alerts, HUD visible, opening over. */
function facts(over: Partial<Facts> = {}): Facts {
  return {
    ...noFacts(true), active: true, view: 'possess', workers: 5,
    possessed: { isQueen: false, underground: false, carryingFood: true, trailOn: false, colonyOrders: false },
    ...over,
  };
}

function setup(learned: HintId[] = ['hint-cycle', 'hint-observer']) {
  const store = new MemoryHintStore();
  for (const id of learned) store.learn(id); // the hints that would otherwise come first in a colony with workers
  const engine = new HintEngine({ store });
  /** Runs `s` real seconds in 0.25 s steps with the given facts. */
  const run = (s: number, f: Facts = facts()) => { for (let t = 0; t < s - 1e-9; t += 0.25) engine.update(f, 0.25); };
  return { store, engine, run };
}

const shownIds = (e: HintEngine) => e.log.filter((l) => l.event === 'shown').map((l) => l.id);

describe('hint table', () => {
  it('has exactly one entry per hint id, in a strict order, with words', () => {
    expect(HINT_TABLE.map((d) => d.id).sort()).toEqual([...HINT_IDS].sort());
    const orders = HINT_TABLE.map((d) => d.order);
    expect(new Set(orders).size).toBe(orders.length);
    for (const d of HINT_TABLE) {
      expect(hintText(d.id).verb.length).toBeGreaterThan(0);
      for (const a of d.after ?? []) expect(HINT_IDS).toContain(a);
      expect(hintText(d.id).verb).not.toMatch(/!|\byou\b/i); // house style: calm, no exclamation, no second person
    }
  });

  it('follows the order of GDD 08 §9.2 for the ids it lists', () => {
    const order = ['hint-move', 'hint-look', 'hint-antennate', 'hint-dig', 'hint-readiness', 'hint-seal', 'hint-lay', 'hint-timelapse', 'hint-cycle',
      'hint-observer', 'hint-pickup', 'hint-trail', 'hint-share', 'hint-colony-view', 'hint-marker', 'hint-speed', 'hint-scent', 'hint-why', 'hint-directives'] as HintId[];
    const pos = order.map((id) => HINT_TABLE.find((d) => d.id === id)!.order);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
});

describe('the engine: show, learn, once only', () => {
  it('shows a hint after its trigger held for the delay, and nothing before', () => {
    const { engine, run } = setup();
    run(HINT_DELAY_REAL_S - 0.5);
    expect(engine.view()).toBeNull();
    run(1);
    expect(engine.view()?.id).toBe('hint-trail');
    expect(engine.state('hint-trail')).toBe('shown');
  });

  it('is learned by doing the thing the set number of times, and never shows again', () => {
    const { engine, run } = setup();
    run(3);
    expect(engine.view()?.id).toBe('hint-trail');
    engine.use('trail');
    expect(engine.view()?.id).toBe('hint-trail'); // 1 of 2
    engine.use('trail');
    expect(engine.state('hint-trail')).toBe('learned');
    expect(engine.view()).toBeNull();
    run(120);
    expect(shownIds(engine).filter((i) => i === 'hint-trail')).toHaveLength(1);
    expect(engine.view()?.id).not.toBe('hint-trail');
  });

  it('counts uses even when the hint never showed (performing the action is learning)', () => {
    const { engine, run } = setup();
    engine.use('trail', 2);
    run(30);
    expect(shownIds(engine)).not.toContain('hint-trail');
    expect(engine.state('hint-trail')).toBe('learned');
  });

  it('counts continuous movement in seconds and learns hint-move at 3 s', () => {
    const { engine, run } = setup();
    run(2.5, facts({ moving: true }));
    expect(engine.state('hint-move')).not.toBe('learned');
    run(1, facts({ moving: true }));
    expect(engine.state('hint-move')).toBe('learned');
  });

  it('dismiss hides the card and the hint never returns; hints off shows nothing', () => {
    const { engine, run } = setup();
    run(3);
    expect(engine.dismiss()).toBe(true);
    expect(engine.state('hint-trail')).toBe('dismissed');
    run(60);
    expect(shownIds(engine).filter((i) => i === 'hint-trail')).toHaveLength(1);
    const off = setup();
    off.run(10, facts({ hintsOn: false }));
    expect(off.engine.view()).toBeNull();
    expect(shownIds(off.engine)).toEqual([]);
  });
});

describe('the engine: one at a time, priority, rate', () => {
  /** Facts in which several engine hints are ready at once: trail (12), colony-view (14), scent (17). */
  const many = () => facts({ firstFood: true, firstTrail: true });

  it('shows the hint with the lowest order first, one at a time', () => {
    const { engine, run } = setup();
    run(3, many());
    expect(engine.view()?.id).toBe('hint-trail');
    run(30, many());
    expect(engine.view()?.id).toBe('hint-trail'); // still the same one; nothing else joins it
    engine.use('trail', 2);
    expect(engine.view()).toBeNull();
    run(HINT_GAP_REAL_S - 1, many());
    expect(engine.view()).toBeNull(); // quiet gap after one goes away
    run(3, many());
    expect(engine.view()?.id).toBe('hint-colony-view');
  });

  it(`shows at most ${HINT_MAX_PER_MINUTE} new hints per real minute`, () => {
    const { engine, run } = setup();
    const f = many();
    const learnCurrent = () => { const v = engine.view(); if (v) engine.learn(v.id); };
    // keep learning whatever shows; count how many new ones appear within a minute
    for (let t = 0; t < 58; t += 0.25) { engine.update(f, 0.25); learnCurrent(); }
    expect(shownIds(engine).length).toBeLessThanOrEqual(HINT_MAX_PER_MINUTE);
    for (let t = 0; t < 40; t += 0.25) { engine.update(f, 0.25); learnCurrent(); }
    expect(shownIds(engine).length).toBeGreaterThan(HINT_MAX_PER_MINUTE); // the window moved on
  });

  it('respects the order prerequisites (look needs move learned, observer needs cycle)', () => {
    const { engine, run } = setup();
    run(10, facts({ possessed: { isQueen: false, underground: false, carryingFood: false, trailOn: false, colonyOrders: false } }));
    expect(shownIds(engine)).not.toContain('hint-look');
    expect(shownIds(engine)).not.toContain('hint-observer');
    engine.learn('hint-move');
    run(3, facts({ possessed: { isQueen: false, underground: false, carryingFood: false, trailOn: false, colonyOrders: false } }));
    expect(engine.view()?.id).toBe('hint-look');
  });
});

describe('the engine: when it stays quiet', () => {
  it.each([
    ['a critical alert', { criticalAlert: true }],
    ['a time-lapse', { timelapse: true }],
    ['the opening running', { foundingInProgress: true, openingPhase: 'dig' }],
    ['a hidden HUD', { hudHidden: true }],
    ['photo mode', { view: 'photo' as const }],
  ])('shows nothing during %s', (_name, over) => {
    const { engine, run } = setup();
    run(20, facts(over as Partial<Facts>));
    expect(engine.view()).toBeNull();
    expect(shownIds(engine)).toEqual([]);
    run(3); // and the hint is still waiting afterwards
    expect(engine.view()?.id).toBe('hint-trail');
  });

  it('hides the hint on screen when a fight starts and keeps quiet for a while after it', () => {
    const { engine, run } = setup();
    run(3);
    expect(engine.view()?.id).toBe('hint-trail');
    engine.onEvent({ type: 'combat-hit' }, { possessedId: 1, colonyId: 0 });
    run(0.5);
    expect(engine.view()).toBeNull();
    run(8);
    expect(engine.view()).toBeNull();
    run(12);
    expect(engine.view()?.id).toBe('hint-trail');
  });

  it('stands still while a menu is open or no game is running', () => {
    const { engine, run } = setup();
    run(1, facts());
    run(30, facts({ menuOpen: true }));
    expect(engine.view()).toBeNull();
    const before = engine.clock;
    run(5, noFacts());
    expect(engine.clock).toBe(before);
  });

  it('hides a hint whose trigger is gone (the food was dropped) and lets it come back later', () => {
    const { engine, run } = setup();
    run(3);
    expect(engine.view()?.id).toBe('hint-trail');
    const none = facts({ possessed: { isQueen: false, underground: false, carryingFood: false, trailOn: false, colonyOrders: false } });
    run(2, none);
    expect(engine.view()).toBeNull();
    run(25, facts());
    expect(engine.view()?.id).toBe('hint-trail');
  });
});

describe('the engine: idle fade and return', () => {
  it(`fades to compact after ${HINT_IDLE_REAL_S} s, returns to full after ${HINT_RETURN_REAL_S} s more, once`, () => {
    const { engine, run } = setup();
    run(3);
    expect(engine.view()?.compact).toBe(false);
    run(HINT_IDLE_REAL_S);
    expect(engine.view()?.compact).toBe(true);
    run(HINT_RETURN_REAL_S - 5);
    expect(engine.view()?.compact).toBe(true);
    run(10);
    expect(engine.view()?.compact).toBe(false);
    run(HINT_IDLE_REAL_S + 5);
    expect(engine.view()?.compact).toBe(true); // fades again; it does not return a second time
    run(HINT_RETURN_REAL_S - 80);
    expect(engine.view()?.compact).toBe(true);
    run(60); // on screen for more than HINT_EXPIRY_REAL_S in all: it retires and stays quiet for a long while
    expect(engine.view()).toBeNull();
    expect(engine.log.some((l) => l.event === 'retired' && l.id === 'hint-trail')).toBe(true);
  });
});

describe('the engine: hints drawn by other presenters are tracked, not drawn', () => {
  it('marks an opening hint shown once while the overlay draws it, learns it by action, draws nothing itself', () => {
    const { engine, run } = setup();
    const opening = facts({ foundingInProgress: true, openingPhase: 'search', view: 'possess', possessed: { isQueen: true, underground: false, carryingFood: false, trailOn: false, colonyOrders: false }, externalShown: ['hint-move'] });
    run(5, opening);
    expect(engine.state('hint-move')).toBe('shown');
    expect(engine.log.filter((l) => l.id === 'hint-move' && l.event === 'shown')).toEqual([{ at: expect.any(Number), event: 'shown', id: 'hint-move', presenter: 'founding' }]);
    expect(engine.view()).toBeNull();
    run(3.5, { ...opening, moving: true });
    expect(engine.state('hint-move')).toBe('learned');
  });

  it('learns a gauge hint (reserves) by being seen for a few seconds', () => {
    const { engine, run } = setup();
    const f = facts({ foundingInProgress: true, openingPhase: 'search', externalShown: ['hint-reserves'] });
    run(4, f);
    expect(engine.state('hint-reserves')).toBe('shown');
    run(6, f);
    expect(engine.state('hint-reserves')).toBe('learned');
  });

  it('draws hint-look during the opening (no overlay draws it), after move, and learns it by two drags', () => {
    const { engine, run } = setup();
    engine.learn('hint-move');
    const f = facts({ foundingInProgress: true, openingPhase: 'search', possessed: { isQueen: true, underground: false, carryingFood: false, trailOn: false, colonyOrders: false } });
    run(3, f);
    expect(engine.view()?.id).toBe('hint-look');
    engine.use('look');
    engine.use('look');
    expect(engine.state('hint-look')).toBe('learned');
    expect(engine.view()).toBeNull();
  });

  it('falls back to drawing hint-cycle itself when the opening overlay does not show it', () => {
    const { engine, run } = setup([]);
    run(3, facts({ possessed: { isQueen: true, underground: false, carryingFood: false, trailOn: false, colonyOrders: false } }));
    expect(engine.view()?.id).toBe('hint-cycle');
    expect(engine.view()?.action).toBe('possess-next');
  });
});

describe('event rules', () => {
  const ctx = { possessedId: 7, colonyId: 0 };
  it('counts Tab cycles, releases, trails, pick-ups of the possessed ant only', () => {
    const { engine } = setup();
    engine.onEvent({ type: 'possession-started', antId: 7, via: 'cycle' }, ctx);
    engine.onEvent({ type: 'possession-started', antId: 7, via: 'roster' }, ctx);
    expect(engine.uses()['cycle']).toBe(1);
    engine.onEvent({ type: 'trail-toggled', antId: 9, on: true }, ctx); // someone else's ant
    engine.onEvent({ type: 'trail-toggled', antId: 7, on: false }, ctx); // trail off is no use
    expect(engine.uses()['trail']).toBeUndefined();
    engine.onEvent({ type: 'trail-toggled', antId: 7, on: true }, ctx);
    expect(engine.uses()['trail']).toBe(1);
    engine.onEvent({ type: 'action-completed', antId: 7, action: 'pick-up' }, ctx);
    engine.onEvent({ type: 'action-completed', antId: 8, action: 'pick-up' }, ctx);
    expect(engine.uses()['pickup']).toBe(1);
  });

  it('counts sharing food only when the possessed ant gives (not ambient exchange between others)', () => {
    const { engine } = setup();
    engine.onEvent({ type: 'trophallaxis', donorId: 9, receiverId: 7, ambient: false }, ctx); // someone else gave
    engine.onEvent({ type: 'trophallaxis', donorId: 7, receiverId: 9, ambient: true }, ctx); // ambient, not the player's act
    expect(engine.uses()['share']).toBeUndefined();
    engine.onEvent({ type: 'trophallaxis', donorId: 7, receiverId: 9, ambient: false }, ctx);
    engine.onEvent({ type: 'trophallaxis', donorId: 7, receiverId: 9, ambient: false }, ctx);
    expect(engine.state('hint-share')).toBe('learned');
  });

  it('counts a refreshing site assessment once per reading, not twice a second', () => {
    const { engine, run } = setup();
    for (let i = 0; i < 6; i++) { engine.onEvent({ type: 'opening.site-assessed' }, ctx); run(0.5); }
    expect(engine.uses()['antennate']).toBe(1);
    run(5);
    engine.onEvent({ type: 'opening.site-assessed' }, ctx);
    expect(engine.uses()['antennate']).toBe(2);
    expect(engine.state('hint-antennate')).toBe('learned');
  });

  it('opens later hints from flags: the first delivery makes the colony-view hint available', () => {
    const { engine, run } = setup();
    const plain = facts({ possessed: { isQueen: false, underground: true, carryingFood: false, trailOn: false, colonyOrders: false } });
    run(5, plain);
    expect(shownIds(engine)).not.toContain('hint-colony-view');
    engine.onEvent({ type: 'delivery', colonyId: 0 }, ctx);
    run(3, plain);
    expect(engine.view()?.id).toBe('hint-colony-view');
  });
});

describe('persistence and reset', () => {
  it('a second engine on the same store does not show what the first learned; a reset brings it back', () => {
    const store = new MemoryHintStore();
    store.learn('hint-cycle'); store.learn('hint-observer');
    const a = new HintEngine({ store });
    for (let t = 0; t < 3; t += 0.25) a.update(facts(), 0.25);
    expect(a.view()?.id).toBe('hint-trail');
    a.use('trail', 2);
    const b = new HintEngine({ store });
    for (let t = 0; t < 10; t += 0.25) b.update(facts(), 0.25);
    expect(b.view()).toBeNull();
    store.reset();
    for (let t = 0; t < 3; t += 0.25) b.update(facts(), 0.25);
    expect(b.view()?.id).toBe('hint-cycle'); // everything is pending again, the first of the table comes first
  });
});
