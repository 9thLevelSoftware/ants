// Independent verification of sim-fix-colony item 2 and 4 (reviewer): spoil piled where the design's complaint
// was (a 2 BU neck, the entrance shaft) must never wall the nest in once it tamps: every chamber keeps a path to
// the open entrance, and the path stays at least 1.5 BU across (GDD 03 §5.1 walkable; §5.3 N1). Checked
// globally over the whole nest (not just the tamp's local box). A real plug (seal-entrance) closes an entrance
// without an `entrance-closed` report.
import { describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { PELLET_TAMP_S, TAMP_RETRY_S } from '@/sim/balance/nest';
import { TICKS_PER_SECOND } from '@/sim/time';
import { OPEN_MIN } from './carve/keys';
import { nestSampleBox } from './chambers/detect';
import { flushClosedEntrances } from './entrances';
import { sealEntrance } from './index';
import { collect, nestSim, openVolumeNear, playerNest, runTicks } from './nestTestKit';
import { loosePellets, placePellet, spawnPellet } from './pellets';

const PELLET = 0.85;

/** Floor sample under p: walks down through open samples. */
function floorAt(sim: Sim, p: { x: number; y: number; z: number }) {
  const v = sim.carve.voxel, i = Math.round(p.x / v), k = Math.round(p.z / v);
  let j = Math.round(p.y / v);
  if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) throw new Error(`floorAt: ${JSON.stringify(p)} is not open`);
  while (sim.carve.sampleAt(i, j - 1, k) >= OPEN_MIN) j--;
  return { x: i * v, y: j * v, z: k * v };
}

/**
 * Are a and b joined through open samples of the nest box, plainly (eroded false) or through samples whose six face
 * neighbours are open too (eroded true: a passage >= 3 samples = 1.5 BU across, the passage rule's own measure)?
 * The start / goal are snapped to the nearest qualifying sample within 2 BU.
 */
function joined(sim: Sim, nest: Nest, a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }, eroded: boolean): boolean {
  const box = nestSampleBox(sim, nest), carve = sim.carve, v = carve.voxel;
  const open = (i: number, j: number, k: number) => carve.sampleAt(i, j, k) >= OPEN_MIN;
  const ok = (i: number, j: number, k: number) => open(i, j, k)
    && (!eroded || (open(i + 1, j, k) && open(i - 1, j, k) && open(i, j + 1, k) && open(i, j - 1, k) && open(i, j, k + 1) && open(i, j, k - 1)));
  const snap = (p: { x: number; y: number; z: number }): [number, number, number] | null => {
    const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v), R = Math.round((2 * sim.world.bu) / v);
    let best: [number, number, number] | null = null, bd = Infinity;
    for (let dk = -R; dk <= R; dk++) for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const d = di * di + dj * dj + dk * dk;
      if (d < bd && ok(ci + di, cj + dj, ck + dk)) { bd = d; best = [ci + di, cj + dj, ck + dk]; }
    }
    return best;
  };
  const s = snap(a), g = snap(b);
  if (!s || !g) return false;
  const key = (i: number, j: number, k: number) => `${i},${j},${k}`;
  const seen = new Set([key(...s)]), queue: [number, number, number][] = [s];
  const goal = key(...g);
  for (let q = 0; q < queue.length; q++) {
    const [i, j, k] = queue[q];
    if (key(i, j, k) === goal) return true;
    for (const [di, dj, dk] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const ni = i + di, nj = j + dj, nk = k + dk;
      if (ni < box.i0 || ni > box.i1 || nj < box.j0 || nj > box.j1 || nk < box.k0 || nk > box.k1) continue;
      const kk = key(ni, nj, nk);
      if (seen.has(kk) || !ok(ni, nj, nk)) continue;
      seen.add(kk);
      queue.push([ni, nj, nk]);
    }
  }
  return false;
}

/** Runs until every pellet has had its first tamp and `retries` retries. */
function tampAll(sim: Sim, retries: number): void {
  runTicks(sim, (PELLET_TAMP_S + retries * TAMP_RETRY_S) * TICKS_PER_SECOND + 20);
}

describe('verify: tamped spoil never walls the small test nest in (sim-fix-colony item 2)', () => {
  it('a heap of 30 pellets just under the mouth (1 BU deep): the entrance stays open', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = playerNest(sim);
    const e = nest.entrances[0], bu = sim.world.bu;
    const g = sim.field.height(e.pos.x, e.pos.z);
    const at = floorAt(sim, { x: e.pos.x + 0.5 * bu, y: g - 1 * bu, z: e.pos.z + 0.15 * bu });
    for (let n = 0; n < 30; n++) placePellet(sim, spawnPellet(sim, at, PELLET, 'loam', nest.id, nest.colony, -1), at);
    const ev = collect<{ type: string; into?: string }>(sim, ['entrance-closed', 'pellet-dumped'], () => tampAll(sim, 3));
    expect(ev.filter((x) => x.type === 'entrance-closed')).toEqual([]);
    expect(e.status).toBe('open');
  }, 120_000);

  it('a heap of 30 pellets in the entrance shaft: the entrance stays open, the food chamber keeps a 1.5 BU path out', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = playerNest(sim);
    const e = nest.entrances[0], bu = sim.world.bu;
    const food = nest.chambers.find((c) => c.type === 'food')!;
    expect(joined(sim, nest, food.center, { x: e.pos.x, y: e.pos.y - 1.5 * bu, z: e.pos.z }, true)).toBe(true);
    // the shaft's slanted first segment, 2 BU below the ground: its floor
    const g = sim.field.height(e.pos.x, e.pos.z);
    const at = floorAt(sim, { x: e.pos.x + 1.0 * bu, y: g - 2 * bu, z: e.pos.z + 0.33 * bu });
    for (let n = 0; n < 30; n++) placePellet(sim, spawnPellet(sim, at, PELLET, 'loam', nest.id, nest.colony, -1), at);
    const ev = collect<{ type: string; into?: string }>(sim, ['entrance-closed', 'pellet-dumped'], () => tampAll(sim, 3));
    expect(ev.filter((x) => x.type === 'pellet-dumped' && x.into === 'tamp').length).toBeGreaterThan(0); // spoil did tamp
    expect(ev.filter((x) => x.type === 'entrance-closed')).toEqual([]);
    expect(e.status).toBe('open');
    expect(sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, food.center)).toBeGreaterThan(0);
    expect(joined(sim, nest, food.center, { x: e.pos.x, y: e.pos.y - 1.5 * bu, z: e.pos.z }, false)).toBe(true);
    expect(joined(sim, nest, food.center, { x: e.pos.x, y: e.pos.y - 1.5 * bu, z: e.pos.z }, true)).toBe(true);
  }, 120_000);

  it('a heap of 40 pellets at the food-nursery neck: nursery and royal chambers keep a 1.5 BU path to the food chamber', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = playerNest(sim);
    const food = nest.chambers.find((c) => c.type === 'food')!;
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!;
    const royal = nest.chambers.find((c) => c.type === 'royal')!;
    expect(joined(sim, nest, nursery.center, food.center, true)).toBe(true);
    // the neck where the tunnel leaves the nursery toward the food chamber (its rim at floor height)
    const dx = food.center.x - nursery.center.x, dz = food.center.z - nursery.center.z, l = Math.hypot(dx, dz);
    const rim = { x: nursery.center.x + (dx / l) * nursery.radii.x * 0.95, y: nursery.center.y - nursery.radii.y + 1.0 * sim.world.bu, z: nursery.center.z + (dz / l) * nursery.radii.z * 0.95 };
    const at = floorAt(sim, rim);
    for (let n = 0; n < 40; n++) placePellet(sim, spawnPellet(sim, at, PELLET, 'loam', nest.id, nest.colony, -1), at);
    const ev = collect<{ type: string; into?: string }>(sim, ['pellet-dumped'], () => tampAll(sim, 3));
    expect(ev.filter((x) => x.into === 'tamp').length).toBeGreaterThan(0);
    for (const c of [nursery, royal]) {
      expect(sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, c.center), `${c.type} D_exit`).toBeGreaterThan(0);
      expect(joined(sim, nest, c.center, food.center, true), `${c.type} 1.5 BU path`).toBe(true);
    }
    // what did not fit is still lying there, not destroyed
    const lying = loosePellets(sim, nest.id);
    for (const it of lying) expect(it.volume).toBeGreaterThan(0);
  }, 120_000);
});

describe('verify: a plug closes an entrance without an entrance-closed report (sim-fix-colony item 4)', () => {
  it('seal-entrance until sealed: status sealed with plug voxels, no entrance-closed', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = playerNest(sim);
    const e = nest.entrances[0];
    const ev = collect<{ type: string }>(sim, ['entrance-closed'], () => {
      for (let n = 0; n < 8 && e.status !== 'sealed'; n++) sealEntrance(sim, e.id, -1);
      flushClosedEntrances(sim);
      runTicks(sim, 30);
    });
    expect(e.status).toBe('sealed');
    expect(e.plugVoxelCount).toBeGreaterThan(0);
    expect(ev).toEqual([]);
  });
});

describe('verify: GDD 03 App. E check 7 in a tunnel (the check\'s own wording) under the passage rule', () => {
  it('one 0.85 BU^3 pellet on a 2 BU tunnel floor: gone after 12,000 ticks, open volume within 1.5 BU down by 0.85 +- 0.01', () => {
    const sim = nestSim({});
    const bu = sim.world.bu, c = sim.world.size / 2, y = -20 * bu;
    sim.kernel.carveCapsule({ x: c - 12 * bu, y, z: c }, { x: c + 12 * bu, y, z: c }, bu, { force: true });
    const nest = playerNest(sim, { x: c, y, z: c });
    const floor = floorAt(sim, { x: c, y, z: c });
    const it = spawnPellet(sim, floor, PELLET, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, floor);
    const before = openVolumeNear(sim, floor, 1.5 * bu), beforeWide = openVolumeNear(sim, floor, 5 * bu);
    runTicks(sim, 11990);
    expect(sim.stores.items.has(it.id)).toBe(true);
    runTicks(sim, 10);
    expect(sim.stores.items.has(it.id)).toBe(false);
    expect(beforeWide - openVolumeNear(sim, floor, 5 * bu)).toBeCloseTo(0.85, 2); // conserved, but spread wider:
    // GDD 03 §1.3 / App. E check 7: within 1.0 BU (1.5 BU if not enough). Failed under the earlier per-column
    // headroom rule (only the tunnel's centre line of floor samples usable, fill spread to 2.5 / 4 BU); fixed by
    // judging the walkable passage instead (sim-fix-colony review).
    expect(before - openVolumeNear(sim, floor, 1.5 * bu)).toBeCloseTo(0.85, 2);
  }, 60_000);
});
