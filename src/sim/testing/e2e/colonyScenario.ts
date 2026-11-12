// Stage 1A end-to-end scenario kit (integration gate): an established colony on a GENERATED world, built only
// through the real modules (nest carveTemplateNest, colony cheats, ecology cheat.spawnFood), plus scripted
// stand-ins for the Stage 1B behaviours (beh-forage, beh-nest) that call the same public functions those
// behaviours will call. Used by src/sim/testing/e2e/*.test.ts and the soak tool (tools/sim/soak.ts --colony).
//
// Determinism: the scripts keep every bit of their state in ant.bb (persisted, numbers only) and read only state,
// so save -> restore -> continue equals an uninterrupted run. Nothing here is production code.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Chamber, Entrance, FoodSource, Nest, Sim, System, Task } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { LAY_EGG_S, TRAIL_DAB } from '@/sim/balance';
import { begin } from '@/sim/ants';
import {
  canLay, feedBrood, larvaRemainingNeed, layEgg, nurseLoadMix, recordDelivery, recordForagerReturn, tendBroodAt, wantsFeed,
  withdrawFood,
} from '@/sim/colony';
import { ecloseBrood } from '@/sim/colony/brood';
import { navStop, navToTarget, placeOnSurface } from '@/sim/locomotion';
import { canDigAt, carveTemplateNest } from '@/sim/nest';
import { discoverSource, footprintMm } from '@/sim/ecology';
import { secondsToTicks } from '@/sim/time';

/** ant.bb keys of the scripts (numbers only). */
export const SB = { phase: 'sc.phase', source: 'sc.src', trips: 'sc.trips', quiet: 'sc.quiet' } as const;

/** Forager phases. */
const GO = 0, DRINK = 1, HOME = 2;

export interface ColonyScenario {
  nest: Nest;
  entrance: Entrance;
  royal: Chamber;
  food: Chamber;
  source: FoodSource;
}

export interface ColonyScenarioOptions {
  workers?: number;
  /** Brood cheat-spawned into the royal chamber. */
  eggs?: number;
  larvae?: number;
  pupae?: number;
  /** Food source distance from the entrance, BU (default 40). */
  sourceDistBu?: number;
  /** Source size, loads (default 400). */
  sourceUnits?: number;
  /** Starting stores, loads C / P (default 20 / 20). */
  stores?: { c: number; p: number };
}

/** A diggable, nav-passable surface point 'minBu'..'maxBu' from `from` (ring search, deterministic), or null. */
export function findDigSite(sim: Sim, ant: Ant, from: Vec3, minBu: number, maxBu: number): Vec3 | null {
  const bu = sim.world.bu;
  for (let r = minBu; r <= maxBu; r += 4) {
    for (let a = 0; a < 16; a++) {
      const x = from.x + Math.cos((a / 16) * 2 * Math.PI) * r * bu, z = from.z + Math.sin((a / 16) * 2 * Math.PI) * r * bu;
      const g = sim.field.height(x, z);
      const below = { x, y: g - 1.5 * bu, z };
      if (sim.navGrid.blocked(x, z) || sim.field.diggability(below, sim.species.id) < 0.8) continue;
      if (!canDigAt(sim, ant, below)) continue;
      // keep clear of primitives (stones, kerbs) around the shaft
      if (sim.field.primAt({ x, y: g, z }, 6 * bu)) continue;
      return { x, y: g, z };
    }
  }
  return null;
}

/**
 * Builds an established colony around the generated world's queen start: a template nest (founding shaft and cell
 * as the royal chamber plus the template chambers, GDD 03 §15) carved by the nest module, the queen established in
 * the royal chamber, workers and brood cheat-spawned, one sugar spill cheat-spawned on the surface. Commands are
 * applied at once (one commands pass, no other system).
 */
export function setupColonyScenario(sim: Sim, o: ColonyScenarioOptions = {}): ColonyScenario {
  const { state } = sim;
  const bu = sim.world.bu;
  const col = state.colonies[0];
  const queen = sim.stores.ants.get(col.queenId)!;
  const site = findDigSite(sim, queen, queen.pos, 12, 120);
  if (!site) throw new Error('setupColonyScenario: no diggable nest site near the queen start');
  const nest = sim.stores.nests.get(col.nestIds[0])!;
  nest.origin = { ...site };
  const { chambers } = carveTemplateNest(sim, nest.id);
  const royal = chambers.find((c) => c.type === 'royal') ?? chambers[0];
  const food = chambers.find((c) => c.type === 'food') ?? royal;
  const entrance = nest.entrances[0];
  if (!royal || !entrance) throw new Error('setupColonyScenario: the template nest has no chamber or entrance');
  establishQueen(sim, queen, royal);

  // a sugar spill on open ground at the given distance from the entrance (first passable direction)
  const dist = (o.sourceDistBu ?? 40) * bu;
  let spot: Vec3 | null = null;
  for (let a = 0; a < 16 && !spot; a++) {
    const x = entrance.pos.x + Math.cos((a / 16) * 2 * Math.PI) * dist, z = entrance.pos.z + Math.sin((a / 16) * 2 * Math.PI) * dist;
    if (!sim.navGrid.blocked(x, z) && !sim.field.primAt({ x, y: sim.field.height(x, z), z }, 3 * bu)) spot = { x, y: sim.field.height(x, z), z };
  }
  if (!spot) throw new Error('setupColonyScenario: no open ground for the food source');
  const before = state.sources.length;
  sim.enqueue({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: spot, units: o.sourceUnits ?? 400, stage: null });
  const stores = o.stores ?? { c: 20, p: 20 };
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: stores.c, p: stores.p, toxin: 0 });
  if ((o.workers ?? 0) > 0) {
    sim.enqueue({ type: 'cheat.spawnAnts', colonyId: col.id, n: o.workers!, caste: 'worker', ageGd: 8, task: null, pos: { ...entrance.pos } });
  }
  for (const [stage, n] of [['egg', o.eggs ?? 0], ['larva', o.larvae ?? 0], ['pupa', o.pupae ?? 0]] as const) {
    if (n > 0) sim.enqueue({ type: 'cheat.spawnBrood', colonyId: col.id, n, stage, destined: 'worker', chamberId: royal.id, progress: 0.2 });
  }
  sim.applyPendingCommands();
  const source = state.sources[before];
  if (!source) throw new Error('setupColonyScenario: cheat.spawnFood made no source');
  return { nest, entrance, royal, food, source };
}

/** The founding queen becomes an established queen standing on the royal chamber floor (stand-in for founding). */
function establishQueen(sim: Sim, q: Ant, royal: Chamber): void {
  const qs = q.queen!;
  qs.founding = null;
  qs.mode = 'established';
  qs.fecundity = 1;
  q.flags &= ~AntFlag.FOUNDING;
  const floor = { x: royal.center.x, y: royal.center.y - royal.radii.y * 0.5, z: royal.center.z };
  if (!placeOnSurface(sim, q, floor)) throw new Error('establishQueen: no floor in the royal chamber');
}

// ---- scripted behaviours (stand-ins for beh-forage / beh-nest) ----

/** Source the colony's foragers use: the first alive source (the scenario has one). */
function scenarioSource(sim: Sim): FoodSource | undefined {
  for (const s of sim.stores.sources.list) if (s.alive && s.units > 0) return s;
  return undefined;
}

function foodChamber(sim: Sim, ant: Ant): { nest: Nest; chamber: Chamber } | null {
  const col = sim.stores.colonies.get(ant.colony);
  const nest = col ? sim.stores.nests.get(col.nestIds[0]) : undefined;
  if (!nest || nest.chambers.length === 0) return null;
  return { nest, chamber: nest.chambers.find((c) => c.type === 'food') ?? nest.chambers[0] };
}

/**
 * Forager loop: walk to the source (locomotion), drink with the `harvest-liquid` action primitive, walk home to
 * the food chamber laying trail dabs on the surface (GDD 02 §8.3), unload with colony.recordDelivery.
 */
function forageUpdate(sim: Sim, ant: Ant): void {
  const bb = ant.bb;
  const phase = bb[SB.phase] ?? GO;
  if (phase === GO) {
    const s = scenarioSource(sim);
    if (!s) { navStop(sim, ant); return; }
    bb[SB.source] = s.id;
    const reach = Math.max(1.5 * sim.world.bu, footprintMm(s, sim.world.bu));
    const d = Math.hypot(ant.pos.x - s.pos.x, ant.pos.z - s.pos.z);
    if (d <= reach + sim.world.bu && ant.medium === 'surface') {
      navStop(sim, ant);
      discoverSource(sim, ant.colony, s.id, ant.id); // what beh-forage's perception will do on arrival
      if (begin(sim, ant, 'harvest-liquid', { kind: 'source', id: s.id, pos: s.pos })) bb[SB.phase] = DRINK;
      return;
    }
    if (ant.nav.status !== 'moving') navToTarget(sim, ant, { kind: 'source', id: s.id, pos: s.pos }, reach);
    return;
  }
  if (phase === DRINK) {
    if (ant.action) return;
    bb[SB.phase] = HOME;
    return;
  }
  // HOME
  const home = foodChamber(sim, ant);
  if (!home) return;
  if (ant.medium === 'surface' && ant.nestId < 0 && bb[SB.quiet] !== 1) sim.phero.deposit(ant.colony, 'trail', ant.pos, TRAIL_DAB);
  if (ant.chamberId === home.chamber.id || (ant.nav.status === 'arrived' && ant.nestId === home.nest.id)) {
    navStop(sim, ant);
    const c = ant.cropC, p = ant.cropP;
    const got = recordDelivery(sim, ant, bb[SB.source] ?? -1, 'sugar', c, p);
    ant.cropC = Math.max(0, ant.cropC - got.c);
    ant.cropP = Math.max(0, ant.cropP - got.p);
    recordForagerReturn(sim, ant, got.c + got.p >= 0.5, bb[SB.source] ?? -1);
    bb[SB.trips] = (bb[SB.trips] ?? 0) + 1;
    bb[SB.phase] = GO;
    return;
  }
  if (ant.nav.status !== 'moving') {
    navToTarget(sim, ant, { kind: 'chamber', id: home.chamber.id, pos: home.chamber.center }, 1.5 * sim.world.bu);
  }
}

const forager = (task: Task): Behaviour => ({
  task,
  enter: (_sim, ant) => { ant.bb[SB.phase] = ant.cropC + ant.cropP > 0.5 ? HOME : GO; },
  update: forageUpdate,
  exit: (sim, ant) => navStop(sim, ant),
});

/** Everybody else stays where allocation found them (the default idle behaviour, kept explicit). */
const holder = (task: Task): Behaviour => ({
  task,
  enter: (sim, ant) => navStop(sim, ant),
  update: (sim, ant) => { if (ant.nav.status === 'moving') navStop(sim, ant); },
  exit: () => {},
});

/** Nurses and queen-carers walk to the brood (royal) chamber and stay there (scriptedCareSystem does the care). */
const inNest = (task: Task): Behaviour => ({
  task,
  enter: (sim, ant) => navStop(sim, ant),
  update: (sim, ant) => {
    const col = sim.stores.colonies.get(ant.colony);
    const nest = col ? sim.stores.nests.get(col.nestIds[0]) : undefined;
    const room = nest?.chambers.find((c) => c.type === 'royal') ?? nest?.chambers[0];
    if (!room || ant.chamberId === room.id) { if (ant.nav.status === 'moving') navStop(sim, ant); return; }
    if (ant.nav.status !== 'moving') navToTarget(sim, ant, { kind: 'chamber', id: room.id, pos: room.center }, 2 * sim.world.bu);
  },
  exit: (sim, ant) => navStop(sim, ant),
});

/** Behaviours that do nothing for every task: the test script alone moves the ants (no default navStop). */
export function passiveBehaviours(): Behaviour[] {
  const all: Task[] = ['idle', 'rest', 'nurse', 'queen-care', 'scout', 'forage', 'tend', 'store', 'dig', 'haul', 'guard', 'patrol'];
  return all.map((task) => ({ task, enter: () => {}, update: () => {}, exit: () => {} }));
}

/**
 * Scripted behaviours for every Stage 1A task: forage and scout run the forager loop, nurse and queen-care go to
 * the brood chamber, the rest hold position.
 */
export function scriptedBehaviours(): Behaviour[] {
  const all: Task[] = ['idle', 'rest', 'nurse', 'queen-care', 'scout', 'forage', 'tend', 'store', 'dig', 'haul', 'guard', 'patrol'];
  return all.map((t) => (t === 'forage' || t === 'scout' ? forager(t) : t === 'nurse' || t === 'queen-care' ? inNest(t) : holder(t)));
}

/**
 * Scripted brood care (stand-in for beh-nest nurses and the queen.reside behaviour), stateless so it survives a
 * save: every NURSE_TICKS the colony's nurses feed hungry larvae from the pool (nurseLoadMix -> withdrawFood ->
 * feedBrood), tend the brood around them and help ready pupae eclose; the queen lays whenever canLay allows, on a
 * LAY_EGG_S cadence of the tick counter.
 */
export function scriptedCareSystem(): System {
  const NURSE_TICKS = 50;
  const layTicks = secondsToTicks(LAY_EGG_S);
  return {
    name: 'e2e-care', phase: 'behaviours',
    run(sim) {
      const t = sim.state.tick;
      for (const col of sim.stores.colonies.list) {
        if (!col.alive || !col.isPlayer) continue;
        const q = sim.stores.ants.get(col.queenId);
        if (q && t % layTicks === 0 && canLay(sim, q)) layEgg(sim, q);
        if (t % NURSE_TICKS !== 0) continue;
        const def = sim.getSpecies(col.species) ?? sim.species;
        for (const nurse of sim.stores.ants.list) {
          if (!nurse.alive || nurse.colony !== col.id || nurse.task !== 'nurse' || nurse.nestId < 0) continue;
          tendBroodAt(sim, col.id, nurse.pos, 6 * sim.world.bu);
          for (const b of sim.stores.brood.list) {
            if (!b.alive || b.colony !== col.id) continue;
            if (b.stage === 'pupa') { ecloseBrood(sim, b.id, nurse.id); continue; }
            if (!wantsFeed(b, def)) continue;
            const mix = nurseLoadMix(sim, col.id, Math.min(0.1, larvaRemainingNeed(def, b)));
            const got = withdrawFood(sim, col.id, mix.c, mix.p, 'transit', nurse);
            nurse.cropC += got.c; nurse.cropP += got.p;
            feedBrood(sim, nurse, b.id, got.c, got.p);
            break; // one larva per nurse per round
          }
        }
      }
    },
  };
}
