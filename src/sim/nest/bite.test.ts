// Dig bites (GDD 03 §1.2, App. E checks 1-4): the ramp brush, bite volume, pellets, durations per material and
// moisture, refusals.
import { describe, expect, it } from 'vitest';
import type { Primitive, Sim } from '@/sim/types';
import { PrimFlag, VoxelFlag } from '@/sim/types';
import { digBite, canDigAt } from './index';
import { biteTicks, digSpeedAt } from './substrate';
import { nestRuntime } from './runtime';
import { feetOf, nestSim, placeWorker, playerNest } from './nestTestKit';
import { walkerStep } from '@/sim/locomotion/walker';
import { DIG_BITE_S } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import type { MaterialId } from '@/sim/types';

const BU = 4;

/** A horizontal tunnel at 8 BU depth ending at the world centre, a worker facing its end face (+x). */
function wallSetup(material: MaterialId = 'loam', moisture = 0.4, prims?: Primitive[]) {
  const sim = nestSim({ material, moisture, prims });
  const c = sim.world.size / 2, y = -8 * BU;
  sim.kernel.carveCapsule({ x: c - 8 * BU, y, z: c }, { x: c, y, z: c }, 1.25 * BU, { force: true });
  playerNest(sim, { x: c - 4 * BU, y, z: c });
  const ant = placeWorker(sim, { x: c - 1.5 * BU, y, z: c }, { x: 1, y: 0, z: 0 });
  return { sim, ant, c, y };
}

function carveHash(sim: Sim): number {
  let h = 0;
  sim.carve.data.chunks.forEach((a, n) => { for (let s = 0; s < a.length; s++) h = (h * 31 + a[s] + n) >>> 0; });
  return h;
}

describe('dig bite (ramp brush)', () => {
  it('check 1: one bite at a loam face removes 0.70-1.00 BU^3 and yields one pellet of exactly that volume', () => {
    const { sim, ant } = wallSetup();
    const before = sim.carve.openVolume();
    const items = sim.state.items.length;
    const res = digBite(sim, ant, feetOf(ant), { x: 1, y: 0, z: 0 }, 0);
    expect(res.ok).toBe(true);
    expect(res.material).toBe('loam');
    const removed = (sim.carve.openVolume() - before) / BU ** 3;
    expect(removed).toBeGreaterThanOrEqual(0.7);
    expect(removed).toBeLessThanOrEqual(1.0);
    expect(sim.state.items.length).toBe(items + 1);
    const pellet = sim.stores.items.get(res.pelletId)!;
    expect(pellet.kind).toBe('soil-pellet');
    expect(Math.abs(pellet.volume - removed)).toBeLessThan(1e-6);
    // the action lasts 10 ticks in loam at moisture 0.4 for a standard worker
    expect(biteTicks(sim, ant, { x: sim.world.size / 2 + BU, y: -8 * BU, z: sim.world.size / 2 })).toBe(10);
  });

  it('repeated bites extend a straight ramp and the digger stays on its level set', () => {
    const { sim, ant } = wallSetup();
    let total = 0;
    for (let n = 0; n < 10; n++) {
      const res = digBite(sim, ant, feetOf(ant), { x: 1, y: 0, z: 0 }, 30);
      expect(res.ok).toBe(true);
      total += sim.stores.items.get(res.pelletId)!.volume;
      // the walker was re-projected by the nest after the carve: still on f = footOffset
      expect(Math.abs(sim.field.sample(ant.pos) - ant.footOffset)).toBeLessThan(0.02 * BU);
      // auto-advance (GDD 01): step up to the new face
      walkerStep(sim.field, ant, { x: 1, y: 0, z: 0 }, 4 * BU, 0.1, sim.kernel.walker);
    }
    // the ramp goes down at about the requested slope
    expect(ant.pos.y).toBeLessThan(-8 * BU - 1.25 * BU + ant.footOffset);
    // GDD 01 check 6 / GDD 03 risk note: 10 bites at one spot remove 7-10 BU^3
    expect(total).toBeGreaterThan(7);
    expect(total).toBeLessThan(10);
  });

  it('check 2: bite durations in sand, clay (moist and dry) and loose loam', () => {
    const at = (sim: Sim) => ({ x: sim.world.size / 2 + BU, y: -8 * BU, z: sim.world.size / 2 });
    const sand = wallSetup('sand', 0.4);
    expect(biteTicks(sand.sim, sand.ant, at(sand.sim))).toBe(7);
    const clay = wallSetup('clay', 0.4);
    expect(biteTicks(clay.sim, clay.ant, at(clay.sim))).toBe(23);
    const dry = wallSetup('clay', 0.05);
    expect(biteTicks(dry.sim, dry.ant, at(dry.sim))).toBe(41);
    const loose = wallSetup('loam', 0.4);
    const p = at(loose.sim), v = loose.sim.carve.voxel;
    nestRuntime(loose.sim).flags.add(Math.round(p.x / v), Math.round(p.y / v), Math.round(p.z / v), VoxelFlag.LOOSE);
    expect(biteTicks(loose.sim, loose.ant, p)).toBe(5);
    // the formula: DIG_BITE_S / digSpeed (x digPower 1, workRate 1)
    expect(Math.ceil((DIG_BITE_S / digSpeedAt(sand.sim, 'lasius-niger', at(sand.sim))) * TICKS_PER_SECOND - 1e-9)).toBe(7);
  });

  it('check 3: concrete refuses the bite (not-diggable), the carve grid is unchanged and no item appears', () => {
    const size = 128 * BU, c = size / 2;
    const concrete: Primitive = {
      id: 1, shape: 'box', pos: { x: c + 1 * BU, y: -8 * BU, z: c }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 1.2 * BU, y: 3 * BU, z: 3 * BU }, round: 0, material: 'concrete', flags: 0, objectId: -1,
    };
    const { sim, ant } = wallSetup('loam', 0.4, [concrete]);
    const hash = carveHash(sim), items = sim.state.items.length;
    const res = digBite(sim, ant, feetOf(ant), { x: 1, y: 0, z: 0 }, 0);
    expect(res).toMatchObject({ ok: false, reason: 'not-diggable', pelletId: -1 });
    expect(carveHash(sim)).toBe(hash);
    expect(sim.state.items.length).toBe(items);
  });

  it('check 4: Lasius cannot dig sound wood; a carpenter media digs it in 25 ticks at wood moisture 0.2', () => {
    const size = 128 * BU, c = size / 2;
    const log: Primitive = {
      id: 1, shape: 'box', pos: { x: c + 2 * BU, y: 2 * BU, z: c }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: 2 * BU, y: 2 * BU, z: 3 * BU }, round: 0, material: 'wood-sound', flags: PrimFlag.DIGGABLE, objectId: -1,
    };
    const sim = nestSim({ prims: [log] });
    sim.state.worldDelta.wood.push({ primId: 1, moisture: 20, decay: 0 });
    const inside = { x: c + 2 * BU, y: 2 * BU, z: c };
    expect(digSpeedAt(sim, 'lasius-niger', inside)).toBe(0);
    expect(canDigAt(sim, 'lasius-niger', inside)).toBe(false);
    const ticks = Math.ceil((DIG_BITE_S / (digSpeedAt(sim, 'camponotus-pennsylvanicus', inside) * 1.0)) * TICKS_PER_SECOND - 1e-9);
    expect(ticks).toBe(25);
    // a Lasius worker facing the log: not-diggable
    const ant = placeWorker(sim, { x: c - 0.5 * BU, y: 1 * BU, z: c }, { x: 1, y: 0, z: 0 });
    expect(digBite(sim, ant, feetOf(ant), { x: 1, y: 0, z: 0 }, -10).reason).toBe('not-diggable');
  });

  it('refuses castes that cannot dig and reports nothing to dig in open air', () => {
    const { sim, ant } = wallSetup();
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    queen.flags = 0; // an established queen
    expect(digBite(sim, queen, feetOf(queen), { x: 1, y: 0, z: 0 }, 0).reason).toBe('caste');
    // standing on the surface looking up into the sky: no face within the probe
    const top = placeWorker(sim, { x: 10 * BU, y: 2 * BU, z: 10 * BU }, { x: 1, y: 0, z: 0 });
    expect(digBite(sim, top, feetOf(top), { x: 1, y: 0, z: 0 }, -80).reason).toBe('no-target');
    expect(ant.alive).toBe(true);
  });
});
