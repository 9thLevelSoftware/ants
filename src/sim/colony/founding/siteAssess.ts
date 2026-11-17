// Live founding-site assessment (GDD 06 §5.7): samples the running world at a ground point into the read-out's
// seven factors and scores them with THE site-quality function of the static suitability map (siteScore.ts,
// directions §K). The inputs are the map's own inputs, read where the generator read them: the ground strata of
// the founding band, the static shade, flood and litter maps, the zone's disturbance, the rival nest sites, and a
// ceiling of cover material over the terrain cells around the point (the generator rasterises the same rule);
// soil moisture is the live topsoil value (the map's input at generation time, so the two agree until it rains).

import type { Vec3 } from '@/core/math/vec3';
import type { ByteMap, Material, Sim, SiteWord, SpeciesId, ZoneDef } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import { TERRAIN_CELL_BU } from '@/sim/balance';
import { SITE_CEILING_PROBE } from '@/sim/balance/founding';
import { columnTempAt } from '@/sim/environment/chamber';
import { byteAt } from '@/sim/world/terrainSample';
import {
  bandDigFactor, coverValueOf, floodFactorOf, moistFactor, quietFactorOf, rivalFactorAt, warmFactorOf, type CoverLevel,
} from '@/worldgen/maps/suitability';
import { CEILING_MATERIALS, DISTURBANCE_PASSES, SUIT, WARM_COVER_MATERIALS } from '@/worldgen/tuning/maps';
import { speciesOf } from './access';
import { siteProfile, siteQuality, siteWordOf } from './siteScore';

export interface SiteReading {
  /** Ground point assessed, mm. */
  point: Vec3;
  /** Scores 0..1 in SITE_FACTORS order. */
  factors: number[];
  q: number;
  word: SiteWord;
  /** What the scores were made from (read-out words, tests). */
  raw: { material: Material; theta: number; tempC: number; cover: CoverLevel; warmCover: boolean; floodRisk: number; disturbance: number };
}

function byte01(m: ByteMap | undefined, x: number, z: number, fallback: number): number {
  if (!m || m.nx === 0) return fallback;
  return byteAt(m, x, z) / 255;
}

function moistureLayer(sim: Sim, layer: 'theta0' | 'theta1', x: number, z: number): number {
  const m = sim.state.env.moisture;
  if (!m || m.nx === 0) return byte01(sim.world.maps.moisture, x, z, 0.3);
  const ix = Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)));
  const iz = Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell)));
  return m[layer][iz * m.nx + ix] / 255;
}

/** Deep soil moisture (theta1) at (x, z), 0..1 (the founding model's moisture term). */
export function deepMoisture(sim: Sim, x: number, z: number): number {
  return moistureLayer(sim, 'theta1', x, z);
}

/** Topsoil moisture (theta0) at (x, z), 0..1: the static map's moisture input, live. */
export function topsoilMoisture(sim: Sim, x: number, z: number): number {
  return moistureLayer(sim, 'theta0', x, z);
}

function zoneAt(sim: Sim, x: number, z: number): ZoneDef | undefined {
  const m = sim.world.maps.zone;
  if (!m || m.nx === 0) return undefined;
  const id = byteAt(m, x, z);
  return sim.world.zones.find((zd) => zd.id === id);
}

/** Human disturbance 0..1 at (x, z): expected passes of the zone variant over DISTURBANCE_FULL (1 - fQuiet). */
export function footTrafficAt(sim: Sim, x: number, z: number): number {
  const v = zoneAt(sim, x, z)?.variant;
  return 1 - quietFactorOf(v ? DISTURBANCE_PASSES[v] ?? 0 : 0);
}

const UP = { x: 0, y: 1, z: 0 };
const isCeiling = (m: Material | undefined) => m !== undefined && (CEILING_MATERIALS as readonly string[]).includes(m);

/**
 * The generator's ceiling rule at one terrain cell (its centre): a primitive of a ceiling material over the ground,
 * resting on it or with its underside within SUIT.ceilingMaxBu above it. Returns its material, or null.
 */
function ceilingAt(sim: Sim, x: number, z: number): Material | null {
  const bu = sim.world.bu, g = sim.field.height(x, z);
  const o = { x, y: g + SITE_CEILING_PROBE.startBu * bu, z };
  const max = SUIT.ceilingMaxBu * bu;
  const t = sim.field.sphereTrace(o, UP, max, 0);
  if (t >= max) return null;
  const prim = sim.field.primAt({ x, y: o.y + t, z }, SITE_CEILING_PROBE.primRadiusBu * bu);
  return prim && isCeiling(prim.material) ? prim.material : null;
}

/**
 * Cover level over a ground point (the map's cover kinds): `ceiling` when the terrain cell and its four neighbours
 * are roofed, `beside` when any cell within SUIT.besideCells is, else litter (SUIT.litterMin), lawn sward or bare.
 * `warm` when the roof is a warm stone material (the map's warm-stone bonus).
 */
export function coverLevelAt(sim: Sim, x: number, z: number): { level: CoverLevel; warm: boolean } {
  const cell = TERRAIN_CELL_BU * sim.world.bu;
  const ci = Math.floor(x / cell), ck = Math.floor(z / cell);
  const roof = (di: number, dk: number) => ceilingAt(sim, (ci + di + 0.5) * cell, (ck + dk + 0.5) * cell);
  const centre = roof(0, 0);
  const warmOf = (m: Material | null) => m !== null && (WARM_COVER_MATERIALS as readonly string[]).includes(m);
  if (centre && roof(-1, 0) && roof(1, 0) && roof(0, -1) && roof(0, 1)) return { level: 'ceiling', warm: warmOf(centre) };
  const r = SUIT.besideCells;
  for (let dk = -r; dk <= r; dk++) {
    for (let di = -r; di <= r; di++) {
      const m = di === 0 && dk === 0 ? centre : roof(di, dk);
      if (m) return { level: 'beside', warm: warmOf(m) };
    }
  }
  if (byte01(sim.world.maps.litter, x, z, 0) >= SUIT.litterMin) return { level: 'litter', warm: false };
  return { level: zoneAt(sim, x, z)?.type === 'lawn' ? 'sward' : 'bare', warm: false };
}

/** fDig of the founding band at (x, z) (the generator's strata rule; a hard crust vetoes): 0 = not diggable. */
function bandDig(sim: Sim, species: SpeciesId, x: number, z: number, theta: number): { fDig: number; material: Material } {
  const g = sim.world.ground, bu = sim.world.bu;
  const surf = materialFromCode(byteAt(g.surface, x, z)), sub = materialFromCode(byteAt(g.subsoil, x, z));
  const crust = byteAt(g.crustMm, x, z);
  const deep = SUIT.bandBu[1] * bu < crust ? surf : sub;
  if (crust > 0 && bandDigFactor(species, surf, theta) === 0) return { fDig: 0, material: surf };
  let sum = 0;
  for (let s = 0; s < SUIT.bandSamples; s++) {
    const d = (SUIT.bandBu[0] + ((SUIT.bandBu[1] - SUIT.bandBu[0]) * s) / (SUIT.bandSamples - 1)) * bu;
    sum += bandDigFactor(species, d < crust ? surf : sub, theta);
  }
  return { fDig: sum / SUIT.bandSamples, material: deep };
}

/** Optional species rule (additive, species-carpenter): adjusts the ground reading, e.g. a wood nester reads the wood at p. */
export const siteAssessRules: { adjust: ((sim: Sim, p: Vec3, base: SiteReading) => SiteReading) | null } = { adjust: null };

/** The founding queen's assessment of the ground at (x, z) (any y: the ground height is taken). */
export function assessSite(sim: Sim, p: Vec3): SiteReading {
  const base = assessGround(sim, p);
  return siteAssessRules.adjust ? siteAssessRules.adjust(sim, p, base) : base;
}

function assessGround(sim: Sim, p: Vec3): SiteReading {
  const def = speciesOf(sim);
  const species = def.id as SpeciesId;
  const prof = siteProfile(species);
  const bu = sim.world.bu;
  const x = p.x, z = p.z, g = sim.field.height(x, z);
  const point = { x, y: g, z };
  const theta = topsoilMoisture(sim, x, z);
  const zone = zoneAt(sim, x, z);
  const dig = bandDig(sim, species, x, z, theta);
  const fDig = zone?.type === 'interior' ? 0 : dig.fDig;
  const cover = coverLevelAt(sim, x, z);
  const floodRisk = byte01(sim.world.maps.floodRisk, x, z, 0);
  const disturbance = footTrafficAt(sim, x, z);
  const factors = [
    fDig,
    moistFactor(prof.moist, theta),
    warmFactorOf(byte01(sim.world.maps.shade, x, z, 0), cover.warm),
    coverValueOf(cover.level),
    floodFactorOf(floodRisk),
    rivalFactorAt(sim.world.placements?.rivalSites ?? [], x, z, bu),
    1 - disturbance,
  ];
  const q = siteQuality(factors, species);
  // the chamber the queen would dig here: its temperature names the warmth word and feeds the forecast
  const covered = cover.level === 'ceiling';
  const tempC = columnTempAt(sim, x, z, (covered ? def.opening.dMinCoverBu : def.opening.dMinOpenBu) * bu, covered);
  return { point, factors, q, word: siteWordOf(q), raw: { material: dig.material, theta, tempC, cover: cover.level, warmCover: cover.warm, floodRisk, disturbance } };
}
