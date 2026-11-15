// The claustral cell (GDD 02 §2.7 `queen.found-care`, GDD 06 §5.11-§5.12): while the colony has no worker the
// sealed queen cares for her brood automatically on the colony's slow tick. She tends every pile, feeds the larvae
// from her founding pool (that is the progressive larval draw of the model), helps ready pupae out of their
// cocoons, clears meconia and cocoon husks out of the cell, pays her upkeep, eats the youngest larva when the
// pool runs low, and the cell's hazards are rolled. Development itself is the colony brood system's.
// The model's brood hazard mu(Q) is applied on top of the colony's base hazard (only the part mu exceeds it by).

import { rngFloat } from '@/core/rng';
import type { Ant, Brood, Nest, OpeningState, Sim } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { FEED_LARVA_LOADS, FOUNDING_FEED_P_SHARE } from '@/sim/balance/actions';
import { LARVA_GUT_CAP } from '@/sim/balance';
import {
  FOUND_CANNIBAL, FOUND_CARE_EVERY_TICKS, FOUND_CARE_FEED_BELOW, FOUND_FIRST_BROOD_DEV_MULT, FOUND_HAZARD, FOUND_HAZARD_EVERY_GD,
  FOUND_HAZARD_LOSS, FOUND_HAZARD_RESPONDED, FOUND_HAZARD_RESPONSE, FOUND_UPKEEP_PER_GD, FOUND_WINTER_UPKEEP_FACTOR,
} from '@/sim/balance/founding';
import { removeItem } from '@/sim/entities';
import { chamberHumidity, rainIntensityAt } from '@/sim/environment';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import type { FoundingHazard } from '@/sim/types';
import { ecloseBrood, larvaRemainingNeed } from '../brood';
import { broodTempC } from '../envAdapter';
import { devRate, stageDu } from '../life';
import { feedFromCrop } from '../stores';
import { broodDies } from '../brood';
import { FB, bbGet, bbSet, playerColonyOf, speciesOf } from './access';
import { colonyBaseHazardPerGd, foundingMu } from './model';
import { deepMoisture, footTrafficAt } from './siteAssess';
import { queenDies } from './failure';

const CARE_DT_GD = FOUND_CARE_EVERY_TICKS / TICKS_PER_DAY;

export interface CareResult {
  /** The queen died of exhaustion (pool empty, nothing edible). */
  queenDied: boolean;
  eclosed: number;
}

function colonyBrood(sim: Sim, colonyId: number): Brood[] {
  const out: Brood[] = [];
  for (const b of sim.stores.brood.list) if (b.alive && b.colony === colonyId) out.push(b);
  return out;
}

/** Larval food moved from the pool through her crop into a larva's gut (the feed-larva effect, automated). */
function feedLarva(sim: Sim, q: Ant, b: Brood): void {
  const f = q.queen!.founding!;
  const def = speciesOf(sim);
  const want = Math.min(FEED_LARVA_LOADS, LARVA_GUT_CAP - b.gutC - b.gutP, larvaRemainingNeed(def, b), f.reserveLoads);
  if (!(want > 1e-9)) return;
  f.reserveLoads -= want;
  const p = want * FOUNDING_FEED_P_SHARE, c = want - p;
  q.cropP += p;
  q.cropC += c;
  feedFromCrop(sim, q, b.id, c, p);
  // whatever the larva did not take goes back to the pool (the crop is only the hand-over vessel)
  f.reserveLoads += q.cropC + q.cropP;
  q.cropC = 0;
  q.cropP = 0;
}

/** The waste of the cell (meconia, cocoon husks, brood corpses): packed away into the shaft fill. */
function tidyCell(sim: Sim, nest: Nest): void {
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.kind !== 'waste' || it.nestId !== nest.id || it.carrierIds.length > 0) continue;
    removeItem(sim, it.id, 'founding-tidy');
  }
}

/** Youngest edible brood: the least developed larva, else the youngest egg (pupae are cocooned, never eaten). */
function youngestEdible(list: readonly Brood[]): Brood | null {
  let larva: Brood | null = null, egg: Brood | null = null;
  for (const b of list) {
    if (!b.alive || b.carriedBy !== -1) continue;
    if (b.stage === 'larva' && (!larva || b.progress < larva.progress)) larva = b;
    else if (b.stage === 'egg' && (!egg || b.progress < egg.progress)) egg = b;
  }
  return larva ?? egg;
}

/** Cannibalism (GDD 06 §5.12 step 3): returns false when she must eat but nothing is edible. */
function cannibalism(sim: Sim, q: Ant, list: Brood[]): boolean {
  const f = q.queen!.founding!;
  if (f.reserveLoads >= FOUND_CANNIBAL.low * f.R0) return true;
  const empty = f.reserveLoads <= 0;
  const every = Math.round(FOUND_CANNIBAL.everyGd * TICKS_PER_DAY);
  const due = sim.state.tick - bbGet(q, FB.cannibalTick, -1e9) >= every;
  if (!empty && !due) return true;
  bbSet(q, FB.cannibalTick, sim.state.tick);
  if (!empty && rngFloat(sim.stream('rng.opening')) >= FOUND_CANNIBAL.p) return true;
  const victim = youngestEdible(list);
  if (!victim) return !empty;
  const back = victim.stage === 'larva'
    ? FOUND_CANNIBAL.larvaReturn * (victim.fedC + victim.fedP + victim.gutC + victim.gutP)
    : FOUND_CANNIBAL.eggReturn;
  broodDies(sim, victim, 'cannibalised');
  f.reserveLoads += back;
  bbSet(q, FB.eaten, bbGet(q, FB.eaten, 0) + 1);
  sim.emit({ type: 'queen.egg-eaten', queenId: q.id });
  sim.emit({ type: 'cannibalism', colonyId: q.colony, broodId: victim.id });
  return true;
}

/** Hazard rates per GD of the sealed cell (GDD 06 §5.12 step 4). */
export function hazardRates(sim: Sim, op: OpeningState, nest: Nest): Record<'flood' | 'intruder' | 'fungus' | 'collapse', number> {
  const cover = op.siteFactors[3] ?? 0.1, flood = op.siteFactors[4] ?? 1, rival = op.siteFactors[5] ?? 1;
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  const humidity = cell ? chamberHumidity(sim, cell.id) : 0.6;
  const depthBu = cell ? cell.depthMm / sim.world.bu : 10;
  const params = sim.state.config.difficulty.params;
  const H = FOUND_HAZARD;
  return {
    flood: H.floodBase * (1 - flood) ** 2 * rainIntensityAt(sim, nest.origin),
    intruder: H.intruderBase * (1 - cover) * H.intruderSealed * params.predatorDensityMult * (1 + H.intruderRivalGain * (1 - rival)),
    fungus: H.fungusBase * Math.max(0, (humidity - H.fungusHumidityFrom) / H.fungusHumiditySpan),
    collapse: depthBu < H.collapseDepthBu ? H.collapseBase * footTrafficAt(sim, nest.origin.x, nest.origin.z) : 0,
  };
}

/**
 * Applies one hazard's outcome. No interrupt beats in T1: Gentle resolves with the responded outcome halved; on the
 * other difficulties the first openingInterruptMax hazards are answered by her automatic care (the success outcome),
 * later ones take the default outcome.
 */
function applyHazard(sim: Sim, op: OpeningState, q: Ant, list: Brood[], hazard: FoundingHazard): void {
  const max = sim.state.config.difficulty.params.openingInterruptMax;
  const gentle = max <= 0;
  // an interrupt beat the T1 lapse cannot show yet: her automatic care responds (FOUND_HAZARD_RESPONSE)
  const responds = !gentle && op.interruptsUsed < max;
  if (responds) op.interruptsUsed++;
  const loss = (gentle ? FOUND_HAZARD_RESPONDED : responds ? FOUND_HAZARD_RESPONSE : FOUND_HAZARD_LOSS)[hazard];
  const rng = sim.stream('rng.opening');
  let lost = 0;
  for (const b of list) {
    if (b.alive && rngFloat(rng) < loss.brood) { broodDies(sim, b, hazard === 'flood' ? 'flooding' : 'predation'); lost++; }
  }
  if (loss.health > 0) q.hp = Math.max(0, q.hp - loss.health * q.maxHp);
  op.hazardLog.push({ tick: sim.state.tick, hazard, outcome: `${gentle || responds ? 'responded' : 'default'}:${lost}` });
  sim.emit({ type: 'queen.hazard', queenId: q.id, hazard });
  if (q.hp <= 0) queenDies(sim, q, hazard === 'intruder' ? 'predation' : 'crushed', hazard === 'intruder' ? 'predation' : 'crushed');
}

function rollHazards(sim: Sim, op: OpeningState, q: Ant, nest: Nest, list: Brood[]): void {
  const every = Math.round(FOUND_HAZARD_EVERY_GD * TICKS_PER_DAY);
  if (sim.state.tick - bbGet(q, FB.hazardTick, sim.state.tick - every) < every) return;
  bbSet(q, FB.hazardTick, sim.state.tick);
  const rates = hazardRates(sim, op, nest);
  const rng = sim.stream('rng.opening');
  for (const h of ['flood', 'intruder', 'fungus', 'collapse'] as const) {
    if (rates[h] > 0 && rngFloat(rng) < 1 - Math.exp(-rates[h] * FOUND_HAZARD_EVERY_GD)) applyHazard(sim, op, q, list, h);
    if (!q.alive) return;
  }
}

/** Upkeep of the sealed queen for one care period (no surface extra underground), loads. */
function upkeep(sim: Sim): number {
  const winter = currentSeason(sim.state) === 'winter' ? FOUND_WINTER_UPKEEP_FACTOR : 1;
  return FOUND_UPKEEP_PER_GD * winter * sim.state.config.difficulty.params.reserveDrainMult * CARE_DT_GD;
}

/**
 * The first brood's fast track (FOUND_FIRST_BROOD_DEV_MULT): an egg or a pupa still developing gains the extra
 * development of one care period on top of the colony brood system's own step (which then moves the stage on).
 */
function fastTrackStep(def: ReturnType<typeof speciesOf>, b: Brood, tempC: number): void {
  if (b.stage === 'larva' || (b.flags & (BroodFlag.READY | BroodFlag.DIAPAUSE)) !== 0) return;
  const extra = ((FOUND_FIRST_BROOD_DEV_MULT - 1) * devRate(def, tempC) * CARE_DT_GD) / stageDu(def, b.stage, b.destined);
  if (extra > 0) b.progress = Math.min(1, b.progress + extra);
}

/** One care period (every FOUND_CARE_EVERY_TICKS ticks) of the sealed founding queen. */
export function careTick(sim: Sim, op: OpeningState, q: Ant, nest: Nest): CareResult {
  const res: CareResult = { queenDied: false, eclosed: 0 };
  const f = q.queen?.founding;
  const col = playerColonyOf(sim);
  if (!f || !col || !q.alive) return res;
  if (sim.state.tick - bbGet(q, FB.careTick, -1e9) < FOUND_CARE_EVERY_TICKS) return res;
  bbSet(q, FB.careTick, sim.state.tick);
  f.reserveLoads -= upkeep(sim);
  // The queen feeds this brood from her pool, which replaces the colony's stores until the first worker eats
  // (GDD 02 §2.7 point 1): the empty stores are no protein shortage, so the early (minim) pupation clock (§2.6)
  // does not run in the claustral cell (the starvation clocks are held by the opening system, system.ts).
  const core = col.core;
  if (core) core.minimSinceTick = -1;
  const list = colonyBrood(sim, col.id);
  const def = speciesOf(sim);
  const mu = foundingMu(op.siteQ, def.id as Parameters<typeof foundingMu>[1], sim.state.config.difficulty.params.foundingBroodMortalityMult,
    deepMoisture(sim, nest.origin.x, nest.origin.z));
  const rng = sim.stream('rng.opening');
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  for (const b of list) {
    if (!b.alive) continue;
    b.lastTendedTick = sim.state.tick;
    // laid in the cavity outside the registered cell (the shaft's end): she keeps the pile in her cell
    if (b.chamberId < 0 && b.carriedBy === -1 && cell) { b.chamberId = cell.id; b.nestId = nest.id; }
    if (b.stage === 'pupa' && (b.flags & BroodFlag.READY) !== 0) {
      if (ecloseBrood(sim, b.id, q.id)) { res.eclosed++; bbSet(q, FB.eclosed, bbGet(q, FB.eclosed, 0) + 1); }
      continue;
    }
    // the model's hazard beyond the colony's own base hazard at this temperature (compressed with the fast track)
    const tempC = broodTempC(sim, b);
    const track = b.stage === 'larva' ? 1 : FOUND_FIRST_BROOD_DEV_MULT;
    const extra = mu * track - colonyBaseHazardPerGd(def, tempC);
    if (extra > 0 && rngFloat(rng) < 1 - Math.exp(-extra * CARE_DT_GD)) { broodDies(sim, b, 'base'); continue; }
    fastTrackStep(def, b, tempC);
    if (b.stage === 'larva' && b.gutC + b.gutP < FOUND_CARE_FEED_BELOW) feedLarva(sim, q, b);
  }
  tidyCell(sim, nest);
  if (!cannibalism(sim, q, list)) {
    queenDies(sim, q, 'exhaustion', 'exhaustion');
    res.queenDied = true;
    return res;
  }
  if (f.reserveLoads < 0 && !youngestEdible(list)) {
    f.reserveLoads = 0;
    queenDies(sim, q, 'exhaustion', 'exhaustion');
    res.queenDied = true;
    return res;
  }
  rollHazards(sim, op, q, nest, list);
  if (!q.alive) res.queenDied = true;
  return res;
}
