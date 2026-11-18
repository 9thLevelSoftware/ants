// app-seams-2 review: the Focus line in Auto against the sim's own aims (GDD 08 3.4: "During the first 2 game days of a
// new colony, then only when a new aim opens (shown 30 real s)"). Up to AIMS_SHOWN_MAX aims are open at once, oldest
// first, and the line shows the oldest; a NEW aim usually opens behind an older one that stays open.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { TICKS_PER_DAY } from '@/sim/time';
import type { AimId, Sim } from '@/sim/types';
import { focusAimOf } from '@/game/uiBridge/hudSlices';
import { FOCUS_LINE_REAL_S, FocusLineClock } from './focusLine';

function simPastNewColony(): Sim {
  const sim = makeTestSim({ nest: 'small', workers: 2 });
  sim.state.tick = 3 * TICKS_PER_DAY; // past the first 2 game days
  sim.state.progression.aims.length = 0;
  return sim;
}

const open = (sim: Sim, id: AimId): void => {
  sim.state.progression.aims.push({ id, state: 'open', openedTick: sim.state.tick, doneTick: -1 });
};

describe('Focus line, Auto, fed from the sim (review)', () => {
  it('the colony counts as new only in its first 2 game days', () => {
    const sim = simPastNewColony();
    open(sim, 'aim-first-food');
    expect(focusAimOf(sim)?.newColony).toBe(false);
    sim.state.tick = 2 * TICKS_PER_DAY - 1;
    expect(focusAimOf(sim)?.newColony).toBe(true);
  });

  it('the top aim closing brings the next one up: shown for 30 s', () => {
    const sim = simPastNewColony();
    const clock = new FocusLineClock();
    open(sim, 'aim-first-food');
    sim.state.tick += 10;
    open(sim, 'aim-second-chamber');
    clock.note(focusAimOf(sim), 0);
    sim.state.progression.aims[0].state = 'done';
    clock.note(focusAimOf(sim), 1000);
    expect(focusAimOf(sim)?.id).toBe('aim-second-chamber');
    expect(clock.visible('auto', focusAimOf(sim), 2000)).toBe(true);
    expect(clock.visible('auto', focusAimOf(sim), 1000 + FOCUS_LINE_REAL_S * 1000 + 1)).toBe(false);
  });

  // FAILS on the reviewed tree: the clock only watches the top (oldest) aim's id, so an aim that opens behind an older
  // open one never shows the line. In play the oldest aim (e.g. "Where does the nearest sugar lie?") can stay open for
  // days while the midden / second entrance / cross-zone aims open behind it: in Auto the line then never appears.
  it('a NEW aim opening behind an older open aim shows the line for 30 s', () => {
    const sim = simPastNewColony();
    const clock = new FocusLineClock();
    open(sim, 'aim-first-food');
    clock.note(focusAimOf(sim), 0); // the HUD has been watching
    sim.state.tick += 100;
    open(sim, 'aim-midden'); // a new aim opens; the older one stays open
    clock.note(focusAimOf(sim), 5000);
    expect(clock.visible('auto', focusAimOf(sim), 6000)).toBe(true);
  });
});
