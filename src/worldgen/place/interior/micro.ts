// Micro-connections of the building (GDD 04 §6.2), all free space between primitives (directions §K): the
// door crack (or a closed weather strip), pipe penetrations, the guaranteed weep vent of the façade, and the
// skirting gap. Kick-space sections are registered with the runs. Also the skirting boards themselves, which
// need the wall intervals the furniture left free.

import { rngChance, rngRange, type RngState } from '@/core/rng';
import { addMicro, qmm, supportAt, type GenContext } from '../../kit';
import { WallFrame } from '../../catalog/interior/frame';
import { skirtingTemplate, type SkirtingRun } from '../../catalog/interior/shell';
import { BACK_DOOR, HOUSE_WALL, SKIRTING, WEEP_VENT } from '../../catalog/interior/dims';
import { MICRO } from '../../tuning/pipeline';
import { clampGap, type KitchenPlan } from './plan';
import type { Room } from './room';
import type { RunInfo } from './runPlace';
import { placeBuilder } from './shellPlace';
import { clearanceAt } from './solid';

/** A mouth on a support top may sit this far above `capY` and still count as on it (quantisation), mm. */
const MOUTH_CAP_TOL = 1;
/** Height above a mouth at which it must be free space, mm. */
const MOUTH_CHECK_LIFT = 0.5;

/** Mouth offset beyond a wall face: one terrain cell (the zone raster puts a face within half a cell). */
export function mouthOff(ctx: GenContext): number {
  return Math.max(2 * ctx.dims.bu, ctx.dims.cell);
}

/** Interval [lo, hi] minus the given intervals. */
function subtract(lo: number, hi: number, cuts: [number, number][]): [number, number][] {
  const c = [...cuts].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let x = lo;
  for (const [a, b] of c) { if (a > x) out.push([x, Math.min(a, hi)]); x = Math.max(x, b); }
  if (hi > x) out.push([x, hi]);
  return out.filter(([a, b]) => b - a >= SKIRTING.minRun);
}

/** Mouths of a skirting gap at the board's middle: on the floor in front of the board, and in its void. */
function skirtingMouths(run: SkirtingRun, off: number, floorY: number) {
  const a = (run.a0 + run.a1) / 2;
  return { posA: run.f.p(a, floorY, run.void + SKIRTING.thick + off), posB: run.f.p(a, floorY, run.void / 2) };
}

export function placeSkirting(ctx: GenContext, room: Room, plan: KitchenPlan, runs: RunInfo, rng: RngState): void {
  const ext = room.ext, eu = room.eu, er = room.er, neg = (a: { x: number; z: number }) => ({ x: -a.x, z: -a.z });
  const jamb = BACK_DOOR.leafWidth / 2 + BACK_DOOR.jambWidth;
  const walls: { f: WallFrame; spans: [number, number][] }[] = [
    { f: ext, spans: subtract(room.u0, room.u1, [[plan.door.u - jamb, plan.door.u + jamb], ...runs.extCovered]) },
    { f: new WallFrame(ext.x(0, room.depth), ext.z(0, room.depth), eu, neg(er)), spans: subtract(room.u0, room.u1, []) },
  ];
  for (const [u, dir] of [[room.u0, eu], [room.u1, neg(eu)]] as const) {
    const cut = runs.endCovered && Math.abs(plan.uc - u) < 1 ? [runs.endCovered] : [];
    walls.push({ f: new WallFrame(ext.x(u, 0), ext.z(u, 0), er, dir), spans: subtract(0, room.depth, cut) });
  }
  const min = MICRO.gapMinBu * room.bu, clear = MICRO.passClearK * room.bu;
  // the furniture already stands: the gap's mouths must be free floor (not under a bowl mat or a bin)
  const mouths = (run: SkirtingRun) => skirtingMouths(run, mouthOff(ctx), room.floorY);
  const mouthsFree = (run: SkirtingRun) => {
    const m = mouths(run);
    return [m.posA, m.posB].every((p) => clearanceAt(ctx, p.x, p.y + MOUTH_CHECK_LIFT, p.z) > 0);
  };
  const boards: SkirtingRun[] = [];
  let gapRun: SkirtingRun | null = null;
  for (const w of walls) for (const [a0, a1] of w.spans) {
    const open = rngChance(rng, SKIRTING.passableP);
    const gap = open ? clampGap(rng, SKIRTING.floorGap[0], SKIRTING.floorGap[1], min) : rngRange(rng, 0, Math.min(SKIRTING.floorGap[1], 0.8 * clear));
    const vd = open ? clampGap(rng, SKIRTING.void[0], SKIRTING.void[1], min) : rngRange(rng, SKIRTING.void[0], SKIRTING.void[1]);
    const run = { f: w.f, a0, a1, gap, void: vd };
    boards.push(run);
    if (!gapRun && gap >= min && vd >= min && mouthsFree(run)) gapRun = run;
  }
  if (boards.length > 0) placeBuilder(ctx, skirtingTemplate(room.floorY, boards));
  if (gapRun) {
    const { posA, posB } = mouths(gapRun), off = mouthOff(ctx);
    addMicro(ctx, {
      kind: 'skirting-gap', posA, posB,
      gapMm: Math.min(gapRun.gap, gapRun.void), minClearanceBu: Math.min(gapRun.gap, gapRun.void) / room.bu,
      lengthBu: (SKIRTING.thick + off) / room.bu, useful: true, reason: 'hidden route along the wall',
    });
  }
}

/**
 * An outside mouth whose height is only known once the garden surface is final (the paving comes in the props
 * step): the mouth rests on the highest support at its (x, z) at or below `capY`, and the connection's length
 * follows from that height.
 */
export interface OutsideMouth { microId: number; capY: number; length: (outY: number) => number }

/** Door crack (or the closed weather-strip instance), pipe penetrations and the façade's weep vent. */
export function placeBuildingMicro(ctx: GenContext, room: Room, plan: KitchenPlan | null, vents: { u: number; slot: number }[]): OutsideMouth[] {
  const ext = room.ext, off = mouthOff(ctx), bu = room.bu, T = room.T;
  const mouths: OutsideMouth[] = [];
  /** Outside mouth at u, one mouth offset beyond the garden face, provisionally on the support there. */
  const outside = (u: number, capY: number) => {
    const x = ext.x(u, -T - off), z = ext.z(u, -T - off);
    return { x, y: supportAt(ctx, x, z, capY), z };
  };
  if (plan) {
    const u = plan.door.u, gap = plan.door.gap;
    // on the threshold sill's top (its nose reaches past the garden face), outside the leaf
    const cap = room.floorY + MOUTH_CAP_TOL;
    const length = () => (T + 2 * off) / bu;
    const posA = outside(u, cap);
    mouths.push({
      microId: addMicro(ctx, {
        kind: 'door-crack', posA, posB: ext.p(u, room.floorY, off),
        gapMm: gap, minClearanceBu: gap / bu, lengthBu: length(),
        useful: gap >= MICRO.gapMinBu * bu, reason: plan.door.sealed ? 'weather strip' : 'interior access',
      }), capY: cap, length,
    });
    for (const p of plan.pipes) {
      const y = p.axisY, holeBottom = y - p.diam / 2 - p.annulus;
      const length = (outY: number) => (T + 2 * off + Math.max(0, holeBottom - outY) + (y - room.floorY)) / bu;
      const posA = outside(p.u, holeBottom);
      mouths.push({
        microId: addMicro(ctx, {
          kind: 'pipe-penetration', posA, posB: ext.p(p.u, room.floorY, off),
          gapMm: p.annulus, minClearanceBu: p.annulus / bu, lengthBu: length(posA.y),
          useful: p.annulus >= MICRO.gapMinBu * bu, reason: p.at === 'sink' ? 'interior access (under the sink)' : 'interior access (behind the washer)',
        }), capY: holeBottom, length,
      });
    }
  }
  const v = vents[0];
  if (v) {
    const length = (outY: number) => (HOUSE_WALL.outerLeaf + off + room.cavity / 2 + Math.max(0, WEEP_VENT.courseY - outY)) / bu;
    const posA = outside(v.u, WEEP_VENT.courseY);
    mouths.push({
      microId: addMicro(ctx, {
        kind: 'weep-vent', posA, posB: ext.p(v.u, WEEP_VENT.courseY, -T + HOUSE_WALL.outerLeaf + room.cavity / 2),
        gapMm: v.slot, minClearanceBu: v.slot / bu, lengthBu: length(posA.y),
        useful: false, reason: 'wall cavity',
      }), capY: WEEP_VENT.courseY, length,
    });
  }
  return mouths;
}

/** Re-seats the outside mouths on the final garden surface (paving, sills); call after the outdoor props. */
export function settleOutsideMouths(ctx: GenContext, mouths: readonly OutsideMouth[]): void {
  for (const m of mouths) {
    const c = ctx.world.micro.find((x) => x.id === m.microId);
    if (!c) continue;
    const y = qmm(supportAt(ctx, c.posA.x, c.posA.z, m.capY));
    c.posA = { x: c.posA.x, y, z: c.posA.z };
    c.lengthBu = m.length(y);
    if (!(clearanceAt(ctx, c.posA.x, y + MOUTH_CHECK_LIFT, c.posA.z) > 0)) ctx.notes.push(`interior: ${c.kind} outside mouth is not in free space`);
  }
}
