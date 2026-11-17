// Threat director and quiet share (GDD 05 §6, invariant I11). Major threats against the player colony: bird
// events and centipede nest invasions (this module), raids, Formica raids and rival digging (rivals module, through
// requestMajorThreat / endMajorThreat). At most one is active; a new one needs THREAT_MIN_QUIET_GD since the last
// ended, and while the trailing quiet share is below QUIET_SHARE_MIN + 0.05 it is refused as if that time had not
// passed. The hourly record lives in state.rivals.threatDirector.quiet (plain data).

import type { QuietTracker, Sim, ThreatDirector } from '@/sim/types';
import { LOUD_HOURS_PER_THREAT, QUIET_ALERT_SHARE, QUIET_MARGIN, QUIET_SAMPLE_EVERY, QUIET_WINDOW_GD } from '@/sim/balance/creatures';
import { difficultyValue } from '@/sim/balance/difficulty';
import { calendarTick, TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';
import { conditions } from './conditions';

const RING = QUIET_WINDOW_GD * 24;

function director(sim: Sim): ThreatDirector {
  return sim.state.rivals.threatDirector;
}

export function quietTracker(sim: Sim): QuietTracker {
  const td = director(sim);
  if (!td.quiet) {
    td.quiet = {
      hours: new Array<number>(RING).fill(-1), head: 0, curHour: -1, curThreat: 0, curSamples: 0, curAlertSamples: 0,
      curCounted: 0, total: 0, counted: 0, quiet: 0, threats: 0,
    };
  }
  return td.quiet;
}

/** Quiet hours / counted hours over the trailing window; null when no hour was counted yet. */
export function quietShare(sim: Sim): number | null {
  const { counted, quiet } = trailingCounts(sim);
  return counted > 0 ? quiet / counted : null;
}

/** May a new major threat start now (one at a time, minimum quiet time, trailing quiet share)? */
export function canStartMajorThreat(sim: Sim): boolean {
  const td = director(sim);
  if (td.activeKind !== null) return false;
  if (td.lastEndTick >= 0 && sim.state.tick - td.lastEndTick < difficultyValue(sim, 'threatMinQuietGd') * TICKS_PER_DAY) return false;
  // the trailing share must stay above the target + margin even with the new threat's loud hours in it (a window
  // with few counted hours - after winter, after founding - would otherwise drop below the target at once)
  const { counted, quiet } = trailingCounts(sim);
  return quiet / (counted + LOUD_HOURS_PER_THREAT) >= difficultyValue(sim, 'quietShareMin') + QUIET_MARGIN;
}

/** Counted and quiet hours in the trailing window. */
function trailingCounts(sim: Sim): { counted: number; quiet: number } {
  let counted = 0, quiet = 0;
  for (const h of quietTracker(sim).hours) if (h >= 0) { counted++; quiet += h; }
  return { counted, quiet };
}

/** Starts a major threat if the director allows it; true when it is now the active one. */
export function requestMajorThreat(sim: Sim, kind: string): boolean {
  if (!canStartMajorThreat(sim)) return false;
  const td = director(sim);
  td.activeKind = kind;
  td.activeSinceTick = sim.state.tick;
  quietTracker(sim).threats++;
  quietTracker(sim).curThreat = 1;
  return true;
}

export function endMajorThreat(sim: Sim, kind: string): void {
  const td = director(sim);
  if (td.activeKind !== kind) return;
  td.activeKind = null;
  td.lastEndTick = sim.state.tick;
}

function counts(sim: Sim): boolean {
  const c = conditions(sim);
  if (c.phase === 'night' || c.winter) return false;
  return sim.state.progression.stage.id !== 'founding';
}

function alertActive(sim: Sim): boolean {
  for (const a of sim.state.progression.alerts) if (a.level === 'warning' || a.level === 'critical') return true;
  return false;
}

/** Every tick: closes the previous clock hour when a new one starts and samples the current one. */
export function quietTick(sim: Sim): void {
  const q = quietTracker(sim);
  const hour = Math.floor(calendarTick(sim.state) / TICKS_PER_HOUR);
  if (hour !== q.curHour) {
    if (q.curHour >= 0) closeHour(q);
    q.curHour = hour;
    q.curThreat = director(sim).activeKind !== null ? 1 : 0;
    q.curSamples = 0;
    q.curAlertSamples = 0;
    q.curCounted = counts(sim) ? 1 : 0;
  }
  if (director(sim).activeKind !== null) q.curThreat = 1;
  if (sim.state.tick % QUIET_SAMPLE_EVERY === 0) {
    q.curSamples++;
    if (alertActive(sim)) q.curAlertSamples++;
  }
}

function closeHour(q: QuietTracker): void {
  let code = -1;
  if (q.curCounted) {
    const loudAlerts = q.curSamples > 0 && q.curAlertSamples / q.curSamples >= QUIET_ALERT_SHARE;
    code = q.curThreat || loudAlerts ? 0 : 1;
    q.counted++;
    q.quiet += code;
  }
  q.total++;
  q.hours[q.head] = code;
  q.head = (q.head + 1) % q.hours.length;
}
