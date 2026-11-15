// Test support for the plants module (never imported by game code): a test world with herb host plants (a
// climbable stem, a climb route from the ground to the aphid site near its top, the site as a point of interest),
// optional small nest with workers, clock and weather helpers, and a stand-alone herd for unit tests.

import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRoute, GameConfig, Herd, PlantState, Poi, Primitive, Sim, System, WorldData, WorldObject } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { defaultWorldParams } from '@/worldgen';
import { buildWorld, makeTestSim } from '@/sim/testing';
import { requireSpecies } from '@/sim/species';
import { defaultGameConfig } from '@/sim/createGame';
import { spawnPlant } from '@/sim/entities';
import { timeHandlers } from '@/sim/environment';
import { DEFAULT_DAYS_PER_YEAR, ticksPerYear, TICKS_PER_DAY } from '@/sim/time';
import { HOST_APHID, foundHerd } from './hosts';
import { ensureLinks } from './links';
import { ports } from './ports';

export interface HerbSpec {
  /** Offset from the world centre, BU. */
  dx: number;
  dz: number;
  /** Stem height above the ground, BU (default 12). */
  heightBu?: number;
}

const STEM_R_BU = 0.6;
const ROUTE_STEP_BU = 3;
/** The aphid site sits this far below the stem top, BU. */
const SITE_BELOW_TOP_BU = 2;

export interface HerbWorld {
  world: WorldData;
  /** Herb object ids, in spec order, and their aphid-site points. */
  objectIds: number[];
  sites: Vec3[];
}

/** A flat lawn world (size BU) with herb host plants. */
export function herbWorld(sizeBu: number, herbs: HerbSpec[], seed = 1): HerbWorld {
  const bu = requireSpecies('lasius-niger').buMm;
  const size = sizeBu * bu;
  const prims: Primitive[] = [], objects: WorldObject[] = [], routes: ClimbRoute[] = [], pois: Poi[] = [];
  const objectIds: number[] = [], sites: Vec3[] = [];
  let id = 1;
  for (const hs of herbs) {
    const x = size / 2 + hs.dx * bu, z = size / 2 + hs.dz * bu;
    const hBu = hs.heightBu ?? 12;
    const objectId = id++, primId = id++, routeId = id++, poiId = id++;
    const half = ((hBu + 1) * bu) / 2;
    prims.push({
      id: primId, shape: 'capsule', pos: { x, y: -bu + half, z }, rot: { x: 0, y: 0, z: 0, w: 1 },
      size: { x: STEM_R_BU * bu, y: half - STEM_R_BU * bu, z: 0 }, round: 0, material: 'plant', flags: PrimFlag.CLIMBABLE, objectId,
    });
    const sx = x - STEM_R_BU * bu, top = (hBu - SITE_BELOW_TOP_BU) * bu;
    const pts: Vec3[] = [];
    for (let y = 0; y < top; y += ROUTE_STEP_BU * bu) pts.push({ x: sx, y, z });
    pts.push({ x: sx, y: top, z });
    routes.push({ id: routeId, kind: 'stem', objectId, points: pts, lengthBu: top / bu } as ClimbRoute);
    const site = { x: sx, y: top, z };
    pois.push({ id: poiId, kind: 'aphid-site', pos: site, objectId });
    objects.push({
      id: objectId, templateId: 'test-herb', pos: { x, y: 0, z }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: prims.length - 1,
      primCount: 1, tags: ['plant'], routeIds: [routeId], poiIds: [poiId],
    });
    objectIds.push(objectId);
    sites.push(site);
  }
  const params = { ...defaultWorldParams('lasius-niger', seed), sizeClass: 'compact' as const, rivalCount: 0, incipientCount: 0 };
  const world = buildWorld({ params, size, bu, height: () => 0, prims, objects, climbRoutes: routes });
  world.pois.push(...pois);
  for (const o of objectIds) world.placements.plants.push({ objectId: o, hostFlags: HOST_APHID, hostClass: 'herb', hostPoiIds: undefined });
  return { world, objectIds, sites };
}

export interface PlantSimOptions {
  sizeBu?: number;
  herbs?: HerbSpec[];
  /** Workers in the small nest (0 = no nest). */
  workers?: number;
  seed?: number;
  /** Systems (default: the game's). */
  systems?: readonly System[];
  seasonLengthDays?: 5 | 7 | 10;
}

/** A test sim (cheats on) on a herb world; plant states for every herb (createNewGame makes them from placements). */
export function plantSim(o: PlantSimOptions = {}): { sim: Sim; plants: PlantState[]; sites: Vec3[] } {
  const hw = herbWorld(o.sizeBu ?? 160, o.herbs ?? [{ dx: -30, dz: -20 }], o.seed ?? 1);
  const len = o.seasonLengthDays;
  const sim = makeTestSim({
    world: hw.world, seed: o.seed ?? 1, systems: o.systems, nest: (o.workers ?? 0) > 0 ? 'small' : 'none', workers: o.workers ?? 0,
    config: len ? seasonConfig(o.seed ?? 1, len) : undefined,
  });
  const plants = hw.objectIds.map((oid) => sim.stores.plants.list.find((p) => p.objectId === oid) ?? spawnPlant(sim, oid, 'herb', HOST_APHID));
  return { sim, plants, sites: hw.sites };
}

/** Calendar part of a config with another season length (the start day scaled as the game does). */
function seasonConfig(seed: number, len: 5 | 7 | 10): Partial<GameConfig> {
  const c = defaultGameConfig('lasius-niger', seed, 'naturalist', len);
  return { rules: c.rules, startSeason: c.startSeason, startDayOfSeason: c.startDayOfSeason, startHour: c.startHour };
}

/** A herd on the plant's site with its source and film. */
export function addHerd(sim: Sim, plant: PlantState, aphids: number, init?: Partial<Herd>): Herd {
  const h = foundHerd(sim, plant, 0, aphids, 'aphid', init);
  ensureLinks(sim, h);
  return h;
}

/** Sets the calendar to default-year day d28 (0-based fractional) at this sim's season length. */
export function setD28(sim: Sim, d28: number): void {
  const tick = Math.round((d28 / DEFAULT_DAYS_PER_YEAR) * ticksPerYear(sim.state.config));
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick });
}

/** Calendar tick of default-year day d28 for this sim (absolute, not relative to now). */
export function ticksPerD28(sim: Sim): number {
  return ticksPerYear(sim.state.config) / DEFAULT_DAYS_PER_YEAR;
}

/** Fixes the air temperature (°C) and dryness the plants read; returns a restore function. */
export function fixWeather(airC: number, rain = 0): () => void {
  const saved = { airTemp: ports.airTemp, isRaining: ports.isRaining, rainIntensityAt: ports.rainIntensityAt };
  ports.airTemp = () => airC;
  ports.isRaining = () => rain > 0;
  ports.rainIntensityAt = () => rain;
  return () => Object.assign(ports, saved);
}

export function stepTicks(sim: Sim, n: number): void {
  for (let i = 0; i < n; i++) sim.tick();
}

export const GD = TICKS_PER_DAY;
