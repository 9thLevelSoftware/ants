// Alert engine (GDD 08 §6, App. A): active alerts de-duplicated by `kind:subjectId` (a repeat updates the card's
// count, an escalation re-raises), game-time cooldown after a key clears (a raise inside it goes to the event log
// only), click-through target (`focus`, `diagnosticId`). Every raise, escalation and clear is logged and emitted as
// an `alert` event {op, alert}. The interface owns presentation throttling in real time (toasts, rate limits).

import type { ActiveAlert, AlertKind, AlertLevel, Sim } from '@/sim/types';
import { ALERT_LEVELS } from '@/sim/types';
import { ALERT_COOLDOWN_GAME_H, ALERTS_ACTIVE_MAX } from '@/sim/balance';
import { TICKS_PER_HOUR } from '@/sim/time';
import { engineOf, memGet, memSet } from './engine';
import { logEvent } from './journal';

/** Alert fields a module supplies; progression fills id, ticks, count and acknowledgement. */
export type AlertRequest = Omit<ActiveAlert, 'id' | 'raisedTick' | 'updatedTick' | 'count' | 'acknowledged'>;

export function alertKey(kind: AlertKind, subjectId: number): string {
  return `${kind}:${subjectId}`;
}

const rank = (l: AlertLevel): number => ALERT_LEVELS.indexOf(l);

function cooldownTicks(level: AlertLevel): number {
  return Math.round((ALERT_COOLDOWN_GAME_H[level] ?? 0) * TICKS_PER_HOUR);
}

function snapshot(a: ActiveAlert): ActiveAlert {
  return { ...a, focus: a.focus ? { ...a.focus, pos: { ...a.focus.pos } } : null, tokens: a.tokens ? { ...a.tokens } : undefined };
}

function log(sim: Sim, a: ActiveAlert, op: string): void {
  logEvent(sim, `alert.${op}`, a.level, a.kind, a.tokens ?? {}, a.focus, a.title ? `${a.title} — ${a.cause}` : '');
}

/** Why a new alert for this request would not be stored now, or null when it would be. */
export type AlertRefusal = 'cooldown' | 'full';

/** Ranking used by the active-alert cap: unacknowledged above acknowledged, then by level. */
const capScore = (acknowledged: boolean, level: AlertLevel): number => (acknowledged ? 0 : 10) + rank(level);

/**
 * Whether a raise of `req` would be refused: its key cleared less than its cooldown ago (GDD 08 §6.3), or the
 * active list is full of alerts that all rank above it. An active key is never refused (it updates its card).
 */
export function alertRefusal(sim: Sim, req: Pick<AlertRequest, 'kind' | 'level' | 'subjectId'>): AlertRefusal | null {
  const p = sim.state.progression;
  if (p.alerts.some((a) => a.kind === req.kind && a.subjectId === req.subjectId)) return null;
  const cleared = engineOf(sim).alertCleared[alertKey(req.kind, req.subjectId)];
  if (cleared !== undefined && sim.state.tick - cleared < cooldownTicks(req.level)) return 'cooldown';
  if (p.alerts.length >= ALERTS_ACTIVE_MAX) {
    const score = capScore(false, req.level);
    if (p.alerts.every((a) => capScore(a.acknowledged, a.level) > score)) return 'full';
  }
  return null;
}

/**
 * Raises or updates an alert; returns its id, or -1 when it is refused (see `alertRefusal`): the raise then goes
 * to the event log only. A repeat of an active key counts up; a higher level escalates it, and a lower level from the
 * same diagnostic eases it (op 'update').
 */
export function raiseAlert(sim: Sim, req: AlertRequest): number {
  const p = sim.state.progression;
  const eng = engineOf(sim);
  const now = sim.state.tick;
  const cur = p.alerts.find((a) => a.kind === req.kind && a.subjectId === req.subjectId);
  if (cur) {
    const escalated = rank(req.level) > rank(cur.level);
    cur.count++;
    cur.updatedTick = now;
    cur.title = req.title;
    cur.cause = req.cause;
    cur.focus = req.focus;
    cur.diagnosticId = req.diagnosticId;
    if (req.tokens) cur.tokens = { ...req.tokens };
    // the same diagnostic asks for a lower level: its cause eased (bad -> warn), so the card falls back with it
    const eased = rank(req.level) < rank(cur.level) && req.diagnosticId !== null && req.diagnosticId === cur.diagnosticId;
    if (escalated) {
      cur.level = req.level;
      cur.acknowledged = false;
      log(sim, cur, 'escalate');
    } else if (eased) {
      cur.level = req.level;
      log(sim, cur, 'ease');
    }
    sim.emit({ type: 'alert', op: 'update', alert: snapshot(cur) });
    return cur.id;
  }
  const refused = alertRefusal(sim, req);
  if (refused) {
    logEvent(sim, `alert.${refused}`, req.level, req.kind, req.tokens ?? {}, req.focus, req.title ? `${req.title} — ${req.cause}` : '');
    return -1;
  }
  if (p.alerts.length >= ALERTS_ACTIVE_MAX) dropOne(sim);
  const a: ActiveAlert = {
    id: eng.nextAlertId++, kind: req.kind, level: req.level, subjectId: req.subjectId, title: req.title, cause: req.cause,
    focus: req.focus, diagnosticId: req.diagnosticId, raisedTick: now, updatedTick: now, count: 1, acknowledged: false,
  };
  if (req.tokens) a.tokens = { ...req.tokens };
  p.alerts.push(a);
  log(sim, a, 'raise');
  sim.emit({ type: 'alert', op: 'raise', alert: snapshot(a) });
  return a.id;
}

/**
 * Makes room for one alert: drops the least important active one (acknowledged first, then the lowest level, then
 * the oldest). It leaves the interface with op 'clear' but starts no cooldown (its condition was not resolved).
 */
function dropOne(sim: Sim): void {
  const list = sim.state.progression.alerts;
  let worst = 0;
  for (let i = 1; i < list.length; i++) {
    if (capScore(list[i].acknowledged, list[i].level) < capScore(list[worst].acknowledged, list[worst].level)) worst = i;
  }
  const [a] = list.splice(worst, 1);
  log(sim, a, 'dropped');
  sim.emit({ type: 'alert', op: 'clear', alert: snapshot(a) });
}

/** Clears an active alert (no-op when it is not active) and starts its cooldown. */
export function clearAlert(sim: Sim, kind: AlertKind, subjectId: number): void {
  const p = sim.state.progression;
  const i = p.alerts.findIndex((a) => a.kind === kind && a.subjectId === subjectId);
  if (i < 0) return;
  const [a] = p.alerts.splice(i, 1);
  const eng = engineOf(sim);
  eng.alertCleared[alertKey(kind, subjectId)] = sim.state.tick;
  delete eng.mem[seenKey(kind, subjectId)];
  pruneCooldowns(sim);
  log(sim, a, 'clear');
  sim.emit({ type: 'alert', op: 'clear', alert: snapshot(a) });
}

/** Forgets cooldown marks older than the longest cooldown (keeps the record small). */
function pruneCooldowns(sim: Sim): void {
  const eng = engineOf(sim);
  const longest = Math.max(...Object.values(ALERT_COOLDOWN_GAME_H)) * TICKS_PER_HOUR;
  for (const k of Object.keys(eng.alertCleared)) if (sim.state.tick - eng.alertCleared[k] > longest) delete eng.alertCleared[k];
}

/** Marks an alert seen (`acknowledgeAlert` command); a critical alert stays in the list but is no longer pinned. */
export function acknowledgeAlert(sim: Sim, alertId: number): boolean {
  const a = sim.state.progression.alerts.find((x) => x.id === alertId);
  if (!a || a.acknowledged) return false;
  a.acknowledged = true;
  sim.emit({ type: 'alert', op: 'update', alert: snapshot(a) });
  return true;
}

/** Active alerts ordered for the feed: level (critical first), then newest (plain copies). */
export function activeAlerts(sim: Sim): ActiveAlert[] {
  return sim.state.progression.alerts
    .map(snapshot)
    .sort((a, b) => rank(b.level) - rank(a.level) || b.updatedTick - a.updatedTick || b.id - a.id);
}

// ---- lifetime of an alert whose raiser clears it by condition and time (quiet-time) ----
// A raiser that holds a card only while a condition holds calls `touchAlert` each time the condition is seen, and
// `expireAlert` each check: the card leaves once the condition has not been seen for `idleTicks`, or when it has been
// up for `maxTicks`, whichever comes first. The marks live in `progression.engine.mem` (saved with the game).

export interface AlertLifetime {
  /** Clear this long after the condition was last seen, ticks. */
  idleTicks: number;
  /** Clear this long after the card was raised, ticks (0 = no cap). */
  maxTicks: number;
}

const seenKey = (kind: AlertKind, subjectId: number): string => `aseen:${alertKey(kind, subjectId)}`;

/** The condition behind an active alert holds now: restarts its idle clock without counting a repeat. */
export function touchAlert(sim: Sim, kind: AlertKind, subjectId: number): void {
  memSet(sim, seenKey(kind, subjectId), sim.state.tick);
}

/** Clears the alert when its lifetime is over (see `AlertLifetime`); true when it was cleared. */
export function expireAlert(sim: Sim, kind: AlertKind, subjectId: number, life: AlertLifetime): boolean {
  const a = sim.state.progression.alerts.find((x) => x.kind === kind && x.subjectId === subjectId);
  if (!a) return false;
  const now = sim.state.tick;
  const seen = Math.max(a.raisedTick, memGet(sim, seenKey(kind, subjectId), a.raisedTick));
  if (now - seen < life.idleTicks && (life.maxTicks <= 0 || now - a.raisedTick < life.maxTicks)) return false;
  clearAlert(sim, kind, subjectId);
  return true;
}
