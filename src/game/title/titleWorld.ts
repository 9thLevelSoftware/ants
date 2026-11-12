// The title screen's backdrop vignette (GDD 08 §3.3): a small, pre-seeded, hand-laid patch of ground where a lawn
// meets a woodland edge (grass on one side, fallen leaves, pebbles and mulch on the other, a few stones), with three
// idle workers in it. Built in milliseconds from the sim's test-world builder (no world generation), deterministic,
// and never ticked: the title shows a calm still life with a slow camera drift.
import { rngFork, rngRange } from '@/core/rng';
import { fbm2 } from '@/core/math/noise';
import type { Primitive, Sim, WorldData, WorldObject, ZoneType, ZoneVariant } from '@/sim/types';
import { materialCode, PrimFlag, type MaterialId } from '@/sim/types';
import { spawnAnt } from '@/sim/entities';
import { walkerPlace } from '@/sim/locomotion/walker';
import { makeTestSim } from '@/sim/testing';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { requireSpecies } from '@/sim/species';
import { defaultWorldParams } from '@/worldgen';

/** GDD 08 §3.3 TITLE_SEED (presentation only: the vignette's relief, stones and ant poses). */
export const TITLE_SEED = 0x7a11e;
/** Vignette layout, in BU of the reference species (Lasius, 4 mm): edge, lawn / woodland split, the ants' spot. */
export const TITLE_LAYOUT = {
  sizeBu: 256,
  /** The woodland edge runs along x = this (lawn below, forest above). */
  forestFromBu: 150,
  /** Where the three ants stand (centre of the frame), BU. */
  antsAtBu: { x: 160, z: 128 },
  antSpreadBu: 7,
  ants: 3,
  /** Relief: gentle undulation, BU amplitude and feature size. */
  reliefBu: 1.5,
  reliefScaleBu: 50,
  /** Stones: count and radius range, BU. */
  stones: 6,
  stoneRadiusBu: [2.5, 6] as const,
} as const;

const SPECIES = 'lasius-niger' as const;
/** The vignette's moment: calendar tick of summer day 3, 17:30 (warm low sun; 6000 ticks per game day). */
export const TITLE_CALENDAR_TICK = 9 * 6000 + Math.round((17.5 / 24) * 6000);

function zoneOf(xBu: number): { type: ZoneType; variant: ZoneVariant | null; mat: MaterialId } {
  return xBu >= TITLE_LAYOUT.forestFromBu ? { type: 'forest', variant: 'deciduous', mat: 'humus' } : { type: 'lawn', variant: 'mown', mat: 'loam' };
}

function stones(bu: number, height: (x: number, z: number) => number): Primitive[] {
  const L = TITLE_LAYOUT, rng = rngFork(TITLE_SEED, 'title-stones');
  const out: Primitive[] = [];
  for (let i = 0; i < L.stones; i++) {
    const a = rngRange(rng, 0, Math.PI * 2), d = rngRange(rng, 18, 70) * bu;
    const x = L.antsAtBu.x * bu + Math.cos(a) * d, z = L.antsAtBu.z * bu + Math.sin(a) * d;
    const r = rngRange(rng, L.stoneRadiusBu[0], L.stoneRadiusBu[1]) * bu;
    const yaw = rngRange(rng, 0, Math.PI);
    out.push({
      id: i + 1, shape: 'ellipsoid', pos: { x, y: height(x, z) - r * 0.15, z }, rot: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
      size: { x: r, y: r * rngRange(rng, 0.4, 0.6), z: r * rngRange(rng, 0.6, 0.9) }, round: 0, material: 'stone',
      flags: PrimFlag.CLIMBABLE | PrimFlag.SHELTER, objectId: -1,
    });
  }
  return out;
}

/** A tree just beyond the woodland edge of the vignette: its leaves fall on both zones (decor fringe). */
function treeBeyondEdge(size: number): WorldObject {
  return {
    id: 1, templateId: 'standing-tree', pos: { x: size + 300, y: 0, z: size * 0.55 }, rot: { x: 0, y: 0, z: 0, w: 1 },
    primStart: 0, primCount: 0, tags: [], routeIds: [], poiIds: [],
  };
}

export function makeTitleWorld(): WorldData {
  const L = TITLE_LAYOUT, bu = requireSpecies(SPECIES).buMm, size = L.sizeBu * bu;
  const inv = 1 / (L.reliefScaleBu * bu), amp = L.reliefBu * bu;
  const height = (x: number, z: number) => fbm2(x * inv, z * inv, TITLE_SEED, 3) * amp;
  const params = { ...defaultWorldParams(SPECIES, TITLE_SEED), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  const world = buildWorld({
    params, size, bu, height, prims: stones(bu, height), objects: [treeBeyondEdge(size)],
    // the founding queen the new-game state always contains waits out of shot in a far corner
    queenStart: { pos: { x: 12 * bu, y: height(12 * bu, 12 * bu), z: 12 * bu }, fwd: { x: 1, y: 0, z: 0 } },
  });
  const lawn = zoneOf(0), forest = zoneOf(L.forestFromBu);
  const split = L.forestFromBu * bu;
  world.zones = [
    { id: 0, type: lawn.type, variant: lawn.variant, rects: [[0, 0, split, size]], areaMm2: split * size },
    { id: 1, type: forest.type, variant: forest.variant, rects: [[split, 0, size, size]], areaMm2: (size - split) * size },
  ];
  const zm = world.maps.zone;
  for (let k = 0; k < zm.nz; k++) for (let i = 0; i < zm.nx; i++) zm.data[k * zm.nx + i] = (i + 0.5) * zm.cell >= split ? 1 : 0;
  const g = world.ground.surface;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) g.data[k * g.nx + i] = materialCode(zoneOf(((i + 0.5) * g.cell) / bu).mat);
  return world;
}

/** The vignette's sim: the world, no systems (never ticked), three idle workers around the ants' spot. */
export function makeTitleSim(): Sim {
  const world = makeTitleWorld();
  const sim = makeTestSim({ world, species: SPECIES, seed: TITLE_SEED, systems: [] });
  // the clock as cheat.setTime moves it (the calendar anchor); the sim never ticks, so nothing else needs settling
  sim.state.env.calendar.startTick = TITLE_CALENDAR_TICK - sim.state.tick;
  const L = TITLE_LAYOUT, bu = world.bu, colony = sim.state.colonies[0];
  const rng = rngFork(TITLE_SEED, 'title-ants');
  for (let i = 0; i < L.ants; i++) {
    const a = (i / L.ants) * Math.PI * 2 + rngRange(rng, -0.4, 0.4), r = rngRange(rng, 0.4, 1) * L.antSpreadBu * bu;
    const x = L.antsAtBu.x * bu + Math.cos(a) * r, z = L.antsAtBu.z * bu + Math.sin(a) * r;
    const h = rngRange(rng, 0, Math.PI * 2);
    const pos = { x, y: sim.field.height(x, z) + 2 * bu, z };
    const ant = spawnAnt(sim, { colony: colony.id, caste: 'worker', pos, fwd: { x: Math.cos(h), y: 0, z: Math.sin(h) }, ageGd: 10 });
    walkerPlace(sim.field, ant, pos, { dir: { x: 0, y: -1, z: 0 } }, sim.kernel.walker);
  }
  return sim;
}

/** Centre of the three ants, mm (the camera's subject). */
export function titleSubject(sim: Sim): { x: number; y: number; z: number } {
  let x = 0, y = 0, z = 0, n = 0;
  for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') { x += a.pos.x; y += a.pos.y; z += a.pos.z; n++; }
  if (n === 0) { const c = sim.world.size / 2; return { x: c, y: sim.field.height(c, c), z: c }; }
  return { x: x / n, y: y / n, z: z / n };
}
