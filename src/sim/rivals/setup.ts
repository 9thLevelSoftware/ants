// The real nest of a rival colony (GDD 05 §3.4): carved through the nest module's template layout, the queen(s)
// in the royal chamber, and the display brood in the nursery (min(24, ceil(B / 10)) real items standing for the
// abstract brood B). Built on the first rivals tick (the New Game context has no Sim) and for new foundations.

import type { Vec3 } from '@/core/math/vec3';
import { rngFloat, rngRange } from '@/core/rng';
import type { Ant, Brood, BroodStage, Chamber, Nest, RivalSite, Sim, SpeciesId } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { getSpecies } from '@/sim/species';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import { spawnAnt, spawnBrood } from '@/sim/entities';
import { carveTemplateNest, createPlan, instantCarvePlan } from '@/sim/nest';
import { walkerPlace } from '@/sim/locomotion/walker';
import {
  AGENT_THINK_TICKS, BROOD_DISPLAY_MAX, ENTRANCE_N_STEPS, ENTRANCE_SEARCH_BU, EXTRA_ENTRANCE_BU, EXTRA_ENTRANCE_SPACING_BU, SITE_CLEAR_BU, SITE_DIG_MIN, BROOD_DISPLAY_PER, DISPLAY_LARVA_SHARE, DISPLAY_PROGRESS, DISPLAY_PUPA_SHARE,
  NEST_GENERAL_DEPTHS_BU, NEST_GENERAL_PER_N0, NEST_NURSERY_DEPTH_BU,
} from '@/sim/balance/rivals';
import { createRivalColony } from './init';
import { BB, colExt, JOB, type RivalColony } from './state';

/** The colony's main nest. */
export function homeNest(sim: Sim, col: { nestIds: number[] }): Nest | undefined {
  for (const id of col.nestIds) {
    const n = sim.stores.nests.get(id);
    if (n) return n;
  }
  return undefined;
}

/** Royal, nursery and deepest chamber of a nest (fallbacks: the first / deepest chamber). */
export function chambersOf(nest: Nest): { royal: Chamber | undefined; nursery: Chamber | undefined; deepest: Chamber | undefined } {
  let deepest: Chamber | undefined;
  for (const c of nest.chambers) if (!deepest || c.center.y < deepest.center.y) deepest = c;
  const royal = nest.chambers.find((c) => c.type === 'royal') ?? nest.chambers[0];
  const nursery = nest.chambers.find((c) => c.type === 'nursery') ?? royal;
  return { royal, nursery, deepest };
}

/** Floor point of a chamber with a horizontal offset (fractions of its radii), mm. */
export function chamberFloor(ch: Chamber, fx = 0, fz = 0): Vec3 {
  return { x: ch.center.x + fx * ch.radii.x, y: ch.center.y - 0.6 * ch.radii.y, z: ch.center.z + fz * ch.radii.z };
}

/**
 * Carves the template nest. The nest module plans chambers for the four playable species only, so a rival-only
 * species is laid out with its profile's playable template species (the colony's species is swapped for the one
 * synchronous call; reported as a seam: the nest module should take a template species).
 */
function carveNest(sim: Sim, col: RivalColony, nest: Nest): void {
  const p = rivalProfile(col.species);
  const generals = Math.min(NEST_GENERAL_DEPTHS_BU.length, 1 + Math.floor(p.n0 / NEST_GENERAL_PER_N0));
  const chambers = col.rival.incipient ? [] : [
    { type: 'nursery' as const, size: 'm' as const, depthBu: NEST_NURSERY_DEPTH_BU },
    ...NEST_GENERAL_DEPTHS_BU.slice(0, generals).map((d) => ({ type: 'general' as const, size: 's' as const, depthBu: d })),
  ];
  asTemplateSpecies(col, () => {
    carveTemplateNest(sim, nest.id, { chambers, royal: true });
    if (nest.entrances.length === 0) openEntrance(sim, nest);
  });
}

/** Runs a nest-module call with a rival-only species swapped for its profile's playable template species. */
function asTemplateSpecies<T>(col: RivalColony, fn: () => T): T {
  const species = col.species;
  if (!getSpecies(species)) col.species = rivalProfile(species).templateSpecies;
  try {
    return fn();
  } finally {
    col.species = species;
  }
}

/** Entrances a rival nest has for N workers: 1 + [N >= 300] + [N >= 800] (GDD 05 §3.4). */
export function entranceTierOf(n: number): number {
  return 1 + ENTRANCE_N_STEPS.filter((s) => n >= s).length;
}

/**
 * One more entrance: a tunnel from a chamber (shallowest first) up to free ground 10-18 BU away, at least
 * EXTRA_ENTRANCE_SPACING_BU from the other entrances (a nest-module plan, carved at once). False when none fits.
 */
export function addEntrance(sim: Sim, col: RivalColony, nest: Nest): boolean {
  const bu = sim.world.bu, before = nest.entrances.length;
  const anchors = [...nest.chambers].sort((a, b) => b.center.y - a.center.y || a.id - b.id);
  return asTemplateSpecies(col, () => {
    for (const ch of anchors) {
      for (const r of EXTRA_ENTRANCE_BU) {
        for (let k = 0; k < 8; k++) {
          const a = ((k + 0.5) / 8) * Math.PI * 2;
          const x = ch.center.x + Math.cos(a) * r * bu, z = ch.center.z + Math.sin(a) * r * bu;
          const g = { x, y: sim.field.height(x, z), z };
          if (sim.navGrid.blocked(x, z) || sim.field.primAt(g, 2 * bu)) continue;
          if (nest.entrances.some((e) => Math.hypot(e.pos.x - x, e.pos.z - z) < EXTRA_ENTRANCE_SPACING_BU * bu)) continue;
          const id = createPlan(sim, {
            nestId: nest.id, kind: 'entrance', anchor: { pos: { ...ch.center }, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: g,
            priority: 'normal', confirmWarnings: true,
          }, 'worldgen');
          if (id < 0) continue;
          instantCarvePlan(sim, id);
          if (nest.entrances.length > before) return true;
        }
      }
    }
    return false;
  });
}

/** Carves entrances up to the tier of the colony's N (setup and hourly; each tier once, even if none fits). */
export function growEntrances(sim: Sim, col: RivalColony): void {
  const ext = colExt(sim.state, col.id);
  const nest = homeNest(sim, col);
  if (!ext.setupDone || !nest || ext.destroyedTick >= 0) return;
  const want = entranceTierOf(col.rival.n);
  const have = ext.entranceTier ?? 1;
  if (want <= have) return;
  for (let t = have; t < want; t++) addEntrance(sim, col, nest);
  ext.entranceTier = want;
}

/** Open, diggable ground for the shaft: the site itself, else the nearest such point around it (a site under a stone). */
function diggableSite(sim: Sim, o: Vec3, species: SpeciesId): Vec3 {
  const bu = sim.world.bu;
  const ok = (x: number, z: number): Vec3 | null => {
    const g = { x, y: sim.field.height(x, z), z };
    if (sim.navGrid.blocked(x, z) || sim.field.primAt(g, SITE_CLEAR_BU * bu)) return null;
    return sim.field.diggability({ x, y: g.y - bu, z }, species) >= SITE_DIG_MIN ? g : null;
  };
  const here = ok(o.x, o.z);
  if (here) return here;
  for (const r of ENTRANCE_SEARCH_BU) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const p = ok(o.x + Math.cos(a) * r * bu, o.z + Math.sin(a) * r * bu);
      if (p) return p;
    }
  }
  return o;
}

/**
 * A nest under cover (stone, slab, turf mound) whose shaft did not break the open ground gets an entrance tunnel
 * to the nearest free ground beside it (a plan of the nest module, carved at once).
 */
function openEntrance(sim: Sim, nest: Nest): void {
  const bu = sim.world.bu, o = nest.origin;
  for (const r of ENTRANCE_SEARCH_BU) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = o.x + Math.cos(a) * r * bu, z = o.z + Math.sin(a) * r * bu;
      const g = { x, y: sim.field.height(x, z), z };
      if (sim.navGrid.blocked(x, z) || sim.field.primAt(g, 2 * bu)) continue;
      const id = createPlan(sim, {
        nestId: nest.id, kind: 'entrance', anchor: { pos: { ...o }, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: g,
        priority: 'normal', confirmWarnings: true,
      }, 'worldgen');
      if (id < 0) continue;
      instantCarvePlan(sim, id);
      if (nest.entrances.length > 0) return;
    }
  }
}

/** Places a walker on the floor below a point (traced down); false when there is no floor. */
export function placeOnFloor(sim: Sim, ant: Ant, p: Vec3, heading?: Vec3): boolean {
  return walkerPlace(sim.field, ant, p, { dir: { x: 0, y: -1, z: 0 }, heading }, sim.kernel.walker);
}

function spawnQueen(sim: Sim, col: RivalColony, nest: Nest, royal: Chamber, i: number): Ant {
  const rng = sim.stream('rng.rivals');
  const at = chamberFloor(royal, rngRange(rng, -0.3, 0.3), rngRange(rng, -0.3, 0.3));
  // an incipient colony's queen is still the founding queen (founding stats), without the player's FOUNDING flag
  const q = spawnAnt(sim, {
    colony: col.id, caste: 'queen', pos: at, task: 'raid', nestId: nest.id, chamberId: royal.id, ageGd: 30,
    founding: col.rival.incipient,
  });
  q.flags &= ~AntFlag.FOUNDING;
  placeOnFloor(sim, q, { x: at.x, y: royal.center.y, z: at.z });
  q.bb[BB.job] = JOB.queen;
  q.bb[BB.t0] = sim.state.tick;
  q.thinkTick = sim.state.tick + ((q.id + i) % AGENT_THINK_TICKS);
  col.queens.push({ antId: q.id, lifespanDays: null });
  if (col.queenId < 0) col.queenId = q.id;
  return q;
}

/** Display brood target: min(24, ceil(B / 10)) (0 when B is 0). */
export function displayTarget(b: number): number {
  return b <= 0 ? 0 : Math.min(BROOD_DISPLAY_MAX, Math.ceil(b / BROOD_DISPLAY_PER));
}

/** The colony's display brood lying in its own nest (not carried). */
export function displayBrood(sim: Sim, col: RivalColony, nest: Nest): Brood[] {
  const out: Brood[] = [];
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === col.id && b.carriedBy < 0 && b.nestId === nest.id) out.push(b);
  return out;
}

function drawStage(u: number): BroodStage {
  return u < DISPLAY_PUPA_SHARE ? 'pupa' : u < DISPLAY_PUPA_SHARE + DISPLAY_LARVA_SHARE ? 'larva' : 'egg';
}

/** Brings the display brood to its target count: new items in the nursery, surplus removed (no death event). */
export function syncDisplayBrood(sim: Sim, col: RivalColony): void {
  const nest = homeNest(sim, col);
  const ch = nest ? chambersOf(nest).nursery : undefined;
  if (!nest || !ch) return;
  const have = displayBrood(sim, col, nest);
  const want = displayTarget(col.rival.b);
  const rng = sim.stream('rng.rivals');
  for (let i = have.length; i < want; i++) {
    const pos = chamberFloor(ch, rngRange(rng, -0.5, 0.5), rngRange(rng, -0.5, 0.5));
    spawnBrood(sim, {
      colony: col.id, stage: drawStage(rngFloat(rng)), destined: 'worker', pos, nestId: nest.id, chamberId: ch.id,
      init: { progress: rngRange(rng, DISPLAY_PROGRESS[0], DISPLAY_PROGRESS[1]) },
    });
  }
  for (let i = have.length - 1; i >= want; i--) removeBroodQuietly(sim, have[i], 'absorbed');
}

/** Removes a brood item without a death (display brood folded back into B, or adopted by its new colony). */
export function removeBroodQuietly(sim: Sim, b: Brood, cause: string): void {
  if (!sim.stores.brood.markDead(b.id)) return;
  sim.emit({ type: 'entity-removed', entity: 'brood', id: b.id, cause });
}

/** Builds the real nest of a colony created by createRivalColony (once); `announce` emits `rival-founded`. */
export function setupRivalNest(sim: Sim, col: RivalColony, announce = false): void {
  const ext = colExt(sim.state, col.id);
  if (ext.setupDone) return;
  ext.setupDone = true;
  const nest = homeNest(sim, col);
  if (!nest) return;
  nest.origin = diggableSite(sim, nest.origin, rivalProfile(col.species).templateSpecies);
  carveNest(sim, col, nest);
  nest.architect.mode = 'off'; // rival nests never auto-expand (GDD 05 §3.4) beyond the entrance rule
  ext.entranceTier = 1;
  growEntrances(sim, col);
  const { royal } = chambersOf(nest);
  if (!royal) return;
  const queens = col.rival.incipient ? 1 : rivalProfile(col.species).queens;
  for (let i = 0; i < queens; i++) spawnQueen(sim, col, nest, royal, i);
  syncDisplayBrood(sim, col);
  if (announce) sim.emit({ type: 'rival-founded', colonyId: col.id, species: col.species, pos: { ...nest.origin } });
}

/** Creates and builds a rival colony at a site during play (new foundations, tests). */
export function addRivalColony(sim: Sim, site: RivalSite): RivalColony | null {
  const col = createRivalColony(sim, site, sim.world.bu);
  if (!col || !col.rival) return null;
  setupRivalNest(sim, col as RivalColony, true);
  return col as RivalColony;
}
