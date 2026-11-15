// Builds the running sim for resolved new-game options: world generation and the sim around it, or, for test
// worlds, makeTestSim (the prepared world, the optional small nest and its workers, exactly as module tests do).
// Generation runs in the worldgen worker when the build ships its source (the portable build's asset pack; started
// from a Blob URL, architecture §8) and on the main thread otherwise; both give the same world (GDD 04 DET-7).
import { createNewGame, startCalendarTick } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import type { Sim } from '@/sim/types';
import type { WorldgenProgress } from '@/worldgen';
import { blobWorkerFactory, generateWorldAsync } from '@/worldgen/worker';
import type { ResolvedNewGame } from './options';

export type Generated = ReturnType<typeof createNewGame> | null;

/** World + initial state (the slow part: world generation). Null for test worlds (built whole in wake). */
export function generate(resolved: ResolvedNewGame): Generated {
  return resolved.testWorld ? null : createNewGame(resolved.config, resolved.world);
}

export interface GenerateAsyncOptions {
  /** Source text of the classic worker bundle (null: generate on the main thread). */
  workerSource: string | null;
  onProgress?: (p: WorldgenProgress) => void;
}

/** Like generate(), with the world built off the main thread when a worker can be started. */
export async function generateAsync(resolved: ResolvedNewGame, o: GenerateAsyncOptions): Promise<Generated> {
  if (resolved.testWorld) return null;
  if (resolved.world) return createNewGame(resolved.config, resolved.world);
  startCalendarTick(resolved.config); // refuses an invalid start (winter) before the slow part
  const world = await generateWorldAsync(resolved.config.world, {
    onProgress: o.onProgress,
    createWorker: o.workerSource ? blobWorkerFactory(o.workerSource) : undefined,
  });
  // resolveNewGame already synced the world params with the rules, so the config is used as it is
  return createNewGame(resolved.config, world);
}

/** The runtime sim. */
export function wake(resolved: ResolvedNewGame, generated: Generated): Sim {
  const tw = resolved.testWorld;
  if (tw && resolved.world) {
    return makeTestSim({ world: resolved.world, config: resolved.config, nest: tw.nest ?? 'none', workers: tw.workers ?? 0 });
  }
  if (!generated) throw new Error('startSession: nothing generated');
  return createSim(generated.state, generated.world);
}
