// The harvester's daily rhythm in the small test nest (task AC3; GDD 07 §5.3.7): foragers do not leave while every
// trail cell is past the shade-seeking temperature (a hot midday), leave again when it cools, and each active
// window opens only after the patrollers have come back.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { setClimateOverride } from '@/sim/colony/envAdapter';
import { calendarTick, hourOf, TICKS_PER_HOUR } from '@/sim/time';
import { addAnts, messorKit } from './testkit';
import { gateOf, setTrailTempOverride } from './rhythm';

/** Hour of day now. */
const hour = (sim: Sim) => hourOf(calendarTick(sim.state));

describe('heat rhythm and patrol gate (AC3)', () => {
  it('no forager leaves in the hot midday or before the patrol is back; foraging resumes when it cools', () => {
    const k = messorKit({ tempC: 24 });
    const sim = k.sim;
    const col = sim.state.colonies[0];
    col.stores.c = 4;
    col.stores.p = 1;
    setClimateOverride(sim, { chamberTemp: () => 24, rh: () => 0.3, pointTemp: () => 24, surfaceActivity: () => 1 });
    // hot from 11:00 to 15:00: every trail sample at 44 °C (E20: heat stress 1)
    const hot = () => { const h = hour(sim); return h >= 11 && h < 15; };
    setTrailTempOverride(sim, () => (hot() ? 44 : 26));
    // start at 06:00
    while (Math.abs(hour(sim) - 6) > 0.05) sim.state.env.calendar.startTick += TICKS_PER_HOUR / 10;
    addAnts(k, 'media', 18, k.nest.chambers[1], 'idle');

    const inside = new Map<number, boolean>();
    for (const a of sim.state.ants) inside.set(a.id, a.nestId >= 0);
    const leftHot: number[] = [], leftMorning: number[] = [], leftAfter: number[] = [], leftBeforeGate: number[] = [];
    let gateOpenedAt = -1, patrolOut = 0;
    for (let t = 0; t < 12 * TICKS_PER_HOUR; t++) {
      sim.tick();
      const gate = gateOf(col);
      if (gate.open && gateOpenedAt < 0) gateOpenedAt = sim.state.tick;
      for (const a of sim.stores.ants.list) {
        const was = inside.get(a.id) ?? true;
        const now = a.nestId >= 0;
        inside.set(a.id, now);
        if (!was || now || a.colony !== col.id || a.caste === 'queen') continue;
        if (a.task === 'patrol' && gateOpenedAt < 0) patrolOut++;
        if (a.task !== 'forage' && a.task !== 'scout') continue; // patrollers, diggers to the mound, haulers
        if (hot()) leftHot.push(a.id);
        else if (hour(sim) >= 15) leftAfter.push(a.id);
        else leftMorning.push(a.id);
        if (gateOpenedAt < 0) leftBeforeGate.push(a.id);
      }
    }
    expect(gateOpenedAt).toBeGreaterThan(100); // the patrol took its time
    expect(patrolOut).toBeGreaterThanOrEqual(1);
    expect(leftBeforeGate).toEqual([]);
    expect(leftHot).toEqual([]);
    expect(leftMorning.length).toBeGreaterThan(0);
    expect(leftAfter.length).toBeGreaterThan(0);
  }, 60_000);
});
