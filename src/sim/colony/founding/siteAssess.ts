// Live founding-site assessment (GDD 06 §5.7): samples the world at a ground point into the seven factors and
// scores them (siteScore.ts). Inputs shared with the static suitability map come from the same sources: the
// species' site materials, the soil moisture grid, the flood-risk and exposure maps, the zone disturbance table
// and the ceiling materials of src/worldgen/tuning/maps.ts.

import type { Vec3 } from '@/core/math/vec3';
import type { ByteMap, Material, Sim, SiteWord, SpeciesId } from '@/sim/types';
import { SITE_FACTORS } from '@/sim/types';
import {
  SITE_LITTER_MIN, SITE_ROOF_MAX_BU, SITE_SAMPLE_DEPTH_BU,
} from '@/sim/balance/founding';
import { columnTempAt } from '@/sim/environment';
import { CEILING_MATERIALS, DISTURBANCE_FULL, DISTURBANCE_PASSES } from '@/worldgen/tuning/maps';
import { canDigAt } from '@/sim/nest';
import { playerColonyOf, speciesOf } from './access';
import {
  coverFactor, diggabilityFactor, exposureFactor, floodSafetyFactor, moistureFactor, rivalScentFactor, siteProfile,
  siteQuality, siteWordOf, warmthFactor, type CoverKind,
} from './siteScore';

export interface SiteReading {
  /** Ground point assessed, mm. */
  point: Vec3;
  /** Scores 0..1 in SITE_FACTORS order. */
  factors: number[];
  q: number;
  word: SiteWord;
  /** What the scores were made from (read-out words, tests). */
  raw: { material: Material; theta: number; tempC: number; cover: CoverKind; floodRisk: number; rivalScent: number; footTraffic: number; openSky: number };
}

function byte(m: ByteMap | undefined, x: number, z: number, fallback: number): number {
  if (!m || m.nx === 0) return fallback;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return fallback;
  return m.data[iz * m.nx + ix] / 255;
}

/** Deep soil moisture (theta1) at (x, z), 0..1. */
export function deepMoisture(sim: Sim, x: number, z: number): number {
  const m = sim.state.env.moisture;
  if (!m || m.nx === 0) return byte(sim.world.maps.moisture, x, z, 0.3);
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
  return m.theta1[iz * m.nx + ix] / 255;
}

const UP = { x: 0, y: 1, z: 0 };

/**
 * Cover over a ground point: a solid roof of a ceiling material within SITE_ROOF_MAX_BU above the ground (or the
 * point lies right beside such a primitive: "under or beside stones", directions §K), dense litter, a lawn's
 * grass canopy, else bare ground.
 */
export function coverAt(sim: Sim, x: number, z: number): CoverKind {
  const bu = sim.world.bu, g = sim.field.height(x, z);
  const o = { x, y: g + 0.25 * bu, z };
  const max = SITE_ROOF_MAX_BU * bu;
  const t = sim.field.sphereTrace(o, UP, max, 0);
  const isCeiling = (m: Material | undefined) => m !== undefined && (CEILING_MATERIALS as readonly string[]).includes(m);
  if (t < max) {
    const prim = sim.field.primAt({ x, y: o.y + t, z }, 0.5 * bu);
    if (isCeiling(prim?.material)) return 'roof';
  }
  const beside = sim.field.primAt(o, 1.0 * bu);
  if (beside && isCeiling(beside.material) && beside.pos.y + beside.size.y > g + 0.5 * bu) return 'roof';
  if (byte(sim.world.maps.litter, x, z, 0) >= SITE_LITTER_MIN) return 'litter';
  const m = sim.world.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : -1;
  const zone = sim.world.zones.find((zd) => zd.id === id);
  return zone && zone.type === 'lawn' ? 'grass' : 'bare';
}

/** Human disturbance 0..1 at (x, z): expected passes of the zone variant (the static map's fQuiet input). */
export function footTrafficAt(sim: Sim, x: number, z: number): number {
  const m = sim.world.maps.zone;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  const id = ix >= 0 && iz >= 0 && ix < m.nx && iz < m.nz ? m.data[iz * m.nx + ix] : -1;
  const v = sim.world.zones.find((zd) => zd.id === id)?.variant;
  const passes = v ? (DISTURBANCE_PASSES[v] ?? 0) : 0;
  return Math.min(1, passes / DISTURBANCE_FULL);
}

/** Strongest home scent of any other colony at p, ph. */
function rivalScentAt(sim: Sim, p: Vec3, ownColony: number): number {
  let best = 0;
  for (const c of sim.state.colonies) {
    if (!c.alive || c.id === ownColony) continue;
    best = Math.max(best, sim.phero.sample(c.id, 'home', p));
  }
  return best;
}

/** The founding queen's assessment of the ground at (x, z) (any y: the ground height is taken). */
export function assessSite(sim: Sim, p: Vec3): SiteReading {
  const def = speciesOf(sim);
  const species = def.id as SpeciesId;
  const prof = siteProfile(species);
  const bu = sim.world.bu;
  const x = p.x, z = p.z, g = sim.field.height(x, z);
  const point = { x, y: g, z };
  const material = sim.field.materialAt({ x, y: g - SITE_SAMPLE_DEPTH_BU * bu, z });
  const theta = deepMoisture(sim, x, z);
  // the surface must be diggable for this species (crusts, paving, hard primitives refuse: "Cannot dig here")
  const top = { x, y: g - 0.5 * bu, z };
  const dig = canDigAt(sim, species, top) ? diggabilityFactor(def.opening.siteMaterials, material, theta) : 0;
  const cover = coverAt(sim, x, z);
  const covered = cover === 'roof';
  const depthMm = (covered ? def.opening.dMinCoverBu : def.opening.dMinOpenBu) * bu;
  const tempC = columnTempAt(sim, x, z, depthMm, covered);
  const floodRisk = byte(sim.world.maps.floodRisk, x, z, 0);
  const col = playerColonyOf(sim);
  const rivalScent = rivalScentAt(sim, point, col ? col.id : -1);
  const footTraffic = footTrafficAt(sim, x, z);
  const openSky = covered ? 0 : byte(sim.world.maps.exposure, x, z, 1);
  const factors = new Array<number>(SITE_FACTORS.length);
  factors[0] = dig;
  factors[1] = moistureFactor(prof.moist, theta);
  factors[2] = warmthFactor(prof.toptC, tempC);
  factors[3] = coverFactor(cover);
  factors[4] = floodSafetyFactor(floodRisk);
  factors[5] = rivalScentFactor(rivalScent);
  factors[6] = exposureFactor(footTraffic, openSky);
  const q = dig > 0 ? siteQuality(factors, species) : 0;
  return { point, factors, q, word: siteWordOf(q), raw: { material, theta, tempC, cover, floodRisk, rivalScent, footTraffic, openSky } };
}
