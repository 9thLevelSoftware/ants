// Save migrations: one function per version step, applied in order by restore().

import { MIN_SAVE_VERSION, SAVE_VERSION } from './version';

/** Upgrades a decoded state of version v to v + 1 (mutating or returning a new object). */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

/** MIGRATIONS[v] upgrades v -> v + 1. Empty while SAVE_VERSION is 1. */
const MIGRATIONS: Record<number, Migration> = {};

export function migrateState(state: Record<string, unknown>, fromVersion: number): Record<string, unknown> {
  if (fromVersion > SAVE_VERSION) throw new Error(`save version ${fromVersion} is newer than this build (${SAVE_VERSION})`);
  if (fromVersion < MIN_SAVE_VERSION) throw new Error(`save version ${fromVersion} is too old (min ${MIN_SAVE_VERSION})`);
  let s = state;
  for (let v = fromVersion; v < SAVE_VERSION; v++) {
    const step = MIGRATIONS[v];
    if (!step) throw new Error(`no migration from save version ${v}`);
    s = step(s);
    s.version = v + 1;
  }
  return s;
}
