// Places the kitchen run(s) of the plan: base units with kickboards (one guaranteed passable kick-space
// section per run), countertops, the sink with its optional water film, fridge, cooker and washer.

import { rngInt, rngRange, rngChance, type RngState } from '@/core/rng';
import type { MaterialId } from '@/sim/types';
import { addMicro, addWaterBody, type GenContext } from '../../kit';
import type { WallFrame } from '../../catalog/interior/frame';
import {
  cookerTemplate, counterTemplate, fridgeTemplate, isCabinet, runDepths, runLevels, runTemplate, sinkRect, sinkTemplate,
  washerTemplate, type Slot,
} from '../../catalog/interior/cabinets';
import { BASE_UNIT, COOKER, FRIDGE, SINK, WASHER } from '../../catalog/interior/dims';
import { MICRO } from '../../tuning/pipeline';
import { clampGap, type KitchenPlan, type RunPlan } from './plan';
import type { Room } from './room';
import { placeBuilder } from './shellPlace';

/** A counter surface for counter items: frame, free spans along the run, depth range. */
export interface CounterInfo { f: WallFrame; spans: [number, number][]; n0: number; n1: number; topY: number }

export interface RunInfo {
  counters: CounterInfo[];
  /** World rects taken by the runs and appliances (table clearance, lanes). */
  footprints: { x0: number; x1: number; z0: number; z1: number }[];
  /** Wall intervals covered (u along the exterior wall; r along the end wall at u = uc). */
  extCovered: [number, number][];
  endCovered: [number, number] | null;
}

/** Merged a-intervals of consecutive cabinet slots. */
function cabinetSpans(slots: Slot[]): [number, number][] {
  const out: [number, number][] = [];
  for (const s of slots) {
    if (!isCabinet(s.kind)) continue;
    const last = out[out.length - 1];
    if (last && Math.abs(last[1] - s.a0) < 1e-6) last[1] = s.a1; else out.push([s.a0, s.a1]);
  }
  return out;
}

function kickSections(rng: RngState, run: RunPlan, room: Room): { a0: number; a1: number; gap: number; passable: boolean }[] {
  const spans = cabinetSpans(run.slots);
  if (spans.length > 0 && run.kickA0 < spans[0][0] && Math.abs(spans[0][0] - run.slots[0].a0) < 1e-6) spans[0][0] = run.kickA0;
  const secs: { a0: number; a1: number; gap: number; passable: boolean }[] = [];
  for (const [a0, a1] of spans) {
    const k = Math.max(1, Math.round((a1 - a0) / BASE_UNIT.kickSection));
    for (let i = 0; i < k; i++) secs.push({ a0: a0 + ((a1 - a0) * i) / k, a1: a0 + ((a1 - a0) * (i + 1)) / k, gap: 0, passable: false });
  }
  const sure = secs.length > 0 ? rngInt(rng, 0, secs.length - 1) : -1;
  const clear = MICRO.passClearK * room.bu;
  secs.forEach((s, i) => {
    s.gap = i === sure ? clampGap(rng, BASE_UNIT.kickGap[0], BASE_UNIT.kickGap[1], MICRO.gapMinBu * room.bu) : rngRange(rng, BASE_UNIT.kickGap[0], BASE_UNIT.kickGap[1]);
    s.passable = s.gap >= clear;
  });
  return secs;
}

/** Route positions: a door edge beside a gap, about one per 1.2 m of run. */
function routePositions(run: RunPlan): number[] {
  const cand: number[] = [];
  run.slots.forEach((s, i) => {
    if (!isCabinet(s.kind)) return;
    cand.push(i === 0 ? s.a1 - 12 : s.a0 + 12);
  });
  const out: number[] = [];
  for (const a of cand) if (out.length === 0 || a - out[out.length - 1] >= 1200) out.push(a);
  return out;
}

/** Counter segments: the counter extent minus the cooker slots. */
function counterSegments(run: RunPlan): [number, number][] {
  const cuts = run.slots.filter((s) => s.kind === 'cooker').map((s) => [s.a0, s.a1] as [number, number]).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let a = run.counterA0;
  for (const [c0, c1] of cuts) { if (c0 - a > 1) out.push([a, c0]); a = Math.max(a, c1); }
  if (run.counterA1 - a > 1) out.push([a, run.counterA1]);
  return out;
}

export function placeRuns(ctx: GenContext, room: Room, plan: KitchenPlan, rng: RngState, foot: number): RunInfo {
  const cw = plan.counterGap, cd = plan.counterDepth, fy = room.floorY;
  const material: MaterialId = rngChance(rng, 0.6) ? 'plastic' : 'stone';
  const d = runDepths(cw, cd), lv = runLevels(fy);
  const info: RunInfo = { counters: [], footprints: [], extCovered: [], endCovered: null };
  for (const run of [plan.main, plan.l]) {
    if (!run) continue;
    const kick = kickSections(rng, run, room);
    placeBuilder(ctx, runTemplate({ f: run.f, floorY: fy, slots: run.slots, counterGap: cw, counterDepth: cd, kick, routeAs: routePositions(run), foot }));
    const sink = run.slots.find((s) => s.kind === 'sink');
    const sinkA = sink ? (sink.a0 + sink.a1) / 2 : null;
    const segments = counterSegments(run);
    const cp = { f: run.f, floorY: fy, counterGap: cw, counterDepth: cd, segments, sinkA, material, foot };
    placeBuilder(ctx, counterTemplate(cp));
    if (sinkA !== null) {
      const sid = placeBuilder(ctx, sinkTemplate({ ...cp, sinkA }));
      if (rngChance(rng, SINK.dripP)) {
        const r = sinkRect(cp, sinkA);
        const c = run.f.p(sinkA, lv.counterTop - SINK.depth + SINK.wall, (r.n0 + r.n1) / 2);
        addWaterBody(ctx, { kind: 'bowl-water', vesselObjectId: sid, pos: c, radius: SINK.frontBack / 2 - SINK.wall, levelMm: SINK.filmMm, capMm: 0.8 * SINK.depth });
      }
    }
    for (const s of run.slots) {
      const ap = { f: run.f, floorY: fy, a0: s.a0, wallGap: 0, foot };
      if (s.kind === 'cooker') placeBuilder(ctx, cookerTemplate({ ...ap, wallGap: COOKER.wallGap, feetGap: rngRange(rng, COOKER.feetGap[0], COOKER.feetGap[1]) }));
      if (s.kind === 'washer') placeBuilder(ctx, washerTemplate({ ...ap, wallGap: WASHER.wallGap, feetGap: rngRange(rng, WASHER.feetGap[0], WASHER.feetGap[1]) }));
    }
    // the guaranteed passable kick-space section is the run's `kick-space` micro-connection (free space under the board)
    const sure = kick.find((k) => k.passable && k.gap >= MICRO.gapMinBu * room.bu - 1e-9);
    if (sure) {
      const a = (sure.a0 + sure.a1) / 2, off = Math.max(2 * room.bu, ctx.dims.cell);
      addMicro(ctx, {
        kind: 'kick-space', posA: run.f.p(a, fy, d.kickFront + off), posB: run.f.p(a, fy, d.kickBack - off),
        gapMm: sure.gap, minClearanceBu: sure.gap / room.bu, lengthBu: (BASE_UNIT.kickThick + 2 * off) / room.bu, useful: true, reason: 'shelter',
      });
    }
    const end = Math.max(run.counterA1, run.slots[run.slots.length - 1].a1);
    info.footprints.push(run.f.rect(run.name === 'main' ? 0 : run.kickA0, end, 0, d.counterFront));
    const free = segments.flatMap(([a0, a1]) => {
      if (sinkA === null || sinkA < a0 || sinkA > a1) return [[a0, a1] as [number, number]];
      return [[a0, sinkA - SINK.width / 2] as [number, number], [sinkA + SINK.width / 2, a1] as [number, number]];
    });
    info.counters.push({ f: run.f, spans: free, n0: cw, n1: cw + cd, topY: lv.counterTop });
    if (run.name === 'main') info.extCovered.push(uSpan(plan, 0, end));
    else info.endCovered = [0, end];
  }
  const fr = plan.fridge;
  placeBuilder(ctx, fridgeTemplate({ f: fr.f, floorY: fy, a0: fr.a0, wallGap: fr.wallGap, feetGap: fr.feetGap, foot }));
  const fEnd = fr.a0 + FRIDGE.width;
  info.footprints.push(fr.f.rect(fr.a0, fEnd, 0, fr.wallGap + FRIDGE.depth));
  if (fr.f === plan.main.f) info.extCovered.push(uSpan(plan, 0, fEnd + FRIDGE.sideGap));
  else info.endCovered = [0, Math.max(info.endCovered?.[1] ?? 0, fEnd + FRIDGE.sideGap)];
  return info;
}

/** u interval of main-run coordinates [a0, a1]. */
function uSpan(plan: KitchenPlan, a0: number, a1: number): [number, number] {
  const u0 = plan.uc + plan.sigma * a0, u1 = plan.uc + plan.sigma * a1;
  return [Math.min(u0, u1), Math.max(u0, u1)];
}
