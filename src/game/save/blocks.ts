// When saving must wait (GDD 06 §15 rule 3, GDD 08 §7.6): a pure read of the state and the game mode.
import type { SimState } from '@/sim/types';

export interface BlockContext {
  /** Game mode: only `playing` and `paused` can save. */
  mode: string;
  /** Camera/view id; photo mode blocks autosave. */
  view: string;
}

/**
 * Why a save of this kind cannot be written now, or null. A manual save is refused only while there is no game, a
 * game is loading, or a time-lapse is running (a save inside a lapse is impossible, GDD 06 §6). An autosave also
 * waits during the possessed flight, an interrupt beat, the intro card and photo mode. A `checkpoint` autosave
 * (named events such as `pre-winter`) is exempt from the lapse, flight and intro rules.
 */
export function blockReason(
  state: SimState | null, ctx: BlockContext, kind: 'manual' | 'autosave', opts: { checkpoint?: boolean } = {},
): string | null {
  if (!state) return 'There is no game to save.';
  if (ctx.mode === 'loading') return 'A game is loading.';
  if (ctx.mode !== 'playing' && ctx.mode !== 'paused') return 'Saving is possible only while a game is running.';
  // A checkpoint is written AT the start of a lapse / flight / the end of the intro, so those states do not block it.
  if (opts.checkpoint) return kind === 'autosave' && ctx.view === 'photo' ? 'Photo mode is open.' : null;
  if (state.player.timelapse) return 'A time-lapse is running.';
  if (state.env.winter.phase === 'lapse') return 'The winter time-lapse is running.';
  if (kind === 'manual') return null;
  if (ctx.view === 'photo') return 'Photo mode is open.';
  if (state.player.opening?.phase === 'intro-card') return 'The intro card is showing.';
  if (state.colonies[0]?.repro.active) return 'A nuptial flight is in progress.';
  return null;
}

/** The possessed ant is in combat (autosave is deferred up to AUTOSAVE_DEFER_MAX_S). */
export function possessedInCombat(state: SimState): boolean {
  const id = state.player.possessedAntId;
  if (id < 0) return false;
  const a = state.ants.find((x) => x.id === id);
  return !!a && a.alive && a.combat !== null;
}
