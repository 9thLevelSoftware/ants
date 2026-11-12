// Micro-connections of the building (GDD 04 §6.2), all free space between primitives (directions §K): the
// door crack (or a closed weather strip), pipe penetrations, the guaranteed weep vent of the façade, and the
// skirting gap. Kick-space sections are registered with the runs. Also the skirting boards themselves, which
// need the wall intervals the furniture left free.

import { rngChance, rngRange, type RngState } from '@/core/rng';
import { addMicro, terrainAt, type GenContext } from '../../kit';
import { WallFrame } from '../../catalog/interior/frame';
import { skirtingTemplate, type SkirtingRun } from '../../catalog/interior/shell';
import { BACK_DOOR, HOUSE_WALL, SKIRTING, WEEP_VENT } from '../../catalog/interior/dims';
import { MICRO } from '../../tuning/pipeline';
import { clampGap, type KitchenPlan } from './plan';
import type { Room } from './room';
import type { RunInfo } from './runPlace';
import { placeBuilder } from './shellPlace';

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
  const boards: SkirtingRun[] = [];
  let gapRun: SkirtingRun | null = null;
  for (const w of walls) for (const [a0, a1] of w.spans) {
    const open = rngChance(rng, SKIRTING.passableP);
    const gap = open ? clampGap(rng, SKIRTING.floorGap[0], SKIRTING.floorGap[1], min) : rngRange(rng, 0, Math.min(SKIRTING.floorGap[1], 0.8 * clear));
    const vd = open ? clampGap(rng, SKIRTING.void[0], SKIRTING.void[1], min) : rngRange(rng, SKIRTING.void[0], SKIRTING.void[1]);
    const run = { f: w.f, a0, a1, gap, void: vd };
    boards.push(run);
    if (!gapRun && gap >= min && vd >= min) gapRun = run;
  }
  if (boards.length > 0) placeBuilder(ctx, skirtingTemplate(room.floorY, boards));
  if (gapRun) {
    const a = (gapRun.a0 + gapRun.a1) / 2, off = mouthOff(ctx);
    addMicro(ctx, {
      kind: 'skirting-gap', posA: gapRun.f.p(a, room.floorY, gapRun.void + SKIRTING.thick + off), posB: gapRun.f.p(a, room.floorY, gapRun.void / 2),
      gapMm: Math.min(gapRun.gap, gapRun.void), minClearanceBu: Math.min(gapRun.gap, gapRun.void) / room.bu,
      lengthBu: (SKIRTING.thick + off) / room.bu, useful: true, reason: 'hidden route along the wall',
    });
  }
}

/** Door crack (or the closed weather-strip instance), pipe penetrations and the façade's weep vent. */
export function placeBuildingMicro(ctx: GenContext, room: Room, plan: KitchenPlan | null, vents: { u: number; slot: number }[]): void {
  const ext = room.ext, off = mouthOff(ctx), bu = room.bu, T = room.T;
  const ground = (u: number, r: number) => terrainAt(ctx, ext.x(u, r), ext.z(u, r));
  if (plan) {
    const u = plan.door.u, gap = plan.door.gap;
    addMicro(ctx, {
      kind: 'door-crack', posA: ext.p(u, ground(u, -T - off), -T - off), posB: ext.p(u, room.floorY, off),
      gapMm: gap, minClearanceBu: gap / bu, lengthBu: (T + 2 * off) / bu,
      useful: gap >= MICRO.gapMinBu * bu, reason: plan.door.sealed ? 'weather strip' : 'interior access',
    });
    for (const p of plan.pipes) {
      const y = p.axisY, out = ground(p.u, -T - off);
      const climb = Math.max(0, y - p.diam / 2 - p.annulus - out);
      addMicro(ctx, {
        kind: 'pipe-penetration', posA: ext.p(p.u, out, -T - off), posB: ext.p(p.u, room.floorY, off),
        gapMm: p.annulus, minClearanceBu: p.annulus / bu, lengthBu: (T + 2 * off + climb + (y - room.floorY)) / bu,
        useful: p.annulus >= MICRO.gapMinBu * bu, reason: p.at === 'sink' ? 'interior access (under the sink)' : 'interior access (behind the washer)',
      });
    }
  }
  const v = vents[0];
  if (v) {
    const out = ground(v.u, -T - off);
    addMicro(ctx, {
      kind: 'weep-vent', posA: ext.p(v.u, out, -T - off), posB: ext.p(v.u, WEEP_VENT.courseY, -T + HOUSE_WALL.outerLeaf + room.cavity / 2),
      gapMm: v.slot, minClearanceBu: v.slot / bu, lengthBu: (HOUSE_WALL.outerLeaf + off + room.cavity / 2 + Math.max(0, WEEP_VENT.courseY - out)) / bu,
      useful: false, reason: 'wall cavity',
    });
  }
}
