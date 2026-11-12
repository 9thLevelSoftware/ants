// The colony food pool and its exact ledger (GDD 02 §5.1-§5.4). Every change of `Colony.stores.{c,p}` goes
// through this file and is booked on one ledger key, so pool change == inflows - outflows to rounding error.

import type { Ant, Colony, FoodAmount, Sim } from '@/sim/types';
import {
  C_SPOIL_HALF_LIFE_GD, LARVA_GUT_CAP, LOAD_EPS, P_SPOIL_HALF_LIFE_GD, QUEEN_GUT_CAP, SPOIL_OVERFLOW_MULT,
  SPOIL_REF_C, SPOILED_ITEM_LOADS, STOMACH_C_BASE, STOMACH_C_PER_ADULT, STOMACH_P_PER_ADULT, TOXIN_HALF_LIFE_GD,
} from '@/sim/balance';
import { spawnItem } from '@/sim/entities';
import { book, coreOf } from './core';
import { colonyChambers } from './census';
import { chamberTempC } from './envAdapter';

/** Where deposited food comes from: a delivery, recycled brood, or a nurse's unused crop going back. */
export type DepositSource = 'delivery' | 'recycled' | 'transit-return';
/** What withdrawn food is for (ledger key): crops of nurses / carers / beggars, departure rations, upkeep. */
export type WithdrawPurpose = 'transit' | 'ration' | 'workers' | 'queen' | 'larvae';

/** Food moved, with the toxin it carried. */
export interface FoodMove extends FoodAmount {
  toxin: number;
}

export interface PoolCapacity {
  /** Social stomach, loads. */
  stomachC: number;
  stomachP: number;
  /** Solid piles in chambers, loads (C and P together). */
  pileCap: number;
}

export function poolCapacity(col: Colony): PoolCapacity {
  const core = coreOf(col);
  const n = core.workers;
  return { stomachC: STOMACH_C_BASE + STOMACH_C_PER_ADULT * n, stomachP: STOMACH_P_PER_ADULT * n, pileCap: core.pileCap };
}

/** Pile capacity of the colony's chambers (GDD 03 §6.4 `capacity.food`), loads. */
export function measurePileCap(sim: Sim, col: Colony): number {
  let cap = 0;
  for (const ch of colonyChambers(sim, col)) cap += Math.max(0, ch.capacity.food);
  return cap;
}

/** Free room for C and for P given the current stock. */
export function poolSpace(col: Colony): { c: number; p: number } {
  const k = poolCapacity(col);
  const s = col.stores;
  const pileC = Math.max(0, s.c - k.stomachC);
  const pileP = Math.max(0, s.p - k.stomachP);
  return {
    c: Math.max(0, k.stomachC + k.pileCap - pileP - s.c),
    p: Math.max(0, k.stomachP + k.pileCap - pileC - s.p),
  };
}

/** Refreshes `stores.cap` (display: C and P capacity given the other nutrient's piles). */
export function refreshCapacity(col: Colony): void {
  const sp = poolSpace(col);
  col.stores.cap.c = col.stores.c + sp.c;
  col.stores.cap.p = col.stores.p + sp.p;
}

/** True while the colony has no adult worker: the founding pool replaces the stores (GDD 02 §2.7). */
function poolClosed(col: Colony): boolean {
  return coreOf(col).workers === 0;
}

/**
 * Adds food to the pool, limited by capacity; returns what was accepted. The toxin accepted is proportional.
 * Deliveries count toward today's intake.
 */
export function deposit(col: Colony, c: number, p: number, toxin: number, source: DepositSource): FoodMove {
  if (!col.alive || poolClosed(col)) return { c: 0, p: 0, toxin: 0 };
  const s = col.stores;
  const ac = Math.min(Math.max(0, c), poolSpace(col).c);
  s.c += ac;
  const ap = Math.min(Math.max(0, p), poolSpace(col).p);
  s.p += ap;
  const total = Math.max(0, c) + Math.max(0, p);
  const at = total > 0 ? Math.max(0, toxin) * ((ac + ap) / total) : 0;
  s.toxin += at;
  if (source === 'delivery') {
    book(col, 'inDeliveryC', ac);
    book(col, 'inDeliveryP', ap);
    col.counters.intakeTodayC += ac;
    col.counters.intakeTodayP += ap;
  } else if (source === 'recycled') {
    book(col, 'inRecycledC', ac);
    book(col, 'inRecycledP', ap);
  } else {
    book(col, 'transitC', -ac);
    book(col, 'transitP', -ap);
  }
  refreshCapacity(col);
  return { c: ac, p: ap, toxin: at };
}

const OUT_KEY_C = { transit: 'transitC', ration: 'outRationC', workers: 'outWorkersC', queen: 'outQueenC', larvae: 'outLarvaeC' } as const;
const OUT_KEY_P = { transit: 'transitP', ration: 'transitP', workers: 'transitP', queen: 'outQueenP', larvae: 'outLarvaeP' } as const;

/** Takes food from the pool (as much as there is); returns what was taken, with its share of the pool toxin. */
export function withdraw(col: Colony, c: number, p: number, purpose: WithdrawPurpose): FoodMove {
  if (!col.alive) return { c: 0, p: 0, toxin: 0 };
  const s = col.stores;
  const before = s.c + s.p;
  const tc = Math.min(Math.max(0, c), s.c);
  const tp = Math.min(Math.max(0, p), s.p);
  s.c -= tc;
  s.p -= tp;
  if (s.c < LOAD_EPS) s.c = 0;
  if (s.p < LOAD_EPS) s.p = 0;
  const toxin = before > 0 ? s.toxin * ((tc + tp) / before) : 0;
  s.toxin -= toxin;
  book(col, OUT_KEY_C[purpose], tc);
  book(col, OUT_KEY_P[purpose], tp);
  if (purpose !== 'transit') {
    col.counters.useTodayC += tc;
    col.counters.useTodayP += tp;
  }
  refreshCapacity(col);
  return { c: tc, p: tp, toxin };
}

/**
 * Books food leaving a crop into a consumer (larva, queen): from the colony's transit balance first; any rest
 * never passed through the pool and is booked as a direct delivery consumed at once (pool unchanged).
 */
function bookCropFeed(col: Colony, c: number, p: number, to: 'larvae' | 'queen'): void {
  const fromTransitC = Math.min(c, Math.max(0, col.ledger.transitC));
  const fromTransitP = Math.min(p, Math.max(0, col.ledger.transitP));
  book(col, 'transitC', -fromTransitC);
  book(col, 'transitP', -fromTransitP);
  book(col, 'inDeliveryC', c - fromTransitC);
  book(col, 'inDeliveryP', p - fromTransitP);
  col.counters.intakeTodayC += c - fromTransitC;
  col.counters.intakeTodayP += p - fromTransitP;
  book(col, to === 'larvae' ? 'outLarvaeC' : 'outQueenC', c);
  book(col, to === 'larvae' ? 'outLarvaeP' : 'outQueenP', p);
  col.counters.useTodayC += c;
  col.counters.useTodayP += p;
}

/**
 * The giver feeds a larva (broodId) or, with broodId -1, its colony's queen, from its crop in the requested
 * amounts, limited by the crop and the receiver's gut space (scaled proportionally). Returns what moved.
 */
export function feedFromCrop(sim: Sim, giver: Ant, broodId: number, c: number, p: number): FoodAmount {
  const col = sim.stores.colonies.get(giver.colony);
  if (!col) return { c: 0, p: 0 };
  let wantC = Math.min(Math.max(0, c), giver.cropC);
  let wantP = Math.min(Math.max(0, p), giver.cropP);
  let space: number;
  let receiverId = -1;
  const larva = broodId >= 0 ? sim.stores.brood.get(broodId) : undefined;
  const queen = broodId < 0 ? sim.stores.ants.get(col.queenId) : undefined;
  if (larva) {
    if (larva.stage !== 'larva' || larva.colony !== col.id) return { c: 0, p: 0 };
    space = LARVA_GUT_CAP - larva.gutC - larva.gutP;
  } else if (queen && queen.queen) {
    space = QUEEN_GUT_CAP - queen.queen.gut.c - queen.queen.gut.p;
    receiverId = queen.id;
  } else {
    return { c: 0, p: 0 };
  }
  const total = wantC + wantP;
  if (total <= LOAD_EPS || space <= LOAD_EPS) return { c: 0, p: 0 };
  if (total > space) {
    const k = space / total;
    wantC *= k;
    wantP *= k;
  }
  giver.cropC -= wantC;
  giver.cropP -= wantP;
  if (giver.cropC < LOAD_EPS) giver.cropC = 0;
  if (giver.cropP < LOAD_EPS) giver.cropP = 0;
  if (larva) {
    larva.gutC += wantC;
    larva.gutP += wantP;
    larva.hungerTicks = 0;
    bookCropFeed(col, wantC, wantP, 'larvae');
  } else if (queen?.queen) {
    queen.queen.gut.c += wantC;
    queen.queen.gut.p += wantP;
    bookCropFeed(col, wantC, wantP, 'queen');
  }
  sim.emit({ type: 'feed', giverId: giver.id, receiverId, broodId: larva ? larva.id : -1, c: wantC, p: wantP });
  return { c: wantC, p: wantP };
}

/** Spoilage half-life multiplier at chamber temperature T (GDD 02 §5.1): x 2^((20 - T) / 10). */
function spoilRatePerGd(halfLifeGd: number, tempC: number): number {
  return Math.LN2 / (halfLifeGd * Math.pow(2, (SPOIL_REF_C - tempC) / 10));
}

/** Temperature of the food store: the first food chamber, else the colony's first chamber. */
export function storeTempC(sim: Sim, col: Colony): number {
  const chs = colonyChambers(sim, col);
  const food = chs.find((ch) => ch.type === 'food') ?? chs[0];
  return chamberTempC(sim, food ? food.id : -1);
}

/**
 * Spoils pile food for dtGd game days (piles only; the social stomach keeps). Returns the P spoilage rate, loads
 * per gd (it is part of the protein need). Every SPOILED_ITEM_LOADS spoiled spawns a `spoiled-food` waste item.
 */
export function spoil(sim: Sim, col: Colony, dtGd: number): { c: number; p: number } {
  const k = poolCapacity(col);
  const s = col.stores;
  const t = storeTempC(sim, col);
  const pileC = Math.max(0, s.c - k.stomachC);
  const pileP = Math.max(0, s.p - k.stomachP);
  const over = Math.max(0, pileC + pileP - k.pileCap);
  const overShare = pileC + pileP > 0 ? over / (pileC + pileP) : 0;
  const mult = 1 + overShare * (SPOIL_OVERFLOW_MULT - 1);
  const rateC = pileC * spoilRatePerGd(C_SPOIL_HALF_LIFE_GD, t) * mult;
  const rateP = pileP * spoilRatePerGd(P_SPOIL_HALF_LIFE_GD, t) * mult;
  const lostC = Math.min(pileC, rateC * dtGd);
  const lostP = Math.min(pileP, rateP * dtGd);
  if (lostC > 0 || lostP > 0) {
    const before = s.c + s.p;
    s.c -= lostC;
    s.p -= lostP;
    if (before > 0) s.toxin -= s.toxin * ((lostC + lostP) / before);
    book(col, 'outSpoiledC', lostC);
    book(col, 'outSpoiledP', lostP);
    const core = coreOf(col);
    core.spoiledPending += lostC + lostP;
    while (core.spoiledPending >= SPOILED_ITEM_LOADS) {
      core.spoiledPending -= SPOILED_ITEM_LOADS;
      spawnSpoiledItem(sim, col);
    }
  }
  s.toxin *= Math.pow(0.5, dtGd / TOXIN_HALF_LIFE_GD);
  return { c: rateC, p: rateP };
}

function spawnSpoiledItem(sim: Sim, col: Colony): void {
  const chs = colonyChambers(sim, col);
  const ch = chs.find((x) => x.type === 'food') ?? chs[0];
  const nest = sim.stores.nests.get(col.nestIds[0] ?? -1);
  const pos = ch ? ch.center : nest ? nest.origin : sim.world.queenStart.pos;
  spawnItem(sim, {
    kind: 'waste', pos,
    init: { wasteKind: 'spoiled-food', nestId: nest ? nest.id : -1, chamberId: ch ? ch.id : -1, inNest: !!ch, colony: col.id },
  });
}
