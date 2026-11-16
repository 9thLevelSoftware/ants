// AC4 and GDD 04 App. E 13 / 14: sweeping removes food and trails in its area, a food drop creates sources an ant
// can find, bait poisons through the colony's toxin store with its delay, mowing cuts the sward and the herbs above
// the cut (they regrow after 2 GD) and is cancelled on wet grass; footfalls on sand leave prints.

import { describe, expect, it } from 'vitest';
import { rngFork, rngRange } from '@/core/rng';
import { createSource, nearestSource, takeFromSource } from '@/sim/ecology';
import { recordDelivery } from '@/sim/colony/activation';
import { economySystem } from '@/sim/colony/colonySystems';
import { makeTestSim } from '@/sim/testing';
import { findNonPlain } from '@/sim/testing';
import { HUMAN_PHERO, MOW_CUT_MM, MOW_REGROW_GD } from '@/sim/balance/human';
import { TICKS_PER_DAY } from '@/sim/time';
import { humanEventsSystem } from './index';
import { humanPlan } from './plans';
import { inFootprint } from './plan';
import { humanSites } from './sites';
import { humanExtra } from './extra';
import { humanSim, patioWorld, placeWorker, runToEnd, scheduleNow } from './testkit';

describe('human effects (AC4, GDD 04 §15.4)', () => {
  it('sweeping removes the food and the trails in its area', () => {
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 3000 }));
    const patio = humanSites(sim.world).list.find((s) => s.kind === 'patio')!;
    const rng = rngFork(2, 'sweep');
    const crumbs: number[] = [];
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < 40; i++) {
      const p = { x: rngRange(rng, 300, 2700), y: 0, z: rngRange(rng, 300, 2700) };
      crumbs.push(createSource(sim, { variant: 'crumb-starch', pos: p, tier: 2 }).id);
      sim.phero.deposit(sim.state.colonies[0].id, 'trail', { ...p, y: 2 }, 5);
      pts.push(p);
    }
    const inst = scheduleNow(sim, 'sweeping', 'broom', patio.id, null);
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    const swept = (p: { x: number; z: number }) => plan.impacts.some((i) => inFootprint(i.fp, p.x, p.z));
    const before = pts.filter(swept).map((p) => sim.phero.sample(sim.state.colonies[0].id, 'trail', { ...p, y: 2 }));
    runToEnd(sim, inst);
    const inArea = crumbs.filter((_, i) => swept(pts[i]));
    expect(inArea.length).toBeGreaterThan(20);
    const gone = inArea.filter((id) => !sim.stores.sources.get(id)).length;
    expect(gone / inArea.length).toBeGreaterThanOrEqual(0.7);
    const after = pts.filter(swept).map((p) => sim.phero.sample(sim.state.colonies[0].id, 'trail', { ...p, y: 2 }));
    const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
    expect(sum(after)).toBeLessThanOrEqual(sum(before) * HUMAN_PHERO.broom.trail + 1e-6);
  });

  it('a food drop creates sources a nearby ant can find', () => {
    const sim = humanSim(patioWorld({ surface: 'concrete', sizeMm: 3000 }));
    const before = sim.state.sources.filter((s) => s.alive).length;
    const at = { x: 1500, y: 0, z: 1500 };
    const inst = scheduleNow(sim, 'food-drop', 'crumb-fall', -1, at);
    runToEnd(sim, inst);
    const made = sim.state.sources.filter((s) => s.alive);
    expect(made.length).toBeGreaterThan(before);
    for (const s of made) expect(Math.hypot(s.pos.x - at.x, s.pos.z - at.z)).toBeLessThan(400);
    const id = placeWorker(sim, at.x + 200, at.z);
    expect(id).toBeGreaterThanOrEqual(0);
    sim.index.refresh();
    expect(nearestSource(sim, 0, sim.stores.ants.get(id)!.pos, 600)).toBeGreaterThanOrEqual(0);
  });

  it('bait poisons through the colony toxin store, with its delay', () => {
    const sim = makeTestSim({ nest: 'small', workers: 12, systems: [humanEventsSystem, economySystem] });
    const at = { x: sim.world.size * 0.8, y: 0, z: sim.world.size * 0.8 };
    const inst = scheduleNow(sim, 'bait-station', 'station', -1, at);
    runToEnd(sim, inst, 200);
    const bait = humanExtra(sim).baits[0];
    expect(bait).toBeDefined();
    expect(sim.state.worldDelta.dynPrims.some((p) => p.id === bait.primId)).toBe(true);
    const gel = sim.stores.sources.get(bait.sourceId)!;
    expect(gel.variant).toBe('bait-gel');
    const col = sim.state.colonies[0];
    const workers = sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
    // two foragers bring gel home: it enters the shared stores with its toxin
    let toxin = 0;
    for (const w of workers.slice(0, 2)) {
      const got = takeFromSource(sim, w, gel.id, 20, { checkReach: false });
      toxin += recordDelivery(sim, w, gel.id, 'bait', got.c, got.p, got.toxin).toxin;
    }
    expect(toxin).toBeGreaterThan(0);
    expect(col.stores.toxin).toBeGreaterThan(0);
    const hp0 = workers.map((a) => a.hp);
    for (let i = 0; i < 20; i++) sim.tick();
    // no instant effect: the dose acts over 0.5 GD
    const early = workers.reduce((s, a, i) => s + (hp0[i] - a.hp), 0);
    for (let i = 0; i < TICKS_PER_DAY / 2; i++) sim.tick();
    const late = workers.reduce((s, a, i) => s + (hp0[i] - (a.alive ? a.hp : 0)), 0);
    expect(late).toBeGreaterThan(early * 5 + 1e-6);
    expect(late).toBeGreaterThan(0);
  });

  it('E13: mowing on doy 10 is cancelled when rain ended 0.1 GD ago; no grass changes', () => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 3000 }));
    sim.tick();
    const grass = sim.state.worldDelta.grassHeightMm.slice();
    sim.state.env.weather.state = 'clear';
    sim.state.env.weather.history.lastRainEndTick = sim.state.tick - Math.round(0.1 * TICKS_PER_DAY);
    const lawn = humanSites(sim.world).list.find((s) => s.kind === 'lawn-mown')!;
    let cancelled = 0;
    sim.events.on('human.cancelled', (e) => { if (e.kind === 'mowing') cancelled++; });
    const inst = scheduleNow(sim, 'mowing', 'motor', lawn.id, null);
    runToEnd(sim, inst, 50);
    expect(inst.cancelled).toBe(true);
    expect(cancelled).toBe(1);
    expect(Array.from(sim.state.worldDelta.grassHeightMm)).toEqual(Array.from(grass));
  });

  it('E14: the deck cuts the sward to 35 mm and a nectar anchor at 120 mm; both regrow after 2 GD', () => {
    const sim = humanSim(patioWorld({ zone: 'lawn', variant: 'mown', surface: 'loam', sizeMm: 2000 }));
    sim.tick();
    const g = sim.state.worldDelta.grassHeightMm;
    for (let i = 0; i < g.length; i++) g[i] = 90;
    const lawn = humanSites(sim.world).list.find((s) => s.kind === 'lawn-mown')!;
    const inst = scheduleNow(sim, 'mowing', 'motor', lawn.id, null);
    sim.tick();
    const plan = humanPlan(sim, inst)!;
    // a flower head at 120 mm in the middle of the third stripe
    const mid = plan.impacts[Math.floor(plan.impacts.length / 3)].fp;
    const flower = createSource(sim, { variant: 'flower', pos: { x: mid.x, y: 120, z: mid.z }, tier: 2 });
    runToEnd(sim, inst, 4000);
    const nav = sim.world.nav.cls;
    const cell = Math.floor(mid.z / nav.cell) * nav.nx + Math.floor(mid.x / nav.cell);
    expect(g[cell]).toBe(MOW_CUT_MM);
    expect(sim.stores.sources.get(flower.id)).toBeUndefined();
    for (let i = 0; i < Math.round(MOW_REGROW_GD * TICKS_PER_DAY) + 200; i++) sim.tick();
    const back = sim.state.sources.find((s) => s.alive && s.variant === 'flower' && Math.hypot(s.pos.x - mid.x, s.pos.z - mid.z) < 1);
    expect(back).toBeDefined();
    expect(g[cell]).toBeGreaterThan(MOW_CUT_MM); // the sward grew back over the two days
  });

  it('footfalls on bare sand leave prints the field follows, and the human state stays plain data', () => {
    const sim = humanSim(patioWorld({ zone: 'sand', variant: 'sand-pit', surface: 'sand', sizeMm: 3000 }));
    const h0 = sim.field.height(1500, 1500);
    const inst = scheduleNow(sim, 'footsteps', 'adult', -1, { x: 1500, y: 0, z: 1500 });
    runToEnd(sim, inst);
    expect(sim.state.worldDelta.heightDeltas.length).toBeGreaterThan(0);
    // somewhere along the pass the ground went down
    let lowest = 0;
    for (let x = 300; x < 2700; x += 20) for (let z = 300; z < 2700; z += 20) lowest = Math.min(lowest, sim.field.height(x, z) - h0);
    expect(lowest).toBeLessThan(-2);
    expect(findNonPlain(sim.state.env.human)).toEqual([]);
  });
});
