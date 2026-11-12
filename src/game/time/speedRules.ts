// Time-speed rules tied to views (GDD 01 §8, GDD 06 §4.2). The simulation enforces the possession and opening
// limits itself (setSpeed handler); these pure functions let the game and the UI apply the same rules up front
// (grey out a button, refuse with the right reason) and decide the game-level freezes (photo, pause menu).
import type { OpeningPhase, RunSpeed, SpeedLevel } from '@/sim/types';
import { SPEED_LEVELS } from '@/sim/types';
import { OPENING_MAX_SPEED, POSSESS_MAX_SPEED } from '@/sim/balance';

export type ViewId = 'possess' | 'observer' | 'colony' | 'photo';
export const VIEW_IDS: readonly ViewId[] = ['possess', 'observer', 'colony', 'photo'];

export type GameMode = 'title' | 'loading' | 'playing' | 'paused' | 'epitaph';

export interface SpeedContext {
  mode: GameMode;
  view: ViewId;
  /** An ant is possessed (the sim's possessedAntId !== -1). */
  possessed: boolean;
  /** Opening phase, null when the opening is over or absent. */
  openingPhase: OpeningPhase | null;
  /** A sim-driven time-lapse is running (it sets its own rate). */
  timelapse: boolean;
}

export type SpeedRefusal = 'possession' | 'opening' | 'frozen' | 'timelapse';

/** Opening phases limited to pause/1x/2x (GDD 06 §4.2; E-17). */
const SLOW_OPENING: ReadonlySet<OpeningPhase> = new Set<OpeningPhase>(['search', 'dig', 'seal', 'lay']);

/** The sim does not advance at all (photo mode, pause menu, title, loading, epitaph). Pause is separate. */
export function isFrozen(ctx: Pick<SpeedContext, 'mode' | 'view'>): boolean {
  return ctx.mode !== 'playing' || ctx.view === 'photo';
}

/** Highest running speed allowed in this context. */
export function maxSpeed(ctx: SpeedContext): RunSpeed {
  let max: RunSpeed = 8;
  if (ctx.possessed || ctx.view === 'possess') max = Math.min(max, POSSESS_MAX_SPEED) as RunSpeed;
  if (ctx.openingPhase !== null && SLOW_OPENING.has(ctx.openingPhase)) max = Math.min(max, OPENING_MAX_SPEED) as RunSpeed;
  return max;
}

/** Speed levels the player may choose now (0 = pause). Empty while frozen or during a time-lapse. */
export function allowedSpeeds(ctx: SpeedContext): SpeedLevel[] {
  if (isFrozen(ctx) || ctx.timelapse) return [];
  const max = maxSpeed(ctx);
  return SPEED_LEVELS.filter((s) => s <= max);
}

/** Why a request would be refused, or null when it is allowed (0 = pause is always allowed while playing). */
export function refusalFor(level: SpeedLevel, ctx: SpeedContext): SpeedRefusal | null {
  if (isFrozen(ctx)) return 'frozen';
  if (ctx.timelapse) return 'timelapse';
  if (level === 0) return null;
  if ((ctx.possessed || ctx.view === 'possess') && level > POSSESS_MAX_SPEED) return 'possession';
  if (ctx.openingPhase !== null && SLOW_OPENING.has(ctx.openingPhase) && level > OPENING_MAX_SPEED) return 'opening';
  return null;
}

/** Speed after a possession starts: 1x, or clamped to 4x with dropTo1xOnPossess off (GDD 01 §8). */
export function speedOnPossess(current: RunSpeed, dropTo1x: boolean): RunSpeed {
  if (dropTo1x) return 1;
  return current > POSSESS_MAX_SPEED ? POSSESS_MAX_SPEED : current;
}

/** Next level up / down for the speed-up / speed-down keys (pause counts as the bottom). */
export function nextSpeed(current: SpeedLevel, dir: 1 | -1): SpeedLevel {
  const i = SPEED_LEVELS.indexOf(current);
  const j = Math.max(0, Math.min(SPEED_LEVELS.length - 1, i + dir));
  return SPEED_LEVELS[j];
}
