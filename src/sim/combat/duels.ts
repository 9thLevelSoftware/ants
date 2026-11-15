// Duel tables (acceptance criterion 2): seeded single fights run through the real systems, summarised as win
// rates and durations. Used by duels.test.ts (3 seeds) and, behind FOUNDRESS_LONG=1, with 500 trials per table.

import { createColony } from '@/sim/entities';
import { ant, arena, setFlags, stepUntil } from './testkit';
import { beginGrapple, engage } from './index';
import type { Ant } from '@/sim/types';

export type DuelKind = 'locked-workers' | 'workers' | 'workers-no-acid' | 'major-vs-minor' | 'three-vs-one' | 'three-vs-one-no-acid';

export interface DuelResult {
  /** 'a' = side A (the player colony) killed every opponent, 'b' = side B did, 'none' = time out / both fled. */
  winner: 'a' | 'b' | 'none';
  /** Seconds from the start (from the lock for 'locked-workers') to the first death; -1 none. */
  firstDeathS: number;
  /** Seconds until the fight is decided (all of one side dead, or the time limit). */
  durationS: number;
}

const LIMIT_TICKS = 900;

function decided(as: Ant[], bs: Ant[]): 'a' | 'b' | null {
  if (bs.every((b) => !b.alive)) return 'a';
  if (as.every((a) => !a.alive)) return 'b';
  return null;
}

/** One duel of `kind` on `seed`. */
export function runDuel(kind: DuelKind, seed: number): DuelResult {
  const locked = kind === 'locked-workers';
  const ar = arena({ seed, manual: locked, flags: { noRetreat: locked } });
  const sim = ar.sim;
  let as: Ant[], bs: Ant[];
  if (kind === 'major-vs-minor') {
    const cp = createColony(sim, { species: 'camponotus-pennsylvanicus', isPlayer: false });
    const cp2 = createColony(sim, { species: 'camponotus-pennsylvanicus', isPlayer: false });
    const major = ant(sim, cp.id, 40, 40, 'major', { x: 1, y: 0, z: 0 }, 1.5);
    const minor = ant(sim, cp2.id, 40 + (major.radius * 2) / sim.world.bu + 1.2, 40, 'minor', { x: -1, y: 0, z: 0 }, 0.78);
    as = [major]; bs = [minor];
  } else if (kind === 'three-vs-one' || kind === 'three-vs-one-no-acid') {
    const v = ant(sim, ar.rival, 40, 40, 'worker', { x: -1, y: 0, z: 0 });
    as = [[38.9, 40, 1, 0], [40, 38.9, 0, 1], [40, 41.1, 0, -1]].map(([x, z, fx, fz]) => ant(sim, ar.home, x, z, 'worker', { x: fx, y: 0, z: fz }));
    bs = [v];
  } else {
    as = [ant(sim, ar.home, 40, 40, 'worker', { x: 1, y: 0, z: 0 })];
    bs = [ant(sim, ar.rival, 40.9, 40, 'worker', { x: -1, y: 0, z: 0 })];
  }
  if (kind.endsWith('no-acid')) for (const x of [...as, ...bs]) x.acid = 0;
  sim.index.refresh();
  if (locked) {
    setFlags(sim, { noRng: true });
    beginGrapple(sim, as[0].id, 'ant', bs[0].id);
    beginGrapple(sim, bs[0].id, 'ant', as[0].id);
    setFlags(sim, { noRng: false });
  } else {
    for (const x of as) engage(sim, x.id, 'ant', bs[0].id);
    for (const y of bs) engage(sim, y.id, 'ant', as[0].id);
  }
  let firstDeath = -1;
  const all = [...as, ...bs];
  // times are those of the tick that ran (state.tick has moved on by one when the predicate runs)
  const t = stepUntil(sim, () => {
    if (firstDeath < 0 && all.some((x) => !x.alive)) firstDeath = sim.state.tick - 1;
    if (decided(as, bs)) return true;
    // both sides disengaged (fled): no fight left
    return all.every((x) => !x.alive || (x.task !== 'fight' && !x.combat?.lock && (x.combat?.heldBy.length ?? 0) === 0));
  }, LIMIT_TICKS);
  return { winner: decided(as, bs) ?? 'none', firstDeathS: firstDeath < 0 ? -1 : firstDeath / 10, durationS: t / 10 };
}

export interface DuelTable {
  kind: DuelKind;
  trials: number;
  winA: number;
  winB: number;
  none: number;
  /** Duration percentiles of decided fights, s. */
  p05: number;
  p50: number;
  p95: number;
  /** Share of decided fights whose first death lies in [lo, hi] s (for the stated E9 range). */
  inRange: number;
}

export function duelTable(kind: DuelKind, seeds: number[], range: [number, number] = [0, Infinity]): DuelTable {
  const rs = seeds.map((s) => runDuel(kind, s));
  const dec = rs.filter((r) => r.winner !== 'none').map((r) => r.firstDeathS).sort((x, y) => x - y);
  const q = (f: number): number => (dec.length ? dec[Math.min(dec.length - 1, Math.floor(f * dec.length))] : -1);
  return {
    kind, trials: rs.length, winA: rs.filter((r) => r.winner === 'a').length, winB: rs.filter((r) => r.winner === 'b').length,
    none: rs.filter((r) => r.winner === 'none').length, p05: q(0.05), p50: q(0.5), p95: q(0.95),
    inRange: dec.length ? dec.filter((d) => d >= range[0] - 1e-9 && d <= range[1] + 1e-9).length / dec.length : 0,
  };
}
