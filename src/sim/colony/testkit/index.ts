// Test kit for colony-core tests (and for other modules' tests that need a running colony without the
// behaviour tasks): a small sim with only the colony systems, an established queen, chambers, workers, brood,
// a climate fake and a scripted stand-in for nurses / queen-carers (the later beh-nest task's job).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, BroodCaste, BroodStage, Chamber, ChamberType, Colony, Sim, System, Task } from '@/sim/types';
import { AntFlag, BroodFlag } from '@/sim/types';
import { removeItem, spawnAnt, spawnBrood } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { makeTestSim } from '@/sim/testing';
import { LAY_EGG_S } from '@/sim/balance/actions';
import { secondsToTicks } from '@/sim/time';
import {
  allocationSystem, broodSystem, colonyDiagnosticsSystem, colonyStatsSystem, economySystem, queenSystem,
  taskReevalSystem,
} from '../colonySystems';
import { invalidateCensus } from '../census';
import { setClimateOverride, type ClimateOverride } from '../envAdapter';
import { deposit, feedFromCrop, withdraw } from '../stores';
import { ecloseBrood, larvaRemainingNeed, wantsFeed } from '../brood';
import { cannibaliseBrood, nextCannibalVictim } from '../cannibalism';
import { canLay, layEgg } from '../queen';
import { LARVA_C_REQ, LARVA_GUT_CAP, LARVA_P_REQ } from '@/sim/balance';

export const COLONY_SYSTEMS: readonly System[] = [
  commandsSystem, allocationSystem, taskReevalSystem, queenSystem, broodSystem, economySystem, colonyStatsSystem,
  colonyDiagnosticsSystem,
];

export interface ColonySimOptions {
  seed?: number;
  /** Extra systems run after the colony systems (scripted behaviour fakes). */
  extra?: readonly System[];
  climate?: ClimateOverride;
  /** Start day of summer (default 2 = doy 9), hour 0. */
  summerDay?: number;
  /** Leave the allocation systems out (tests that pin tasks by hand). */
  noAllocation?: boolean;
}

/** A test sim with only the colony systems and a constant climate (default 25 °C, RH 0.8, activity 1). */
export function makeColonySim(o: ColonySimOptions = {}): Sim {
  const sim = makeTestSim({
    seed: o.seed ?? 1,
    systems: [...COLONY_SYSTEMS.filter((s) => !o.noAllocation || (s !== allocationSystem && s !== taskReevalSystem)), ...(o.extra ?? [])],
    config: { startSeason: 'summer', startDayOfSeason: o.summerDay ?? 2, startHour: 0 },
  });
  setClimateOverride(sim, { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 1, ...o.climate });
  return sim;
}

export function colonyOf(sim: Sim): Colony {
  return sim.state.colonies[0];
}

/** Adds a chamber to the colony's first nest; returns it. */
export function addChamber(sim: Sim, type: ChamberType, center: Vec3, food = 50, id?: number): Chamber {
  const nest = sim.stores.nests.get(colonyOf(sim).nestIds[0])!;
  const ch: Chamber = {
    id: id ?? sim.state.nextId++, type, designatedBy: 'player', center: { ...center }, radii: { x: 20, y: 8, z: 20 },
    volume: 100, floorArea: 50, depthBu: 10, depthMm: 40, roofMin: 5, covered: false, seedVoxel: 0, voxelCount: 800,
    capacity: { adults: 100, brood: 150, food, other: 50 }, occupancy: { adults: 0, brood: 0, food: 0, other: 0 },
    temp: 25, humidity: 0.8, wetUntilTick: -1, flooded: 0, floodRisk: 0, flags: 0, createdTick: sim.state.tick,
  };
  nest.chambers.push(ch);
  return ch;
}

/** Adds an entrance to the colony's first nest; returns its id. */
export function addEntrance(sim: Sim, pos: Vec3): number {
  const nest = sim.stores.nests.get(colonyOf(sim).nestIds[0])!;
  const id = sim.state.nextId++;
  nest.entrances.push({
    id, kind: 'dug', status: 'open', pos: { ...pos }, dir: { x: 0, y: 1, z: 0 }, radius: 4, moundId: -1, rimTarget: 0,
    plugVoxelCount: 0, createdTick: 0, trafficIn: 0, trafficOut: 0,
  });
  return id;
}

/** Turns the founding queen into an established queen in `chamber` (fecundity 1, full health). */
export function establishQueen(sim: Sim, chamber: Chamber): Ant {
  const col = colonyOf(sim);
  const q = sim.stores.ants.get(col.queenId)!;
  const qs = q.queen!;
  qs.founding = null;
  qs.mode = 'established';
  qs.fecundity = 1;
  q.flags &= ~AntFlag.FOUNDING;
  q.maxHp = 50;
  q.hp = q.maxHp;
  q.tb = 25;
  q.pos = { ...chamber.center };
  q.nestId = col.nestIds[0];
  q.chamberId = chamber.id;
  return q;
}

export interface WorkerSpec {
  ageGd?: number;
  task?: Task;
  chamber?: Chamber | null;
  /** Lifespan override, gd (default 1000 so tests are not cut short by old age). */
  lifespanGd?: number;
  state?: string;
  callow?: boolean;
}

export function addWorkers(sim: Sim, n: number, s: WorkerSpec = {}): Ant[] {
  const col = colonyOf(sim);
  const out: Ant[] = [];
  for (let i = 0; i < n; i++) {
    const pos = s.chamber ? { ...s.chamber.center } : { ...sim.world.queenStart.pos };
    const a = spawnAnt(sim, {
      colony: col.id, caste: 'worker', pos, task: s.task ?? 'idle', lengthBu: 1, ageGd: s.ageGd ?? 3,
      nestId: s.chamber === null ? -1 : col.nestIds[0], chamberId: s.chamber ? s.chamber.id : -1,
      flags: s.callow ? AntFlag.CALLOW : 0,
    });
    a.lifespanGd = s.lifespanGd ?? 1000;
    a.tb = 25;
    if (s.state) a.state = s.state;
    out.push(a);
  }
  invalidateCensus(sim);
  return out;
}

export function addBrood(sim: Sim, stage: BroodStage, n: number, chamber: Chamber, progress = 0, destined: BroodCaste = 'worker'): void {
  const col = colonyOf(sim);
  for (let i = 0; i < n; i++) {
    spawnBrood(sim, {
      colony: col.id, stage, destined, pos: chamber.center, nestId: col.nestIds[0], chamberId: chamber.id,
      init: { progress: typeof progress === 'number' ? progress : 0 },
    });
  }
  invalidateCensus(sim);
}

export function step(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

export interface CareOptions {
  /** Feed hungry larvae from the pool (nurse load mix). */
  feedLarvae?: boolean;
  /** Tend every brood pile. */
  tend?: boolean;
  /** Help ready pupae eclose. */
  assist?: boolean;
  /** Lay eggs whenever the queen can, at most one per LAY_EGG_S (the queen.reside behaviour). */
  lay?: boolean;
  /** Keep the queen's gut at the retinue target from the pool; or a fixed P supply per gd (overrides). */
  feedQueen?: boolean;
  queenPPerGd?: number;
  queenCPerGd?: number;
  /** Eat brood in starvation stage S3+. */
  cannibalise?: boolean;
  /** Remove waste items at once (haulers). Default true. */
  haul?: boolean;
}

/**
 * A scripted stand-in for nurses and queen-carers. It uses only the colony API (withdraw / feedBrood /
 * ecloseBrood / layEgg / cannibaliseBrood) through a "virtual nurse": the colony's lowest-id worker.
 */
export function careSystem(o: CareOptions): System {
  let nextLay = 0;
  return {
    name: 'test-care', phase: 'behaviours',
    run(sim) {
      const col = colonyOf(sim);
      let nurse: Ant | undefined;
      for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'worker') { nurse = a; break; }
      const q = sim.stores.ants.get(col.queenId);
      for (const b of sim.stores.brood.list) {
        if (!b.alive || b.colony !== col.id) continue;
        if (o.tend) b.lastTendedTick = sim.state.tick;
        if (o.assist && b.stage === 'pupa' && (b.flags & BroodFlag.READY)) ecloseBrood(sim, b.id, nurse ? nurse.id : -1);
        if (o.feedLarvae && nurse && wantsFeed(b, sim.species)) {
          const share = LARVA_P_REQ / (LARVA_P_REQ + LARVA_C_REQ);
          const load = Math.min(LARVA_GUT_CAP - b.gutC - b.gutP, larvaRemainingNeed(sim.species, b));
          const got = withdraw(col, load * (1 - share), load * share, 'transit');
          nurse.cropC += got.c;
          nurse.cropP += got.p;
          feedFromCrop(sim, nurse, b.id, got.c, got.p);
        }
      }
      if (q?.queen && nurse) {
        if (o.queenPPerGd !== undefined || o.queenCPerGd !== undefined) {
          const dt = 1 / 6000;
          const got = withdraw(col, (o.queenCPerGd ?? 0) * dt, (o.queenPPerGd ?? 0) * dt, 'transit');
          nurse.cropC += got.c;
          nurse.cropP += got.p;
          feedFromCrop(sim, nurse, -1, got.c, got.p);
        } else if (o.feedQueen && (q.queen.gut.c < 0.3 || q.queen.gut.p < 0.4)) {
          const got = withdraw(col, Math.max(0, 0.3 - q.queen.gut.c), Math.max(0, 0.4 - q.queen.gut.p), 'transit');
          nurse.cropC += got.c;
          nurse.cropP += got.p;
          feedFromCrop(sim, nurse, -1, got.c, got.p);
        }
      }
      // Whatever the virtual nurse could not hand over goes back to the pool.
      if (nurse && nurse.cropC + nurse.cropP > 0) {
        const back = deposit(col, nurse.cropC, nurse.cropP, 0, 'transit-return');
        nurse.cropC -= back.c;
        nurse.cropP -= back.p;
      }
      if (o.lay && q && sim.state.tick >= nextLay && canLay(sim, q)) {
        layEgg(sim, q);
        nextLay = sim.state.tick + secondsToTicks(LAY_EGG_S);
      }
      if (o.haul !== false) for (const it of sim.stores.items.list) if (it.alive && it.kind === 'waste') removeItem(sim, it.id, 'test-haul');
      if (o.cannibalise && nurse) {
        const v = nextCannibalVictim(sim, col.id);
        if (v) cannibaliseBrood(sim, nurse.id, v.id);
      }
    },
  };
}
