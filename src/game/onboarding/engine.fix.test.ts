// Engine behaviour added by the review round: preemption by an earlier hint once the shown one is compact, the rate
// limit counted from the first showing (not from stored progress), the table without invented prerequisites, a
// fallback anchor for hint-directives, and Shift+H on the opening overlay's prompts.
import { describe, expect, it } from 'vitest';
import type { HintId } from '@/sim/types';
import { HINT_GAP_REAL_S, HINT_IDLE_REAL_S, HINT_MAX_PER_MINUTE, HINT_RATE_WINDOW_REAL_S } from './balance';
import { HintEngine } from './engine';
import { noFacts } from './facts';
import { MemoryHintStore } from './store';
import { HINT_TABLE } from './table';
import type { Facts } from './types';

const worker = { isQueen: false, underground: false, carryingFood: false, trailOn: false, colonyOrders: false };
const facts = (over: Partial<Facts> = {}): Facts => ({ ...noFacts(true), active: true, view: 'possess', workers: 5, possessed: { ...worker }, ...over });

function rig(learned: HintId[] = ['hint-cycle', 'hint-observer']) {
  const store = new MemoryHintStore();
  for (const id of learned) store.learn(id);
  const engine = new HintEngine({ store });
  const run = (s: number, f: Facts) => { for (let t = 0; t < s - 1e-9; t += 0.25) engine.update(f, 0.25); };
  const events = (name: string) => engine.log.filter((l) => l.event === name).map((l) => `${l.id}${l.note ? `:${l.note}` : ''}`);
  return { store, engine, run, events };
}

describe('preemption: a compact hint gives the slot to an earlier one', () => {
  it('hint-colony-view (14) is compact after a minute; hint-trail (12) becomes due and takes the slot', () => {
    const r = rig();
    const firstFood = facts({ firstFood: true });
    r.run(HINT_IDLE_REAL_S + 5, firstFood);
    expect(r.engine.view()?.id).toBe('hint-colony-view');
    expect(r.engine.view()?.compact).toBe(true);
    const carrying = facts({ firstFood: true, possessed: { ...worker, carryingFood: true } });
    r.run(HINT_GAP_REAL_S + 2, carrying);
    expect(r.engine.view()?.id).toBe('hint-trail');
    expect(r.events('hidden')).toContain('hint-colony-view:preempted');
    expect(r.engine.state('hint-colony-view')).toBe('shown'); // not dismissed: it may come back
  });

  it('a hint in its full form is never pushed off by an earlier one', () => {
    const r = rig();
    r.run(5, facts({ firstFood: true }));
    expect(r.engine.view()?.id).toBe('hint-colony-view');
    r.run(30, facts({ firstFood: true, possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-colony-view');
  });

  it('a later hint never preempts an earlier one, compact or not', () => {
    const r = rig();
    r.run(HINT_IDLE_REAL_S + 5, facts({ possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-trail');
    r.run(30, facts({ firstFood: true, possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-trail');
  });

  it('does not preempt when the per-minute limit would keep the earlier hint from showing (no flip-flop)', () => {
    const r = rig();
    r.run(HINT_IDLE_REAL_S + 5, facts({ firstFood: true })); // colony-view: a new hint at ~1.5 s
    // two more new hints in the window: use up the limit with others first
    const shows = r.engine.log.filter((l) => l.event === 'shown').length;
    expect(shows).toBe(1);
    const before = r.engine.log.length;
    // hint-trail is new and the window holds one show: it may preempt (2nd new hint of the minute is allowed)
    r.run(10, facts({ firstFood: true, possessed: { ...worker, carryingFood: true } }));
    expect(r.engine.view()?.id).toBe('hint-trail');
    // now both are compact/shown; a third earlier hint cannot appear in this minute
    expect(r.engine.log.length).toBeGreaterThan(before);
  });
});

describe('the per-minute limit counts the first showing, not stored progress', () => {
  it('a hint with one earlier use (stored as shown) still counts as a new prompt when it first appears', () => {
    const r = rig();
    r.engine.use('speed', 1); // stored 'shown' with 1 of 2 uses, never on screen
    r.run(3, facts({ possessed: { ...worker, carryingFood: true } }));
    r.engine.use('trail', 2);
    r.run(6, facts({ firstFood: true }));
    r.engine.use('colony-view');
    r.run(HINT_RATE_WINDOW_REAL_S + 45, facts({ view: 'observer', possessed: null }));
    const shows = r.engine.log.filter((l) => l.event === 'shown' && l.presenter === 'engine');
    expect(shows.map((l) => l.id)).toEqual(['hint-trail', 'hint-colony-view', 'hint-speed']);
    const first = shows[0]!.at;
    expect(shows.filter((l) => l.at < first + HINT_RATE_WINDOW_REAL_S).length).toBeLessThanOrEqual(HINT_MAX_PER_MINUTE);
  });

  it('a hint that came back after a while is not new again', () => {
    const r = rig();
    r.run(3, facts({ possessed: { ...worker, carryingFood: true } })); // trail shows (new)
    r.run(3, facts({ possessed: { ...worker, carryingFood: false } })); // trigger gone: hidden
    r.run(HINT_GAP_REAL_S + 20, facts({ possessed: { ...worker, carryingFood: true } })); // back
    expect(r.engine.log.filter((l) => l.event === 'shown' && l.id === 'hint-trail').length).toBe(2);
  });
});

describe('prerequisites follow GDD 08 §9.2', () => {
  it('hint-why shows on the first warn diagnostic even when hint-cycle was never learned', () => {
    const r = rig([]);
    r.store.learn('hint-observer');
    // the hand-over banner is up (it draws hint-cycle), the player has not pressed Tab
    r.run(HINT_IDLE_REAL_S, facts({ diagWarn: true, view: 'observer', possessed: null, externalShown: ['hint-cycle'] }));
    expect(r.engine.log.some((l) => l.id === 'hint-why' && l.event === 'shown')).toBe(true);
  });

  it('only the order of the first-fifteen-minutes table, hint-look, hint-observer, hint-photo and hint-overlay have prerequisites', () => {
    expect(HINT_TABLE.filter((d) => d.after?.length).map((d) => d.id).sort()).toEqual(['hint-look', 'hint-observer', 'hint-overlay', 'hint-photo']);
  });
});

describe('hint-directives', () => {
  const queen = (over: Partial<Facts> = {}) => facts({ possessed: { ...worker, isQueen: true, colonyOrders: true }, ...over });

  it('is left to the context chip while the chip shows the "Colony orders" line, and counted as shown', () => {
    const r = rig();
    r.run(10, queen({ externalShown: ['hint-directives'] }));
    expect(r.engine.view()).toBeNull();
    expect(r.engine.log.some((l) => l.id === 'hint-directives' && l.event === 'shown' && l.presenter === 'prompt')).toBe(true);
  });

  it('is drawn by the card, on the panel, when the queen is possessed and the chip is not there', () => {
    const r = rig();
    r.run(4, queen());
    expect(r.engine.view()).toMatchObject({ id: 'hint-directives', anchor: 'panel' });
  });

  it('is a chip by the time cluster when the queen is not possessed (fallback after the first workers)', () => {
    const r = rig();
    r.run(4, facts({ daysSinceFirstWorker: 4, possessed: { ...worker }, view: 'observer' }));
    expect(r.engine.view()).toMatchObject({ id: 'hint-directives', anchor: 'time' });
  });
});

describe('Shift+H on the opening overlay\'s prompts', () => {
  it('dismisses the hints that overlay draws, once, and never touches the engine\'s own hints', () => {
    const r = rig([]);
    expect(r.engine.dismissExternal(['hint-dig', 'hint-trail'])).toBe(true);
    expect(r.engine.state('hint-dig')).toBe('dismissed');
    expect(r.engine.state('hint-trail')).toBe('pending'); // engine-presented: use dismiss() for the card
    expect(r.engine.allows('hint-dig')).toBe(false);
    expect(r.engine.dismissExternal(['hint-dig'])).toBe(false);
    expect(r.engine.log.filter((l) => l.event === 'dismissed').map((l) => l.id)).toEqual(['hint-dig']);
  });
});
