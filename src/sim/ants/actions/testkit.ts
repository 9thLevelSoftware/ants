// Test helpers for the action library (used by *.test.ts only): a small sim running the ant systems, fakes of the
// owning modules' functions (installed into `ports`), and entity shortcuts. No vitest import: fakes are plain.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Brood, Caste, Chamber, FoodSource, Item, Sim, System, Task } from '@/sim/types';
import { spawnAnt, spawnBrood, spawnItem, spawnSource } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing/testWorld';
import { lifecycleSystem } from '../lifecycle';
import { behaviourSystem } from '../behaviourRunner';
import { playerControlSystem } from '../player/control';
import { ports, type Ports } from './ports';
import { actionSystem } from './system';

export const ANT_SYSTEMS: readonly System[] = [commandsSystem, behaviourSystem, playerControlSystem, actionSystem, lifecycleSystem];

/** A test sim (flat loam world) that runs only the command, behaviour, player-control, action and lifecycle systems. */
export function makeAntSim(seed = 1, systems: readonly System[] = ANT_SYSTEMS): Sim {
  return makeTestSim({ seed, systems });
}

/** Mutable world the fakes below act on. */
export interface FakeWorld {
  demand: Partial<Record<Task, number>>;
  chambers: Chamber[];
  damage: { kind: string; id: number; dmg: number }[];
  bites: number;
  tempFactor: number;
  grapple: boolean;
}

/** Replaces ports with deterministic fakes of the owning modules; returns the world and a restore function. */
export function installFakes(sim: Sim, over: Partial<Ports> = {}): { fake: FakeWorld; restore: () => void } {
  const saved = { ...ports };
  const fake: FakeWorld = { demand: {}, chambers: [], damage: [], bites: 0, tempFactor: 1, grapple: true };
  const fakes: Partial<Ports> = {
    speedMult: () => fake.tempFactor,
    canDigAt: () => true,
    // fake substrate: the field's material table only (no moisture, loose fill or crusts)
    nestDigSpeedAt: (s, species, p) => s.field.diggability(p, species),
    digBite: (s, ant) => {
      fake.bites++;
      const it = spawnItem(s, { kind: 'soil-pellet', pos: ant.pos, init: { volume: 0.85, material: 'loam', bulk: 0.5 } });
      return { ok: true, reason: null, voxels: 7, pelletId: it.id, material: 'loam' };
    },
    dumpPellet: () => null,
    sealEntrance: (s, entranceId) => {
      for (const n of s.stores.nests.list) for (const e of n.entrances) {
        if (e.id !== entranceId) continue;
        e.plugVoxelCount++;
        e.status = e.plugVoxelCount >= 3 ? 'sealed' : 'sealing';
        return e.status === 'sealed';
      }
      return false;
    },
    unsealEntrance: (s, entranceId) => {
      for (const n of s.stores.nests.list) for (const e of n.entrances) {
        if (e.id !== entranceId) continue;
        e.plugVoxelCount = Math.max(0, e.plugVoxelCount - 1);
        e.status = e.plugVoxelCount === 0 ? 'open' : 'reopening';
        return e.status === 'open';
      }
      return false;
    },
    findChamberAt: (_s, p) => fake.chambers.find((c) => insideChamber(c, p)) ?? null,
    depositFood: (s, colonyId, c, p) => {
      const col = s.stores.colonies.get(colonyId);
      if (!col) return { c: 0, p: 0 };
      col.stores.c += c; col.stores.p += p;
      return { c, p };
    },
    withdrawFood: (s, colonyId, c, p) => {
      const col = s.stores.colonies.get(colonyId);
      if (!col) return { c: 0, p: 0 };
      const tc = Math.min(c, col.stores.c), tp = Math.min(p, col.stores.p);
      col.stores.c -= tc; col.stores.p -= tp;
      return { c: tc, p: tp };
    },
    feedBrood: (s, giver, broodId, c, p) => {
      const b = s.stores.brood.get(broodId);
      if (!b) return { c: 0, p: 0 };
      giver.cropC -= c; giver.cropP -= p;
      b.gutC += c; b.gutP += p; b.fedC += c; b.fedP += p;
      return { c, p };
    },
    layEgg: (s, queen) => {
      const q = queen.queen;
      if (!q) return -1;
      if (q.founding) q.founding.reserveLoads -= 0.04;
      else q.gut.p -= 0.04;
      q.eggBudget -= 1;
      return spawnBrood(s, { colony: queen.colony, stage: 'egg', destined: 'worker', pos: queen.pos }).id;
    },
    colonyDemand: (_s, _c, task) => fake.demand[task] ?? 0,
    takeFromSource: (s, ant, sourceId, amount) => fakeTake(s, ant, sourceId, amount),
    nearestSource: (s, _colony, p, r) => {
      let best = -1, bestD = Infinity;
      for (const src of s.stores.sources.list) {
        const d = Math.hypot(src.pos.x - p.x, src.pos.y - p.y, src.pos.z - p.z);
        if (src.alive && src.units > 0 && d <= r && d < bestD) { best = src.id; bestD = d; }
      }
      return best;
    },
    discoverSource: (s, _colony, sourceId) => {
      const src = s.stores.sources.get(sourceId);
      if (!src || src.discoveredBy & 1) return false;
      src.discoveredBy |= 1;
      return true;
    },
    applyDamage: (_s, kind, id, dmg) => { fake.damage.push({ kind, id, dmg }); return dmg; },
    beginGrapple: (s, holderId, kind, id) => {
      const a = s.stores.ants.get(holderId);
      if (!a || !fake.grapple) return false;
      a.combat = emptyCombat();
      a.combat.lock = { targetKind: kind, targetId: id, slot: 0 };
      return true;
    },
    releaseGrapple: (s, holderId) => {
      const a = s.stores.ants.get(holderId);
      if (a?.combat) a.combat.lock = null;
    },
    navTo: () => true,
    navStop: () => {},
  };
  Object.assign(ports, fakes, over);
  return { fake, restore: () => Object.assign(ports, saved) };
}

type Take = ReturnType<Ports['takeFromSource']>;

/** The sources-core contract (liquid: game s of drinking into the crop; pick / tear: an item in the mandibles). */
function fakeTake(s: Sim, ant: Ant, sourceId: number, amount: number): Take {
  const r: Take = { status: 'ok', c: 0, p: 0, toxin: 0, water: 0, taken: 0, itemId: -1, depleted: false };
  const src = s.stores.sources.get(sourceId);
  if (!src) return { ...r, status: 'no-source' };
  if (src.units <= 1e-9) return { ...r, status: 'empty' };
  if (ports.harvestForm(s, src) === 'liquid') {
    const room = ant.cropCap - ant.cropC - ant.cropP;
    if (room <= 1e-9) return { ...r, status: 'crop-full' };
    const v = Math.min(amount * 0.05 * src.drinkRateMult, src.units, room / Math.max(src.c + src.p, 1e-9));
    src.units -= v;
    ant.cropC += v * src.c; ant.cropP += v * src.p;
    return { ...r, c: v * src.c, p: v * src.p, taken: v, depleted: src.units <= 1e-9 };
  }
  if (ant.carry.kind !== 'none') return { ...r, status: 'hands-full' };
  const pick = ports.harvestForm(s, src) === 'pick';
  if (pick && src.unitBulk > ant.carryCap) return { ...r, status: 'too-heavy' };
  const bulk = pick ? src.unitBulk : Math.min(ant.carryCap, src.units * src.unitBulk);
  const units = bulk / src.unitBulk;
  src.units -= units;
  const it = spawnItem(s, {
    kind: 'food-piece', pos: ant.pos,
    init: { c: units * src.c, p: units * src.p, bulk, foodKind: src.kind, variant: src.variant, carrierIds: [ant.id] },
  });
  ant.carry = { kind: 'item', id: it.id };
  return { ...r, c: it.c, p: it.p, taken: units, itemId: it.id };
}

export function emptyCombat(): NonNullable<Ant['combat']> {
  return {
    lock: null, heldBy: [], pinned: false, seizedBy: -1, escape: 0, paralysedUntilTick: 0, stuckSinceTick: 0,
    disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0, recentHitters: [], biteCdTick: 0, specialCdTick: 0,
    dodgeCdTick: 0,
  };
}

function insideChamber(c: Chamber, p: Vec3): boolean {
  const dx = (p.x - c.center.x) / c.radii.x, dy = (p.y - c.center.y) / c.radii.y, dz = (p.z - c.center.z) / c.radii.z;
  return dx * dx + dy * dy + dz * dz <= 1;
}

/** A chamber record around `center` (radius r mm) for the fake findChamberAt. */
export function fakeChamber(id: number, center: Vec3, r: number, type: Chamber['type'] = 'nursery'): Chamber {
  const load = { adults: 0, brood: 0, food: 0, other: 0 };
  return {
    id, type, designatedBy: 'auto' as Chamber['designatedBy'], center: { ...center }, radii: { x: r, y: r, z: r }, volume: 10,
    floorArea: 10, depthBu: 10, depthMm: 40, roofMin: 4, covered: false, seedVoxel: 0, voxelCount: 80,
    capacity: { ...load, adults: 10 }, occupancy: { ...load }, temp: 22, humidity: 0.7, wetUntilTick: -1, flooded: 0,
    floodRisk: 0, flags: 0, createdTick: 0,
  };
}

/** A worker of the player colony on the flat ground at (x, z) BU, facing +X. */
export function worker(sim: Sim, xBu: number, zBu: number, caste: Caste = 'worker', task: Task = 'idle'): Ant {
  const bu = sim.world.bu;
  return spawnAnt(sim, { colony: sim.state.colonies[0].id, caste, pos: { x: xBu * bu, y: 0, z: zBu * bu }, task, lengthBu: 1 });
}

/** The point `dBu` straight ahead of the ant's body centre, on the ground. */
export function ahead(sim: Sim, ant: Ant, dBu: number): Vec3 {
  const d = dBu * sim.world.bu;
  return { x: ant.pos.x + ant.fwd.x * d, y: 0, z: ant.pos.z + ant.fwd.z * d };
}

export function larva(sim: Sim, at: Vec3): Brood {
  return spawnBrood(sim, { colony: sim.state.colonies[0].id, stage: 'larva', destined: 'worker', pos: at });
}

export function foodItem(sim: Sim, at: Vec3, bulk = 0.5, p = 0.3, c = 0.2): Item {
  return spawnItem(sim, { kind: 'food-piece', pos: at, init: { bulk, c, p, foodKind: 'crumb' } });
}

export function source(sim: Sim, at: Vec3, kind: FoodSource['kind'], units: number, init: Partial<FoodSource> = {}): FoodSource {
  return spawnSource(sim, { kind, pos: at, units, init: { c: 1, p: 0, unitBulk: 1, drinkRateMult: 1, hardness: 1, pool: -1, ...init } });
}

/** Advances n ticks (refreshing the spatial index as tick() does). */
export function step(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

/** Collects events of the given types while running fn. */
export function capture<T extends string>(sim: Sim, types: readonly T[], fn: () => void): { type: string; [k: string]: unknown }[] {
  const got: { type: string; [k: string]: unknown }[] = [];
  const handlers = types.map((t) => {
    const h = (ev: unknown) => { got.push(ev as { type: string }); };
    (sim.events as unknown as { on(t: string, f: (e: unknown) => void): void }).on(t, h);
    return [t, h] as const;
  });
  try { fn(); sim.events.flush(); } finally {
    for (const [t, h] of handlers) (sim.events as unknown as { off(t: string, f: (e: unknown) => void): void }).off(t, h);
  }
  return got;
}
