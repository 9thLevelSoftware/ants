// The dig planner (GDD 03 §14.2, GDD 08 §4.3): choose a template (chamber of a type, tunnel, shaft, entrance) and a
// size, hover a nest wall in the cutaway to anchor a ghost on it, rotate it (15° steps), see the nest module's own
// validation live, and confirm (a second click confirms a plan with warnings) or cancel. Placing sends `planDig`;
// the plan is then the simulation's. The ghost is built from the same geometry as the plan (validatePlanImpl).
import type { Vec3 } from '@/core';
import { PLANNABLE_TYPES } from '@/sim/balance/nestTemplates';
import { PLAN_DEFAULT_LEN_BU, SHAFT_LEN_BU } from '@/sim/balance/nest';
import { validatePlanImpl } from '@/sim/nest/plans/validate';
import { nearestNestOpen } from '@/sim/nest/plans/resolve';
import type { PlanGeometry } from '@/sim/nest/plans/geometry';
import type { ChamberSize, ChamberType, Nest, PlanPriority, PlanSpec, PlanValidationCode, Sim, SpeciesId } from '@/sim/types';
import type { ToolHost } from './markerTool';
import { PendingCommands } from './pendingCommands';
import { PLAN_REASON_TEXT, planReason } from './reasons';

export type PlanTemplate = 'chamber' | 'tunnel' | 'shaft' | 'entrance';

/**
 * GDD 03 §14.2: the pick snaps to the nearest wall within 2 BU. A click on the soil of the slice a little further off than that (a founding cell is
 * 3 to 4 BU across, so beside it is 4 to 8 BU from its wall) was refused with "Start from a tunnel or chamber of this nest" (app-seams-4 item 1,
 * tests/e2e/app4-planner.mjs: every click 3 BU or more from the wall of the cell failed, whichever way the ghost turned). The pick now snaps to
 * the nest's own wall between the click and the nearest open cavity of the nest within ANCHOR_PICK_REACH_BU (DEVIATIONS row), the first
 * measure staying as the cheap exact path. Beyond the reach the ghost says why.
 */
export const ANCHOR_PICK_SNAP_BU = 2;
export const ANCHOR_PICK_REACH_BU = 8;
/** Q / E rotate the ghost by this much (degrees). */
export const GHOST_YAW_STEP_DEG = 15;
/** Shaft length step for Shift+wheel (BU). */
export const SHAFT_STEP_BU = 2;
export const CHAMBER_SIZES: readonly ChamberSize[] = ['s', 'm', 'l'];

export type GhostValidity = 'valid' | 'warning' | 'invalid';

/** The ghost under the cursor: the request, the nest module's verdict, and the geometry to draw. */
export interface PlanPreview {
  spec: PlanSpec;
  validity: GhostValidity;
  codes: PlanValidationCode[];
  warnings: PlanValidationCode[];
  /** Words for the first refusal / warning, null when valid. */
  reason: string | null;
  targetVolume: number;
  geometry: PlanGeometry | null;
  /** Wall point and outward normal the ghost hangs on. */
  anchor: { pos: Vec3; normal: Vec3 };
  /** Validation time, ms (GDD: <= 2 ms per pointer move). */
  ms: number;
}

/** A surface point under the cursor with its outward normal (from the scene pick). */
export interface AnchorPick {
  point: Vec3;
  normal: Vec3;
  kind: 'cap' | 'wall' | 'surface';
}

export interface ConfirmResult {
  /**
   * 'created': planDig sent and the plan exists; 'queued': sent in real time, the outcome follows after the next tick
   * (DigPlanner.takeLateResult); 'confirm-warnings': click again; 'refused': nothing created.
   */
  outcome: 'created' | 'queued' | 'confirm-warnings' | 'refused' | 'none';
  planId: number;
  reason: string | null;
}

const now = (): number => (typeof performance !== 'undefined' ? performance.now() : 0);

export class DigPlanner {
  template: PlanTemplate = 'chamber';
  chamberType: ChamberType = 'general';
  size: ChamberSize = 'm';
  /** Ghost yaw relative to "straight into the wall", degrees. */
  yawDeg = 0;
  shaftLengthBu = PLAN_DEFAULT_LEN_BU;
  /** Shaft direction: down (default) or up toward the surface. */
  shaftUp = false;
  priority: PlanPriority = 'normal';
  /** Tunnel: first click sets the start anchor, the hover is the end point. */
  tunnelStart: { pos: Vec3; normal: Vec3 } | null = null;
  preview: PlanPreview | null = null;
  readonly pending = new PendingCommands();
  /** Outcomes of plans sent in real time, once the sim has decided (taken by the colony controls). */
  private late: ConfirmResult[] = [];
  /** Warnings were shown for this spec key; the next confirm sends it with confirmWarnings. */
  private warnedKey = '';
  private cacheKey = '';

  setTemplate(t: PlanTemplate): void {
    this.template = t;
    this.tunnelStart = null;
    this.preview = null;
    this.warnedKey = '';
  }

  /** Chamber types the species may plan (GDD 03 §6.3). */
  static chamberTypes(sim: Sim): readonly ChamberType[] {
    return PLANNABLE_TYPES[sim.species.id as SpeciesId] ?? ['general'];
  }

  rotate(steps: number): void {
    this.yawDeg = (((this.yawDeg + steps * GHOST_YAW_STEP_DEG) % 360) + 360) % 360;
    this.cacheKey = '';
  }

  /** Shift+wheel: chamber size S / M / L, or shaft length. */
  resize(steps: number): void {
    if (this.template === 'shaft') {
      this.shaftLengthBu = Math.max(SHAFT_LEN_BU[0], Math.min(SHAFT_LEN_BU[1], this.shaftLengthBu + steps * SHAFT_STEP_BU));
    } else {
      const i = CHAMBER_SIZES.indexOf(this.size);
      this.size = CHAMBER_SIZES[Math.max(0, Math.min(CHAMBER_SIZES.length - 1, i + steps))];
    }
    this.cacheKey = '';
  }

  cancel(): void {
    this.tunnelStart = null;
    this.preview = null;
    this.warnedKey = '';
  }

  /** Resolves a plan sent in real time (once per frame). */
  poll(sim: Sim): void {
    this.pending.poll(sim);
  }

  /** The outcome of a queued plan, once known (then cleared). */
  takeLateResult(): ConfirmResult | null {
    return this.late.shift() ?? null;
  }

  /** New game: nothing queued, nothing to report. */
  reset(): void {
    this.cancel();
    this.pending.clear();
    this.late = [];
  }

  /**
   * The ghost for the point under the cursor. A cut-face or surface point snaps to the nearest wall within
   * ANCHOR_PICK_SNAP_BU (field projection); an entrance takes the surface point itself. Cached per anchor voxel.
   */
  hover(sim: Sim, pick: AnchorPick | null): PlanPreview | null {
    const nest = playerNest(sim);
    if (!nest || !pick) { this.preview = null; return null; }
    const anchor = this.anchorFor(sim, pick, nest);
    const spec = this.specFor(sim, nest, anchor, pick.point);
    const key = specKey(spec, sim.carve.voxel, sim.state.tick);
    if (key === this.cacheKey && this.preview) return this.preview;
    const t0 = now();
    const v = validatePlanImpl(sim, spec, 'player');
    const ms = now() - t0;
    const validity: GhostValidity = !v.ok ? 'invalid' : v.warnings.length > 0 ? 'warning' : 'valid';
    this.preview = {
      spec, validity, codes: [...v.codes], warnings: [...v.warnings], reason: planReason(v.codes, v.warnings), targetVolume: v.targetVolume,
      geometry: v.geometry, anchor: { pos: { ...anchor.pos }, normal: { ...anchor.normal } }, ms,
    };
    this.cacheKey = key;
    return this.preview;
  }

  /**
   * Click: tunnel start (first click), or place the previewed plan. Refused plans create nothing and keep the
   * reason; warnings need a second click on the same ghost.
   */
  confirm(h: ToolHost): ConfirmResult {
    const p = this.preview;
    if (!p) return { outcome: 'none', planId: -1, reason: null };
    if (this.template === 'tunnel' && !this.tunnelStart) {
      if (p.codes.includes('anchor-not-in-nest')) return { outcome: 'refused', planId: -1, reason: p.reason };
      this.tunnelStart = { pos: { ...p.anchor.pos }, normal: { ...p.anchor.normal } };
      this.cacheKey = '';
      return { outcome: 'none', planId: -1, reason: null };
    }
    // one plan in flight at a time: its outcome (a tick away in real time) must not be confused with another's
    if (this.pending.size > 0) return { outcome: 'queued', planId: -1, reason: null };
    if (p.validity === 'invalid') { h.toast(p.reason ?? 'This plan cannot be dug'); return { outcome: 'refused', planId: -1, reason: p.reason }; }
    const key = specKey(p.spec, h.sim.carve.voxel, 0);
    if (p.validity === 'warning' && this.warnedKey !== key) {
      this.warnedKey = key;
      return { outcome: 'confirm-warnings', planId: -1, reason: p.reason };
    }
    const spec = p.spec;
    const res: ConfirmResult = { outcome: 'queued', planId: -1, reason: null };
    this.pending.send(h, { type: 'planDig', ...spec, confirmWarnings: p.validity === 'warning' }, (o) => {
      const nest = h.sim.stores.nests.get(spec.nestId);
      const plan = o.refused ? null : nest?.digPlans.find((x) => x.id >= o.firstNewId && x.source === 'player') ?? null;
      const words = o.refused ? PLAN_REASON_TEXT[o.refused as PlanValidationCode] ?? null : null;
      const r: ConfirmResult = plan ? { outcome: 'created', planId: plan.id, reason: null }
        : { outcome: 'refused', planId: -1, reason: words ?? p.reason ?? 'The plan was not accepted' };
      if (o.late) this.late.push(r); else Object.assign(res, r);
    });
    this.warnedKey = '';
    this.tunnelStart = null;
    this.cacheKey = '';
    return res;
  }

  private anchorFor(sim: Sim, pick: AnchorPick, nest: Nest): { pos: Vec3; normal: Vec3 } {
    if (this.template === 'entrance' || pick.kind === 'wall') return { pos: { ...pick.point }, normal: { ...pick.normal } };
    const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 1, z: 0 };
    const ok = sim.field.project(pick.point, 0, out, n);
    if (ok && Math.hypot(out.x - pick.point.x, out.y - pick.point.y, out.z - pick.point.z) <= ANCHOR_PICK_SNAP_BU * sim.world.bu && sim.field.substrate(out) < 0) {
      return { pos: out, normal: n };
    }
    const far = wallToward(sim, nest, pick.point, ANCHOR_PICK_REACH_BU * sim.world.bu);
    if (far) return far;
    return { pos: { ...pick.point }, normal: { ...pick.normal } }; // no wall near: validation says why
  }

  private specFor(sim: Sim, nest: Nest, anchor: { pos: Vec3; normal: Vec3 }, cursor: Vec3): PlanSpec {
    const base = { nestId: nest.id, priority: this.priority, confirmWarnings: false };
    switch (this.template) {
      case 'chamber':
        return { ...base, kind: 'chamber', chamberType: this.chamberType, size: this.size, anchor, yawDeg: this.yawDeg };
      case 'tunnel':
        if (!this.tunnelStart) return { ...base, kind: 'tunnel', anchor, yawDeg: this.yawDeg, length: PLAN_DEFAULT_LEN_BU };
        return { ...base, kind: 'tunnel', anchor: this.tunnelStart, end: { ...cursor } };
      case 'shaft': {
        const dy = (this.shaftUp ? 1 : -1) * this.shaftLengthBu * sim.world.bu;
        return { ...base, kind: 'shaft', anchor, length: this.shaftLengthBu, end: { x: anchor.pos.x, y: anchor.pos.y + dy, z: anchor.pos.z } };
      }
      case 'entrance':
        return { ...base, kind: 'entrance', anchor, surfacePoint: { ...cursor } };
    }
  }
}

/** The player colony's main nest, or null. */
export function playerNest(sim: Sim): Nest | null {
  const col = sim.state.colonies[0];
  const id = col?.nestIds[0];
  return id === undefined ? null : sim.stores.nests.get(id) ?? null;
}

/** Cache key of a request: anchor and end at voxel resolution plus every parameter (and the tick: digging moves on). */
function specKey(s: PlanSpec, voxel: number, tick: number): string {
  const q = (p?: Vec3) => (p ? `${Math.round(p.x / voxel)},${Math.round(p.y / voxel)},${Math.round(p.z / voxel)}` : '-');
  return [s.kind, s.chamberType ?? '', s.size ?? '', s.yawDeg ?? '', s.length ?? '', q(s.anchor.pos), q(s.end), q(s.surfacePoint), s.priority, tick].join('|');
}

/**
 * The wall of the nest's own cavity between the soil point `p` and the nearest open sample of the nest within `reachMm`: marches from the open sample
 * toward `p` to the first point inside solid, bisects it onto the wall and returns it with the field's normal (into free space), or null when the
 * nest has no open sample that near, or the segment never leaves free space (p is in the cavity, which a wall pick would have caught).
 */
export function wallToward(sim: Sim, nest: Nest, p: Vec3, reachMm: number): { pos: Vec3; normal: Vec3 } | null {
  const open = nearestNestOpen(sim, nest, p, reachMm);
  if (!open) return null;
  const dx = p.x - open.x, dy = p.y - open.y, dz = p.z - open.z, len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return null;
  const f = (t: number): number => sim.field.sampleXYZ(open.x + dx * t, open.y + dy * t, open.z + dz * t);
  const steps = Math.max(2, Math.ceil(len / (0.1 * sim.world.bu)));
  let lo = 0, hi = -1;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (f(t) <= 0) { hi = t; break; }
    lo = t;
  }
  if (hi < 0) return null;
  for (let k = 0; k < 8; k++) { const m = (lo + hi) / 2; if (f(m) > 0) lo = m; else hi = m; }
  const pos = { x: open.x + dx * lo, y: open.y + dy * lo, z: open.z + dz * lo };
  const normal = { x: 0, y: 1, z: 0 };
  sim.field.gradient(pos, normal);
  const l = Math.hypot(normal.x, normal.y, normal.z) || 1;
  normal.x /= l; normal.y /= l; normal.z /= l;
  return { pos, normal };
}
