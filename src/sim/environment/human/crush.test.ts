// AC3 (crush table honoured statistically) and GDD 04 App. E 11 / 17: soles and tyres kill per CRUSH_P on each
// surface class, ants in joints and cracks below the contact plane are safe, difficulty scales lethality.

import { describe, expect, it } from 'vitest';
import { rngFork, rngRange } from '@/core/rng';
import type { HumanEventRun, MaterialId, Sim } from '@/sim/types';
import { CRUSH_P, HUMAN_LETHAL_CAP, type CrushContact } from '@/sim/balance/human';
import { crushAnts } from './effects/ground';
import { contactPlane } from './effects/common';
import { inFootprint, type Footprint } from './plan';
import { humanExtra } from './extra';
import { humanSites } from './sites';
import { alive, humanSim, patioWorld, placeWorker, runToEnd, scheduleNow, setWorker } from './testkit';
import { humanPlan } from './plans';

const run = (): HumanEventRun => ({ instId: 1, progressS: 0, nextImpactTick: 0, cues: [], killed: 0, displaced: 0, itemsRemoved: 0 });

/** Workers spread inside a footprint on its top surface; returns their ids. */
function fill(sim: Sim, fp: Footprint, n: number, seed: number, avoid?: (x: number) => boolean): number[] {
  const rng = rngFork(seed, 'fill'), ids: number[] = [];
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  while (ids.length < n) {
    const u = rngRange(rng, -fp.hx * 0.95, fp.hx * 0.95), v = rngRange(rng, -fp.hz * 0.95, fp.hz * 0.95);
    const x = fp.x + u * c - v * s, z = fp.z + u * s + v * c;
    if (avoid && avoid(x)) continue;
    const id = placeWorker(sim, x, z);
    if (id >= 0) ids.push(id);
  }
  sim.index.refresh();
  return ids;
}

describe('crush (AC3, GDD 04 §15.4)', () => {
  it('E11: an adult sole kills 75-95 of 100 workers on open concrete and none of 20 in the sand joints', () => {
    // slabs 200 mm with 12 mm sand joints, top 40 mm: the joint x in [212, 224]
    const sim = humanSim(patioWorld({ slabMm: 200, jointMm: 12, surface: 'sand' }));
    const fp: Footprint = { x: 218, y: 40, z: 112, yaw: 0, hx: 140, hz: 50, disc: false };
    const open = fill(sim, fp, 100, 1, (x) => x > 208 && x < 228);
    const joint: number[] = [];
    for (let i = 0; i < 20; i++) {
      joint.push(setWorker(sim, 218, 0, 70 + i * 4));
    }
    sim.index.refresh();
    for (const id of joint) expect(sim.stores.ants.get(id)!.pos.y).toBeLessThan(20);
    crushAnts(sim, run(), fp, contactPlane(sim, fp), 'adult-shoe');
    const dead = 100 - alive(sim, open);
    expect(dead).toBeGreaterThanOrEqual(75);
    expect(dead).toBeLessThanOrEqual(95);
    expect(alive(sim, joint)).toBe(20);
  });

  const cases: { name: string; surface: MaterialId; zone: 'pavement' | 'lawn' | 'forest'; col: 'hard' | 'soft' | 'sward' | 'litter'; slab?: boolean }[] = [
    { name: 'hard', surface: 'concrete', zone: 'pavement', col: 'hard' },
    { name: 'bare soft', surface: 'loam', zone: 'pavement', col: 'soft' },
    { name: 'sward', surface: 'loam', zone: 'lawn', col: 'sward' },
    { name: 'litter', surface: 'leaf', zone: 'forest', col: 'litter' },
  ];
  it.each(cases)('honours CRUSH_P on $name ground for every contact (binomial, 4 sigma)', ({ surface, zone, col }) => {
    for (const contact of ['adult-shoe', 'child-shoe', 'paw', 'tyre', 'mower-wheel'] as CrushContact[]) {
      const sim = humanSim(patioWorld({ surface, zone, variant: zone === 'lawn' ? 'mown' : zone === 'pavement' ? 'patio' : null }));
      if (zone === 'lawn') sim.state.worldDelta.grassHeightMm.fill(50);
      const n = 160, fp: Footprint = { x: 2000, y: 0, z: 2000, yaw: 0.3, hx: 300, hz: 200, disc: false };
      const ids = fill(sim, fp, n, contact.length);
      crushAnts(sim, run(), fp, contactPlane(sim, fp), contact);
      const p = CRUSH_P[contact][col], dead = n - alive(sim, ids);
      const sd = Math.sqrt(n * p * (1 - p));
      expect(Math.abs(dead - n * p), `${contact} on ${col}: ${dead}/${n}`).toBeLessThanOrEqual(4 * sd + 1);
    }
  });

  it('scales with the difficulty lethality (gentle x0.4, harsh x1.2 capped)', () => {
    for (const [preset, mult] of [['gentle', 0.4], ['harsh', 1.2]] as const) {
      const sim = humanSim(patioWorld({ surface: 'concrete' }), preset);
      const n = 200, fp: Footprint = { x: 2000, y: 0, z: 2000, yaw: 0, hx: 300, hz: 200, disc: false };
      const ids = fill(sim, fp, n, 7);
      crushAnts(sim, run(), fp, contactPlane(sim, fp), 'adult-shoe');
      const p = Math.min(HUMAN_LETHAL_CAP, CRUSH_P['adult-shoe'].hard * mult), dead = n - alive(sim, ids);
      expect(Math.abs(dead - n * p), `${preset}: ${dead}`).toBeLessThanOrEqual(4 * Math.sqrt(n * p * (1 - p)) + 1);
    }
  });

  it('E17: a car arriving in an empty bay kills 17-20 of 20 workers on its tyre track, spares 5 in a crack, parks with 4 tyres', () => {
    // asphalt slabs 600 mm with 4 mm (1 BU) cracks, a car park zone of 16 x 8 m
    const sim = humanSim(patioWorld({ sizeMm: 16000, zone: 'asphalt', variant: 'car-park', surface: 'sand', slabMm: 1500, jointMm: 4, slabTopMm: 30, slabMaterial: 'asphalt' }));
    const site = humanSites(sim.world).list.find((s) => s.kind === 'car-park');
    expect(site && site.bays.length).toBeGreaterThan(0);
    const inst = scheduleNow(sim, 'car', 'arrive', site!.id, null);
    inst.param = 0;
    // the plan's tyre impacts: workers on the tracks, and in a crack crossing one of them
    sim.tick();
    const runState = sim.state.env.human.active.find((r) => r.instId === inst.id);
    expect(runState).toBeDefined();
    const plan = humanPlan(sim, inst)!;
    const tyres = plan.impacts.filter((i) => i.contact === 'tyre');
    const track: number[] = [], crack: number[] = [];
    const rng = rngFork(3, 'e17');
    while (track.length < 20) {
      const t = tyres[Math.floor(rngRange(rng, tyres.length * 0.2, tyres.length * 0.8))];
      const gx = t.fp.x, gz = t.fp.z;
      if (sim.field.height(gx, gz) < -1) continue;
      const id = placeWorker(sim, gx, gz);
      if (id < 0) continue;
      const a = sim.stores.ants.get(id)!;
      if (a.pos.y < 25) { sim.stores.ants.markDead(id); continue; } // fell into a crack: not on the track surface
      track.push(id);
    }
    // a crack: a joint line (x = 1504 k + 2) crossed by a tyre track in the middle of the trip
    const joint = (v: number) => Math.round((v - 2) / 1504) * 1504 + 2;
    const mid = tyres.slice(Math.floor(tyres.length * 0.3)).find((t) => inFootprint(t.fp, t.fp.x, joint(t.fp.z), -20))!;
    expect(mid).toBeDefined();
    for (let i = 0; i < 5; i++) crack.push(setWorker(sim, mid.fp.x + (i - 2) * 25, 0, joint(mid.fp.z)));
    expect(crack.length).toBe(5);
    for (const id of crack) {
      const a = sim.stores.ants.get(id)!;
      expect(a.pos.y).toBeLessThan(15);
      // the crack lies under the track: some tyre impact covers each crack worker
      expect(tyres.some((t) => inFootprint(t.fp, a.pos.x, a.pos.z))).toBe(true);
    }
    runToEnd(sim, inst, 1000);
    const dead = 20 - alive(sim, track);
    expect(dead).toBeGreaterThanOrEqual(17);
    expect(alive(sim, crack)).toBe(5);
    const parked = humanExtra(sim).parked;
    expect(parked.length).toBe(1);
    const tyrePrims = parked[0].primIds.map((id) => sim.state.worldDelta.dynPrims.find((p) => p.id === id)).filter((p) => p?.material === 'rubber');
    expect(tyrePrims.length).toBe(4);
  });
});
