// Blackboard keys of a nurse's shuttle job (GDD 07 §6.2.6, task subtype `nurse:shuttle`), shared by the job rule
// (satellites.ts) and the trip (shuttle.ts).

import type { Ant } from '@/sim/types';

export const SH = {
  /** Brood item carried on this trip, absent / -1 none. */
  brood: 'wd.sh',
  /** Satellite nest and chamber it goes to. */
  nest: 'wd.shN',
  chamber: 'wd.shC',
  /** Parent nest it came from (the nurse walks back there). */
  from: 'wd.shF',
  /** 0 to the brood, 1 carrying, 2 put down, 3 walking back. */
  phase: 'wd.shP',
  /** Tick the trip began. */
  since: 'wd.shT',
  /** Leg of the walk: 0 out of the nest it is in, 1 over the surface to the other nest's mouth, 2 in to the room. */
  leg: 'wd.shL',
  /** 1: a migrant walking to the satellite to live there (no brood carried). */
  migrate: 'wd.shM',
} as const;

export function isShuttling(a: Ant): boolean {
  const v = a.bb[SH.brood];
  return (v !== undefined && v >= 0) || a.bb[SH.migrate] === 1;
}

export function clearShuttle(a: Ant): void {
  for (const k of Object.values(SH)) delete a.bb[k];
}
