// Brood (GDD 02 §2): development rate versus temperature, larval digestion and hunger, mortality hazards,
// stage changes, minims, eclosion readiness and eclosion, diapause hooks. Runs on the staggered slow tick.
// Feeding, tending, eclosion help and cannibalism are performed by ants (behaviours / the founding queen) through
// the exported functions; this file never moves ants.

import { rngFloat, rngGauss } from '@/core/rng';
import { clamp } from '@/core/math/scalar';
import type { Ant, Brood, BroodDeathCause, Colony, ColonyCoreState, Sim, SpeciesDef } from '@/sim/types';
import { AntFlag, BroodFlag } from '@/sim/types';
import {
  BROOD_HAZARD, BROOD_SURVIVAL, DIAG_BROOD_REF_C, DIAPAUSE_COLD_C, DIAPAUSE_DOY, DIAPAUSE_ENTER_GD,
  DIAPAUSE_EXIT_GD, DIAPAUSE_HAZARD_MULT, ECLOSE_WAIT_GD, FEED_URGENCY_HUNGER_GD, FEED_URGENCY_HUNGER_W,
  LARVA_C_DEFICIT_GROWTH,
  LARVA_FEED_REQUEST, LARVA_GUT_CAP, LARVA_P_DEFICIT_C_USE, LARVA_PSTARVE_GD, LARVA_STARVE_GD, LIFESPAN_CLAMP_GD,
  LOAD_EPS, MINIM_MIN_PROGRESS, MINIM_SCALE, MINIM_TRIGGER_GD, NANITIC_LIFESPAN_MEAN_GD, NANITIC_LIFESPAN_SD_GD,
  NANITIC_SCALE, PRIORITY_PROGRESS_BONUS, PROTEIN_PRIORITY_DAYS_P, UNTENDED_GD,
} from '@/sim/balance';
import { killBrood, removeEclosedBrood, spawnAnt, spawnItem } from '@/sim/entities';
import { currentDefaultYearDoy, currentSeason, daysToTicks, TICKS_PER_DAY } from '@/sim/time';
import { accAdd, coreOf } from './core';
import { chamberById, cycleWaste, isWorkerCaste } from './census';
import { broodTempC, chamberRh } from './envAdapter';
import { devRate, larvaFood, stageDu } from './life';
import { daysOfStock } from './needs';
import { countBroodDeath, countStageChange } from './population';

// Imported bindings are accessor reads under Vite's SSR module runner (tests, headless tools); the hot per-entity
// steps below read these module-local copies instead.
const _rngFloat = rngFloat;
const _rngGauss = rngGauss;
const _clamp = clamp;
const _AntFlag = AntFlag;
const _BroodFlag = BroodFlag;
const _BROOD_HAZARD = BROOD_HAZARD;
const _BROOD_SURVIVAL = BROOD_SURVIVAL;
const _DIAG_BROOD_REF_C = DIAG_BROOD_REF_C;
const _DIAPAUSE_COLD_C = DIAPAUSE_COLD_C;
const _DIAPAUSE_DOY = DIAPAUSE_DOY;
const _DIAPAUSE_ENTER_GD = DIAPAUSE_ENTER_GD;
const _DIAPAUSE_EXIT_GD = DIAPAUSE_EXIT_GD;
const _DIAPAUSE_HAZARD_MULT = DIAPAUSE_HAZARD_MULT;
const _ECLOSE_WAIT_GD = ECLOSE_WAIT_GD;
const _FEED_URGENCY_HUNGER_GD = FEED_URGENCY_HUNGER_GD;
const _FEED_URGENCY_HUNGER_W = FEED_URGENCY_HUNGER_W;
const _LARVA_C_DEFICIT_GROWTH = LARVA_C_DEFICIT_GROWTH;
const _LARVA_FEED_REQUEST = LARVA_FEED_REQUEST;
const _LARVA_GUT_CAP = LARVA_GUT_CAP;
const _LARVA_P_DEFICIT_C_USE = LARVA_P_DEFICIT_C_USE;
const _LARVA_PSTARVE_GD = LARVA_PSTARVE_GD;
const _LARVA_STARVE_GD = LARVA_STARVE_GD;
const _LIFESPAN_CLAMP_GD = LIFESPAN_CLAMP_GD;
const _LOAD_EPS = LOAD_EPS;
const _MINIM_MIN_PROGRESS = MINIM_MIN_PROGRESS;
const _MINIM_SCALE = MINIM_SCALE;
const _MINIM_TRIGGER_GD = MINIM_TRIGGER_GD;
const _NANITIC_LIFESPAN_MEAN_GD = NANITIC_LIFESPAN_MEAN_GD;
const _NANITIC_LIFESPAN_SD_GD = NANITIC_LIFESPAN_SD_GD;
const _NANITIC_SCALE = NANITIC_SCALE;
const _PRIORITY_PROGRESS_BONUS = PRIORITY_PROGRESS_BONUS;
const _PROTEIN_PRIORITY_DAYS_P = PROTEIN_PRIORITY_DAYS_P;
const _UNTENDED_GD = UNTENDED_GD;
const _killBrood = killBrood;
const _removeEclosedBrood = removeEclosedBrood;
const _spawnAnt = spawnAnt;
const _spawnItem = spawnItem;
const _currentDefaultYearDoy = currentDefaultYearDoy;
const _currentSeason = currentSeason;
const _daysToTicks = daysToTicks;
const _TICKS_PER_DAY = TICKS_PER_DAY;
const _accAdd = accAdd;
const _coreOf = coreOf;
const _chamberById = chamberById;
const _isWorkerCaste = isWorkerCaste;
const _cycleWaste = cycleWaste;
const _broodTempC = broodTempC;
const _chamberRh = chamberRh;
const _devRate = devRate;
const _larvaFood = larvaFood;
const _stageDu = stageDu;
const _daysOfStock = daysOfStock;

const H = _BROOD_HAZARD;
/** Progress this close to 1 completes the stage (float rounding of the last digestion step). */
const PROGRESS_EPS = 1e-6;

/** Larval hunger 0..1 (GDD 02 §2.4). */
export function larvaHunger(b: Brood): number {
  return _clamp(1 - (b.gutC + b.gutP) / _LARVA_GUT_CAP, 0, 1);
}

/** Food the larva still needs to finish its stage (by progress) beyond what is in its gut, loads. */
export function larvaRemainingNeed(def: SpeciesDef, b: Brood): number {
  const food = _larvaFood(def, b.destined, b.destinedLengthBu);
  return Math.max(0, (food.c + food.p) * (1 - b.progress) - b.gutC - b.gutP);
}

/** True if the larva requests a feed (nursery `feed` job); with `def`, only while it still needs food. */
export function wantsFeed(b: Brood, def?: SpeciesDef): boolean {
  if (!b.alive || b.stage !== 'larva' || (b.flags & _BroodFlag.DIAPAUSE) !== 0 || b.gutC + b.gutP >= _LARVA_FEED_REQUEST) return false;
  return !def || larvaRemainingNeed(def, b) > _LOAD_EPS;
}

/** Feed-job urgency, with the protein-priority bonus under scarcity (GDD 02 §2.4, §5.4.3). */
export function feedUrgency(b: Brood, col: Colony): number {
  const u = larvaHunger(b) + _FEED_URGENCY_HUNGER_W * Math.min(1, b.hungerTicks / _TICKS_PER_DAY / _FEED_URGENCY_HUNGER_GD);
  return _daysOfStock(col).p < _PROTEIN_PRIORITY_DAYS_P ? u * (1 + _PRIORITY_PROGRESS_BONUS * b.progress) : u;
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
  if (on) b.flags |= _BroodFlag.DIAPAUSE;
  else b.flags &= ~_BroodFlag.DIAPAUSE;
  b.diapauseTicks = 0;
}

function spawnWaste(sim: Sim, b: Brood, wasteKind: 'meconium' | 'cocoon' | 'brood-corpse'): void {
  _spawnItem(sim, {
    kind: 'waste', pos: b.pos,
    init: { wasteKind, nestId: b.nestId, chamberId: b.chamberId, inNest: b.chamberId >= 0, colony: b.colony },
  });
}

/** Brood death with the colony counter and the brood-corpse waste item (none when cannibalised). */
export function broodDies(sim: Sim, b: Brood, cause: BroodDeathCause): void {
  const col = sim.stores.colonies.get(b.colony);
  if (!_killBrood(sim, b.id, cause)) return;
  if (col) {
    col.counters.broodDeaths++;
    countBroodDeath(col, cause);
  }
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
  const col = sim.stores.colonies.get(b.colony);
  if (col) countStageChange(col, from, to);
  if (from === 'larva' && to === 'pupa') spawnWaste(sim, b, 'meconium');
}

/** Hazards per gd other than the base hazard, by cause (GDD 02 §2.5). */
function extraHazards(sim: Sim, col: Colony, b: Brood, tempC: number, out: Map<BroodDeathCause, number>): void {
  const now = sim.state.tick;
  const diapause = (b.flags & _BroodFlag.DIAPAUSE) !== 0;
  if (b.stage !== 'larva' && b.carriedBy === -1 && now - b.lastTendedTick > UNTENDED_TICKS) out.set('untended', H.untended);
  let temp = 0;
  if (tempC >= H.heatMinC) temp += H.heatPerC * (tempC - H.heatOffsetC);
  if (tempC <= H.frostMaxC) temp += diapause ? H.frostDiapause : H.frost;
  if (temp > 0) out.set('temperature', temp);
  if (b.stage !== 'pupa' && _chamberRh(sim, b.chamberId, b.pos) < H.humidityMinRh) out.set('humidity', H.humidity);
  if (b.chamberId >= 0) {
    const waste = _cycleWaste(col, b.chamberId);
    if (waste > H.wasteTolerance) out.set('hygiene', Math.min(H.hygieneCap, H.hygienePerItem * (waste - H.wasteTolerance)));
    const ch = _chamberById(sim, b.chamberId);
    if (ch && ch.flooded >= H.floodFraction) out.set('flooding', H.flooding);
  } else if (b.carriedBy === -1) {
    out.set('exposure', H.exposure);
  }
  if ((b.flags & _BroodFlag.READY) && (b.readyTicks ?? 0) > ECLOSE_WAIT_TICKS) out.set('eclosion-failed', H.eclosionFailed);
}

const hazardScratch = new Map<BroodDeathCause, number>();
const UNTENDED_TICKS = _daysToTicks(_UNTENDED_GD);
const ECLOSE_WAIT_TICKS = _daysToTicks(_ECLOSE_WAIT_GD);
const LARVA_STARVE_TICKS = _daysToTicks(_LARVA_STARVE_GD);
const LARVA_PSTARVE_TICKS = _daysToTicks(_LARVA_PSTARVE_GD);

/** Larval digestion for dtGd; returns the progress in DU and updates gut, fed and starvation clocks. */
function digest(b: Brood, r: number, du: number, food: { c: number; p: number }, dtGd: number, dtTicks: number): number {
  const dC = (food.c / du) * r * dtGd;
  const dP = (food.p / du) * r * dtGd;
  const hasC = b.gutC > _LOAD_EPS, hasP = b.gutP > _LOAD_EPS;
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
    du_ = _LARVA_C_DEFICIT_GROWTH * r * dtGd * (dP > 0 ? p / dP : 0);
  } else if (hasC) {
    const c = Math.min(b.gutC, _LARVA_P_DEFICIT_C_USE * dC);
    b.gutC -= c; b.fedC += c;
    b.pStarveTicks += dtTicks;
  } else {
    b.hungerTicks += dtTicks;
  }
  if (b.gutC < _LOAD_EPS) b.gutC = 0;
  if (b.gutP < _LOAD_EPS) b.gutP = 0;
  if (b.gutP > 0) b.pStarveTicks = 0;
  if (b.gutC + b.gutP > 0) b.hungerTicks = 0;
  b.hunger = larvaHunger(b);
  return du_;
}

/** Diapause entry / exit clocks (GDD 02 §2.8, T2). */
function updateDiapause(sim: Sim, b: Brood, tempC: number, dtTicks: number): void {
  const inDiapause = (b.flags & _BroodFlag.DIAPAUSE) !== 0;
  if (!inDiapause) {
    b.diapauseTicks = tempC <= _DIAPAUSE_COLD_C ? (b.diapauseTicks ?? 0) + dtTicks : 0;
    if (_currentDefaultYearDoy(sim.state) >= _DIAPAUSE_DOY || b.diapauseTicks > _daysToTicks(_DIAPAUSE_ENTER_GD)) setBroodDiapause(b, true);
  } else {
    const warm = _currentSeason(sim.state) === 'spring' && tempC >= _DIAPAUSE_COLD_C;
    b.diapauseTicks = warm ? (b.diapauseTicks ?? 0) + dtTicks : 0;
    if (b.diapauseTicks >= _daysToTicks(_DIAPAUSE_EXIT_GD)) setBroodDiapause(b, false);
  }
}

/** Per-run sums of one colony's brood steps (flushed into Colony.core.acc by the brood system). */
export interface BroodAcc {
  larvaC: number; larvaP: number; larvae: number;
  winLarva: number; winLarvaP: number; winLarvaC: number; winR: number; winGrowth: number; winHyg: number; winHum: number;
}

export function newBroodAcc(): BroodAcc {
  return { larvaC: 0, larvaP: 0, larvae: 0, winLarva: 0, winLarvaP: 0, winLarvaC: 0, winR: 0, winGrowth: 0, winHyg: 0, winHum: 0 };
}

export function flushBroodAcc(core: ColonyCoreState, a: BroodAcc): void {
  if (a.larvae === 0 && a.winLarva === 0) return;
  _accAdd(core, 'cyc.larvaC', a.larvaC);
  _accAdd(core, 'cyc.larvaP', a.larvaP);
  _accAdd(core, 'cyc.larvae', a.larvae);
  _accAdd(core, 'win.larva', a.winLarva);
  _accAdd(core, 'win.larvaP', a.winLarvaP);
  _accAdd(core, 'win.larvaC', a.winLarvaC);
  _accAdd(core, 'win.larvaR', a.winR);
  _accAdd(core, 'win.larvaGrowth', a.winGrowth);
  _accAdd(core, 'win.hygieneHaz', a.winHyg);
  _accAdd(core, 'win.humidityHaz', a.winHum);
}

/** One slow-tick step of a brood item of a full-fidelity colony. */
export function broodStep(sim: Sim, b: Brood, col: Colony, core: ColonyCoreState, def: SpeciesDef, dtTicks: number, acc: BroodAcc = newBroodAcc()): void {
  const dtGd = dtTicks / _TICKS_PER_DAY;
  const tempC = _broodTempC(sim, b);
  if (b.stage === 'larva') updateDiapause(sim, b, tempC, dtTicks);
  const diapause = (b.flags & _BroodFlag.DIAPAUSE) !== 0;
  const r = diapause ? 0 : _devRate(def, tempC);
  const du = _stageDu(def, b.stage, b.destined);
  let progressDu = 0;

  if (b.stage === 'larva') {
    if (!diapause) {
      const food = _larvaFood(def, b.destined, b.destinedLengthBu);
      acc.larvaC += (food.c / du) * r;
      acc.larvaP += (food.p / du) * r;
      acc.larvae++;
      const hadP = b.gutP > _LOAD_EPS, hadC = b.gutC > _LOAD_EPS;
      progressDu = digest(b, r, du, food, dtGd, dtTicks);
      acc.winLarva++;
      if (hadP) acc.winLarvaP++;
      if (hadC) acc.winLarvaC++;
      acc.winR += r;
      acc.winGrowth += progressDu / dtGd;
      if (b.hungerTicks > LARVA_STARVE_TICKS || b.pStarveTicks > LARVA_PSTARVE_TICKS) {
        broodDies(sim, b, 'starvation');
        return;
      }
    }
  } else if (!(b.flags & _BroodFlag.READY)) {
    progressDu = r * dtGd;
  } else {
    b.readyTicks = (b.readyTicks ?? 0) + dtTicks;
  }

  // Mortality: base hazard per DU of progress plus the extra hazards per gd.
  hazardScratch.clear();
  extraHazards(sim, col, b, tempC, hazardScratch);
  // Diapause larvae do not progress: their base hazard runs per gd (as at r = 1), x _DIAPAUSE_HAZARD_MULT.
  const perDu = -Math.log(_BROOD_SURVIVAL[b.stage]) / du;
  const base = diapause ? perDu * _DIAPAUSE_HAZARD_MULT * dtGd : perDu * progressDu;
  let total = base;
  for (const v of hazardScratch.values()) total += v * dtGd;
  if (b.stage === 'larva') {
    acc.winHyg += hazardScratch.get('hygiene') ?? 0;
    acc.winHum += hazardScratch.get('humidity') ?? 0;
  }
  if (total > 0) {
    const rng = sim.stream('rng.brood');
    if (_rngFloat(rng) < 1 - Math.exp(-total)) {
      let pick = _rngFloat(rng) * total - base;
      let cause: BroodDeathCause = 'base';
      if (pick >= 0) {
        for (const [k, v] of hazardScratch) {
          pick -= v * dtGd;
          cause = k;
          if (pick < 0) break;
        }
      }
      broodDies(sim, b, cause);
      return;
    }
  }

  // Development and stage changes.
  if (progressDu > 0) b.progress += progressDu / du;
  if (b.stage === 'larva' && !diapause && b.progress >= _MINIM_MIN_PROGRESS && b.progress < 1
    && core.minimSinceTick >= 0 && sim.state.tick - core.minimSinceTick >= _daysToTicks(_MINIM_TRIGGER_GD)) {
    b.flags |= _BroodFlag.MINIM;
    setStage(sim, b, 'pupa');
    return;
  }
  if (b.progress >= 1 - PROGRESS_EPS) {
    if (b.stage === 'egg') setStage(sim, b, 'larva');
    else if (b.stage === 'larva') setStage(sim, b, 'pupa');
    else if (!(b.flags & _BroodFlag.READY)) {
      b.progress = 1;
      b.flags |= _BroodFlag.READY;
      b.readyTicks = 0;
    }
  }
}

/** Mean larval development rate reference r(_DIAG_BROOD_REF_C) for diagnostics. */
export function referenceDevRate(def: SpeciesDef): number {
  return _devRate(def, _DIAG_BROOD_REF_C);
}

/**
 * A helper (nurse, or the founding queen) completes eclosion of a `ready` pupa (`assist-eclosion`, GDD 02 §2.9).
 * Spawns the callow adult at the cocoon and a cocoon waste item; returns the new ant, or null.
 */
export function ecloseBrood(sim: Sim, pupaId: number, _helperId = -1): Ant | null {
  const b = sim.stores.brood.get(pupaId);
  if (!b || b.stage !== 'pupa' || !(b.flags & _BroodFlag.READY)) return null;
  const col = sim.stores.colonies.get(b.colony);
  if (!col) return null;
  const def = sim.getSpecies(col.species);
  const cd = def?.castes.find((c) => c.caste === b.destined);
  const nanitic = (b.flags & _BroodFlag.NANITIC) !== 0;
  const minim = (b.flags & _BroodFlag.MINIM) !== 0;
  const mean = cd ? cd.lengthBu.mean : 1;
  let lengthBu: number | undefined;
  if (nanitic) lengthBu = _NANITIC_SCALE * mean;
  else if (minim) lengthBu = _MINIM_SCALE * mean;
  else if (b.destinedLengthBu !== 1) lengthBu = b.destinedLengthBu;
  let flags = _AntFlag.CALLOW;
  if (nanitic) flags |= _AntFlag.NANITIC;
  if (minim) flags |= _AntFlag.MINIM;
  const ant = _spawnAnt(sim, {
    colony: col.id, caste: b.destined, pos: b.pos, task: 'idle', lengthBu, ageGd: 0, nestId: b.nestId,
    chamberId: b.chamberId, flags,
  });
  if (nanitic) {
    ant.lifespanGd = _clamp(_rngGauss(sim.stream('rng.colony'), _NANITIC_LIFESPAN_MEAN_GD, _NANITIC_LIFESPAN_SD_GD), _LIFESPAN_CLAMP_GD[0], _LIFESPAN_CLAMP_GD[1]);
  }
  spawnWaste(sim, b, 'cocoon');
  _removeEclosedBrood(sim, b.id);
  col.counters.eclosions++;
  if (_isWorkerCaste(ant.caste)) _coreOf(col).workers++;
  sim.emit({ type: 'ant-eclosed', antId: ant.id, colonyId: col.id, caste: ant.caste, nanitic, minim });
  return ant;
}
