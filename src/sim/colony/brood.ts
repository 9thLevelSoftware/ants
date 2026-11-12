// Brood (GDD 02 §2): development rate versus temperature, larval digestion and hunger, mortality hazards,
// stage changes, minims, eclosion readiness and eclosion, diapause hooks. Runs on the staggered slow tick.
// Feeding, tending, eclosion help and cannibalism are performed by ants (behaviours / the founding queen) through
// the exported functions; this file never moves ants.

import { rngFloat, rngGauss } from '@/core/rng';
import { clamp } from '@/core/math/scalar';
import type { Ant, Brood, BroodDeathCause, Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import { AntFlag, BroodFlag } from '@/sim/types';
import {
  BROOD_HAZARD, BROOD_SURVIVAL, CANNIBAL_INTERVAL_S, CANNIBAL_MIN_HUNGER_GD, CANNIBAL_RECYCLE_FRAC,
  DIAG_BROOD_REF_C, DIAPAUSE_COLD_C, DIAPAUSE_DOY, DIAPAUSE_ENTER_GD, DIAPAUSE_EXIT_GD, DIAPAUSE_HAZARD_MULT,
  ECLOSE_WAIT_GD, EGG_RECYCLE_P, FEED_URGENCY_HUNGER_GD, FEED_URGENCY_HUNGER_W, LARVA_C_DEFICIT_GROWTH,
  LARVA_FEED_REQUEST, LARVA_GUT_CAP, LARVA_P_DEFICIT_C_USE, LARVA_PSTARVE_GD, LARVA_STARVE_GD, LIFESPAN_CLAMP_GD,
  LOAD_EPS, MINIM_MIN_PROGRESS, MINIM_SCALE, MINIM_TRIGGER_GD, NANITIC_LIFESPAN_MEAN_GD, NANITIC_LIFESPAN_SD_GD,
  NANITIC_SCALE, PRIORITY_PROGRESS_BONUS, PROTEIN_PRIORITY_DAYS_P, UNTENDED_GD,
} from '@/sim/balance';
import { killBrood, removeEclosedBrood, spawnAnt, spawnItem } from '@/sim/entities';
import { currentDefaultYearDoy, currentSeason, daysToTicks, secondsToTicks, TICKS_PER_DAY } from '@/sim/time';
import { accAdd, coreOf } from './core';
import { chamberById, isWorkerCaste, itemCounts } from './census';
import { broodTempC, chamberRh } from './envAdapter';
import { devRate, larvaFood, stageDu } from './life';
import { daysOfStock } from './needs';
import { deposit } from './stores';

const H = BROOD_HAZARD;

/** Larval hunger 0..1 (GDD 02 §2.4). */
export function larvaHunger(b: Brood): number {
  return clamp(1 - (b.gutC + b.gutP) / LARVA_GUT_CAP, 0, 1);
}

/** True if the larva requests a feed (nursery `feed` job). */
export function wantsFeed(b: Brood): boolean {
  return b.alive && b.stage === 'larva' && (b.flags & BroodFlag.DIAPAUSE) === 0 && b.gutC + b.gutP < LARVA_FEED_REQUEST;
}

/** Feed-job urgency, with the protein-priority bonus under scarcity (GDD 02 §2.4, §5.4.3). */
export function feedUrgency(b: Brood, col: Colony): number {
  const u = larvaHunger(b) + FEED_URGENCY_HUNGER_W * Math.min(1, b.hungerTicks / TICKS_PER_DAY / FEED_URGENCY_HUNGER_GD);
  return daysOfStock(col).p < PROTEIN_PRIORITY_DAYS_P ? u * (1 + PRIORITY_PROGRESS_BONUS * b.progress) : u;
}

/** Marks brood within radiusMm of p (one pile) as tended now (`nurse.tend`, founding queen care). Returns the count. */
export function tendBroodAt(sim: Sim, colonyId: number, p: { x: number; y: number; z: number }, radiusMm: number): number {
  const r2 = radiusMm * radiusMm;
  let n = 0;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== colonyId) continue;
    const dx = b.pos.x - p.x, dy = b.pos.y - p.y, dz = b.pos.z - p.z;
    if (dx * dx + dy * dy + dz * dz <= r2) { b.lastTendedTick = sim.state.tick; n++; }
  }
  return n;
}

export function tendBrood(sim: Sim, broodId: number): boolean {
  const b = sim.stores.brood.get(broodId);
  if (!b) return false;
  b.lastTendedTick = sim.state.tick;
  return true;
}

/** Diapause hook (GDD 02 §2.8; overwintering may force it). Only larvae diapause. */
export function setBroodDiapause(b: Brood, on: boolean): void {
  if (b.stage !== 'larva') return;
  if (on) b.flags |= BroodFlag.DIAPAUSE;
  else b.flags &= ~BroodFlag.DIAPAUSE;
  b.diapauseTicks = 0;
}

function spawnWaste(sim: Sim, b: Brood, wasteKind: 'meconium' | 'cocoon' | 'brood-corpse'): void {
  spawnItem(sim, {
    kind: 'waste', pos: b.pos,
    init: { wasteKind, nestId: b.nestId, chamberId: b.chamberId, inNest: b.chamberId >= 0, colony: b.colony },
  });
}

function die(sim: Sim, b: Brood, cause: BroodDeathCause): void {
  const col = sim.stores.colonies.get(b.colony);
  if (!killBrood(sim, b.id, cause)) return;
  if (col) col.counters.broodDeaths++;
  if (cause !== 'cannibalised') spawnWaste(sim, b, 'brood-corpse');
}

function setStage(sim: Sim, b: Brood, to: Brood['stage']): void {
  const from = b.stage;
  b.stage = to;
  b.progress = 0;
  b.stageTick = sim.state.tick;
  b.hungerTicks = 0;
  b.pStarveTicks = 0;
  b.hunger = 0;
  b.gutC = 0;
  b.gutP = 0;
  sim.emit({ type: 'brood-stage', broodId: b.id, from, to });
  if (from === 'larva' && to === 'pupa') spawnWaste(sim, b, 'meconium');
}

/** Hazards per gd other than the base hazard, by cause (GDD 02 §2.5). */
function extraHazards(sim: Sim, b: Brood, tempC: number, out: Map<BroodDeathCause, number>): void {
  const now = sim.state.tick;
  const diapause = (b.flags & BroodFlag.DIAPAUSE) !== 0;
  if (b.stage !== 'larva' && b.carriedBy === -1 && now - b.lastTendedTick > daysToTicks(UNTENDED_GD)) out.set('untended', H.untended);
  let temp = 0;
  if (tempC >= H.heatMinC) temp += H.heatPerC * (tempC - H.heatOffsetC);
  if (tempC <= H.frostMaxC) temp += diapause ? H.frostDiapause : H.frost;
  if (temp > 0) out.set('temperature', temp);
  if (b.stage !== 'pupa' && chamberRh(sim, b.chamberId, b.pos) < H.humidityMinRh) out.set('humidity', H.humidity);
  if (b.chamberId >= 0) {
    const waste = itemCounts(sim).wasteByChamber.get(b.chamberId) ?? 0;
    if (waste > H.wasteTolerance) out.set('hygiene', Math.min(H.hygieneCap, H.hygienePerItem * (waste - H.wasteTolerance)));
    const ch = chamberById(sim, b.chamberId);
    if (ch && ch.flooded >= H.floodFraction) out.set('flooding', H.flooding);
  } else if (b.carriedBy === -1) {
    out.set('exposure', H.exposure);
  }
  if ((b.flags & BroodFlag.READY) && (b.readyTicks ?? 0) > daysToTicks(ECLOSE_WAIT_GD)) out.set('eclosion-failed', H.eclosionFailed);
}

const hazardScratch = new Map<BroodDeathCause, number>();

/** Larval digestion for dtGd; returns the progress in DU and updates gut, fed and starvation clocks. */
function digest(b: Brood, r: number, du: number, food: { c: number; p: number }, dtGd: number, dtTicks: number): number {
  const dC = (food.c / du) * r * dtGd;
  const dP = (food.p / du) * r * dtGd;
  const hasC = b.gutC > LOAD_EPS, hasP = b.gutP > LOAD_EPS;
  let du_ = 0;
  if (r <= 0) return 0;
  if (hasC && hasP) {
    const f = Math.min(1, b.gutC / dC, b.gutP / dP);
    const c = dC * f, p = dP * f;
    b.gutC -= c; b.gutP -= p; b.fedC += c; b.fedP += p;
    du_ = r * dtGd * f;
  } else if (hasP) {
    const p = Math.min(b.gutP, dP);
    b.gutP -= p; b.fedP += p;
    du_ = LARVA_C_DEFICIT_GROWTH * r * dtGd * (dP > 0 ? p / dP : 0);
  } else if (hasC) {
    const c = Math.min(b.gutC, LARVA_P_DEFICIT_C_USE * dC);
    b.gutC -= c; b.fedC += c;
    b.pStarveTicks += dtTicks;
  } else {
    b.hungerTicks += dtTicks;
  }
  if (b.gutC < LOAD_EPS) b.gutC = 0;
  if (b.gutP < LOAD_EPS) b.gutP = 0;
  if (b.gutP > 0) b.pStarveTicks = 0;
  if (b.gutC + b.gutP > 0) b.hungerTicks = 0;
  b.hunger = larvaHunger(b);
  return du_;
}

/** Diapause entry / exit clocks (GDD 02 §2.8, T2). */
function updateDiapause(sim: Sim, b: Brood, tempC: number, dtTicks: number): void {
  const inDiapause = (b.flags & BroodFlag.DIAPAUSE) !== 0;
  if (!inDiapause) {
    b.diapauseTicks = tempC <= DIAPAUSE_COLD_C ? (b.diapauseTicks ?? 0) + dtTicks : 0;
    if (currentDefaultYearDoy(sim.state) >= DIAPAUSE_DOY || b.diapauseTicks > daysToTicks(DIAPAUSE_ENTER_GD)) setBroodDiapause(b, true);
  } else {
    const warm = currentSeason(sim.state) === 'spring' && tempC >= DIAPAUSE_COLD_C;
    b.diapauseTicks = warm ? (b.diapauseTicks ?? 0) + dtTicks : 0;
    if (b.diapauseTicks >= daysToTicks(DIAPAUSE_EXIT_GD)) setBroodDiapause(b, false);
  }
}

/** One slow-tick step of a brood item of a full-fidelity colony. */
export function broodStep(sim: Sim, b: Brood, col: Colony, core: ColonyCoreState, def: SpeciesDef, dtTicks: number): void {
  const dtGd = dtTicks / TICKS_PER_DAY;
  const tempC = broodTempC(sim, b);
  if (b.stage === 'larva') updateDiapause(sim, b, tempC, dtTicks);
  const diapause = (b.flags & BroodFlag.DIAPAUSE) !== 0;
  const r = diapause ? 0 : devRate(def, tempC);
  const du = stageDu(def, b.stage, b.destined);
  let progressDu = 0;

  if (b.stage === 'larva') {
    if (!diapause) {
      const food = larvaFood(def, b.destined, b.destinedLengthBu);
      accAdd(core, 'cyc.larvaC', (food.c / du) * r);
      accAdd(core, 'cyc.larvaP', (food.p / du) * r);
      accAdd(core, 'cyc.larvae', 1);
      const hadP = b.gutP > LOAD_EPS, hadC = b.gutC > LOAD_EPS;
      progressDu = digest(b, r, du, food, dtGd, dtTicks);
      accAdd(core, 'win.larva', 1);
      if (hadP) accAdd(core, 'win.larvaP', 1);
      if (hadC) accAdd(core, 'win.larvaC', 1);
      accAdd(core, 'win.larvaR', r);
      accAdd(core, 'win.larvaGrowth', progressDu / dtGd);
      if (b.hungerTicks > daysToTicks(LARVA_STARVE_GD) || b.pStarveTicks > daysToTicks(LARVA_PSTARVE_GD)) {
        die(sim, b, 'starvation');
        return;
      }
    }
  } else if (!(b.flags & BroodFlag.READY)) {
    progressDu = r * dtGd;
  } else {
    b.readyTicks = (b.readyTicks ?? 0) + dtTicks;
  }

  // Mortality: base hazard per DU of progress plus the extra hazards per gd.
  hazardScratch.clear();
  extraHazards(sim, b, tempC, hazardScratch);
  // Diapause larvae do not progress: their base hazard runs per gd (as at r = 1), x DIAPAUSE_HAZARD_MULT.
  const perDu = -Math.log(BROOD_SURVIVAL[b.stage]) / du;
  const base = diapause ? perDu * DIAPAUSE_HAZARD_MULT * dtGd : perDu * progressDu;
  let total = base;
  for (const v of hazardScratch.values()) total += v * dtGd;
  if (b.stage === 'larva') {
    if (hazardScratch.has('hygiene')) accAdd(core, 'win.hygieneHaz', hazardScratch.get('hygiene') ?? 0);
    if (hazardScratch.has('humidity')) accAdd(core, 'win.humidityHaz', hazardScratch.get('humidity') ?? 0);
  }
  if (total > 0) {
    const rng = sim.stream('rng.brood');
    if (rngFloat(rng) < 1 - Math.exp(-total)) {
      let pick = rngFloat(rng) * total - base;
      let cause: BroodDeathCause = 'base';
      if (pick >= 0) {
        for (const [k, v] of hazardScratch) {
          pick -= v * dtGd;
          cause = k;
          if (pick < 0) break;
        }
      }
      die(sim, b, cause);
      return;
    }
  }

  // Development and stage changes.
  if (progressDu > 0) b.progress += progressDu / du;
  if (b.stage === 'larva' && !diapause && b.progress >= MINIM_MIN_PROGRESS && b.progress < 1
    && core.minimSinceTick >= 0 && sim.state.tick - core.minimSinceTick >= daysToTicks(MINIM_TRIGGER_GD)) {
    b.flags |= BroodFlag.MINIM;
    setStage(sim, b, 'pupa');
    return;
  }
  if (b.progress >= 1) {
    if (b.stage === 'egg') setStage(sim, b, 'larva');
    else if (b.stage === 'larva') setStage(sim, b, 'pupa');
    else if (!(b.flags & BroodFlag.READY)) {
      b.progress = 1;
      b.flags |= BroodFlag.READY;
      b.readyTicks = 0;
    }
  }
}

/** Mean larval development rate reference r(DIAG_BROOD_REF_C) for diagnostics. */
export function referenceDevRate(def: SpeciesDef): number {
  return devRate(def, DIAG_BROOD_REF_C);
}

/**
 * A helper (nurse, or the founding queen) completes eclosion of a `ready` pupa (`assist-eclosion`, GDD 02 §2.9).
 * Spawns the callow adult at the cocoon and a cocoon waste item; returns the new ant, or null.
 */
export function ecloseBrood(sim: Sim, pupaId: number, _helperId = -1): Ant | null {
  const b = sim.stores.brood.get(pupaId);
  if (!b || b.stage !== 'pupa' || !(b.flags & BroodFlag.READY)) return null;
  const col = sim.stores.colonies.get(b.colony);
  if (!col) return null;
  const def = sim.getSpecies(col.species);
  const cd = def?.castes.find((c) => c.caste === b.destined);
  const nanitic = (b.flags & BroodFlag.NANITIC) !== 0;
  const minim = (b.flags & BroodFlag.MINIM) !== 0;
  const mean = cd ? cd.lengthBu.mean : 1;
  let lengthBu: number | undefined;
  if (nanitic) lengthBu = NANITIC_SCALE * mean;
  else if (minim) lengthBu = MINIM_SCALE * mean;
  else if (b.destinedLengthBu !== 1) lengthBu = b.destinedLengthBu;
  let flags = AntFlag.CALLOW;
  if (nanitic) flags |= AntFlag.NANITIC;
  if (minim) flags |= AntFlag.MINIM;
  const ant = spawnAnt(sim, {
    colony: col.id, caste: b.destined, pos: b.pos, task: 'idle', lengthBu, ageGd: 0, nestId: b.nestId,
    chamberId: b.chamberId, flags,
  });
  if (nanitic) {
    ant.lifespanGd = clamp(rngGauss(sim.stream('rng.colony'), NANITIC_LIFESPAN_MEAN_GD, NANITIC_LIFESPAN_SD_GD), LIFESPAN_CLAMP_GD[0], LIFESPAN_CLAMP_GD[1]);
  }
  spawnWaste(sim, b, 'cocoon');
  removeEclosedBrood(sim, b.id);
  col.counters.eclosions++;
  if (isWorkerCaste(ant.caste)) coreOf(col).workers++;
  sim.emit({ type: 'ant-eclosed', antId: ant.id, colonyId: col.id, caste: ant.caste, nanitic, minim });
  return ant;
}

/**
 * Next brood item nurses may eat (GDD 02 §5.7 S3): eggs first, then larvae with the least progress that have
 * been hungry for CANNIBAL_MIN_HUNGER_GD; null outside S3+ or while the colony rate limit holds.
 */
export function nextCannibalVictim(sim: Sim, colonyId: number): Brood | null {
  const col = sim.stores.colonies.get(colonyId);
  if (!col) return null;
  if (col.starvationStage !== 'brood-sacrifice' && col.starvationStage !== 'adult-starvation') return null;
  if (sim.state.tick < coreOf(col).cannibalReadyTick) return null;
  let egg: Brood | null = null;
  let larva: Brood | null = null;
  const minHunger = daysToTicks(CANNIBAL_MIN_HUNGER_GD);
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== colonyId || b.carriedBy !== -1) continue;
    if (b.stage === 'egg') { if (!egg || b.id < egg.id) egg = b; } else if (b.stage === 'larva' && b.hungerTicks > minHunger) {
      if (!larva || b.progress < larva.progress) larva = b;
    }
  }
  return egg ?? larva;
}

/** A nurse eats a brood item (`nurse.cannibalise`): recycled into the pool (eggs EGG_RECYCLE_P, larvae half of fed). */
export function cannibaliseBrood(sim: Sim, _eaterId: number, broodId: number): boolean {
  const b = sim.stores.brood.get(broodId);
  if (!b || b.stage === 'pupa') return false;
  const col = sim.stores.colonies.get(b.colony);
  if (!col) return false;
  const c = b.stage === 'larva' ? CANNIBAL_RECYCLE_FRAC * b.fedC : 0;
  const p = b.stage === 'larva' ? CANNIBAL_RECYCLE_FRAC * b.fedP : EGG_RECYCLE_P;
  die(sim, b, 'cannibalised');
  deposit(col, c, p, 0, 'recycled');
  coreOf(col).cannibalReadyTick = sim.state.tick + secondsToTicks(CANNIBAL_INTERVAL_S);
  sim.emit({ type: 'cannibalism', colonyId: col.id, broodId });
  return true;
}
