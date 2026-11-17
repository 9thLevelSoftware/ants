// The garden's substrate ledger (GDD 07 §6.4.1 subIn1Gd, subQ/subP/subT over 1.5 GD, subSources over 2 GD): planted
// pulp is booked into bins of SUB_BIN_GD; planting also leaves spent substrate as waste (§6.4.2: W += 0.5 x planted,
// "spent after the ~3.2 GD turnover, modelled as immediate"). Pure.

import type { GardenRecord, LeafLot, SubstrateBin } from '@/sim/types';
import { SUB_BIN_GD, SUB_BINS, SUB_PLANTS_PER_BIN } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY } from '@/sim/time';
import type { FungusParams } from './params';

const BIN_TICKS = Math.round(SUB_BIN_GD * TICKS_PER_DAY);

/** The bin for `tick`, opened (and old bins dropped) as needed. */
function binAt(g: GardenRecord, tick: number): SubstrateBin {
  const bins = (g.subBins ??= []);
  const start = Math.floor(tick / BIN_TICKS) * BIN_TICKS;
  let b = bins[bins.length - 1];
  if (!b || b.tick !== start) {
    b = { tick: start, lu: 0, qLu: 0, pLu: 0, tLu: 0, plants: [] };
    bins.push(b);
  }
  pruneBins(g, tick);
  return b;
}

/** Drops bins older than the ledger window. */
export function pruneBins(g: GardenRecord, tick: number): void {
  const bins = g.subBins;
  if (!bins) return;
  const oldest = tick - SUB_BINS * BIN_TICKS;
  while (bins.length > 0 && bins[0].tick + BIN_TICKS <= oldest) bins.shift();
}

/** Books `lu` of substrate with these traits into the garden now; returns the waste it leaves, loads. */
export function plantSubstrate(P: FungusParams, g: GardenRecord, lot: Pick<LeafLot, 'q' | 'p' | 't' | 'plantId'>, lu: number, tick: number): number {
  if (!(lu > 0)) return 0;
  const b = binAt(g, tick);
  b.lu += lu;
  b.qLu += lot.q * lu;
  b.pLu += lot.p * lu;
  b.tLu += lot.t * lu;
  const e = b.plants.find((x) => x.plantId === lot.plantId);
  if (e) e.lu += lu;
  else b.plants.push({ plantId: lot.plantId, lu, p: lot.p, t: lot.t });
  if (b.plants.length > SUB_PLANTS_PER_BIN) {
    b.plants.sort((x, y) => y.lu - x.lu);
    const rest = b.plants.splice(SUB_PLANTS_PER_BIN - 1);
    const other = b.plants.find((x) => x.plantId === -1);
    const sum = rest.reduce((a, x) => a + x.lu, 0);
    if (other) other.lu += sum; else b.plants.push({ plantId: -1, lu: sum, p: 0, t: 0 });
  }
  const waste = P.wasteFrac * lu;
  g.waste += waste;
  return waste;
}

/** Substrate planted over the last `gd` game days (whole bins, the current partial bin included), LU. */
export function substrateOver(g: GardenRecord, tick: number, gd: number): { lu: number; q: number; p: number; t: number } {
  const from = tick - gd * TICKS_PER_DAY;
  let lu = 0, q = 0, p = 0, t = 0;
  for (const b of g.subBins ?? []) {
    // the bin straddling the window's start counts by its overlap (planting taken as even across the bin)
    const w = Math.max(0, Math.min(1, (b.tick + BIN_TICKS - from) / BIN_TICKS));
    if (w <= 0) continue;
    lu += b.lu * w; q += b.qLu * w; p += b.pLu * w; t += b.tLu * w;
  }
  return lu > 1e-9 ? { lu, q: q / lu, p: p / lu, t: t / lu } : { lu: 0, q: 0, p: 0, t: 0 };
}

/** Each plant's share of the substrate of the last `gd` game days (0..1) with its traits; plant -1 excluded. */
export function plantShares(g: GardenRecord, tick: number, gd: number): { plantId: number; share: number; p: number; t: number }[] {
  const from = tick - gd * TICKS_PER_DAY;
  const m = new Map<number, { plantId: number; share: number; p: number; t: number }>();
  let total = 0;
  for (const b of g.subBins ?? []) {
    const w = Math.max(0, Math.min(1, (b.tick + BIN_TICKS - from) / BIN_TICKS));
    if (w <= 0) continue;
    for (const e of b.plants) {
      total += e.lu * w;
      if (e.plantId === -1) continue;
      const r = m.get(e.plantId) ?? { plantId: e.plantId, share: 0, p: e.p, t: e.t };
      r.share += e.lu * w;
      m.set(e.plantId, r);
    }
  }
  const out = [...m.values()];
  for (const r of out) r.share = total > 0 ? r.share / total : 0;
  return out;
}

/** The garden's inputs from the ledger: subIn1Gd over the last game day; traits over the last 1.5 GD. */
export function substrateInputs(g: GardenRecord, tick: number): { subIn1Gd: number; subQ: number; subP: number; subT: number } {
  const day = substrateOver(g, tick, 1);
  const win = substrateOver(g, tick, 1.5);
  return { subIn1Gd: day.lu, subQ: win.lu > 0 ? win.q : 0, subP: win.p, subT: win.t };
}
