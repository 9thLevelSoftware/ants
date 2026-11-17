// The processing chain's throughput counters and its bottleneck detector (GDD 07 §6.4.6, §5.4.10 diag-at-chain):
// per stage, LU (or LU-equivalents: harvest as FL, waste as loads) through it over windows of CHAIN_WINDOW_GD. A
// stage running more than CHAIN_SHORT_FRAC below the stage upstream of it over the last window is short; the
// narrowest stage relative to the demand (1.8 x Σ G per game day over the window) is named.

import type { ChainCounters, Colony, Sim } from '@/sim/types';
import { CHAIN_SHORT_FRAC, CHAIN_WINDOW_GD } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';

export type ChainStage = 'cut' | 'carried' | 'processed' | 'planted' | 'harvested' | 'wasteOut';

/** Stages in chain order (upstream first). Harvest and waste follow planting: each LU planted makes waste. */
export const CHAIN_ORDER: readonly ChainStage[] = ['cut', 'carried', 'processed', 'planted'];

function fresh(tick: number): ChainCounters {
  return { windowTick: tick, cut: 0, carried: 0, processed: 0, planted: 0, harvested: 0, wasteOut: 0, last: null, narrow: '', narrowSince: -1 };
}

export function chainOf(col: Colony, tick: number): ChainCounters {
  return (col.fungus!.chain ??= fresh(tick));
}

/** Books throughput at a stage. */
export function chainAdd(sim: Sim, col: Colony, stage: ChainStage, amount: number): void {
  if (!col.fungus || !(amount > 0)) return;
  const c = chainOf(col, sim.state.tick);
  c[stage] += amount;
}

/**
 * The narrowest stage of a finished window: each stage's throughput relative to the demand; a stage counts as short
 * when it ran more than CHAIN_SHORT_FRAC below the stage upstream of it (the first stage, cutting, when below the
 * demand by that much). Returns '' when no stage is short.
 */
export function narrowestStage(w: NonNullable<ChainCounters['last']>): ChainStage | '' {
  let worst: ChainStage | '' = '', worstRatio = Infinity;
  for (let i = 0; i < CHAIN_ORDER.length; i++) {
    const s = CHAIN_ORDER[i];
    const up = i === 0 ? w.demand : w[CHAIN_ORDER[i - 1]];
    if (!(up > 1e-6)) continue;
    const ratio = w[s] / up;
    if (ratio < 1 - CHAIN_SHORT_FRAC && ratio < worstRatio) { worst = s; worstRatio = ratio; }
  }
  return worst;
}

/** Closes the window when it is over: the counts become `last`, the narrowest stage is updated. */
export function rollChain(sim: Sim, col: Colony, gardenMassGu: number, needPerGuGd: number): void {
  const c = chainOf(col, sim.state.tick);
  const len = CHAIN_WINDOW_GD * TICKS_PER_DAY;
  if (sim.state.tick - c.windowTick < len) return;
  const span = (sim.state.tick - c.windowTick) / TICKS_PER_DAY;
  c.last = {
    cut: c.cut, carried: c.carried, processed: c.processed, planted: c.planted, harvested: c.harvested, wasteOut: c.wasteOut,
    demand: needPerGuGd * gardenMassGu * span,
  };
  const n = narrowestStage(c.last);
  if (n !== c.narrow) { c.narrow = n; c.narrowSince = n ? sim.state.tick : -1; }
  c.windowTick = sim.state.tick;
  c.cut = 0; c.carried = 0; c.processed = 0; c.planted = 0; c.harvested = 0; c.wasteOut = 0;
}
