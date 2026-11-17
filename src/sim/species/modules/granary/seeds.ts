// Seed sources for a granary colony (GDD 07 §6.3.1, GDD 05 grass-seed nodes). Worldgen places `grass-seed` anchors
// at the seed sites of plants but leaves them empty ("per granary module"). This module keeps a list of seed sites
// (those anchors plus ground patches in open ground around the nest) and stocks each with a seed node of one class
// (S, M or L: size-matched carrying) and hardness. GDD 05's window (doy 10-20) is the seed rain: while it lasts
// the ecology refills the nodes (refillPerGd); outside it the nodes are out of season, and an emptied node is
// retired by the ecology and set up again at its site the next time the window opens.

import { rngInt, rngRange } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Colony, FoodSource, GranaryModule, SeedClass, SeedSite, Sim, System } from '@/sim/types';
import { SEED_CLASSES } from '@/sim/types';
import { createSource } from '@/sim/ecology/sources/spawn';
import { isInSeason } from '@/sim/ecology/sources/season';
import { odourFromRadiusBu } from '@/sim/ecology/sources/def';
import {
  SEED_BANK_START, SEED_BULK, SEED_CLASS_SHARE, SEED_HARDNESS, SEED_NODE_UNITS, SEED_ODOUR_BU, SEED_QUALITY,
  SEED_RAIN_PER_GD, SEED_SLOTS, SEED_SOURCE_STEP_TICKS, SEED_PATCHES, SEED_PATCH_RADIUS_BU, SEED_HEADS_PER_PLANT,
} from '@/sim/balance/species-harvester';
import { TICKS_PER_DAY } from '@/sim/time';
import { granaryColonies } from './economy';
import { nutrientsPerSeedLoad, type GranaryParams } from './params';
import { loadsOfClass } from './cohorts';

/** Seed class of a site by a share table and a 0..1 draw. */
function classOfDraw(x: number): SeedClass {
  let acc = 0;
  for (const c of SEED_CLASSES) {
    acc += SEED_CLASS_SHARE[c];
    if (x < acc) return c;
  }
  return 'S';
}

function newSite(sim: Sim, pos: Vec3, up: Vec3, anchorId: number, objectId: number): SeedSite {
  const rng = sim.stream('rng.ecology');
  const seedClass = classOfDraw(rngRange(rng, 0, 1));
  const [h0, h1] = SEED_HARDNESS[seedClass];
  return {
    pos: { x: pos.x, y: pos.y, z: pos.z }, up: { x: up.x, y: up.y, z: up.z }, seedClass, hardness: rngRange(rng, h0, h1),
    anchorId, objectId, capacity: rngInt(rng, SEED_NODE_UNITS[0], SEED_NODE_UNITS[1]), sourceId: -1,
    seedHeads: objectId >= 0 ? SEED_HEADS_PER_PLANT : 0,
  };
}

/** A ground seed patch at p (a midden plant, a test patch). */
export function newPatchSite(sim: Sim, p: Vec3): SeedSite {
  return newSite(sim, p, { x: 0, y: 1, z: 0 }, -1, -1);
}

/** The colony's main nest origin (or the queen's start). */
function homeOf(sim: Sim, col: Colony): Vec3 {
  const n = sim.stores.nests.get(col.nestIds[0] ?? -1);
  return n ? n.origin : sim.world.queenStart.pos;
}

/** A ground point for a seed patch: open, natural ground (not interior, not blocked for walking), or null. */
function groundPoint(sim: Sim, x: number, z: number): Vec3 | null {
  const w = sim.world;
  if (x < w.bu * 4 || z < w.bu * 4 || x > w.size - w.bu * 4 || z > w.size - w.bu * 4) return null;
  if (sim.navGrid.blocked(x, z)) return null;
  const m = w.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : 0;
  const zone = w.zones.find((zd) => zd.id === id)?.type;
  if (zone === 'interior' || zone === 'asphalt' || zone === 'pavement') return null;
  return { x, y: sim.field.height(x, z), z };
}

/** Builds the site list once: grass-seed anchors, then SEED_PATCHES ground patches around the nest. */
export function initSeedSites(sim: Sim, col: Colony, mod: GranaryModule): SeedSite[] {
  const sites: SeedSite[] = [];
  for (const a of sim.world.placements.foodAnchors) {
    if (a.kind === 'seed' && a.initialState.startsWith('grass-seed')) sites.push(newSite(sim, a.pos, a.up, a.id, a.hostObjectId));
  }
  const home = homeOf(sim, col);
  const rng = sim.stream('rng.ecology');
  const bu = sim.world.bu;
  for (let i = 0, tries = 0; i < SEED_PATCHES && tries < SEED_PATCHES * 8; tries++) {
    const ang = rngRange(rng, 0, Math.PI * 2);
    const r = rngRange(rng, SEED_PATCH_RADIUS_BU[0], SEED_PATCH_RADIUS_BU[1]) * bu;
    const p = groundPoint(sim, home.x + Math.cos(ang) * r, home.z + Math.sin(ang) * r);
    if (!p) continue;
    sites.push(newSite(sim, p, { x: 0, y: 1, z: 0 }, -1, -1));
    i++;
  }
  mod.seedSites = sites;
  return sites;
}

/** Writes the site's seed class onto a source record (bulk, nutrients, hardness, odour, refill). */
export function configureSeedSource(s: FoodSource, site: SeedSite, g: GranaryParams): void {
  const per = nutrientsPerSeedLoad(g);
  const loads = loadsOfClass(g, site.seedClass);
  s.unitBulk = SEED_BULK[site.seedClass];
  s.c = loads * per.c;
  s.p = loads * per.p;
  s.hardness = site.hardness;
  s.quality = SEED_QUALITY;
  s.odour = odourFromRadiusBu(SEED_ODOUR_BU);
  s.slots = SEED_SLOTS;
  s.capacity = site.capacity;
  s.refillPerGd = site.capacity * SEED_RAIN_PER_GD;
  s.decayPerGd = 0;
}

/** The live source of a site, or undefined (retired by the ecology). */
function liveSource(sim: Sim, site: SeedSite): FoodSource | undefined {
  const s = site.sourceId >= 0 ? sim.stores.sources.get(site.sourceId) : undefined;
  return s && s.alive ? s : undefined;
}

/** Adopts the worldgen's empty source at an anchor site, if there is one. */
function adoptAnchorSource(sim: Sim, site: SeedSite): FoodSource | undefined {
  if (site.anchorId < 0) return undefined;
  for (const s of sim.stores.sources.list) if (s.alive && s.anchorId === site.anchorId && s.variant === 'grass-seed') return s;
  return undefined;
}

/**
 * Keeps one site stocked: an existing node keeps its class data; a missing one is set up (adopting the empty
 * worldgen node at an anchor) while the seed rain is on. `startFill` is the share of capacity a new node starts with.
 */
function refreshSite(sim: Sim, site: SeedSite, g: GranaryParams, startFill: number): void {
  let s = liveSource(sim, site);
  if (s) { configureSeedSource(s, site, g); return; }
  s = adoptAnchorSource(sim, site);
  if (!s) {
    s = createSource(sim, {
      variant: 'grass-seed', pos: site.pos, up: { x: site.up.x, y: site.up.y, z: site.up.z }, units: 1, objectId: site.objectId,
      anchorId: site.anchorId,
    });
  }
  configureSeedSource(s, site, g);
  if (!isInSeason(sim, s)) { site.sourceId = s.id; return; }
  s.units = Math.max(1, Math.round(site.capacity * startFill));
  site.sourceId = s.id;
}

/** Refreshes every site of the colony; on a new game day in the window the plants grow seed heads again. */
export function refreshSeedSites(sim: Sim, col: Colony, g: GranaryParams): void {
  const mod = col.granary!;
  const first = !mod.seedSites;
  const sites = mod.seedSites ?? initSeedSites(sim, col, mod);
  const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
  const newDay = mod.seedDay !== day;
  for (const site of sites) {
    refreshSite(sim, site, g, first ? SEED_BANK_START : SEED_RAIN_PER_GD);
    const s = liveSource(sim, site);
    if (newDay && s && isInSeason(sim, s) && site.objectId >= 0) site.seedHeads = SEED_HEADS_PER_PLANT;
  }
  mod.seedDay = day;
}

/** The seed site of a source id, or undefined. */
export function siteOfSource(mod: GranaryModule, sourceId: number): SeedSite | undefined {
  return mod.seedSites?.find((s) => s.sourceId === sourceId);
}

export const seedSourceSystem: System = {
  name: 'granary-seed-sources', phase: 'ecology', every: SEED_SOURCE_STEP_TICKS,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) if (col.isPlayer) refreshSeedSites(sim, col, g);
  },
};
