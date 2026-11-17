// Automatic slow-downs (GDD 06 §4.5, GDD 08 §5.1 / §6.1): a raised alert drops the running speed to 1x (or pauses)
// by the player's Settings > Gameplay choice: `autoSlowCritical` for critical alerts, `autoSlowWarning` for warnings.
// The two blocking prompts of the year, the winter notice (`overwinter-prompt` -> `winter-coming`) and flying weather
// (`flight-launch` -> `flight-weather`), slow time whatever their level, by the critical choice. One slow-down per
// alert kind per AUTO_SLOW_COOLDOWN_GD game days; never while paused; never raises the speed.
import type { ActiveAlert, AlertKind, AlertLevel, Sim, SpeedLevel } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import type { AutoSlowCritical, AutoSlowWarning } from '../settings/model';

/** GDD 06 §4.5: each trigger has a 0.25 game-day cooldown per kind. */
export const AUTO_SLOW_COOLDOWN_GD = 0.25;

/** Alert kinds that slow time regardless of their level (GDD 06 §4.5 table). */
export const AUTO_SLOW_ALWAYS: ReadonlySet<AlertKind> = new Set<AlertKind>(['winter-coming', 'flight-weather']);

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
  apply(to: SpeedLevel, alert: ActiveAlert): void;
}

/** Listens to one sim's alert raises and applies the slow-downs. */
export class AutoSlowWatcher {
  private off: (() => void) | null = null;
  private lastTick = new Map<AlertKind, number>();

  constructor(private readonly host: AutoSlowHost) {}

  attach(sim: Sim): void {
    this.detach();
    this.off = sim.events.on('alert', (e) => {
      if (e.op !== 'raise') return;
      this.consider(e.alert, sim.state.tick);
    });
  }

  detach(): void {
    this.off?.();
    this.off = null;
    this.lastTick.clear();
  }

  /** Applies the slow-down for this raise if its kind is out of cooldown. Returns the new level, or null. */
  consider(alert: ActiveAlert, tick: number): SpeedLevel | null {
    const action = autoSlowAction(alert.kind, alert.level, this.host.choice());
    if (!action) return null;
    const last = this.lastTick.get(alert.kind);
    if (last !== undefined && tick - last < AUTO_SLOW_COOLDOWN_GD * TICKS_PER_DAY) return null;
    const to = slowedLevel(action, this.host.level());
    if (to === null) return null;
    this.lastTick.set(alert.kind, tick);
    this.host.apply(to, alert);
    return to;
  }
}
