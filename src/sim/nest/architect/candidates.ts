// Candidate plans of one placement (GDD 03 §8.4 step 2-3): (a) chambers on wall spots in the type's depth band,
// stratified over tunnels and chambers; (b) when fewer than ARCH_COMPOSITE_BELOW spots qualify, connector tunnels
// and shafts toward the band (the chamber follows at the connector's end at a later evaluation); (c) for types
// with a cover weight, connectors toward the underside of non-diggable covers (stones, slabs) in the footprint.
// All draws come from the given RNG in fixed orders (deterministic).

import type { Vec3 } from '@/core/math/vec3';
import type { RngState } from '@/core/rng';
import { rngRange, rngShuffle } from '@/core/rng';
import type { Nest, NestFieldTarget, PlanSpec, Sim, SpeciesId } from '@/sim/types';
import { NECK_LEN_BU, TUNNEL_LEN_BU, digFactor, nestTemplate } from '@/sim/balance/nest';
import {
  ARCH_BAND_SLACK_BU, ARCH_CANDIDATES, ARCH_COMPOSITE_BELOW, ARCH_COMPOSITE_CANDIDATES, ARCH_COVER_CANDIDATES,
  ARCH_SPOT_RELIEF_BU, ARCH_YAW_JITTER_DEG, CONNECTOR_BAND_INSET_BU, CONNECTOR_LATERAL_BU, CONNECTOR_MAX_SLOPE_DEG,
  CONNECTOR_MIN_LEN_BU, COVER_DIRECT_REACH_W, COVER_SCAN_MAX_STEPS, COVER_SCAN_STEP_BU, COVER_UNDERSIDE_GAP_BU,
} from '@/sim/balance/architect';
import { CHUNK, OPEN_MIN, keyCx, keyCy, keyCz } from '../carve/keys';
import { nestSampleBox } from '../chambers/detect';
import { chamberAtIn } from '../chambers/registry';
import { nestComponents } from '../entrances';
import type { WallSpot } from '../queries';
import { buildGeometry, type PlanGeometry } from '../plans/geometry';
import { draftPlan, resolvePlan } from '../plans/resolve';
import type { NeedRequest } from './needs';
import { bandOf, coverWeight, type ScoreInputs } from './score';
import { isBlacklisted } from './sites';
import { nestRuntime } from '../runtime';

export interface Candidate extends ScoreInputs {
  index: number;
  spec: PlanSpec;
  /** A tunnel or shaft leading toward a chamber site (scored at its end). */
  connector: boolean;
  /** Plan geometry as the nest module will build it (without pillars). */
  geometry: PlanGeometry;
  /** Analytic plan volume (room + neck, or the connector capsule), BU^3: the digCost input. */
  volumeBu3: number;
}

const EXIT: NestFieldTarget = { kind: 'exit', id: -1 };
const SEAL: NestFieldTarget = { kind: 'seal', id: -1 };

/** Path from p to the nearest entrance through the nest (open, else sealed), BU; -1 when unreachable. */
export function entrancePath(sim: Sim, nest: Nest, p: Vec3): number {
  const d = sim.nestNav.distance(nest.id, nest.entrances.some((e) => e.status === 'open') ? EXIT : SEAL, p);
  return d < 0 ? -1 : d / sim.world.bu;
}

/** Path from p to the nearest chamber of the given types, BU; -1 when there is none or it is unreachable. */
function chamberPath(sim: Sim, nest: Nest, p: Vec3, types: readonly string[]): number {
  let best = -1;
  for (const c of nest.chambers) {
    if (!types.includes(c.type)) continue;
    const d = sim.nestNav.distance(nest.id, { kind: 'chamber', id: c.id }, p);
    if (d >= 0 && (best < 0 || d < best * sim.world.bu)) best = d / sim.world.bu;
  }
  return best;
}

/** GDD 03 §8.4 proximity targets: nursery -> royal; food -> nearest entrance; royal -> nursery; others none. */
function relatedPath(sim: Sim, nest: Nest, type: string, p: Vec3): number {
  if (type === 'nursery') return chamberPath(sim, nest, p, ['royal', 'founding']);
  if (type === 'royal') return chamberPath(sim, nest, p, ['nursery']);
  if (type === 'food') return entrancePath(sim, nest, p);
  return -1;
}

const H4 = [1, 0, -1, 0, 0, 1, 0, -1];

/**
 * Wall samples of one carve chunk (open, a non-open sample below, a non-open horizontal neighbour; the first such
 * neighbour in H4 order), as i, j, k, direction quadruples in the grid's scan order. Cached per chunk in the nest
 * runtime and dropped for every chunk a carve can affect (the rule reads one sample around each sample).
 */
function chunkWalls(sim: Sim, key: number): number[] {
  const rt = nestRuntime(sim);
  const have = rt.wallByChunk.get(key);
  if (have) return have;
  const carve = sim.carve, out: number[] = [];
  carve.forEachOpenSample(key, (i, j, k) => {
    if (carve.sampleAt(i, j - 1, k) >= OPEN_MIN) return; // needs a floor below
    for (let d = 0; d < 8; d += 2) {
      if (carve.sampleAt(i + H4[d], j, k + H4[d + 1]) >= OPEN_MIN) continue;
      out.push(i, j, k, d);
      return;
    }
  });
  rt.wallByChunk.set(key, out);
  return out;
}

/**
 * Wall spots of the nest between two depths below the nest origin's ground (BU): open samples with a floor below
 * and a horizontal solid neighbour, in the nest's cavity (the nest module's wallSpots rule, GDD 03 §8.4 a), with
 * whole chunks outside the nest box or the depth range skipped. Fixed scan order (chunk key, sample index).
 */
export function spotsInDepth(sim: Sim, nest: Nest, minDepthBu: number, maxDepthBu: number): WallSpot[] {
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu, b = nestSampleBox(sim, nest);
  // chunks are pre-filtered by depth below the origin's ground, widened by the terrain relief of the footprint
  const g0 = sim.field.height(nest.origin.x, nest.origin.z), slackJ = Math.ceil((ARCH_SPOT_RELIEF_BU * bu) / v);
  const j0 = Math.max(b.j0, Math.floor((g0 - maxDepthBu * bu) / v) - slackJ), j1 = Math.min(b.j1, Math.ceil((g0 - minDepthBu * bu) / v) + slackJ);
  const comps = nestComponents(sim, nest), out: WallSpot[] = [];
  const keys = carve.data.keys.filter((key) => {
    const ci = keyCx(key) * CHUNK, cj = keyCy(key) * CHUNK, ck = keyCz(key) * CHUNK;
    return ci + CHUNK > b.i0 && ci <= b.i1 && cj + CHUNK > j0 && cj <= j1 && ck + CHUNK > b.k0 && ck <= b.k1;
  }).sort((a, c) => a - c);
  for (const key of keys) {
    const walls = chunkWalls(sim, key);
    for (let q = 0; q < walls.length; q += 4) {
      const i = walls[q], j = walls[q + 1], k = walls[q + 2], d = walls[q + 3];
      if (i < b.i0 || i > b.i1 || j < j0 || j > j1 || k < b.k0 || k > b.k1) continue;
      const pos = { x: i * v, y: j * v, z: k * v };
      const depthBu = (sim.field.height(pos.x, pos.z) - pos.y) / bu;
      if (depthBu < minDepthBu || depthBu > maxDepthBu) continue;
      if (sim.field.substrateXYZ(pos.x, pos.y, pos.z) >= 0 || !comps.has(sim.nestNav.componentAt(pos))) continue;
      out.push({ pos, normal: { x: -H4[d], y: 0, z: -H4[d + 1] }, depthBu });
    }
  }
  return out;
}

/** Stratified draw: spots bucketed by the chamber they lie in (-1 = tunnel), shuffled, taken round robin. */
function stratified(sim: Sim, nest: Nest, spots: WallSpot[], n: number, rng: RngState): WallSpot[] {
  const buckets = new Map<number, WallSpot[]>();
  for (const s of spots) {
    const key = chamberAtIn(sim, nest, s.pos)?.id ?? -1;
    const b = buckets.get(key);
    if (b) b.push(s); else buckets.set(key, [s]);
  }
  const lists = [...buckets.keys()].sort((a, b) => a - b).map((k) => rngShuffle(rng, buckets.get(k)!));
  const out: WallSpot[] = [];
  for (let round = 0; out.length < n; round++) {
    let any = false;
    for (const l of lists) if (round < l.length && out.length < n) { out.push(l[round]); any = true; }
    if (!any) break;
  }
  return out;
}

const yawed = (n: Vec3, deg: number): Vec3 => {
  const a = Math.atan2(-n.z, -n.x) + (deg * Math.PI) / 180;
  return { x: Math.cos(a), y: 0, z: Math.sin(a) };
};

/** A chamber candidate on a wall spot (null when the template cannot build it or the anchor is unreachable). */
function chamberCandidate(sim: Sim, nest: Nest, species: string, req: NeedRequest, s: WallSpot, yawDeg: number, index: number): Candidate | null {
  const spec: PlanSpec = {
    nestId: nest.id, kind: 'chamber', chamberType: req.type, size: req.size, anchor: { pos: { ...s.pos }, normal: { ...s.normal } },
    yawDeg, priority: req.priority, confirmWarnings: false,
  };
  const resolved = resolvePlan(sim, nest, spec);
  const g = resolved ? buildGeometry(draftPlan(nest, spec, resolved), species, sim.world.bu) : null;
  if (!g?.ellipsoid) return null;
  const toEntrance = entrancePath(sim, nest, s.pos);
  if (toEntrance < 0) return null;
  const bu = sim.world.bu, e = g.ellipsoid, inside = NECK_LEN_BU + e.hw / bu;
  const related = relatedPath(sim, nest, req.type, s.pos);
  const r = g.capsules[0]?.r ?? 0;
  const volumeBu3 = ((4 / 3) * Math.PI * e.hw * e.hh * e.hl + Math.PI * r * r * NECK_LEN_BU * bu) / bu ** 3;
  return {
    index, spec, connector: false, type: req.type, centre: e.c, ceilingY: e.c.y + e.hh, geometry: g, volumeBu3,
    relatedPathBu: related < 0 ? -1 : related + inside, entrancePathBu: toEntrance + inside,
  };
}

/** A connector tunnel (or shaft) from a wall spot to `end`. */
function connector(sim: Sim, nest: Nest, req: NeedRequest, s: WallSpot, end: Vec3, kind: 'tunnel' | 'shaft', index: number): Candidate | null {
  const bu = sim.world.bu;
  const len = Math.hypot(end.x - s.pos.x, end.y - s.pos.y, end.z - s.pos.z) / bu;
  if (len < CONNECTOR_MIN_LEN_BU) return null;
  const toEntrance = entrancePath(sim, nest, s.pos);
  if (toEntrance < 0) return null;
  const related = relatedPath(sim, nest, req.type, s.pos);
  const spec: PlanSpec = {
    nestId: nest.id, kind, anchor: { pos: { ...s.pos }, normal: { ...s.normal } }, end, priority: req.priority, confirmWarnings: false,
  };
  const resolved = resolvePlan(sim, nest, spec);
  const g = resolved ? buildGeometry(draftPlan(nest, spec, resolved), nestSpecies(sim, nest), bu) : null;
  if (!g) return null;
  const r = (nestTemplate(nestSpecies(sim, nest)).tunnelD / 2) * bu;
  return {
    index, connector: true, type: req.type, centre: end, ceilingY: end.y + r, spec, geometry: g,
    volumeBu3: (Math.PI * r * r * len * bu) / bu ** 3,
    relatedPathBu: related < 0 ? -1 : related + len, entrancePathBu: toEntrance + len,
  };
}

function nestSpecies(sim: Sim, nest: Nest): string {
  return sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
}

/** End of a connector from s toward the band: lateral inside the band, else sloping down (or up) to it. */
function connectorEnd(sim: Sim, s: WallSpot, band: [number, number], dir: Vec3): Vec3 {
  const bu = sim.world.bu;
  const lo = band[0] + CONNECTOR_BAND_INSET_BU, hi = Math.max(lo, band[1] - CONNECTOR_BAND_INSET_BU);
  const drop = s.depthBu < lo ? lo - s.depthBu : s.depthBu > hi ? hi - s.depthBu : 0; // + down
  if (Math.abs(drop) < 1) return { x: s.pos.x + dir.x * CONNECTOR_LATERAL_BU * bu, y: s.pos.y, z: s.pos.z + dir.z * CONNECTOR_LATERAL_BU * bu };
  const slope = (CONNECTOR_MAX_SLOPE_DEG * Math.PI) / 180;
  let run = Math.abs(drop) / Math.tan(slope), dy = drop;
  const len = Math.hypot(run, dy), max = TUNNEL_LEN_BU[1];
  if (len > max) { run *= max / len; dy *= max / len; }
  return { x: s.pos.x + dir.x * run * bu, y: s.pos.y - dy * bu, z: s.pos.z + dir.z * run * bu };
}

/** Undersides of non-diggable primitives in the footprint whose depth fits the band (cover sites, GDD 03 §8.4 c). */
function coverPoints(sim: Sim, nest: Nest, species: string, band: [number, number], halfH: number): Vec3[] {
  const bu = sim.world.bu, t = nestTemplate(species), out: Vec3[] = [];
  for (const p of sim.world.prims) {
    if (digFactor(species as SpeciesId, p.material) > 0) continue;
    if (Math.hypot(p.pos.x - nest.origin.x, p.pos.z - nest.origin.z) > (t.footprintR - ARCH_BAND_SLACK_BU * 2) * bu) continue;
    let y = p.pos.y;
    if (sim.field.hardXYZ(p.pos.x, y, p.pos.z) > 0) continue;
    // down through the primitive to its underside, then the room's half height and a gap below it
    for (let n = 0; n < COVER_SCAN_MAX_STEPS && sim.field.hardXYZ(p.pos.x, y, p.pos.z) <= 0; n++) y -= COVER_SCAN_STEP_BU * bu;
    const below = { x: p.pos.x, y: y - halfH - COVER_UNDERSIDE_GAP_BU * bu, z: p.pos.z };
    const depth = (sim.field.height(below.x, below.z) - below.y) / bu;
    if (depth < band[0] - ARCH_BAND_SLACK_BU || depth > band[1] + ARCH_BAND_SLACK_BU) continue;
    if (sim.field.substrateXYZ(below.x, below.y, below.z) > 0) continue; // the underside is in the open air
    out.push(below);
    if (out.length >= ARCH_COVER_CANDIDATES) break;
  }
  return out;
}

/** All candidates of one placement for a need, in candidate-index order. */
export function placementCandidates(sim: Sim, nest: Nest, req: NeedRequest, rng: RngState, maxCandidates = ARCH_CANDIDATES): Candidate[] {
  const species = nestSpecies(sim, nest), bu = sim.world.bu;
  const band = bandOf(species, req.type);
  const out: Candidate[] = [];
  const qualified = spotsInDepth(sim, nest, band[0] - ARCH_BAND_SLACK_BU, band[1] + ARCH_BAND_SLACK_BU);
  let all: WallSpot[] | null = null;
  const spotsAll = () => (all ??= spotsInDepth(sim, nest, -Infinity, Infinity));
  for (const s of stratified(sim, nest, qualified, maxCandidates, rng)) {
    const c = chamberCandidate(sim, nest, species, req, s, rngRange(rng, -ARCH_YAW_JITTER_DEG, ARCH_YAW_JITTER_DEG), out.length);
    if (c) out.push(c);
  }
  if (qualified.length < ARCH_COMPOSITE_BELOW) {
    const spots = spotsAll();
    for (const s of stratified(sim, nest, spots, ARCH_COMPOSITE_CANDIDATES, rng)) {
      const end = connectorEnd(sim, s, band, yawed(s.normal, rngRange(rng, -ARCH_YAW_JITTER_DEG, ARCH_YAW_JITTER_DEG)));
      const c = connector(sim, nest, req, s, end, 'tunnel', out.length);
      if (c) out.push(c);
    }
    // extend downward from the deepest floor spots (the main shaft's bottom first)
    const deepest = [...spots].sort((a, b) => b.depthBu - a.depthBu || a.pos.x - b.pos.x || a.pos.z - b.pos.z).slice(0, 2);
    for (const s of deepest) {
      const drop = band[0] + CONNECTOR_BAND_INSET_BU - s.depthBu;
      if (drop <= 0) continue;
      const c = connector(sim, nest, req, s, { x: s.pos.x, y: s.pos.y - drop * bu, z: s.pos.z }, 'shaft', out.length);
      if (c) out.push(c);
    }
  }
  const dims = nestTemplate(species).chambers[req.type]?.[req.size];
  if (dims && coverWeight(species, req.type) > 0) {
    // a direct chamber from the nearest wall spot reaches about its neck plus most of its width
    const halfH = (dims.h / 2) * bu, reach = (NECK_LEN_BU + dims.w * COVER_DIRECT_REACH_W) * bu;
    for (const p of coverPoints(sim, nest, species, band, halfH)) {
      let best: WallSpot | null = null, bestD = Infinity;
      for (const s of spotsAll()) {
        const d = (s.pos.x - p.x) ** 2 + (s.pos.y - p.y) ** 2 + (s.pos.z - p.z) ** 2;
        if (d < bestD) { bestD = d; best = s; }
      }
      if (!best) continue;
      const hx = p.x - best.pos.x, hz = p.z - best.pos.z, h = Math.hypot(hx, hz);
      if (h <= reach) continue; // a direct chamber reaches it
      const k = (h - reach) / h;
      const end = { x: best.pos.x + hx * k, y: p.y, z: best.pos.z + hz * k };
      const c = connector(sim, nest, req, best, end, 'tunnel', out.length);
      if (c) out.push(c);
    }
  }
  // blacklisted sites (GDD 03 §7.8): a candidate whose room (or connector end) lies within the site radius
  return out.filter((c) => !isBlacklisted(sim, nest.architect, c.centre)).map((c, index) => ({ ...c, index }));
}
