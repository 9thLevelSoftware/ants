// Automatic slow-downs (GDD 06 §4.5, GDD 08 §5.1 / §6.1): a raised alert drops the running speed to 1x (or pauses)
// by the player's Settings > Gameplay choice: `autoSlowCritical` for critical alerts, `autoSlowWarning` for warnings.
// An alert that escalates to such a level (same card, op 'update') counts like a new one (GDD 08 §6.3).
// The two blocking prompts of the year slow time whatever their level, by the critical choice: flying weather
// (`flight-launch` -> `flight-weather`) and the winter prompt (`overwinter-prompt` -> `winter-coming`). The sim raises
// `winter-coming` at the autumn notice, 1.5 game days before the winter banner itself, so the banner (the blocking
// prompt, sim event `overwinter.banner`, also after each "Delay one day") is a trigger of its own.
// One slow-down per trigger per AUTO_SLOW_COOLDOWN_GD game days; never while paused; never raises the speed.
import type { ActiveAlert, AlertKind, AlertLevel, Sim, SpeedLevel } from '@/sim/types';
import { ALERT_LEVELS } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import type { AutoSlowCritical, AutoSlowWarning } from '../settings/model';

/** GDD 06 §4.5: each trigger has a 0.25 game-day cooldown per kind. */
export const AUTO_SLOW_COOLDOWN_GD = 0.25;

/** Alert kinds that slow time regardless of their level (GDD 06 §4.5 table). */
export const AUTO_SLOW_ALWAYS: ReadonlySet<AlertKind> = new Set<AlertKind>(['winter-coming', 'flight-weather']);

/** Cooldown key of the winter banner trigger (GDD 06 §6.2 Banner row: auto-slow rule `overwinter-prompt`). */
export const OVERWINTER_PROMPT = 'overwinter-prompt';

export type AutoSlowAction = 'slow' | 'pause';

export interface AutoSlowChoice { critical: AutoSlowCritical; warning: AutoSlowWarning }

/** What a newly raised alert of this kind and level asks for, or null. */
export function autoSlowAction(kind: AlertKind, level: AlertLevel, choice: AutoSlowChoice): AutoSlowAction | null {
  const pick = AUTO_SLOW_ALWAYS.has(kind) || level === 'critical' ? choice.critical : level === 'warning' ? choice.warning : 'off';
  return pick === 'off' ? null : pick;
}

/** The speed after the action from `level` (0 = paused), or null when nothing changes (never faster, never while paused). */
export function slowedLevel(action: AutoSlowAction, level: SpeedLevel): SpeedLevel | null {
  if (level === 0) return null;
  if (action === 'pause') return 0;
  return level > 1 ? 1 : null;
}

export interface AutoSlowHost {
  /** Current speed level (0 = paused). */
  level(): SpeedLevel;
  choice(): AutoSlowChoice;
  /** Sets the speed; `trigger` is the cooldown key (`kind:level` of an alert, or OVERWINTER_PROMPT). */
  apply(to: SpeedLevel, trigger: string): void;
}

const rank = (l: AlertLevel): number => ALERT_LEVELS.indexOf(l);

/** Listens to one sim's alerts and winter banner and applies the slow-downs. */
export class AutoSlowWatcher {
  private offs: (() => void)[] = [];
  /** Last tick each trigger slowed time. Keyed by `kind:level` so an escalation is not swallowed by its own lower level. */
  private lastTick = new Map<string, number>();
  /** Level last seen per active alert id, to tell an escalation from a plain repeat. */
  private levels = new Map<number, AlertLevel>();

  constructor(private readonly host: AutoSlowHost) {}

  attach(sim: Sim): void {
    this.detach();
    for (const a of sim.state.progression.alerts) this.levels.set(a.id, a.level);
    this.offs.push(sim.events.on('alert', (e) => this.onAlert(e.op, e.alert, sim.state.tick)));
    this.offs.push(sim.events.on('overwinter.banner', () => this.considerBanner(sim.state.tick)));
  }

  detach(): void {
    for (const off of this.offs) off();
    this.offs = [];
    this.lastTick.clear();
    this.levels.clear();
  }

  private onAlert(op: 'raise' | 'update' | 'clear', alert: ActiveAlert, tick: number): void {
    if (op === 'clear') { this.levels.delete(alert.id); return; }
    const before = this.levels.get(alert.id);
    this.levels.set(alert.id, alert.level);
    if (op === 'raise' || (before !== undefined && rank(alert.level) > rank(before))) this.consider(alert, tick);
  }

  /** Applies the slow-down for this raise (or escalation) if its trigger is out of cooldown. Returns the new level, or null. */
  consider(alert: ActiveAlert, tick: number): SpeedLevel | null {
    return this.trigger(`${alert.kind}:${alert.level}`, autoSlowAction(alert.kind, alert.level, this.host.choice()), tick);
  }

  /** The winter banner: the blocking prompt slows time like `winter-coming` (by the critical choice). */
  considerBanner(tick: number): SpeedLevel | null {
    return this.trigger(OVERWINTER_PROMPT, autoSlowAction('winter-coming', 'notice', this.host.choice()), tick);
  }

  private trigger(key: string, action: AutoSlowAction | null, tick: number): SpeedLevel | null {
    if (!action) return null;
    const last = this.lastTick.get(key);
    if (last !== undefined && tick - last < AUTO_SLOW_COOLDOWN_GD * TICKS_PER_DAY) return null;
    const to = slowedLevel(action, this.host.level());
    if (to === null) return null;
    this.lastTick.set(key, tick);
    this.host.apply(to, key);
    return to;
  }
}
