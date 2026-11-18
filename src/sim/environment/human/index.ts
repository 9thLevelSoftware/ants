// Human activity (GDD 04 §15; owner: human-events). One environment-phase system: the day's schedule at 00:00,
// grass growth, the reactive rules, then every running event's cues and impacts. Public read-only queries feed the
// threat overlay (forecast), the weather effects (local rain from sprinklers and hoses) and the debug API.

import type { CommandHandlerMap, HumanEventInst, HumanEventKind, Sim, System } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { HUMAN_REACTIVE_EVERY, HUMAN_SCHEDULE, type CrushContact } from '@/sim/balance/human';
import { calendarTick, dayOf, TICKS_PER_DAY, TICKS_PER_HOUR, TICKS_PER_SECOND } from '@/sim/time';
import { humanExtra } from './extra';
import { baitSpot, ensureListener, newInst, reactiveCheck, reactiveNewDay } from './reactive';
import { liftParkedForDeparture, startDue, stepRuns } from './runner';
import { scheduleDay } from './schedule';
import { humanSites, type HumanSite } from './sites';
import { grassDaily, runRegrow } from './effects/grass';
import { runBaits } from './effects/bait';
import { crushPAt } from './effects/ground';
import { syncHeightOverlays } from './effects/terrain';
import { humanPlan } from './plans';
import { humanActivityOff } from './rules';
import { openingGraceEndTick } from '@/sim/timeGrace';

export { humanPlan } from './plans';
export { humanSites, siteById, sitesOf, type HumanSite, type HumanSites } from './sites';
export { inFootprint, footprintRadius, type HumanPlan, type Impact, type Actor, type ActorKey, type ActorKind, type Footprint } from './plan';
export { scheduleDay, drawDayEvents, dayContext, rowFrequency, siteScale, type DayContext } from './schedule';
export { humanActivityOff, humanFreqMult, humanLethalMult, humanTelegraphMult } from './rules';
export { crushPAt } from './effects/ground';

const prepared = new WeakSet<Sim>();

function newDay(sim: Sim, day: number): void {
  const h = sim.state.env.human, now = sim.state.tick;
  const dayStart = day * TICKS_PER_DAY - sim.state.env.calendar.startTick;
  grassDaily(sim, day);
  reactiveNewDay(sim, day, dayStart);
  // instances pushed past midnight by the spacing rule carry over; long-overdue ones are dropped
  const carry = h.scheduled.filter((i) => !i.cancelled && i.startTick >= now - TICKS_PER_HOUR);
  // GDD 06 §5.2 opening grace: nothing is scheduled before it ends (sim-seams cross-edit, src/sim/timeGrace.ts)
  const fresh = scheduleDay(sim, day, Math.max(h.dayIndex < 0 ? now : dayStart, openingGraceEndTick(sim)));
  h.scheduled = [...carry, ...fresh].sort((a, b) => a.startTick - b.startTick || a.id - b.id);
  h.dayIndex = day;
  sim.emit({ type: 'human.scheduled', day, instIds: fresh.map((i) => i.id) });
}

export function runHumanEvents(sim: Sim): void {
  const h = sim.state.env.human;
  // winter: the overwintering time-lapse simulates no people (§15.1)
  if (sim.state.env.winter.winterActive) return;
  if (!prepared.has(sim)) { prepared.add(sim); ensureListener(sim); syncHeightOverlays(sim); }
  const day = dayOf(calendarTick(sim.state));
  if (h.dayIndex !== day) newDay(sim, day);
  const now = sim.state.tick, ex = humanExtra(sim);
  if (now % HUMAN_REACTIVE_EVERY === 0) {
    reactiveCheck(sim, (inst) => h.scheduled.push(inst));
    runRegrow(sim);
    runBaits(sim);
  }
  if (ex.baitDueTick >= 0 && humanActivityOff(sim)) ex.baitDueTick = -1; // switched off before the placement
  if (ex.baitDueTick >= 0 && now >= ex.baitDueTick) {
    ex.baitDueTick = -1;
    const at = baitSpot(sim, ex.baitDuePatio);
    if (at) h.scheduled.push(newInst(sim, 'bait-station', 'station', -1, now, at));
  }
  startDue(sim);
  liftParkedForDeparture(sim);
  stepRuns(sim);
}

/** Human activity schedule, telegraphs, impacts (GDD 04 §15). */
export const humanEventsSystem: System = { name: 'human-events', phase: 'environment', run: runHumanEvents };

/** The site an event of `kind` would use at a point (the site containing it, else the first of the row's site kind). */
function siteFor(sim: Sim, kind: HumanEventKind, variant: string | null, at: Vec3 | null): HumanSite | undefined {
  const kinds = HUMAN_SCHEDULE.filter((r) => r.kind === kind && (variant === null || r.variant === null || r.variant === variant)).map((r) => r.site);
  if (kind === 'watering') kinds.push('sprinkler', 'bed');
  const list = humanSites(sim.world).list.filter((s) => kinds.includes(s.kind));
  if (at) {
    const inside = list.find((s) => at.x >= s.rect.x0 && at.x <= s.rect.x1 && at.z >= s.rect.z0 && at.z <= s.rect.z1);
    if (inside) return inside;
  }
  return list[0];
}

export const commandHandlers: Partial<CommandHandlerMap> = {
  'cheat.humanEvent': (sim, cmd) => {
    const site = siteFor(sim, cmd.kind, cmd.variant, cmd.at);
    let at = cmd.at ? { ...cmd.at } : null;
    if (cmd.kind === 'bait-station' && !at) at = baitSpot(sim, false);
    const variant = cmd.variant ?? HUMAN_SCHEDULE.find((r) => r.kind === cmd.kind)?.variant ?? null;
    const inst = newInst(sim, cmd.kind, variant, site?.id ?? -1, sim.state.tick + Math.max(0, Math.round(cmd.startInS * TICKS_PER_SECOND)), at);
    sim.state.env.human.scheduled.push(inst);
  },
  'cheat.setGrass': (sim, cmd) => {
    const nav = sim.world.nav.cls, g = sim.state.worldDelta.grassHeightMm;
    for (let k = 0; k < nav.nz; k++) {
      for (let i = 0; i < nav.nx; i++) {
        const x = (i + 0.5) * nav.cell, z = (k + 0.5) * nav.cell;
        if (cmd.center && Math.hypot(x - cmd.center.x, z - cmd.center.z) > cmd.radius) continue;
        if (g[k * nav.nx + i] > 0 || cmd.center) g[k * nav.nx + i] = Math.max(0, Math.round(cmd.heightMm));
      }
    }
  },
};

export interface HumanForecastEntry {
  instId: number;
  kind: HumanEventKind;
  variant: string | null;
  startTick: number;
  /** Plain words of the place (alert `{area}`). */
  area: string;
  /** Bounds the event may touch, mm (site bounds before the plan exists). */
  rect: { x0: number; z0: number; x1: number; z1: number };
}

/** Upcoming and running events (threat-overlay forecast, GDD 08; `query.world.humanSchedule`). */
export function humanForecast(sim: Sim): HumanForecastEntry[] {
  const h = sim.state.env.human, sites = humanSites(sim.world).list;
  const entry = (i: HumanEventInst): HumanForecastEntry => {
    const s = sites[i.regionId];
    const plan = h.active.some((r) => r.instId === i.id) ? humanPlan(sim, i) : null;
    return {
      instId: i.id, kind: i.kind, variant: i.variant, startTick: i.startTick, area: s?.area ?? 'garden',
      rect: plan ? { ...plan.area } : s ? { ...s.rect } : i.at ? { x0: i.at.x - 500, z0: i.at.z - 500, x1: i.at.x + 500, z1: i.at.z + 500 } : { x0: 0, z0: 0, x1: 0, z1: 0 },
    };
  };
  const running = h.active.map((r) => r.inst).filter((i): i is HumanEventInst => !!i);
  return [...running, ...h.scheduled.filter((i) => !i.cancelled)].map(entry);
}

/** Local rain rate from sprinklers, hoses and cans (a leaf module, so the weather effects and the nest flood model
 * can read it without loading the whole human-events module; nest-fix3 item 7). */
export { humanRainRateAt } from './waterRate';

/** Crush probability for a contact at a point (debug `query.world.crushP`). */
export function crushP(sim: Sim, contact: CrushContact, pos: Vec3): number {
  return crushPAt(sim, contact, pos);
}

export const systems: readonly System[] = [humanEventsSystem];
