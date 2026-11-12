// Turning a stored (or imported) save into a running Sim (GDD 06 §15 rule 6, GDD 08 §7.6): version check and
// migration, regeneration of the static world from the saved params, fingerprint verification, createSim. Every
// failure is a word, never a throw: a mismatch blocks the load instead of producing a broken world.
import { migrateState } from '@/sim/save/migrate';
import { MIN_SAVE_VERSION, SAVE_VERSION } from '@/sim/save/version';
import { createSim } from '@/sim/sim';
import type { Sim, SimState, WorldData, WorldParams } from '@/sim/types';
import { generateWorld, SUPPORTED_GENERATOR_VERSIONS } from '@/worldgen';
import type { SaveCode, SaveMeta } from './types';

export type MigrateFn = (state: Record<string, unknown>, fromVersion: number) => Record<string, unknown>;

export interface LoaderDeps {
  /** Migration hook (default: the sim's migrateState). Tests inject their own. */
  migrate?: MigrateFn;
  /** Static world for saved params. Return undefined to use the generator (default). Test worlds plug in here. */
  worldFor?: (params: WorldParams, meta: SaveMeta) => WorldData | undefined;
  /** Phase callback for a loading screen ('Regenerating the locality'). */
  onPhase?: (phase: 'migrate' | 'world' | 'sim', progress: number) => void;
}

export type RestoreResult =
  | { ok: true; sim: Sim; meta: SaveMeta; migratedFrom: number | null }
  | { ok: false; code: SaveCode; message: string };

const fail = (code: SaveCode, message: string): RestoreResult => ({ ok: false, code, message });

export function restoreSave(meta: SaveMeta, rawState: unknown, deps: LoaderDeps = {}): RestoreResult {
  if (!rawState || typeof rawState !== 'object') return fail('corrupt', 'The saved colony data is missing.');
  let state = rawState as SimState;
  const version = state.version;
  if (typeof version !== 'number' || !Number.isInteger(version)) return fail('corrupt', 'The saved colony data has no version.');
  if (version > SAVE_VERSION) return fail('newer-version', 'This save is from a newer version of FOUNDRESS. Update the game to open it.');
  if (version < MIN_SAVE_VERSION) return fail('too-old', 'This save is from a version of FOUNDRESS that can no longer be opened.');

  let migratedFrom: number | null = null;
  if (version < SAVE_VERSION) {
    deps.onPhase?.('migrate', 0.1);
    try {
      state = (deps.migrate ?? migrateState)(state as unknown as Record<string, unknown>, version) as unknown as SimState;
      migratedFrom = version;
    } catch (e) {
      return fail('too-old', `This save cannot be upgraded: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  const params = state.config?.world;
  if (!params || !Array.isArray(state.ants) || !state.env || !state.player) return fail('corrupt', 'The saved colony data is incomplete.');
  if (!SUPPORTED_GENERATOR_VERSIONS.includes(params.generatorVersion)) {
    return fail('world-mismatch', 'This save was made with a locality generator that this version of the game no longer has, so its world cannot be rebuilt.');
  }

  deps.onPhase?.('world', 0.3);
  let world: WorldData;
  try {
    world = deps.worldFor?.(params, meta) ?? generateWorld(params);
  } catch (e) {
    return fail('failed', `The locality could not be rebuilt: ${e instanceof Error ? e.message : String(e)}`);
  }
  if ((world.meta.fingerprint >>> 0) !== (meta.worldFingerprint >>> 0)) {
    return fail('world-mismatch', 'The locality rebuilt from this save is not the one the colony lived in (the world generator has changed), so the save was not loaded.');
  }

  deps.onPhase?.('sim', 0.9);
  try {
    return { ok: true, sim: createSim(state, world), meta, migratedFrom };
  } catch (e) {
    return fail('corrupt', `The saved colony could not be restored: ${e instanceof Error ? e.message : String(e)}`);
  }
}
