// Builds what the marker renderer draws in the colony view (and the hover / selection rings elsewhere): marker rings
// with their radius, outlines of the nest's dig plans by status, the planner's ghost with its validity pattern and
// reason text, and highlight rings. Pure (reads sim state; no three).
import type { Vec3 } from '@/core';
import type { MarkerLabel, MarkerLineSet, MarkerPointSet, MarkerSceneDesc } from '@/render/fx/markers/MarkerRenderer';
import { CHAMBER_LABEL_COLOR, GHOST_FILL_OPACITY, GHOST_STYLE, HOVER_COLOR, MARKER_COLOR, PLAN_STYLE, SELECT_COLOR, XRAY_DOTS } from '@/render/fx/markers/palette';
import { pushCapsule, pushEllipse, pushEllipsoid, pushGroundRing, pushHatch } from '@/render/fx/markers/shapes';
import type { NestGhost } from '@/render/nest';
import { planCache } from '@/sim/nest/plans/targets';
import type { PlanGeometry } from '@/sim/nest/plans/geometry';
import type { Sim } from '@/sim/types';
import type { PickTarget } from '../picking/entityPick';
import type { PlanPreview } from './digPlanner';
import { playerNest } from './digPlanner';

export interface MarkerSceneInput {
  sim: Sim;
  /** Draw markers and plans (colony view); highlights are drawn in every view. */
  colony: boolean;
  selectedMarkerId: number;
  selectedPlanId: number;
  preview: PlanPreview | null;
  /** Tunnel start of a two-click tunnel. */
  tunnelStart: Vec3 | null;
  hover: PickTarget | null;
  selected: PickTarget | null;
  /** Colony cutaway mode: x-ray adds ant / brood dots and chamber labels (GDD 01 §6.7). */
  cutaway?: 'off' | 'slice' | 'xray';
}

/** Lift of surface rings above the ground, BU. */
const RING_LIFT_BU = 0.15;

/** Outline of a plan geometry (the nest module's PlanGeometry) into a segment array. */
export function planOutline(g: PlanGeometry, out: number[] = []): number[] {
  for (const c of g.capsules) pushCapsule(out, c);
  if (g.ellipsoid) pushEllipsoid(out, g.ellipsoid);
  return out;
}

/** The translucent fill of a ghost: its ellipsoid and its capsule end spheres. */
export function ghostVolumes(g: PlanGeometry, color: string): NestGhost[] {
  const v: NestGhost[] = [];
  const e = g.ellipsoid;
  if (e) {
    // local axes (aw, up, al) -> a quaternion about Y (aw and al are horizontal)
    const yaw = Math.atan2(-e.aw.z, e.aw.x);
    v.push({ center: e.c, radii: { x: e.hw, y: e.hh, z: e.hl }, rotation: { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, color, opacity: GHOST_FILL_OPACITY, onTop: true });
  }
  for (const c of g.capsules) {
    const len = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y, c.b.z - c.a.z);
    const n = Math.max(1, Math.ceil(len / (1.5 * c.r)));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      v.push({ center: { x: c.a.x + (c.b.x - c.a.x) * t, y: c.a.y + (c.b.y - c.a.y) * t, z: c.a.z + (c.b.z - c.a.z) * t }, radii: { x: c.r, y: c.r, z: c.r }, color, opacity: GHOST_FILL_OPACITY * 0.6, onTop: true });
    }
  }
  return v;
}

export function buildMarkerScene(p: MarkerSceneInput): MarkerSceneDesc {
  const { sim } = p, bu = sim.world.bu;
  const lines: MarkerLineSet[] = [], labels: MarkerLabel[] = [], volumes: NestGhost[] = [];
  // the version holds what is drawn, not the tick: in most frames nothing changed and nothing is rebuilt
  const keyParts: (string | number)[] = [p.colony ? 1 : 0];
  const height = (x: number, z: number) => sim.field.height(x, z);
  if (p.colony) {
    const col = sim.state.colonies[0]?.id ?? -1;
    for (const m of sim.state.markers) {
      if (!m.alive || m.colony !== col) continue;
      const pos: number[] = [];
      const surface = sim.field.substrate(m.pos) > -bu;
      pushGroundRing(pos, m.pos, m.radius, surface ? height : null, RING_LIFT_BU * bu);
      // a short pin at the centre so small markers read too
      const top = (surface ? height(m.pos.x, m.pos.z) : m.pos.y) + 3 * bu;
      pos.push(m.pos.x, top - 3 * bu, m.pos.z, m.pos.x, top, m.pos.z);
      const sel = m.id === p.selectedMarkerId;
      lines.push({ positions: pos, color: sel ? SELECT_COLOR : MARKER_COLOR[m.kind], style: 'solid' });
      if (sel) {
        const ring: number[] = [];
        pushGroundRing(ring, m.pos, m.radius * 1.06, surface ? height : null, RING_LIFT_BU * bu);
        lines.push({ positions: ring, color: MARKER_COLOR[m.kind], style: 'dashed', dash: bu });
      }
      keyParts.push(m.id, m.radius, sel ? 's' : '');
    }
    const nest = playerNest(sim);
    for (const plan of nest?.digPlans ?? []) {
      const style = PLAN_STYLE[plan.status];
      if (!style) continue;
      const g = planCache(sim, nest!, plan)?.geometry;
      if (!g) continue;
      const pos = planOutline(g);
      if (style.hatch) pushHatch(pos, plan.anchor.pos, plan.anchor.normal, 2 * bu);
      const sel = plan.id === p.selectedPlanId;
      lines.push({ positions: pos, color: sel ? SELECT_COLOR : style.color, style: style.style, dash: 0.8 * bu });
      keyParts.push('p', plan.id, plan.status, sel ? 's' : '');
    }
  }
  const pv = p.preview;
  if (pv) {
    const st = GHOST_STYLE[pv.validity];
    const pos: number[] = [];
    if (pv.geometry) planOutline(pv.geometry, pos);
    // the anchor disc on the wall, with its outward normal
    pushEllipse(pos, pv.anchor.pos, ...perpPair(pv.anchor.normal), 0.8 * bu, 0.8 * bu);
    pos.push(pv.anchor.pos.x, pv.anchor.pos.y, pv.anchor.pos.z,
      pv.anchor.pos.x + pv.anchor.normal.x * 1.5 * bu, pv.anchor.pos.y + pv.anchor.normal.y * 1.5 * bu, pv.anchor.pos.z + pv.anchor.normal.z * 1.5 * bu);
    if (pv.validity === 'invalid') pushHatch(pos, pv.anchor.pos, pv.anchor.normal, 1.6 * bu);
    lines.push({ positions: pos, color: st.color, style: st.style, dash: 0.6 * bu });
    if (pv.geometry) volumes.push(...ghostVolumes(pv.geometry, st.color));
    const text = pv.reason ?? `${pv.spec.kind === 'chamber' ? `${pv.spec.chamberType} chamber` : pv.spec.kind}: ${Math.round(pv.targetVolume)} BU³`;
    const lp = pv.geometry ? { x: (pv.geometry.min.x + pv.geometry.max.x) / 2, y: pv.geometry.max.y + bu, z: (pv.geometry.min.z + pv.geometry.max.z) / 2 } : { x: pv.anchor.pos.x, y: pv.anchor.pos.y + 2 * bu, z: pv.anchor.pos.z };
    labels.push({ pos: lp, text: pv.validity === 'warning' ? `${text} - click again to confirm` : text, color: st.color });
    keyParts.push('g', pv.validity, text, round(pv.anchor.pos), pv.spec.yawDeg ?? 0, pv.spec.size ?? '', pv.spec.kind, round(pv.spec.end ?? null));
  }
  if (p.tunnelStart) {
    const pos: number[] = [];
    pushEllipse(pos, p.tunnelStart, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 0.6 * bu, 0.6 * bu);
    lines.push({ positions: pos, color: GHOST_STYLE.valid.color, style: 'solid' });
    keyParts.push('ts', round(p.tunnelStart));
  }
  for (const [t, color] of [[p.hover, HOVER_COLOR], [p.selected, SELECT_COLOR]] as const) {
    if (!t || t.kind === 'ant' || t.kind === 'brood' || t.kind === 'item') continue; // those glow in their own renderer
    const r = t.kind === 'chamber' ? chamberRadius(sim, t.id) : 1.6 * bu;
    const pos: number[] = [];
    pushGroundRing(pos, t.pos, r, null, 0);
    lines.push({ positions: pos, color, style: color === HOVER_COLOR ? 'dashed' : 'solid', dash: bu });
    keyParts.push('h', t.kind, t.id, color);
  }
  const points: MarkerPointSet[] = [];
  const xray = p.colony && p.cutaway === 'xray';
  if (xray) xrayOverlay(sim, points, labels, keyParts);
  // x-ray dots follow the ants: they alone change every tick
  return { version: keyParts.join('|'), lines, labels, volumes, points, pointsVersion: xray ? `x${sim.state.tick}` : '' };
}

/** X-ray: the colony's ants and brood inside the soil as dots, and every chamber labelled with its type. */
function xrayOverlay(sim: Sim, points: MarkerPointSet[], labels: MarkerLabel[], key: (string | number)[]): void {
  const col = sim.state.colonies[0]?.id ?? -1;
  const ants: number[] = [], queens: number[] = [], brood: number[] = [];
  for (const a of sim.state.ants) {
    if (!a.alive || a.colony !== col || sim.field.substrate(a.pos) >= 0) continue;
    (a.caste === 'queen' ? queens : ants).push(a.pos.x, a.pos.y, a.pos.z);
  }
  for (const b of sim.state.brood) if (b.alive && b.carriedBy < 0 && sim.field.substrate(b.pos) < 0) brood.push(b.pos.x, b.pos.y, b.pos.z);
  points.push({ positions: brood, ...XRAY_DOTS.brood }, { positions: ants, ...XRAY_DOTS.ant }, { positions: queens, ...XRAY_DOTS.queen });
  key.push('x');
  for (const n of sim.state.nests) {
    if (n.colony !== col) continue;
    for (const c of n.chambers) {
      labels.push({ pos: { x: c.center.x, y: c.center.y + c.radii.y, z: c.center.z }, text: c.type, color: CHAMBER_LABEL_COLOR });
      key.push(c.id, c.type);
    }
  }
}

function chamberRadius(sim: Sim, id: number): number {
  for (const n of sim.state.nests) for (const c of n.chambers) if (c.id === id) return Math.max(c.radii.x, c.radii.z);
  return 4 * sim.world.bu;
}

function perpPair(n: Vec3): [Vec3, Vec3] {
  const t = Math.abs(n.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = { x: n.y * t.z - n.z * t.y, y: n.z * t.x - n.x * t.z, z: n.x * t.y - n.y * t.x };
  const lu = Math.hypot(u.x, u.y, u.z) || 1;
  u.x /= lu; u.y /= lu; u.z /= lu;
  return [u, { x: n.y * u.z - n.z * u.y, y: n.z * u.x - n.x * u.z, z: n.x * u.y - n.y * u.x }];
}

function round(p: Vec3 | null): string {
  return p ? `${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)}` : '-';
}
