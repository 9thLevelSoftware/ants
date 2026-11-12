// Presentation constants of the HUD (GDD 08 section 0: they never affect simulation results). Time conversions come from
// the simulation's own time module, never a literal 250 or 6000.
import { TICKS_PER_DAY, TICKS_PER_HOUR } from '@/sim/time';

/** Alert presentation, GDD 08 6.1 and 6.3. */
export const ALERT_BALANCE = {
  maxVisible: 3,
  /** Game hours after a key clears during which its next raise goes to the log only. */
  cooldownGameH: { info: 0, notice: 3, warning: 1, critical: 0 } as Record<'info' | 'notice' | 'warning' | 'critical', number>,
  /** The same key may not toast twice within this many real seconds, whatever the speed. */
  cooldownRealS: 20,
  rateMax: 4,
  rateWindowRealS: 30,
  resolvedRealS: 4,
  noticeRealS: 12,
  warningRealS: 30,
  /** `info` toasts show only during the first game day, for this long. */
  infoRealS: 6,
  snoozeGameDays: 1,
  ticksPerGameHour: TICKS_PER_HOUR,
  ticksPerGameDay: TICKS_PER_DAY,
  /** With the HUD hidden only critical alerts show, as one pinned card (GDD 08 3.4). */
  hiddenMaxVisible: 1,
} as const;

/**
 * The manual workforce floors (GDD 02 6.3) may together claim at most this share of the sliders, so that with few
 * workers and a large need (a founding colony) the sliders can still be moved. The simulation enforces its own
 * floors in headcounts regardless of what the sliders say.
 */
export const FLOOR_BUDGET_PCT = 75;
