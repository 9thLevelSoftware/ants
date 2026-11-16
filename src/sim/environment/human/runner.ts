// Running human events (GDD 04 §15.1-15.4): the day's draw at 00:00, start gates (weather, rain history, target
// presence) and start decisions (mowing stripe, car bay and direction, the crowd a broom covers), at most
// HUMAN_MAX_CONCURRENT at once, the cue window and impacts of every active run, and the end (casualties, parked
// cars, progress, swept items collected). Pure: state, seeded rng and the world only.

import { rngChance, rngRange } from '@/core/rng';
import type { HumanEventInst, HumanEventRun, Sim } from '@/sim/types';
import { clearAlert, raiseAlert } from '@/sim/progression';
import { removeItem } from '@/sim/entities';
import { spawnHumanFood } from '@/sim/ecology';
import {
  BROOM_COLLECT_P, CAR_DEPART_P, CAR_DOOR_OFFSET_MM, CAR_EVENING_DAY_FRAC, CAR_LITTER_P, HUMAN_DELAY_S, HUMAN_MAX_CONCURRENT, HUMAN_NO_WEATHER, HUMAN_RAIN_STATES, MOW_DRY_GD, MOW_REEL_P,
  SWEEP_GATHER_ANTS, SWEEP_GATHER_CELL_MM, WATER_DRY_GD,
} from '@/sim/balance/human';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { humanExtra } from './extra';
import { applyImpact } from './effects/kinds';
import { humanRng } from './effects/common';
import { addParkedCar, removeDyn } from './effects/objects';
import { refreshCues } from './cues';
import { firstImpactAtOrAfter, forgetPlan, humanPlan } from './plans';
import type { HumanPlan } from './plan';
import { newInst } from './reactive';
import { siteById } from './sites';

const OUTDOOR_RAIN_KINDS = new Set(['sweeping', 'food-drop', 'spill', 'children', 'mowing']);

/** Why an instance may not start now (null = it may). */
function gate(sim: Sim, inst: HumanEventInst): string | null {
  const w = sim.state.env.weather, site = siteById(sim.world, inst.regionId);
  const outdoor = !site || !Number.isFinite(site.y);
  if (HUMAN_NO_WEATHER[inst.kind]?.includes(w.state)) return 'weather';
  if (outdoor && HUMAN_RAIN_STATES.includes(w.state) && (OUTDOOR_RAIN_KINDS.has(inst.kind) || inst.variant === 'paw')) return 'rain';
  const sinceRain = w.history.lastRainEndTick === -1 ? Infinity : sim.state.tick - w.history.lastRainEndTick;
  if (inst.kind === 'mowing' && sinceRain < MOW_DRY_GD * TICKS_PER_DAY) return 'wet-grass';
  if (inst.kind === 'watering' && (HUMAN_RAIN_STATES.includes(w.state) || sinceRain < WATER_DRY_GD * TICKS_PER_DAY)) return 'rained';
  return null;
}

/** Start decisions fixed into the instance before its plan is built. False = no target (cancel). */
function prepare(sim: Sim, inst: HumanEventInst): boolean {
  const ex = humanExtra(sim), rng = humanRng(sim), site = siteById(sim.world, inst.regionId);
  if (inst.kind === 'mowing') {
    if (!inst.variant) inst.variant = rngChance(rng, MOW_REEL_P) ? 'reel' : 'motor';
    if ((inst.param ?? -1) < 0) inst.param = ex.progress[`mow:${inst.regionId}`] ?? 0;
  }
  if (inst.kind === 'vacuum' && (inst.param ?? -1) < 0) inst.param = ex.progress[`vac:${inst.regionId}`] ?? 0;
  if (inst.kind === 'car') {
    if (!site) return false;
    const parked = ex.parked.filter((p) => p.siteId === site.id);
    const free = site.bays.map((_, i) => i).filter((i) => !parked.some((p) => p.bay === i));
    const evening = ((sim.state.tick + sim.state.env.calendar.startTick) % TICKS_PER_DAY) / TICKS_PER_DAY > CAR_EVENING_DAY_FRAC;
    let depart = inst.variant === 'depart' || (inst.variant === null && parked.length > 0 && (evening || free.length === 0 || rngChance(rng, CAR_DEPART_P)));
    if (depart && parked.length === 0) depart = false;
    if (!depart && free.length === 0) return false;
    inst.variant = depart ? 'depart' : 'arrive';
    if ((inst.param ?? -1) < 0 || (depart ? !parked.some((p) => p.bay === inst.param) : !free.includes(inst.param ?? -1))) {
      inst.param = depart ? parked[Math.floor(rngRange(rng, 0, parked.length)) % parked.length].bay : free[Math.floor(rngRange(rng, 0, free.length)) % free.length];
    }
  }
  if (inst.kind === 'sweeping' && inst.variant === 'broom' && site?.kind === 'patio' && !inst.at) inst.at = crowdOn(sim, inst.regionId);
  return true;
}

/** Centre of the densest cell of player ants on a site when it holds >= SWEEP_GATHER_ANTS (GDD 04 §15.6). */
function crowdOn(sim: Sim, siteId: number): { x: number; y: number; z: number } | null {
  const site = siteById(sim.world, siteId);
  if (!site) return null;
  const player = sim.state.colonies[0]?.id ?? -1;
  const cells = new Map<number, { n: number; x: number; z: number }>();
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== player || a.nestId >= 0) continue;
    if (a.pos.x < site.rect.x0 || a.pos.x > site.rect.x1 || a.pos.z < site.rect.z0 || a.pos.z > site.rect.z1) continue;
    const k = Math.floor(a.pos.x / SWEEP_GATHER_CELL_MM) * 100000 + Math.floor(a.pos.z / SWEEP_GATHER_CELL_MM);
    const c = cells.get(k) ?? { n: 0, x: 0, z: 0 };
    c.n++; c.x += a.pos.x; c.z += a.pos.z;
    cells.set(k, c);
  }
  let best: { n: number; x: number; z: number } | null = null;
  for (const c of cells.values()) if (c.n >= SWEEP_GATHER_ANTS && (!best || c.n > best.n)) best = c;
  return best ? { x: best.x / best.n, y: 0, z: best.z / best.n } : null;
}

function cancel(sim: Sim, inst: HumanEventInst): void {
  inst.cancelled = true;
  sim.emit({ type: 'human.cancelled', instId: inst.id, kind: inst.kind });
}

/** Starts due instances (gates, decisions, concurrency); `queue` adds follow-up instances. */
export function startDue(sim: Sim): void {
  const h = sim.state.env.human, now = sim.state.tick, rng = humanRng(sim);
  for (const inst of [...h.scheduled]) {
    if (inst.cancelled || inst.startTick > now) continue;
    if (h.active.length >= HUMAN_MAX_CONCURRENT) {
      inst.startTick = now + Math.round(rngRange(rng, HUMAN_DELAY_S[0], HUMAN_DELAY_S[1]) * TICKS_PER_SECOND);
      continue;
    }
    h.scheduled.splice(h.scheduled.indexOf(inst), 1);
    if (gate(sim, inst) || !prepare(sim, inst)) { cancel(sim, inst); continue; }
    inst.startTick = now;
    forgetPlan(sim, inst.id); // a plan built before the start decisions (forecast, renderer) is stale
    const plan = humanPlan(sim, inst);
    if (!plan) { cancel(sim, inst); continue; }
    const run: HumanEventRun = { instId: inst.id, progressS: 0, nextImpactTick: now + plan.firstT, cues: [], inst, killed: 0, displaced: 0, itemsRemoved: 0 };
    h.active.push(run);
    // a hose or a can is carried in: a walking pass to the spot comes first (§15.2)
    if (inst.kind === 'watering' && inst.variant !== 'sprinkler' && plan.impacts[0]) {
      const f = plan.impacts[0].fp;
      h.scheduled.push(newInst(sim, 'footsteps', 'adult', -1, now, { x: f.x, y: f.y, z: f.z }));
    }
  }
}

function warn(sim: Sim, inst: HumanEventInst, plan: HumanPlan): void {
  const a = plan.area;
  const player = sim.state.colonies[0]?.id ?? -1;
  const exposed = sim.stores.ants.list.some((ant) => ant.alive && ant.colony === player && ant.nestId < 0
    && ant.pos.x >= a.x0 && ant.pos.x <= a.x1 && ant.pos.z >= a.z0 && ant.pos.z <= a.z1);
  if (!exposed) return;
  const area = siteById(sim.world, plan.siteId)?.area ?? 'garden';
  raiseAlert(sim, {
    kind: 'human-event-warning', level: 'warning', subjectId: inst.id, title: '', cause: '',
    focus: { kind: 'point', id: -1, pos: { x: (a.x0 + a.x1) / 2, y: plan.impacts[0]?.fp.y ?? 0, z: (a.z0 + a.z1) / 2 } },
    diagnosticId: 'diag-human-pressure', tokens: { area, event: inst.kind },
  });
}

/** Advances every active run by one tick: cues, start, impacts due, end. */
export function stepRuns(sim: Sim): void {
  const h = sim.state.env.human, now = sim.state.tick;
  for (const run of [...h.active]) {
    const inst = run.inst;
    const plan = inst ? humanPlan(sim, inst) : null;
    if (!inst || !plan) { h.active.splice(h.active.indexOf(run), 1); continue; }
    const t = now - inst.startTick;
    run.progressS = t / TICKS_PER_SECOND;
    const firstWarning = !run.telegraphTicks || Object.keys(run.telegraphTicks).length === 0;
    refreshCues(sim, run, inst, plan);
    if (firstWarning && run.telegraphTicks && Object.keys(run.telegraphTicks).length > 0) warn(sim, inst, plan);
    if (!run.started && t >= plan.firstT) {
      run.started = true;
      sim.emit({ type: 'human.start', instId: inst.id, kind: inst.kind, variant: inst.variant, region: inst.regionId });
    }
    // impacts due this tick (and any skipped since the last step)
    const from = run.started ? firstImpactAtOrAfter(plan, t) : plan.impacts.length;
    for (let i = from; i < plan.impacts.length && plan.impacts[i].t === t; i++) {
      const imp = plan.impacts[i];
      applyImpact(sim, run, plan, imp);
      sim.emit({ type: 'human.impact', instId: inst.id, kind: inst.kind, contact: imp.contact, footprint: { x: imp.fp.x, y: imp.fp.y, z: imp.fp.z }, radiusMm: Math.hypot(imp.fp.hx, imp.fp.hz) });
    }
    if (t >= plan.endT) endRun(sim, run, inst, plan);
  }
}

function endRun(sim: Sim, run: HumanEventRun, inst: HumanEventInst, plan: HumanPlan): void {
  const h = sim.state.env.human, ex = humanExtra(sim), rng = humanRng(sim);
  if (plan.resumeKey) ex.progress[plan.resumeKey] = plan.resume;
  if (run.touched && run.touched.length > 0) {
    let n = 0;
    for (const id of run.touched) if (rngChance(rng, BROOM_COLLECT_P) && removeItem(sim, id, 'swept-up')) n++;
    run.itemsRemoved = (run.itemsRemoved ?? 0) + n;
  }
  if (inst.kind === 'car') endCar(sim, inst, plan);
  sim.emit({ type: 'human.casualties', instId: inst.id, killed: run.killed ?? 0, displaced: run.displaced ?? 0, itemsRemoved: run.itemsRemoved ?? 0 });
  sim.emit({ type: 'human.end', instId: inst.id, kind: inst.kind, variant: inst.variant, region: inst.regionId });
  clearAlert(sim, 'human-event-warning', inst.id);
  h.active.splice(h.active.indexOf(run), 1);
  forgetPlan(sim, inst.id);
}

function endCar(sim: Sim, inst: HumanEventInst, plan: HumanPlan): void {
  const ex = humanExtra(sim), rng = humanRng(sim);
  const keys = plan.actors[0]?.keys ?? [];
  const last = keys[keys.length - 1];
  if (inst.variant === 'arrive' && last) {
    const primIds = addParkedCar(sim, last.x, last.y, last.z, last.yaw);
    ex.parked.push({ siteId: plan.siteId, bay: inst.param ?? 0, primIds, pos: { x: last.x, y: last.y, z: last.z }, yaw: last.yaw, arrivedTick: sim.state.tick });
    if (rngChance(rng, CAR_LITTER_P)) {
      const c = Math.cos(last.yaw), s = Math.sin(last.yaw);
      spawnHumanFood(sim, 'food-drop', { x: last.x - s * CAR_DOOR_OFFSET_MM, y: last.y, z: last.z + c * CAR_DOOR_OFFSET_MM });
    }
  } else if (inst.variant === 'depart') {
    const i = ex.parked.findIndex((p) => p.siteId === plan.siteId && p.bay === inst.param);
    if (i >= 0) {
      for (const id of ex.parked[i].primIds) removeDyn(sim, id, 'parked-car');
      ex.parked.splice(i, 1);
    }
  }
}

/** Removes the parked car of a bay before a departure plan drives it out (the car is drawn by the plan). */
export function liftParkedForDeparture(sim: Sim): void {
  const ex = humanExtra(sim);
  for (const run of sim.state.env.human.active) {
    const inst = run.inst;
    if (!inst || inst.kind !== 'car' || inst.variant !== 'depart' || run.progressS > 0.11) continue;
    const p = ex.parked.find((q) => q.siteId === inst.regionId && q.bay === inst.param);
    if (p && p.primIds.length > 0) { for (const id of p.primIds) removeDyn(sim, id, 'parked-car'); p.primIds = []; }
  }
}
