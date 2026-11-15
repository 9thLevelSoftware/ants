// Stage 1B gate (int-1B-sim work item 6): the player in the loop, headless. A possessed worker harvests from a
// real source, walks home and delivers through the action primitives; directives and markers change allocation
// and, measurably, outcomes; with auto-expansion off the architect creates nothing.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { idleIntent } from '@/sim/types';
import { forageScenario, run } from '@/sim/ants/behaviours/outdoor/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { makeTestSim } from '@/sim/testing';

const workers = (sim: Sim): Ant[] => sim.state.ants.filter((a) => a.alive && a.caste === 'worker');

function stepUntil(sim: Sim, done: () => boolean, max: number): void {
  for (let i = 0; i < max && !done(); i++) sim.tick();
}

describe('player in the loop (gate 1B)', () => {
  it('a possessed worker harvests a real source, walks home by intent and unloads into the food chamber', () => {
    const { sim, col, entrance, sources } = forageScenario({
      workers: 4, stores: { c: 0, p: 0 }, sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 14, bearingDeg: 0, units: 60 }],
    });
    const bu = sim.world.bu, spill = sources[0], w = workers(sim)[0];
    sim.enqueue({ type: 'possess', antId: w.id });
    sim.enqueue({ type: 'cheat.teleport', antId: w.id, pos: { x: spill.pos.x - 2 * bu, y: spill.pos.y + bu, z: spill.pos.z } });
    sim.tick(); sim.tick();
    sim.enqueue({ type: 'action', actionId: 'harvest-liquid', target: { kind: 'source', id: spill.id, pos: { ...spill.pos } }, phase: 'start' });
    sim.tick();
    stepUntil(sim, () => w.cropC > 0.3 && w.action === null, 1200);
    expect(w.cropC).toBeGreaterThan(0.3);
    const crop = w.cropC;
    // walk home: the player holds a direction toward the entrance (camera-relative input already resolved)
    stepUntil(sim, () => {
      const dx = entrance.pos.x - w.pos.x, dz = entrance.pos.z - w.pos.z, l = Math.hypot(dx, dz);
      sim.setPlayerIntent({ ...idleIntent(), dir: { x: dx / l, y: 0, z: dz / l } });
      return l < 2 * bu;
    }, 3000);
    sim.setPlayerIntent(idleIntent());
    expect(Math.hypot(entrance.pos.x - w.pos.x, entrance.pos.z - w.pos.z)).toBeLessThan(2 * bu);
    // down the shaft into a chamber the colony stores food in (teleport: steering a tunnel by intent is the app's)
    const nest = sim.stores.nests.get(col.nestIds[0])!;
    const ch = nest.chambers.find((c) => c.type === 'food') ?? nest.chambers[0];
    sim.enqueue({ type: 'cheat.teleport', antId: w.id, pos: { x: ch.center.x, y: ch.center.y - ch.radii.y + bu, z: ch.center.z } });
    stepUntil(sim, () => w.nestId >= 0, 20);
    const c0 = col.stores.c;
    const refused: string[] = [];
    sim.events.on('action-failed', (e) => { if (e.antId === w.id) refused.push(`${e.action}:${e.reason}`); });
    sim.enqueue({ type: 'action', actionId: 'unload-crop', phase: 'start' });
    sim.tick();
    stepUntil(sim, () => w.action === null, 2000);
    expect(refused, `nest ${w.nestId} chamber ${w.chamberId} crop ${w.cropC}`).toEqual([]);
    expect(col.stores.c - c0).toBeGreaterThan(0.5 * (crop - 0.05));
  }, 60000);

  it('directives: a forage-heavy allocation sends out more foragers and brings home more than a nurse-heavy one', () => {
    const outcome = (shares: { forage: number; nurse: number; dig: number; defend: number }) => {
      const { sim, col, sources } = forageScenario({
        seed: 3, workers: 30, stores: { c: 1, p: 0.3 }, pinned: true, holdStores: { c: 1, p: 0.3 },
        sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 60, bearingDeg: 30, units: 300 }],
      });
      sim.enqueue({ type: 'setDirectives', colonyId: col.id, allocation: shares });
      const s = sources[0];
      s.discoveredBy |= 1;
      let departed = 0, delivered = 0;
      sim.events.on('forager-departed', () => departed++);
      sim.events.on('delivery', (e) => { if (e.colonyId === col.id) delivered++; });
      run(sim, TICKS_PER_DAY / 6);
      return { departed, delivered };
    };
    const many = outcome({ forage: 70, nurse: 10, dig: 10, defend: 10 });
    const few = outcome({ forage: 5, nurse: 75, dig: 10, defend: 10 });
    expect(many.departed).toBeGreaterThan(few.departed);
    expect(many.delivered).toBeGreaterThanOrEqual(few.delivered);
  }, 120000);

  it('directives: stayIn holds every departure', () => {
    const { sim, col } = forageScenario({ workers: 20, stores: { c: 1, p: 0.3 }, sources: [{ kind: 'sugar', variant: 'sugary-spill', distBu: 50, bearingDeg: 0, units: 200 }] });
    sim.enqueue({ type: 'setDirectives', colonyId: col.id, stayIn: true });
    sim.tick();
    let departed = 0;
    sim.events.on('forager-departed', () => departed++);
    run(sim, 1500);
    expect(departed).toBe(0);
  }, 60000);

  it('with auto-expansion off the architect creates no plan; on, it does', () => {
    const plans = (mode: 'off' | 'auto') => {
      const sim = makeTestSim({ nest: 'small', workers: 40 });
      const col = sim.state.colonies[0];
      sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 20, p: 10, toxin: 0 });
      sim.enqueue({ type: 'setAutoExpand', nestId: col.nestIds[0], mode });
      let n = 0;
      sim.events.on('plan-created', () => n++);
      sim.events.on('architect-proposal', () => n++);
      run(sim, 3000);
      const nest = sim.stores.nests.get(col.nestIds[0])!;
      return n + nest.digPlans.filter((p) => p.source === 'architect').length;
    };
    expect(plans('off')).toBe(0);
    expect(plans('auto')).toBeGreaterThan(0);
  }, 120000);
});
