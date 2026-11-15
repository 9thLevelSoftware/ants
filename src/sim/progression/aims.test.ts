// Journal aims (GDD 06 §5.13): opened by colony facts, at most three at a time oldest first with the rest waiting,
// completed by their milestone, never opened when the milestone already fired; `aim-alates` out of season.

import { describe, expect, it } from 'vitest';
import { calendarTickAt } from '@/sim/time';
import { currentAims } from './index';
import { MILESTONE_FIXTURES, addWorkers } from './fixtures';
import { makeProgSim, pollOnce, recordEvents } from './testkit';

describe('aims', () => {
  it('opens at most three, oldest first; a completed aim frees a slot for the next waiting one', () => {
    const sim = makeProgSim({ workers: 4 });
    const ev = recordEvents(sim, ['aim.opened', 'aim.completed']);
    sim.state.player.opening!.phase = 'handover';
    addWorkers(sim, 30);
    pollOnce(sim);
    // hand-over aims first, then the worker-count aims; second-chamber never opens (the test nest has three)
    expect(currentAims(sim).map((a) => a.id)).toEqual(['aim-first-food', 'aim-midden', 'aim-second-entrance']);
    expect(sim.state.progression.aims.some((a) => a.id === 'aim-second-chamber')).toBe(false);
    MILESTONE_FIXTURES['ms-first-food'](sim);
    pollOnce(sim);
    expect(sim.state.progression.aims.find((a) => a.id === 'aim-first-food')!.state).toBe('done');
    // ms-first-food also makes aim-first-protein and aim-first-trail eligible: the first waiting one takes the slot
    expect(currentAims(sim).map((a) => a.id)).toEqual(['aim-midden', 'aim-second-entrance', 'aim-first-protein']);
    expect(sim.state.progression.engine!.aimQueue).toEqual(['aim-first-trail']);
    expect(ev.filter((e) => e.type === 'aim.completed')).toHaveLength(1);
    const journal = sim.state.progression.journal.entries.filter((e) => e.kind === 'aim');
    expect(journal.find((e) => e.key === 'aim-first-food' && e.refs[0] === 'ms-first-food')).toBeDefined();
  });

  it('an aim whose milestone already fired is never opened', () => {
    const sim = makeProgSim({ workers: 4 });
    MILESTONE_FIXTURES['ms-first-midden'](sim);
    pollOnce(sim);
    addWorkers(sim, 20);
    pollOnce(sim);
    expect(sim.state.progression.aims.some((a) => a.id === 'aim-midden')).toBe(false);
  });

  it('aim-alates carries the out-of-season hint outside the lay window', () => {
    const sim = makeProgSim();
    sim.state.progression.aims.push({ id: 'aim-alates', state: 'open', openedTick: 0, doneTick: -1 });
    const [from] = sim.species.reproduction.alateLayWindow;
    sim.state.env.calendar.startTick = calendarTickAt('spring', from, 12, sim.state.config) - sim.state.tick;
    expect(currentAims(sim).find((a) => a.id === 'aim-alates')!.hint).toBeNull();
    sim.state.env.calendar.startTick = calendarTickAt('autumn', 3, 12, sim.state.config) - sim.state.tick;
    expect(currentAims(sim).find((a) => a.id === 'aim-alates')!.hint).toBe('out-of-season');
  });
});
