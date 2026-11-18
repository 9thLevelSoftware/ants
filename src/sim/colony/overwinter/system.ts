// The overwintering trigger sequence (GDD 06 §6.2): notice on the day before the last day of autumn at noon, the
// banner on winter day 1 at 00:00 (Begin / Delay one day, at most OVERWINTER_DELAY_MAX_DAYS), Begin (the aggregate
// step, then the time-lapse shown by the game), and the report closed (back to 1x). Species without a lapse
// (`active`), the `realtime` rule and heated nests play winter normally.

import type { Colony, CommandHandlerMap, CommandOf, DeathCause, Sim, System, WinterRecord } from '@/sim/types';
import { DEATH_CAUSES } from '@/sim/types';
import { killAnt } from '@/sim/entities';
import { calendarTickAt, currentDayOfSeason, currentHour, currentSeason, currentYear, seasonLength, TICKS_PER_DAY, TICKS_PER_SECOND, yearOf, calendarTick } from '@/sim/time';
import { timeHandlers } from '@/sim/environment';
import {
  OVERWINTER_BANNER_AUTO_S, OVERWINTER_DELAY_MAX_DAYS, OVERWINTER_NOTICE_DAYS_BEFORE_END, OVERWINTER_NOTICE_HOUR,
  WINTER_ACTIVE_TMEAN_C,
} from '@/sim/balance/lifecycle';
import { lifecycleOf, openingOver, playerCol } from '../succession/lifecycleState';
import { beginOverwinter, heatedNest, noteHazardAlerts, sampleBroodTemp, winterParams } from './begin';
import { clusterOf } from './climate';
import { dayNeedC, metFactor } from './model';
import { isWorkerCaste } from '../census';
import { clearLifecycleAlert, raiseLifecycleAlert } from '../succession/alerts';
import { endColony } from '../succession/system';
import { reportNumbers } from './report';

/** How often the trigger sequence is checked, ticks (the banner is at most this late). */
const CHECK_EVERY = 5;

function reject(sim: Sim, reason: string, detail = ''): void {
  sim.emit({ type: 'command-rejected', commandType: 'overwinterChoice', reason, detail });
}

/** The player colony needs the lapse this winter (mode, rule, opening done, someone alive). */
function lapseWanted(sim: Sim): boolean {
  const col = playerCol(sim);
  if (!col || !col.alive || col.livingAnts <= 0) return false;
  const def = sim.getSpecies(col.species);
  if (!def || def.winter.mode === 'active') return false;
  if (sim.state.config.rules.winterMode !== 'timelapse') return false;
  return openingOver(sim);
}

/**
 * Ticks the banner waits before Begin happens on its own: OVERWINTER_BANNER_AUTO_S real seconds at the running speed
 * (80 ticks at 1x, 640 at 8x). A speed change while the banner shows rescales the wait.
 */
export function bannerAutoTicks(sim: Sim): number {
  return Math.round(OVERWINTER_BANNER_AUTO_S * TICKS_PER_SECOND * Math.max(1, sim.state.env.time.speed));
}

/** Days of winter the colony's C stores cover at the winter rate of its cluster now (the notice alert). */
export function storeDays(sim: Sim, col: Colony): number {
  const def = sim.getSpecies(col.species);
  if (!def) return 0;
  let workers = 0, larvae = 0;
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id && isWorkerCaste(a.caste)) workers++;
  for (const b of sim.state.brood) if (b.alive && b.colony === col.id && (b.stage === 'larva' || b.stage === 'egg')) larvae++;
  const queen = sim.stores.ants.get(col.queenId);
  const need = dayNeedC(workers, larvae, !!queen && queen.alive, metFactor(winterParams(sim, def), clusterOf(sim, col).tNow));
  return need > 0 ? Math.floor(col.stores.c / need) : 0;
}

/**
 * Tokens of the `winter-coming` alert ("stores cover {x} of {winterDays} days"): `x` = days of cover clamped to the
 * length of the winter (stores for 28 days read "28 of 7" before), `more` = 1 when the stores last longer than the
 * winter (the interface may say "more than the winter"), `coverDays` = the unclamped days for a detail line.
 */
export function winterNoticeTokens(coverDays: number, winterDays: number): { x: number; winterDays: number; more: number; coverDays: number } {
  return { x: Math.min(coverDays, winterDays), winterDays, more: coverDays > winterDays ? 1 : 0, coverDays };
}

/** Shows the banner (or resolves the winter as active when the nest is heated). */
function openBanner(sim: Sim): void {
  const s = sim.state;
  const col = playerCol(sim)!;
  const def = sim.getSpecies(col.species)!;
  const w = s.env.winter;
  if (heatedNest(sim, col, def, WINTER_ACTIVE_TMEAN_C)) {
    w.winterActive = true;
    w.lastYearResolved = currentYear(s);
    return;
  }
  w.winterActive = false;
  w.phase = 'banner';
  lifecycleOf(col).bannerTick = s.tick;
  // foragers are recalled: every outdoor ant goes home (the stay-in directive, cleared at Begin)
  col.directives.stayIn = true;
  col.directives.stayInUntil = s.tick + TICKS_PER_DAY;
  sim.emit({ type: 'overwinter.banner' });
}

/** Begin: the aggregate step, the lapse (paused clock, `player.timelapse`), the report events. */
export function begin(sim: Sim): WinterRecord | null {
  const s = sim.state;
  const col = playerCol(sim);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def) return null;
  const w = s.env.winter;
  sim.emit({ type: 'overwinter.begin' });
  col.directives.stayIn = false;
  col.directives.stayInUntil = -1;
  clearLifecycleAlert(sim, col, 'winter-coming');
  const rec = beginOverwinter(sim, col, def);
  w.phase = 'lapse';
  w.lastYearResolved = rec.year;
  w.delaysUsed = 0;
  w.report = reportNumbers(rec);
  lifecycleOf(col).bannerTick = -1;
  // the game plays the lapse with the clock stopped; closing the report resumes 1x
  const time = s.env.time;
  const from = time.paused ? 0 : time.speed;
  time.paused = true;
  time.skipUntil = -1;
  if (from !== 0) sim.emit({ type: 'time.speed-changed', from, to: 0, reason: 'overwinter' });
  s.player.timelapse = {
    kind: 'winter', startTick: rec.beginTick, endTick: rec.springTick, progress: 1, stage: 'winter',
    counters: { workers0: rec.workers0, workers1: rec.workers1, days: rec.days.length }, interrupt: null,
  };
  sim.emit({ type: 'overwinter.report', report: { ...w.report } });
  return rec;
}

function closeReport(sim: Sim): void {
  const s = sim.state;
  const w = s.env.winter;
  if (w.phase !== 'lapse' && w.phase !== 'report') return reject(sim, 'invalid-phase', w.phase);
  w.phase = 'none';
  s.player.timelapse = null;
  const time = s.env.time;
  time.paused = false;
  time.speed = 1;
  time.requested = 1;
  sim.emit({ type: 'time.speed-changed', from: 0, to: 1, reason: 'overwinter' });
  sim.emit({ type: 'overwinter.end' });
  endIfNoWorkers(sim);
}

/**
 * GDD 06 §6.6: no worker came through the winter: the lapse ends with the Epitaph (after the report has explained
 * why), cause = the leading loss cause. A queen left alone cannot raise brood without workers; she dies with it.
 */
function endIfNoWorkers(sim: Sim): void {
  const col = playerCol(sim);
  const rec = col ? lifecycleOf(col).winters.at(-1) : undefined;
  if (!col || !rec || rec.workers1 > 0) return;
  if (sim.state.ants.some((a) => a.alive && a.colony === col.id && isWorkerCaste(a.caste))) return;
  const cause = leadingCause(rec);
  for (const a of sim.state.ants) if (a.alive && a.colony === col.id) killAnt(sim, a.id, cause);
  endColony(sim, col, cause);
}

/** The winter's leading loss cause as a death cause ('outdoors' is cold). */
function leadingCause(rec: WinterRecord): DeathCause {
  const ranked = Object.entries(rec.losses).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const top = ranked[0]?.[0] ?? 'cold';
  if (top === 'outdoors') return 'cold';
  return (DEATH_CAUSES as readonly string[]).includes(top) ? (top as DeathCause) : 'unknown';
}

function choice(sim: Sim, c: CommandOf<'overwinterChoice'>): void {
  const w = sim.state.env.winter;
  if (c.choice === 'close-report') return closeReport(sim);
  if (w.phase !== 'banner') return reject(sim, 'invalid-phase', w.phase);
  if (c.choice === 'begin') { begin(sim); return; }
  if (c.choice !== 'delay') return reject(sim, 'invalid-choice', String(c.choice));
  if (w.delaysUsed >= OVERWINTER_DELAY_MAX_DAYS) return reject(sim, 'limit', String(w.delaysUsed));
  w.delaysUsed++;
  w.phase = 'none';
  const col = playerCol(sim);
  if (col) {
    const life = lifecycleOf(col);
    life.bannerTick = -1;
    const ct = calendarTick(sim.state);
    life.delayUntilTick = sim.state.tick + (TICKS_PER_DAY - (ct % TICKS_PER_DAY));
  }
}

/** Debug: the clock moves to winter day 1, 00:00 of this year (or the next if past it) and the banner shows. */
function triggerWinter(sim: Sim): void {
  const s = sim.state;
  const cfg = s.config;
  const ct = calendarTick(s);
  const yearStart = (yearOf(ct, cfg) - 1) * seasonLength(s) * 4 * TICKS_PER_DAY;
  let target = yearStart + calendarTickAt('winter', 1, 0, cfg);
  if (target < ct) target = ct; // already in winter: from now
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: target });
  s.env.winter.phase = 'none';
  if (lapseWanted(sim)) openBanner(sim);
}

export const overwinterSystem: System = {
  name: 'overwinter', phase: 'colony-economy', every: CHECK_EVERY,
  run: (sim) => {
    const s = sim.state;
    const w = s.env.winter;
    const col = playerCol(sim);
    if (!col) return;
    const life = lifecycleOf(col);
    const year = currentYear(s);
    const season = currentSeason(s);
    if (w.phase === 'banner') {
      if (s.tick - life.bannerTick >= bannerAutoTicks(sim)) begin(sim);
      return;
    }
    if (w.phase === 'lapse' || w.phase === 'report') return;
    const def = sim.getSpecies(col.species);
    if (def?.winter.heatedNestRule && col.alive) sampleBroodTemp(sim, col);
    if (col.alive) noteHazardAlerts(sim, col);
    // notice: autumn day (L - 1) from noon
    if (season === 'autumn' && life.noticeYear < year && currentDayOfSeason(s) >= seasonLength(s) - OVERWINTER_NOTICE_DAYS_BEFORE_END
      && currentHour(s) >= OVERWINTER_NOTICE_HOUR) {
      life.noticeYear = year;
      life.noticeTick = s.tick;
      if (lapseWanted(sim)) {
        w.phase = 'notice';
        sim.emit({ type: 'overwinter.notice' });
        raiseLifecycleAlert(sim, col, 'winter-coming', winterNoticeTokens(storeDays(sim, col), seasonLength(s)), 'diag-overwinter-readiness');
      }
    }
    // banner: winter, not yet resolved this year, no delay running
    if (season === 'winter' && w.lastYearResolved < year && s.tick >= life.delayUntilTick) {
      if (lapseWanted(sim)) openBanner(sim);
      else w.lastYearResolved = year;
    }
  },
};

export const overwinterCommandHandlers: Partial<CommandHandlerMap> = {
  overwinterChoice: choice,
  'cheat.triggerWinter': triggerWinter,
};
