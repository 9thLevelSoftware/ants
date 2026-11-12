// Pellets and mounds (GDD 03 §1.3, §1.4; App. E checks 5, 6, 7, 9; acceptance 5).
import { describe, expect, it } from 'vitest';
import type { Item, Mound, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { BULKING, REPOSE_DEG } from '@/sim/balance/nest';
import { walkerPlace, walkerStep } from '@/sim/locomotion/walker';
import { clutterSpeedMult, digBite, dumpPellet, dumpPoint, moundVolume } from './index';
import { moundById } from './mounds';
import { placePellet, spawnPellet } from './pellets';
import { nestRuntime } from './runtime';
import { collect, feetOf, nestSim, openVolumeNear, placeWorker, runTicks } from './nestTestKit';

const BU = 4;

function surfacePellet(sim: Sim, x: number, z: number, volume: number): Item {
  const nest = sim.state.nests[0];
  const p = { x, y: sim.field.height(x, z), z };
  const it = spawnPellet(sim, p, volume, 'loam', nest.id, nest.colony, -1);
  placePellet(sim, it, p);
  return it;
}

function entranceMound(sim: Sim): Mound | undefined {
  const e = sim.state.nests[0].entrances[0];
  return e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
}

describe('mounds', () => {
  it('check 5 / acceptance 5: dumped pellets grow a mound of 1.25 x their volume, relaxed to the angle of repose', () => {
    const sim = nestSim({ nest: 'small' });
    const e = sim.state.nests[0].entrances[0];
    let total = 0;
    for (let n = 0; n < 50; n++) {
      const p = dumpPoint(sim, e, { x: 0, y: 0, z: 0 });
      const vol = 0.75 + 0.002 * n;
      surfacePellet(sim, p.x, p.z, vol);
      total += vol;
    }
    runTicks(sim, 3300);
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'soil-pellet').length).toBe(0);
    runTicks(sim, 2800);
    const m = entranceMound(sim)!;
    expect(m).toBeDefined();
    const vol = moundVolume(sim, m);
    expect(Math.abs(vol - BULKING * total) / (BULKING * total)).toBeLessThan(0.005);
    expect(Math.abs(m.volume - vol)).toBeLessThan(1e-3);
    // slopes between adjacent usable cells within 0.5 x tan(38 deg) + 0.01 BU; the hole stays clear
    const lim = (0.5 * Math.tan((REPOSE_DEG.loam! * Math.PI) / 180) + 0.01) * BU;
    const half = ((m.n - 1) * m.cell) / 2, x0 = m.centerX - half, z0 = m.centerZ - half;
    const clear = (ix: number, iz: number) => Math.hypot(x0 + ix * m.cell - e.pos.x, z0 + iz * m.cell - e.pos.z) <= e.radius + 0.25 * BU;
    let worst = 0;
    for (let iz = 0; iz < m.n; iz++) for (let ix = 0; ix < m.n; ix++) {
      const i = iz * m.n + ix;
      if (clear(ix, iz)) { expect(m.h[i]).toBe(0); continue; }
      for (const [jx, jz] of [[ix + 1, iz], [ix, iz + 1]]) {
        if (jx >= m.n || jz >= m.n || clear(jx, jz)) continue;
        const j = jz * m.n + jx;
        worst = Math.max(worst, Math.abs(m.base[i] + m.h[i] - m.base[j] - m.h[j]));
      }
    }
    expect(worst).toBeLessThanOrEqual(lim);
  });

  it('acceptance 5: the mound is part of the field (height overlay) and a walker crosses it', () => {
    const sim = nestSim({ nest: 'small' });
    const e = sim.state.nests[0].entrances[0];
    for (let n = 0; n < 60; n++) {
      const a = (n / 60) * 2 * Math.PI, r = e.radius + 2.5 * BU;
      surfacePellet(sim, e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, 0.85);
    }
    runTicks(sim, 3300);
    const m = entranceMound(sim)!;
    let peak = 0, px = 0, pz = 0;
    const half = ((m.n - 1) * m.cell) / 2;
    for (let i = 0; i < m.h.length; i++) if (m.h[i] > peak) { peak = m.h[i]; px = m.centerX - half + (i % m.n) * m.cell; pz = m.centerZ - half + Math.floor(i / m.n) * m.cell; }
    expect(peak).toBeGreaterThan(0.3 * BU);
    expect(sim.field.height(px, pz)).toBeCloseTo(peak, 3); // the flat test terrain is at y = 0
    // walk across the pile through its highest point
    const dir = { x: px - e.pos.x, z: pz - e.pos.z }, l = Math.hypot(dir.x, dir.z);
    const d = { x: dir.x / l, y: 0, z: dir.z / l };
    const start = { x: px - d.x * 10 * BU, y: 2 * BU, z: pz - d.z * 10 * BU };
    const ant = placeWorker(sim, start, d);
    let top = -Infinity;
    for (let n = 0; n < 60; n++) {
      const st = walkerStep(sim.field, ant, d, 6 * BU, 0.1, sim.kernel.walker);
      expect(st === 'failed').toBe(false);
      expect(sim.field.sample(ant.pos)).toBeGreaterThan(0.3 * ant.footOffset);
      top = Math.max(top, ant.pos.y);
    }
    expect(top).toBeGreaterThan(peak * 0.8);
    expect(walkerPlace(sim.field, ant, { x: px, y: peak + BU, z: pz }, {}, sim.kernel.walker)).toBe(true);
    expect(ant.pos.y - ant.footOffset).toBeCloseTo(peak, 0);
  });

  it('check 6: a surface pellet 3 BU from an entrance still exists at age 2990 and has merged by 3260', () => {
    const sim = nestSim({ nest: 'small' });
    const e = sim.state.nests[0].entrances[0];
    runTicks(sim, 37); // an arbitrary drop tick
    const it = surfacePellet(sim, e.pos.x + 3 * BU, e.pos.z, 0.85);
    runTicks(sim, 2990);
    expect(sim.stores.items.has(it.id)).toBe(true);
    runTicks(sim, 270);
    expect(sim.stores.items.has(it.id)).toBe(false);
    expect(moundVolume(sim, entranceMound(sim)!)).toBeCloseTo(0.85 * BULKING, 6);
  });
});

describe('pellets', () => {
  it('check 7: an untouched clutter pellet is tamped after 1200 s: 0.85 BU^3 less open space, voxels LOOSE', () => {
    const sim = nestSim({ nest: 'small' });
    const food = sim.state.nests[0].chambers.find((c) => c.type === 'food')!;
    const t = sim.field.sphereTrace(food.center, { x: 0, y: -1, z: 0 }, 4 * BU, 0);
    const floor = { x: food.center.x, y: food.center.y - t, z: food.center.z };
    const nest = sim.state.nests[0];
    const it = spawnPellet(sim, floor, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, floor);
    expect(it.inNest).toBe(true);
    const before = openVolumeNear(sim, floor, 1.5 * BU);
    runTicks(sim, 11990);
    expect(sim.stores.items.has(it.id)).toBe(true);
    runTicks(sim, 10);
    expect(sim.stores.items.has(it.id)).toBe(false);
    expect(before - openVolumeNear(sim, floor, 1.5 * BU)).toBeCloseTo(0.85, 2);
    const v = sim.carve.voxel, flags = nestRuntime(sim).flags;
    let loose = 0;
    for (let k = -3; k <= 3; k++) for (let j = -3; j <= 3; j++) for (let i = -3; i <= 3; i++) {
      if (flags.get(Math.round(floor.x / v) + i, Math.round(floor.y / v) + j, Math.round(floor.z / v) + k) & VoxelFlag.LOOSE) loose++;
    }
    expect(loose).toBeGreaterThan(0);
  });

  it('check 9: a founding queen in `digging` expels the bite: no pellet item, mound grows by 1.25 x the volume', () => {
    const sim = nestSim();
    const nest = sim.state.nests[0];
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    nest.founding!.state = 'digging';
    nest.origin = { ...queen.pos };
    const items = sim.state.items.length;
    const ev = collect<{ type: string; volume: number; moundId: number }>(sim, ['pellet-expelled'], () => {
      expect(digBite(sim, queen, feetOf(queen), queen.fwd, 30).ok).toBe(true);
    });
    expect(sim.state.items.length).toBe(items);
    expect(ev.length).toBe(1);
    const m = moundById(sim, ev[0].moundId)!;
    expect(moundVolume(sim, m)).toBeCloseTo(BULKING * ev[0].volume, 6);
  });

  it('dumpPellet: a carried pellet dropped in a chamber lies there as clutter; on the surface it is a surface pellet', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0];
    const food = nest.chambers.find((c) => c.type === 'food')!;
    const ant = placeWorker(sim, { ...food.center }, { x: 1, y: 0, z: 0 }, nest.id);
    const it = spawnPellet(sim, ant.pos, 0.8, 'loam', nest.id, ant.colony, ant.id);
    it.carrierIds = [ant.id];
    ant.carry = { kind: 'item', id: it.id };
    expect(dumpPellet(sim, ant, it.id, feetOf(ant))).toBeNull();
    expect(ant.carry.kind).toBe('none');
    expect(it.carrierIds).toEqual([]);
    expect(it.inNest).toBe(true);
    expect(it.chamberId).toBe(food.id);
    expect(clutterSpeedMult(sim, it.pos)).toBeLessThanOrEqual(1);
    const out = surfacePellet(sim, 20 * BU, 20 * BU, 0.5);
    expect(out.inNest).toBe(false);
  });
});
