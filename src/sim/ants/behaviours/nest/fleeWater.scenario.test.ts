// nest-fix3 acceptance 2 and 4: fleeing water (GDD 03 §11.3) in the standard small test nest (food, nursery and royal
// chambers one below the other, one open entrance). The water is raised by the test (wall drainage off), so each
// scenario controls the level exactly; everything else is the real game: flood step, submersion, behaviours,
// locomotion.
//   (a) water rising through the royal chamber: the queen and the adults reach the dry upper levels, nurses carry the
//       brood up, nobody drowns while a dry place is reachable;
//   (b) the whole nest under water up to the throat: the ants leave through the entrance, and go back to work once
//       it has drained;
//   (c) a sealed nest filled to the brim (no dry place, no way out): deaths, by drowning (the rule does not cheat);
//   (d) the possessed ant is never moved: she gets the water alert instead;
//   save / restore during a flight: the restored game equals the uninterrupted one N ticks later.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { FLOOD_SUBMERGE_DEPTH_BU, FLOOD_STEP_TICKS } from '@/sim/balance/weather';
import { floodCheats } from '@/sim/nest/flood/cheats';
import { spillFor } from '@/sim/nest/flood/runtime';
import { floodedCount, spillVolume } from '@/sim/nest/flood/spill';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { fillSphere } from '@/sim/nest/carveOps';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { FW, isFleeingWater } from './fleeWater';
import { makeNestColony, run, type NestColony } from './testkit';

/** Water volume that fills the basin up to the given flooded share of one chamber (from the spill order). */
function waterForShare(sim: Sim, k: NestColony, chamberId: number, share: number): number {
  const cache = spillFor(sim, k.nest);
  const list = cache.chamberSamples.get(chamberId)!;
  const idx = list[Math.min(list.length - 1, Math.floor(share * list.length))];
  return cache.cumVol[idx + 1];
}

/** Water volume whose level stands at height y, mm. */
function waterUpTo(sim: Sim, k: NestColony, y: number): number {
  const cache = spillFor(sim, k.nest), v = sim.carve.voxel;
  let n = 0;
  while (n < cache.level.length && (cache.level[n] - 0.5) * v < y) n++;
  return cache.cumVol[n];
}

/** Raises (or lowers) the nest's water linearly to `target` over `seconds`, flood steps running as usual. */
function rampWater(sim: Sim, k: NestColony, target: number, seconds: number, watch?: () => void): void {
  const start = k.nest.flood.water, steps = Math.round(seconds), per = (target - start) / steps;
  for (let s = 0; s < steps; s++) {
    k.nest.flood.water = Math.max(0, start + per * (s + 1));
    run(sim, FLOOD_STEP_TICKS);
    watch?.();
  }
}

function colonyAnts(k: NestColony): Ant[] {
  return k.sim.stores.ants.list.filter((a) => a.alive && a.colony === k.queen.colony);
}

function feet(a: Ant): number {
  return a.pos.y - a.up.y * a.footOffset;
}

/** Water over the ant's feet now, BU (-Infinity when dry ground / off the basin). */
function depthBu(k: NestColony, a: Ant): number {
  const w = waterView(k.sim, k.nest);
  return w ? depthOver(k.sim, w, a.pos, feet(a)) / k.sim.world.bu : -Infinity;
}

function colony(workers = 12, brood = true): NestColony {
  const k = makeNestColony({
    workers, seed: 3, stores: { c: 100, p: 100 },
    brood: brood ? [
      { stage: 'egg', n: 3, chamber: 'royal' }, { stage: 'larva', n: 3, chamber: 'royal' }, { stage: 'pupa', n: 2, chamber: 'royal', progress: 0.1 },
    ] : [],
  });
  floodCheats(k.sim.state).drainScale = 0;
  floodCheats(k.sim.state).rainI = 0;
  run(k.sim, 50); // settle into tasks
  return k;
}

describe('fleeing water (nest-fix3 item 2)', () => {
  it('(a) water rising through the royal chamber: queen, adults and brood reach the dry levels above; nobody drowns', () => {
    const k = colony();
    const { sim } = k;
    const deaths: string[] = [], broodDeaths: string[] = [];
    sim.events.on('ant-died', (e) => deaths.push(e.cause));
    sim.events.on('brood-died', (e) => broodDeaths.push(`${e.stage}:${e.cause}`));
    let fled = 0, maxSub = 0;
    const full = waterForShare(sim, k, k.royal.id, 1);
    rampWater(sim, k, full, 400, () => {
      for (const a of colonyAnts(k)) {
        if (isFleeingWater(a)) fled++;
        maxSub = Math.max(maxSub, a.bb['wx.sub'] ?? 0);
      }
    });
    run(sim, 600); // a minute more at the top
    expect(k.royal.flooded).toBeGreaterThan(0.95);
    expect(fled).toBeGreaterThan(0);
    expect(deaths.filter((d) => d === 'drowning')).toEqual([]);
    expect(broodDeaths.filter((d) => d.endsWith('flooding'))).toEqual([]);
    expect(k.queen.alive).toBe(true);
    expect(k.queen.hp).toBe(k.queen.maxHp); // never in water long enough for the drowning clock to bite
    expect(maxSub).toBeLessThan(50);
    for (const a of colonyAnts(k)) expect(depthBu(k, a), `ant ${a.id} ${a.state}`).toBeLessThan(FLOOD_SUBMERGE_DEPTH_BU);
    // the brood is out of the water (carried up, or lying above the level)
    for (const b of sim.stores.brood.list.filter((x) => x.alive)) {
      const w = waterView(sim, k.nest)!;
      expect(depthOver(sim, w, b.pos, b.pos.y), `brood ${b.id} ${b.stage}`).toBeLessThan(0.25 * sim.world.bu);
    }
  }, 60_000);

  it('(b) the whole nest under water up to the throat: the ants leave through the entrance, and work again once it drained', () => {
    const k = colony(8, false);
    const { sim } = k;
    const deaths: string[] = [];
    sim.events.on('ant-died', (e) => deaths.push(e.cause));
    const cache = spillFor(sim, k.nest);
    // fill to just below the throat's top layer
    const top = cache.level[cache.level.length - 1];
    let n = cache.level.length - 1;
    while (n > 0 && cache.level[n - 1] >= top - 2) n--;
    rampWater(sim, k, cache.cumVol[n], 300);
    run(sim, 300);
    const out = colonyAnts(k).filter((a) => a.nestId < 0 || sim.field.substrate(a.pos) >= 0 || depthBu(k, a) === -Infinity);
    expect(out.length).toBeGreaterThanOrEqual(Math.ceil(colonyAnts(k).length * 0.6));
    expect(deaths.filter((d) => d === 'drowning')).toEqual([]);
    // drained: they resume their tasks (no ant fleeing a minute after the water has gone)
    k.nest.flood.water = 0;
    run(sim, 600);
    expect(colonyAnts(k).filter(isFleeingWater).map((a) => a.id)).toEqual([]);
    expect(colonyAnts(k).some((a) => a.nestId === k.nest.id && sim.field.substrate(a.pos) < 0)).toBe(true);
  }, 60_000);

  it('(c) a sealed nest filled to the brim: no dry place, no way out; the ants drown (cause drowning)', () => {
    const k = colony(6, false);
    const { sim } = k;
    const deaths: string[] = [];
    sim.events.on('ant-died', (e) => deaths.push(e.cause));
    // close the throat with soil (the entrance goes `sealed`), then fill the whole basin
    fillSphere(sim, { ...k.entrance.pos, y: k.entrance.pos.y - 1.5 * sim.world.bu }, 2.5 * sim.world.bu);
    run(sim, 100);
    expect(k.entrance.status).toBe('sealed');
    const cap = spillVolume(spillFor(sim, k.nest));
    expect(floodedCount(spillFor(sim, k.nest), cap)).toBeGreaterThan(0);
    rampWater(sim, k, cap, 20);
    run(sim, 2000);
    expect(deaths.filter((d) => d === 'drowning').length).toBeGreaterThan(0);
    expect(k.queen.alive).toBe(false);
  }, 60_000);

  it('(d) the possessed ant is never moved by the rule: she gets the water alert instead', () => {
    const k = colony(6, false);
    const { sim } = k;
    const d = (a: Ant) => Math.hypot(a.pos.x - k.royal.center.x, a.pos.y - k.royal.center.y, a.pos.z - k.royal.center.z);
    const worker = colonyAnts(k).filter((a) => a.caste === 'worker').sort((a, b) => d(a) - d(b))[0];
    sim.enqueue({ type: 'possess', antId: worker.id });
    run(sim, 2);
    expect((worker.flags & AntFlag.POSSESSED) !== 0).toBe(true);
    const at = { ...worker.pos };
    rampWater(sim, k, waterUpTo(sim, k, feet(worker) + sim.world.bu), 60);
    run(sim, 100);
    expect(isFleeingWater(worker)).toBe(false);
    expect(Math.hypot(worker.pos.x - at.x, worker.pos.z - at.z)).toBeLessThan(0.5 * sim.world.bu);
    const card = sim.state.progression.alerts.find((a) => a.kind === 'possessed-danger' && a.subjectId === worker.id);
    expect(card?.cause).toBe('under-water');
    // released: the rule takes her out of the water
    sim.enqueue({ type: 'release', reason: 'player' });
    run(sim, 40);
    expect(sim.state.progression.alerts.some((a) => a.kind === 'possessed-danger' && a.subjectId === worker.id)).toBe(false);
  }, 60_000);
});

describe('save / restore during a flight (nest-fix3 acceptance 4)', () => {
  it('state after restore + N ticks equals the uninterrupted run', () => {
    const k = colony(10);
    const { sim } = k;
    const full = waterForShare(sim, k, k.royal.id, 1);
    // raise the water until some ant is on her way out of it (snapshot mid-flight)
    for (let s = 0; s < 400 && !colonyAnts(k).some((a) => a.bb[FW.on] === 1 && a.bb[FW.phase] === 0); s++) {
      k.nest.flood.water = (full * (s + 1)) / 400;
      run(sim, FLOOD_STEP_TICKS);
    }
    expect(colonyAnts(k).some((a) => a.bb[FW.on] === 1)).toBe(true);
    const bytes = snapshot(sim);
    const world = sim.world;
    const ramp = (s: Sim, steps: number) => {
      const nest = s.stores.nests.get(k.nest.id)!;
      for (let i = 0; i < steps; i++) { nest.flood.water += (full * 0.2) / steps; for (let t = 0; t < FLOOD_STEP_TICKS; t++) s.tick(); }
    };
    ramp(sim, 60);
    const b = createSim(restore(bytes).state, world);
    floodCheats(b.state).drainScale = 0;
    floodCheats(b.state).rainI = 0;
    ramp(b, 60);
    expect(stateHash(b.state)).toBe(stateHash(sim.state));
  }, 60_000);
});
