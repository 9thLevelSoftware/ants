// Leaf sites of a leafcutter colony (GDD 05: `leaf` sources are owned by this module; GDD 07 §6.4.5): the plant
// objects within LEAF_SITE_RANGE_BU of the nest, plus HERB_PATCHES patches of herbage (grass and clover) in the
// natural ground around it. Each site has the plant's leaf quality, protein fraction and toxin (by plant kind with a
// per-object jitter), a stock of standing leaf (LU) that cutters take and that regrows (LEAF_REGROW_PER_GD of its
// capacity per game day: a stripped plant recovers and the foraging front moves outward meanwhile). Built once per
// colony (persisted in col.fungus.leafSites). Herbage patches carry plant ids -1000 - index (negative, never -1).

import { hash3i } from '@/core/math/noise';
import { rngRange } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { Colony, LeafSite, Sim, System } from '@/sim/types';
import {
  HERB_PATCH_LU, HERB_PATCH_RING_BU, HERB_PATCHES, LEAF_REGROW_PER_GD, LEAF_SITE_RANGE_BU, LEAF_SITE_STEP_TICKS,
  LEAF_TRAITS, LEAF_TRAIT_JITTER, PLANT_SITE_LU,
} from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';
import { atColonies } from './economy';

/** Plant id of herbage patch i. */
export const herbId = (i: number) => -1000 - i;

/** The colony's home point: its first nest's origin (or the queen's start). */
export function homeOf(sim: Sim, col: Colony): Vec3 {
  const n = sim.stores.nests.get(col.nestIds[0] ?? -1);
  return n ? n.origin : sim.world.queenStart.pos;
}

function traitsOf(kind: string, id: number): [number, number, number] {
  const t = LEAF_TRAITS[kind] ?? LEAF_TRAITS.default;
  const j = (k: number) => (hash3i(id, k, 7, 0x1eaf) * 2 - 1) * LEAF_TRAIT_JITTER;
  const c = (x: number) => Math.max(0, Math.min(1, x));
  return [c(t[0] + j(1)), c(t[1] + j(2) * 0.5), c(t[2] + j(3))];
}

/** Natural ground at (x, z): not interior, paving or asphalt, walkable; null otherwise. */
function herbGround(sim: Sim, x: number, z: number): Vec3 | null {
  const w = sim.world, b = w.bu * 4;
  if (x < b || z < b || x > w.size - b || z > w.size - b) return null;
  if (sim.navGrid.blocked(x, z)) return null;
  const m = w.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : 0;
  const zone = w.zones.find((zd) => zd.id === id)?.type;
  if (zone === 'interior' || zone === 'asphalt' || zone === 'pavement' || zone === 'sand' || zone === 'rubber') return null;
  const y = sim.field.height(x, z);
  if (sim.field.substrateXYZ(x, y + 0.5 * w.bu, z) <= 0) return null; // under an object
  return { x, y, z };
}

/** The foot of a plant object: the ground under its position, nudged out to open ground if needed. */
function plantFoot(sim: Sim, pos: Vec3): Vec3 | null {
  const bu = sim.world.bu;
  for (const r of [0, 1.5, 3]) {
    for (let k = 0; k < (r === 0 ? 1 : 8); k++) {
      const a = (k / 8) * Math.PI * 2;
      const x = pos.x + Math.cos(a) * r * bu, z = pos.z + Math.sin(a) * r * bu;
      const y = sim.field.height(x, z);
      if (sim.field.substrateXYZ(x, y + 0.5 * bu, z) > 0 && !sim.navGrid.blocked(x, z)) return { x, y, z };
    }
  }
  return null;
}

/** Builds the site list once. */
export function initLeafSites(sim: Sim, col: Colony): LeafSite[] {
  const sites: LeafSite[] = [];
  const home = homeOf(sim, col), bu = sim.world.bu;
  const rng = sim.stream('rng.ecology');
  const r2 = (LEAF_SITE_RANGE_BU * bu) ** 2;
  for (const o of sim.world.objects) {
    if (!o.tags.includes('plant')) continue;
    if ((o.pos.x - home.x) ** 2 + (o.pos.z - home.z) ** 2 > r2) continue;
    const foot = plantFoot(sim, o.pos);
    if (!foot) continue;
    const [q, p, t] = traitsOf(o.templateId, o.id);
    const cap = rngRange(rng, PLANT_SITE_LU[0], PLANT_SITE_LU[1]);
    sites.push({ pos: foot, plantId: o.id, kind: o.templateId, q, p, t, lu: cap, capacity: cap });
  }
  for (let i = 0, tries = 0; i < HERB_PATCHES && tries < HERB_PATCHES * 10; tries++) {
    const ang = rngRange(rng, 0, Math.PI * 2);
    const r = rngRange(rng, HERB_PATCH_RING_BU[0], HERB_PATCH_RING_BU[1]) * bu;
    const p = herbGround(sim, home.x + Math.cos(ang) * r, home.z + Math.sin(ang) * r);
    if (!p) continue;
    const id = herbId(i);
    const [q, pp, t] = traitsOf('herbage', id);
    const cap = rngRange(rng, HERB_PATCH_LU[0], HERB_PATCH_LU[1]);
    sites.push({ pos: p, plantId: id, kind: 'herbage', q, p: pp, t, lu: cap, capacity: cap });
    i++;
  }
  col.fungus!.leafSites = sites;
  return sites;
}

/** The colony's leaf sites (built on first use). */
export function leafSitesOf(sim: Sim, col: Colony): LeafSite[] {
  return col.fungus!.leafSites ?? initLeafSites(sim, col);
}

/** The site nearest to `p` within `rangeBu` that has leaf, or null (the possessed cutter's target). */
export function leafSiteNear(sim: Sim, col: Colony, p: Vec3, rangeBu: number): { site: LeafSite; index: number } | null {
  const sites = leafSitesOf(sim, col);
  const r2 = (rangeBu * sim.world.bu) ** 2;
  let best = -1, bestD = r2;
  for (let i = 0; i < sites.length; i++) {
    const s = sites[i];
    if (s.lu <= 0) continue;
    const d = (s.pos.x - p.x) ** 2 + (s.pos.z - p.z) ** 2 + (s.pos.y - p.y) ** 2;
    if (d <= bestD) { bestD = d; best = i; }
  }
  return best >= 0 ? { site: sites[best], index: best } : null;
}

/** Regrowth of every site (and the list built for colonies that have none yet). */
export function stepLeafSites(sim: Sim, col: Colony, dtGd: number): void {
  for (const s of leafSitesOf(sim, col)) s.lu = Math.min(s.capacity, s.lu + s.capacity * LEAF_REGROW_PER_GD * dtGd);
}

export const leafSiteSystem: System = {
  name: 'fungus-leaf-sites', phase: 'ecology', every: LEAF_SITE_STEP_TICKS,
  run(sim) {
    for (const { col } of atColonies(sim)) stepLeafSites(sim, col, LEAF_SITE_STEP_TICKS / TICKS_PER_DAY);
  },
};
