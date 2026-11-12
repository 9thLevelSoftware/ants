// From a plan request (PlanSpec, GDD 03 App. B `planDig`) to the resolved record geometry the plan keeps
// (see geometry.ts): tunnel / shaft end points, the entrance plan's cavity end, the chamber's yaw.

import type { Vec3 } from '@/core/math/vec3';
import type { ChamberSize, DigPlan, Nest, PlanGeom, PlanSpec, Sim, SurfaceRef } from '@/sim/types';
import {
  ENTRANCE_PLAN_MAX_BU, PLAN_DEFAULT_LEN_BU, SHAFT_LEN_BU, SHAFT_MAX_TILT_DEG, TUNNEL_LEN_BU, nestTemplate,
} from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { nestComponents } from '../entrances';
import { planSpecies } from './targets';


export interface ResolvedPlan {
  anchor: SurfaceRef;
  geom: PlanGeom;
  size: ChamberSize | null;
}

/** Horizontal unit direction of -normal (into the wall), or of yawDeg when the normal is near vertical. */
function intoWall(n: Vec3, yawDeg: number | undefined): Vec3 {
  const hx = -n.x, hz = -n.z, l = Math.hypot(hx, hz);
  if (l > 0.3 && yawDeg === undefined) return { x: hx / l, y: 0, z: hz / l };
  const base = l > 0.3 ? Math.atan2(hz, hx) : 0;
  const a = base + ((yawDeg ?? 0) * Math.PI) / 180;
  return { x: Math.cos(a), y: 0, z: Math.sin(a) };
}

/** Nearest open sample of the nest's cavity to p within maxMm, or null. */
export function nearestNestOpen(sim: Sim, nest: Nest, p: Vec3, maxMm: number): Vec3 | null {
  const v = sim.carve.voxel, comps = nestComponents(sim, nest), m = Math.ceil(maxMm / v);
  const ci = Math.round(p.x / v), cj = Math.round(p.y / v), ck = Math.round(p.z / v);
  let best: Vec3 | null = null, bestD = maxMm * maxMm;
  for (let k = ck - m; k <= ck + m; k++) for (let j = cj - m; j <= cj + m; j++) for (let i = ci - m; i <= ci + m; i++) {
    const d = (i * v - p.x) ** 2 + (j * v - p.y) ** 2 + (k * v - p.z) ** 2;
    if (d > bestD || sim.carve.sampleAt(i, j, k) < OPEN_MIN) continue;
    const q = { x: i * v, y: j * v, z: k * v };
    if (!comps.has(sim.nestNav.componentAt(q))) continue;
    bestD = d; best = q;
  }
  return best;
}

export function resolvePlan(sim: Sim, nest: Nest, spec: PlanSpec): ResolvedPlan | null {
  const bu = sim.world.bu, a = spec.anchor.pos, n = spec.anchor.normal;
  const geom: PlanGeom = { end: null, bend: null, length: 0, yawDeg: spec.yawDeg ?? 0, surfacePoint: null };
  const anchor: SurfaceRef = { pos: { ...a }, normal: { ...n } };
  switch (spec.kind) {
    case 'tunnel': {
      if (spec.end) geom.end = { ...spec.end };
      else {
        const d = intoWall(n, spec.yawDeg);
        const len = clamp(spec.length ?? PLAN_DEFAULT_LEN_BU, TUNNEL_LEN_BU) * bu;
        geom.end = { x: a.x + d.x * len, y: a.y, z: a.z + d.z * len };
      }
      if (spec.bend) geom.bend = { ...spec.bend };
      geom.length = Math.hypot(geom.end.x - a.x, geom.end.y - a.y, geom.end.z - a.z) / bu;
      return { anchor, geom, size: null };
    }
    case 'shaft': {
      let dir: Vec3;
      if (spec.end) {
        const dx = spec.end.x - a.x, dy = spec.end.y - a.y, dz = spec.end.z - a.z, l = Math.hypot(dx, dy, dz) || 1;
        dir = { x: dx / l, y: dy / l, z: dz / l };
        const maxH = Math.sin((SHAFT_MAX_TILT_DEG * Math.PI) / 180);
        const h = Math.hypot(dir.x, dir.z);
        if (h > maxH) { // tilt back to the allowed cone
          const s = maxH / h;
          dir = { x: dir.x * s, y: Math.sign(dir.y || -1) * Math.sqrt(1 - maxH * maxH), z: dir.z * s };
        }
      } else dir = { x: 0, y: n.y < -0.5 ? 1 : -1, z: 0 };
      const len = clamp(spec.length ?? (spec.end ? Math.hypot(spec.end.x - a.x, spec.end.y - a.y, spec.end.z - a.z) / bu : PLAN_DEFAULT_LEN_BU), SHAFT_LEN_BU) * bu;
      geom.end = { x: a.x + dir.x * len, y: a.y + dir.y * len, z: a.z + dir.z * len };
      geom.length = len / bu;
      return { anchor, geom, size: null };
    }
    case 'entrance': {
      const s = spec.surfacePoint ?? a;
      const start = nearestNestOpen(sim, nest, s, ENTRANCE_PLAN_MAX_BU * bu);
      if (!start) return null;
      geom.surfacePoint = { x: s.x, y: sim.field.height(s.x, s.z), z: s.z };
      const dx = geom.surfacePoint.x - start.x, dy = geom.surfacePoint.y - start.y, dz = geom.surfacePoint.z - start.z;
      const l = Math.hypot(dx, dy, dz) || 1;
      anchor.pos = start;
      anchor.normal = { x: -dx / l, y: -dy / l, z: -dz / l };
      geom.length = l / bu;
      return { anchor, geom, size: null };
    }
    case 'chamber': {
      const d = intoWall(n, spec.yawDeg);
      geom.yawDeg = (Math.atan2(d.z, d.x) * 180) / Math.PI;
      const t = nestTemplate(planSpecies(sim, nest));
      const type = spec.chamberType ?? 'general';
      const sizes = t.chambers[type];
      const size: ChamberSize = spec.size ?? (sizes?.m ? 'm' : 's');
      return { anchor, geom, size };
    }
    default:
      return null;
  }
}

function clamp(v: number, r: [number, number]): number {
  return Math.max(r[0], Math.min(r[1], v));
}

/** A plan record shell for geometry building (validation runs before the plan exists). */
export function draftPlan(nest: Nest, spec: PlanSpec, r: ResolvedPlan): DigPlan {
  return {
    id: -1, nestId: nest.id, kind: spec.kind, chamberType: spec.kind === 'chamber' ? (spec.chamberType ?? 'general') : null,
    size: r.size, source: 'player', need: null, priority: spec.priority, status: 'queued', blockedReason: null,
    warnings: [], anchor: r.anchor, geom: r.geom, spheres: [], window: [], slots: [], spoilPoint: { ...r.anchor.pos },
    targetVolume: 0, removedVolume: 0, createdTick: 0, statusTick: 0,
  };
}
