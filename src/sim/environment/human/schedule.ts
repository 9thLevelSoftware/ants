// The day's human events (GDD 04 §15.1): drawn at 00:00 of each game day from the schedule table, the week
// (weekday / weekend), the season and default-year day windows, the map's sites and the difficulty. For every row
// whose site exists: count = floor(f) + (u < frac(f)), f = freq x day factor x freqMult; start times uniform inside
// a window picked by weight. The list drives the threat-overlay forecast (`human.scheduled`).

import { rngChance, rngFloat, rngInt, rngRange, type RngState } from '@/core/rng';
import type { HumanEventInst, HumanEventKind, HumanVariant, Sim } from '@/sim/types';
import { WEEK_DAYS, WEEKEND_FROM } from '@/sim/balance';
import {
  CHILDREN_HEAT_AVOID_H, HUMAN_NIGHT_CAR_MULT, HUMAN_NIGHT_INTERIOR_P, HUMAN_QUIET_HOURS, HUMAN_SAME_KIND_SPACING_H,
  HUMAN_SCHEDULE, HUMAN_WATER_VARIANT_W, type HumanScheduleRow, type HumanWindow,
} from '@/sim/balance/human';
import { defaultYearDoy, seasonOf, TICKS_PER_DAY, TICKS_PER_HOUR, weekdayOf } from '@/sim/time';
import { humanFreqMult } from './rules';
import { humanSites, type HumanSite } from './sites';

/** The day's context the draw depends on (pure inputs; tests build it directly). */
export interface DayContext {
  /** Calendar day index (0-based since spring day 1, year 1). */
  day: number;
  weekend: boolean;
  season: string;
  /** Default-year (28-day) day of year, 1-based. */
  doy28: number;
  heat: boolean;
  freqMult: number;
  /** Kinds the world generator disabled (no lane / region). */
  disabled: readonly string[];
}

export function dayContext(sim: Sim, day: number): DayContext {
  const cal = day * TICKS_PER_DAY + TICKS_PER_HOUR * 12;
  return {
    day, weekend: weekdayOf(cal) >= WEEKEND_FROM, season: seasonOf(cal, sim.state.config), doy28: defaultYearDoy(cal, sim.state.config),
    heat: sim.state.env.weather.state === 'heat', freqMult: humanFreqMult(sim), disabled: sim.world.meta.disabledEvents,
  };
}

/** Expected count of a row on a day (f before the integer draw); 0 when the row is gated off. */
export function rowFrequency(row: HumanScheduleRow, ctx: DayContext): number {
  if (ctx.freqMult <= 0 || ctx.disabled.includes(row.kind)) return 0;
  if (row.seasons && !row.seasons.includes(ctx.season)) return 0;
  if (row.doy && (ctx.doy28 < row.doy[0] || ctx.doy28 > row.doy[1])) return 0;
  const weekendLike = ctx.weekend || (row.summerIsWeekend === true && ctx.season === 'summer');
  if (row.weekendOnly && !ctx.weekend) return 0;
  let f = row.freq * ctx.freqMult;
  if (weekendLike && row.weekendMult !== undefined) f *= row.weekendMult;
  if (row.weekendShare !== undefined) {
    // the row's weekly count split weekend / weekdays (weekdays 0..WEEKEND_FROM-1 are workdays)
    const weekendDays = WEEK_DAYS - WEEKEND_FROM;
    f *= ctx.weekend ? (row.weekendShare * WEEK_DAYS) / weekendDays : ((1 - row.weekendShare) * WEEK_DAYS) / WEEKEND_FROM;
  }
  if (row.heatMult !== undefined && ctx.heat) f *= row.heatMult;
  return f;
}

function windowsOf(row: HumanScheduleRow, ctx: DayContext): readonly HumanWindow[] {
  const weekendLike = ctx.weekend || (row.summerIsWeekend === true && ctx.season === 'summer');
  let ws = weekendLike && row.weekendWindows ? row.weekendWindows : row.windows;
  if (row.kind === 'children' && ctx.heat) {
    // in heat, the 12-15 h part of a window is cut out
    const [a, b] = CHILDREN_HEAT_AVOID_H;
    ws = ws.flatMap((w) => (w.to <= a || w.from >= b ? [w] : [{ ...w, to: a }, { ...w, from: b }].filter((x) => x.to > x.from)));
  }
  return ws;
}

/** Hour of day drawn from weighted windows. */
function drawHour(rng: RngState, ws: readonly HumanWindow[]): number {
  let total = 0;
  for (const w of ws) total += w.w * (w.to - w.from > 0 ? 1 : 0);
  let u = rngFloat(rng) * total;
  for (const w of ws) {
    if (u <= w.w) return rngRange(rng, w.from, w.to);
    u -= w.w;
  }
  const last = ws[ws.length - 1];
  return rngRange(rng, last.from, last.to);
}

function drawCount(rng: RngState, f: number): number {
  const n = Math.floor(f);
  return n + (rngFloat(rng) < f - n ? 1 : 0);
}

/** Sites a row can use on this map. Watering takes any of the sprinkler / bed sites (variant by site). */
function rowSites(sim: Sim, row: HumanScheduleRow): HumanSite[] {
  const list = humanSites(sim.world).list;
  if (row.kind === 'watering') return list.filter((s) => s.kind === 'sprinkler' || s.kind === 'bed');
  return list.filter((s) => s.kind === row.site);
}

/** Watering variant and site among the map's sites (HUMAN_WATER_VARIANT_W renormalised). */
function waterChoice(rng: RngState, sites: HumanSite[]): { site: HumanSite; variant: HumanVariant } | null {
  const opts: { site: HumanSite; variant: 'sprinkler' | 'hose' | 'can'; w: number }[] = [];
  for (const s of sites) {
    if (s.kind === 'sprinkler') opts.push({ site: s, variant: 'sprinkler', w: HUMAN_WATER_VARIANT_W.sprinkler });
    if (s.kind === 'bed' && s.grid) opts.push({ site: s, variant: 'hose', w: HUMAN_WATER_VARIANT_W.hose });
    if (s.kind === 'bed') opts.push({ site: s, variant: 'can', w: HUMAN_WATER_VARIANT_W.can });
  }
  if (opts.length === 0) return null;
  let u = rngFloat(rng) * opts.reduce((a, o) => a + o.w, 0);
  for (const o of opts) { if (u <= o.w) return o; u -= o.w; }
  return opts[opts.length - 1];
}

/** One drawn instance before ids: kind, variant, site, start hour of the day. */
export interface DrawnEvent { kind: HumanEventKind; variant: HumanVariant | null; siteId: number; hour: number }

/** Count multiplier of a row at one of its sites (per-bay rows scale with the car park's bays). */
export function siteScale(row: HumanScheduleRow, site: HumanSite): number {
  return row.perBay ? site.bays.length : 1;
}

/** Rows in draw order: rows that depend on another kind's draw (notOnDayOf) come last. */
const DRAW_ORDER: readonly HumanScheduleRow[] = [
  ...HUMAN_SCHEDULE.filter((r) => !r.notOnDayOf), ...HUMAN_SCHEDULE.filter((r) => r.notOnDayOf),
];

/** Start hours of `f` expected instances: per window by weight (perWindow rows), else each in a weighted window. */
function drawHours(rng: RngState, row: HumanScheduleRow, ws: readonly HumanWindow[], f: number): number[] {
  const out: number[] = [];
  if (!row.perWindow) {
    const n = drawCount(rng, f);
    for (let i = 0; i < n; i++) out.push(drawHour(rng, ws));
    return out;
  }
  const total = ws.reduce((a, w) => a + w.w, 0);
  for (const w of ws) {
    const n = drawCount(rng, (f * w.w) / total);
    for (let i = 0; i < n; i++) out.push(rngRange(rng, w.from, w.to));
  }
  return out;
}

/** Draws the day's events (no ids, no spacing). Deterministic in the rng. */
export function drawDayEvents(sim: Sim, ctx: DayContext, rng: RngState): DrawnEvent[] {
  const out: DrawnEvent[] = [];
  for (const row of DRAW_ORDER) {
    const sites = rowSites(sim, row);
    if (sites.length === 0) continue;
    let f = rowFrequency(row, ctx);
    if (row.dayP !== undefined && !rngChance(rng, row.dayP)) f = 0;
    if (row.notOnDayOf && out.some((e) => e.kind === row.notOnDayOf)) f = 0;
    const perSite = row.kind === 'watering' ? [sites] : sites.map((s) => [s]);
    for (const group of perSite) {
      for (const hour of drawHours(rng, row, windowsOf(row, ctx), f * siteScale(row, group[0]))) {
        if (row.kind === 'watering') {
          const w = waterChoice(rng, group);
          if (w) out.push({ kind: 'watering', variant: w.variant, siteId: w.site.id, hour });
          continue;
        }
        out.push({ kind: row.kind, variant: row.variant, siteId: group[0].id, hour });
      }
    }
  }
  // quiet hours 22:00-06:00: a few night cars (x0.1) and one interior pass (p 0.3)
  const [qa, qb] = HUMAN_QUIET_HOURS;
  const quietSpan = 24 - qa + qb;
  const nightHour = (): number => { const h = qa + rngFloat(rng) * quietSpan; return h >= 24 ? h - 24 : h; };
  for (const row of HUMAN_SCHEDULE) {
    if (row.kind !== 'car') continue;
    for (const s of rowSites(sim, row)) {
      const n = drawCount(rng, rowFrequency(row, ctx) * HUMAN_NIGHT_CAR_MULT * (quietSpan / 24));
      for (let i = 0; i < n; i++) out.push({ kind: 'car', variant: null, siteId: s.id, hour: nightHour() });
    }
  }
  const inLane = humanSites(sim.world).list.find((s) => s.kind === 'interior-lane');
  if (inLane && ctx.freqMult > 0 && !ctx.disabled.includes('footsteps') && rngChance(rng, HUMAN_NIGHT_INTERIOR_P)) {
    out.push({ kind: 'footsteps', variant: 'adult', siteId: inLane.id, hour: nightHour() });
  }
  return out;
}

/**
 * The day's instances with ids and start ticks (state ticks), sorted; same kind at the same site at least
 * HUMAN_SAME_KIND_SPACING_H apart (later ones pushed back); instances before `fromTick` are dropped.
 */
export function scheduleDay(sim: Sim, day: number, fromTick: number): HumanEventInst[] {
  const rng = sim.stream('rng.events.human');
  const ctx = dayContext(sim, day);
  const drawn = drawDayEvents(sim, ctx, rng);
  const dayStart = day * TICKS_PER_DAY - sim.state.env.calendar.startTick;
  const list = drawn.map((d) => ({ d, tick: dayStart + Math.round(d.hour * TICKS_PER_HOUR) })).sort((a, b) => a.tick - b.tick);
  const last = new Map<string, number>();
  const gap = Math.round(HUMAN_SAME_KIND_SPACING_H * TICKS_PER_HOUR);
  const out: HumanEventInst[] = [];
  for (const e of list) {
    const key = `${e.d.kind}:${e.d.siteId}`;
    const prev = last.get(key);
    if (prev !== undefined && e.tick < prev + gap) e.tick = prev + gap;
    last.set(key, e.tick);
    const inst: HumanEventInst = {
      id: sim.state.nextId++, kind: e.d.kind, variant: e.d.variant, startTick: e.tick, laneId: -1, regionId: e.d.siteId,
      seed: rngInt(rng, 1, 0x7fffffff), cancelled: false, at: null, param: -1,
    };
    if (e.tick >= fromTick) out.push(inst);
  }
  return out.sort((a, b) => a.startTick - b.startTick || a.id - b.id);
}
