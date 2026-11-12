// Placement (GDD 03 §8.4 steps 4-5): score every candidate, then walk them best first (ties: lowest candidate
// index) through the architect's own hard rules (cheap) and the nest module's validator (architect rules:
// warnings refuse); the first that passes is the maximum over the valid candidates. digCost uses the plan's
// analytic volume (recorded decision: the voxel count differs only by discretisation, and a room holding existing
// space is refused by roomClear), so the score is known before validation and few candidates are validated.

import type { Vec3 } from '@/core/math/vec3';
import type { RngState } from '@/core/rng';
import type { Nest, PlanSpec, Sim } from '@/sim/types';
import { SCORE_W, ARCH_BAND_SLACK_BU, CONNECTOR_PENALTY, ROOM_ANCHOR_EXEMPT_BU } from '@/sim/balance/architect';
import { FLOOR_MIN_BU, nestTemplate } from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { planG, type PlanGeometry } from '../plans/geometry';
import { planCache } from '../plans/targets';
import { validatePlanImpl } from '../plans/validate';
import { wallMin } from '../substrate';
import { placementCandidates, type Candidate } from './candidates';
import { isLivePlan } from './capacity';
import type { NeedRequest } from './needs';
import { bandOf, digCost, partialScore } from './score';

export interface Placement {
  spec: PlanSpec;
  score: number;
  connector: boolean;
  /** Candidates generated and validated (diagnostics, tests). */
  candidates: number;
  validated: number;
}

/** Soil between g and every other live plan's volume is at least the material's WALL_MIN (§8.5, hard). */
function clearOfPlans(sim: Sim, nest: Nest, g: PlanGeometry): boolean {
  const v = sim.carve.voxel, wm = wallMin(sim.field.materialAt(g.mouth)) * sim.world.bu;
  for (const p of nest.digPlans) {
    if (!isLivePlan(p) || p.kind === 'seal' || p.kind === 'reopen') continue;
    const other = planCache(sim, nest, p)?.geometry;
    if (!other) continue;
    if (other.min.x > g.max.x + wm || other.max.x < g.min.x - wm || other.min.y > g.max.y + wm || other.max.y < g.min.y - wm
      || other.min.z > g.max.z + wm || other.max.z < g.min.z - wm) continue;
    for (let k = Math.floor(g.min.z / v); k <= Math.ceil(g.max.z / v); k++)
      for (let j = Math.floor(g.min.y / v); j <= Math.ceil(g.max.y / v); j++)
        for (let i = Math.floor(g.min.x / v); i <= Math.ceil(g.max.x / v); i++) {
          const x = i * v, y = j * v, z = k * v;
          if (planG(g, x, y, z) > 0 && planG(other, x, y, z) > -wm) return false;
        }
  }
  return true;
}

/** Horizontal half extents of a yawed room's bounding box, mm. */
function roomHalfXZ(e: NonNullable<PlanGeometry['ellipsoid']>): { hx: number; hz: number } {
  return { hx: Math.abs(e.aw.x) * e.hw + Math.abs(e.al.x) * e.hl, hz: Math.abs(e.aw.z) * e.hw + Math.abs(e.al.z) * e.hl };
}

/** Is the sample at (x, y, z) existing open space that a room must keep clear of (not air, not the anchor's junction)? */
function foreignOpen(sim: Sim, i: number, j: number, k: number, anchor: Vec3, exempt: number): boolean {
  if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) return false;
  const v = sim.carve.voxel, x = i * v, y = j * v, z = k * v;
  return sim.field.substrateXYZ(x, y, z) <= 0 && Math.hypot(x - anchor.x, y - anchor.y, z - anchor.z) > exempt;
}

/**
 * Fast rejection before roomClear: probe points on the room's shell grown by WALL_MIN (and FLOOR_MIN above and
 * below) and on its mid plane. A hit means roomClear fails; no hit proves nothing (roomClear decides).
 */
function roomProbeHit(sim: Sim, g: PlanGeometry, anchor: Vec3): boolean {
  const e = g.ellipsoid;
  if (!e) return false;
  const v = sim.carve.voxel, bu = sim.world.bu, wm = wallMin(sim.field.materialAt(e.c)) * bu, fm = FLOOR_MIN_BU * bu;
  const exempt = ROOM_ANCHOR_EXEMPT_BU * bu;
  for (const [sw, sh, sl, ring] of PROBE_SHELLS) {
    const aw = e.hw * sw + wm * (sw > 0 ? 1 : 0), ah = e.hh * sh + fm * (sh > 0 ? 1 : 0), al = e.hl * sl + wm * (sl > 0 ? 1 : 0);
    for (let n = 0; n < ring; n++) {
      const a = (n / ring) * 2 * Math.PI, cu = Math.cos(a), cw = Math.sin(a);
      for (const up of [-1, 0, 1]) {
        const u = cu * aw * (up === 0 ? 1 : 0.6), w = cw * al * (up === 0 ? 1 : 0.6), y = e.c.y + up * ah;
        const x = e.c.x + e.aw.x * u + e.al.x * w, z = e.c.z + e.aw.z * u + e.al.z * w;
        if (foreignOpen(sim, Math.round(x / v), Math.round(y / v), Math.round(z / v), anchor, exempt)) return true;
      }
    }
  }
  return false;
}
/** Probe shells: scale of the room's half axes (w, h, l) before adding the wall margin, and points per ring. */
const PROBE_SHELLS: readonly [number, number, number, number][] = [[1, 1, 1, 24], [0.5, 1, 0.5, 12], [0, 1, 0, 1]];

/**
 * The room of a chamber plan (its ellipsoid, not the neck) holds no existing space and keeps WALL_MIN of soil to
 * every other open cavity, and FLOOR_MIN to cavities straight above or below it, except within
 * ROOM_ANCHOR_EXEMPT_BU of the anchor (the neck's junction). Stricter than validation's `too-close`, which ignores
 * ANCHOR_CONNECTION (4 BU) around the anchor and so lets a room touch the cavity next to its anchor (two rooms
 * would then be detected as one chamber).
 */
function roomClear(sim: Sim, g: PlanGeometry, anchor: Vec3): boolean {
  const e = g.ellipsoid;
  if (!e) return true;
  if (roomProbeHit(sim, g, anchor)) return false;
  const v = sim.carve.voxel, bu = sim.world.bu;
  const wm = wallMin(sim.field.materialAt(e.c)) * bu, fm = FLOOR_MIN_BU * bu, pad = Math.max(wm, fm) + v;
  const exempt = ROOM_ANCHOR_EXEMPT_BU * bu, room: PlanGeometry = { ...g, capsules: [] };
  const { hx, hz } = roomHalfXZ(e);
  for (let k = Math.floor((e.c.z - hz - pad) / v); k <= Math.ceil((e.c.z + hz + pad) / v); k++)
    for (let j = Math.floor((e.c.y - e.hh - pad) / v); j <= Math.ceil((e.c.y + e.hh + pad) / v); j++)
      for (let i = Math.floor((e.c.x - hx - pad) / v); i <= Math.ceil((e.c.x + hx + pad) / v); i++) {
        if (!foreignOpen(sim, i, j, k, anchor, exempt)) continue;
        const x = i * v, y = j * v, z = k * v;
        const d = -planG(room, x, y, z); // < 0: existing space inside the room
        if (d < wm) return false;
        if (planG(g, x, y, z) > 0) continue; // existing space the neck crosses
        // straight above or below the room (inside its horizontal outline): the stacked-cavity floor rule
        const dx = x - e.c.x, dz = z - e.c.z, lw = dx * e.aw.x + dz * e.aw.z, ll = dx * e.al.x + dz * e.al.z;
        if (d < fm && (lw / e.hw) ** 2 + (ll / e.hl) ** 2 <= 1) return false;
      }
  return true;
}

interface Scored { c: Candidate; score: number; depthBu: number }

/**
 * Accepts a candidate request: validates it (default) or creates the plan (the architect's use: createPlan runs
 * the same validation once). Returns false to try the next candidate.
 */
export type AcceptPlacement = (spec: PlanSpec) => boolean;

const validateOnly = (sim: Sim): AcceptPlacement => (spec) => {
  const v = validatePlanImpl(sim, spec, 'architect');
  return v.ok && v.targetVolume > 0;
};

/** The best placement for a need that `accept` takes (default: the best valid one), or null. */
export function choosePlacement(sim: Sim, nest: Nest, req: NeedRequest, rng: RngState, accept: AcceptPlacement = validateOnly(sim), maxCandidates?: number): Placement | null {
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
  const t = nestTemplate(species), band = bandOf(species, req.type);
  const scored: Scored[] = [];
  for (const c of placementCandidates(sim, nest, req, rng, maxCandidates)) {
    if (c.entrancePathBu > t.maxPathToEntrance) continue; // GDD 03 §5.3 N3 (no entrance plans in T1)
    const s = partialScore(sim, nest, species, c);
    if (!c.connector && (s.depthBu < band[0] - ARCH_BAND_SLACK_BU || s.depthBu > band[1] + ARCH_BAND_SLACK_BU)) continue;
    const score = s.partial + SCORE_W.digCost * digCost(sim, species, c.centre, c.volumeBu3) - (c.connector ? CONNECTOR_PENALTY : 0);
    scored.push({ c, score, depthBu: s.depthBu });
  }
  scored.sort((a, b) => b.score - a.score || a.c.index - b.c.index);
  let validated = 0;
  for (const s of scored) {
    if (!clearOfPlans(sim, nest, s.c.geometry) || !roomClear(sim, s.c.geometry, s.c.spec.anchor.pos)) continue;
    validated++;
    if (accept(s.c.spec)) return { spec: s.c.spec, score: s.score, connector: s.c.connector, candidates: scored.length, validated };
  }
  return null;
}
