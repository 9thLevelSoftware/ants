// Reviewer tests for the human-event warning card (quiet-time review): who counts as "in the path", how much warning
// the card gives before the impact, that it leaves once the ants are out of the path, and that an old-style card
// (keyed by instance id, from a save made before this change) leaves at once.

import { describe, expect, it } from 'vitest';
import { HUMAN_ALERT_IDLE_S, HUMAN_ALERT_LOOKAHEAD_S, HUMAN_ALERT_EVERY } from '@/sim/balance/human';
import { raiseAlert } from '@/sim/progression/alerts';
import { TICKS_PER_SECOND } from '@/sim/time';
import type { DifficultyId, Sim } from '@/sim/types';
import { humanPlan } from './plans';
import { humanSites } from './sites';
import { humanSim, patioWorld, placeWorker, scheduleNow } from './testkit';

const KIND = 'human-event-warning';
const card = (sim: Sim) => sim.state.progression.alerts.find((a) => a.kind === KIND);

function patioPass(preset: DifficultyId = 'naturalist') {
  const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 6000 }), preset);
  const lane = humanSites(sim.world).list.find((s) => s.kind === 'patio-lane')!;
  const inst = scheduleNow(sim, 'footsteps', 'adult', lane.id, null);
  const plan = humanPlan(sim, inst)!;
  const mid = plan.impacts[Math.floor(plan.impacts.length / 2)];
  return { sim, inst, plan, mid };
}

/** Ticks until the card is up (or max); returns the tick, -1 if never. */
function untilCard(sim: Sim, max = 3000): number {
  for (let i = 0; i < max; i++) { sim.tick(); if (card(sim)) return sim.state.tick; }
  return -1;
}

describe('human card: who is in the path', () => {
  it('an ant of another colony in the path raises no card', () => {
    const { sim, mid } = patioPass();
    const id = placeWorker(sim, mid.fp.x, mid.fp.z);
    sim.stores.ants.get(id)!.colony = 777;
    expect(untilCard(sim, 2500)).toBe(-1);
  });

  it('a player ant inside the nest (nestId >= 0) right under the path raises no card', () => {
    const { sim, mid } = patioPass();
    const id = placeWorker(sim, mid.fp.x, mid.fp.z);
    sim.stores.ants.get(id)!.nestId = 1;
    expect(untilCard(sim, 2500)).toBe(-1);
  });
});

describe('human card: lead and clearing', () => {
  for (const preset of ['naturalist', 'gentle'] as const) {
    it(`${preset}: the card is up well before the impact that reaches the ant (most of the look-ahead)`, () => {
      const { sim, inst, mid } = patioPass(preset);
      placeWorker(sim, mid.fp.x, mid.fp.z);
      // the first impact near the ant: the card must come before it, by most of the look-ahead
      const t0 = untilCard(sim);
      expect(t0).toBeGreaterThan(0);
      const plan = humanPlan(sim, inst)!;
      const ant = sim.stores.ants.list.find((a) => a.caste === 'worker')!;
      const reach = plan.impacts.find((imp) => imp.contact !== 'none' && Math.hypot(imp.fp.x - ant.pos.x, imp.fp.z - ant.pos.z) < Math.max(imp.fp.hx, imp.fp.hz) + 60);
      expect(reach).toBeDefined();
      const leadS = (inst.startTick + reach!.t - t0) / TICKS_PER_SECOND;
      const mult = preset === 'gentle' ? 1.5 : 1;
      expect(leadS).toBeGreaterThan(HUMAN_ALERT_LOOKAHEAD_S * mult - (HUMAN_ALERT_EVERY + 2) / TICKS_PER_SECOND);
    });
  }

  it('the ant leaves the path: the card goes about HUMAN_ALERT_IDLE_S later', () => {
    const { sim, mid } = patioPass();
    const id = placeWorker(sim, mid.fp.x, mid.fp.z);
    const t0 = untilCard(sim);
    expect(t0).toBeGreaterThan(0);
    const a = sim.stores.ants.get(id)!;
    a.pos = { x: a.pos.x + 2500, y: a.pos.y, z: a.pos.z + 2500 };
    sim.index.refresh();
    let gone = -1;
    for (let i = 0; i < 4 * TICKS_PER_SECOND; i++) { sim.tick(); if (!card(sim)) { gone = sim.state.tick; break; } }
    expect(gone).toBeGreaterThan(0);
    expect(gone - t0).toBeLessThanOrEqual(HUMAN_ALERT_IDLE_S * TICKS_PER_SECOND + 2 * HUMAN_ALERT_EVERY + 2);
  });
});

describe('human card: old saves', () => {
  it('an old-style card (subject = instance id, raised long ago) leaves on the next tick', () => {
    const { sim } = patioPass();
    for (let i = 0; i < 10; i++) sim.tick();
    raiseAlert(sim, { kind: KIND, level: 'warning', subjectId: 987654, title: '', cause: '', focus: null, diagnosticId: 'diag-human-pressure' });
    sim.state.progression.alerts.find((a) => a.subjectId === 987654)!.raisedTick -= 10 * TICKS_PER_SECOND;
    sim.tick();
    expect(sim.state.progression.alerts.some((a) => a.subjectId === 987654)).toBe(false);
  });
});
