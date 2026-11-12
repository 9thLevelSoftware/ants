// The founding queen's reserves, shelter clock and health before the time-lapse (GDD 06 §5.5), one tick at a time.
// Reserves: upkeep at all times, extra while above ground, a cost per dig bite. Desiccation: open sun / shade or
// cover / a shaft deeper than 3 BU / sealed in a humid chamber, x difficulty, x 1.5 when hot. Health regenerates
// while sealed. Returns the death cause when she dies of it this tick (the caller fails the opening).

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  DESICC_HEAT_MULT, DESICC_OPEN_PER_GD, DESICC_SEALED_PER_GD, DESICC_SEALED_RH_MIN,
  DESICC_SHADE_MIN, DESICC_SHADE_PER_GD, DESICC_SHAFT_PER_GD, DESICC_SHAFT_REFUGE_BU, FOUND_DIG_COST_PER_BITE,
  FOUND_HEALTH_REGEN_SEALED, FOUND_SURFACE_EXTRA_PER_GD, FOUND_UPKEEP_PER_GD, FOUND_WINTER_UPKEEP_FACTOR,
} from '@/sim/balance/founding';
import { currentSeason, TICKS_PER_DAY } from '@/sim/time';
import { chamberHumidity } from '@/sim/environment';
import { pointTempC } from '../envAdapter';
import { FB, bbGet, bbSet, depthBelowGround, foundingNest, speciesOf } from './access';
import { coverAt } from './siteAssess';
import { queenDies } from './failure';

const DT_GD = 1 / TICKS_PER_DAY;

/** Static day-mean shade 0..1 at (x, z). */
function shadeMean(sim: Sim, x: number, z: number): number {
  const m = sim.world.maps.shade;
  const ix = Math.floor(x / m.cell), iz = Math.floor(z / m.cell);
  if (ix < 0 || iz < 0 || ix >= m.nx || iz >= m.nz) return 0;
  return m.data[iz * m.nx + ix] / 255;
}

/** Is the founding nest sealed (claustral) now? */
export function nestSealed(sim: Sim): boolean {
  const f = foundingNest(sim)?.founding;
  return !!f && f.state === 'sealed';
}

/** Desiccation rate per GD at the queen's place (before the difficulty and heat multipliers). */
export function desiccationBase(sim: Sim, q: Ant): number {
  const bu = sim.world.bu;
  const depth = depthBelowGround(sim, q);
  if (q.medium === 'cavity' || depth > DESICC_SHAFT_REFUGE_BU * bu) {
    if (nestSealed(sim) && q.chamberId >= 0) {
      return chamberHumidity(sim, q.chamberId) >= DESICC_SEALED_RH_MIN ? DESICC_SEALED_PER_GD : 0;
    }
    if (depth > DESICC_SHAFT_REFUGE_BU * bu) return DESICC_SHAFT_PER_GD;
  }
  // "in shade or under cover (cover score >= 0.6)": a roof or dense litter (GDD 06 §5.5)
  const cover = coverAt(sim, q.pos.x, q.pos.z);
  if (cover === 'roof' || cover === 'litter' || shadeMean(sim, q.pos.x, q.pos.z) >= DESICC_SHADE_MIN) return DESICC_SHADE_PER_GD;
  return DESICC_OPEN_PER_GD;
}

/** Desiccation per GD with the difficulty's exposure rate and the heat multiplier. */
export function desiccationRate(sim: Sim, q: Ant): number {
  const base = desiccationBase(sim, q);
  if (base <= 0) return base;
  const def = speciesOf(sim);
  const hot = pointTempC(sim, q.pos) >= def.thermal.shadeSeekC ? DESICC_HEAT_MULT : 1;
  return base * sim.state.config.difficulty.params.foundingExposureRate * hot;
}

/** Reserve drain per GD (upkeep, plus the surface extra while above ground), with the difficulty multiplier. */
export function reserveDrainPerGd(sim: Sim, q: Ant): number {
  const winter = currentSeason(sim.state) === 'winter' ? FOUND_WINTER_UPKEEP_FACTOR : 1;
  const above = q.medium !== 'cavity' && depthBelowGround(sim, q) <= DESICC_SHAFT_REFUGE_BU * sim.world.bu;
  const mult = sim.state.config.difficulty.params.reserveDrainMult;
  return (FOUND_UPKEEP_PER_GD * winter * mult) + (above ? FOUND_SURFACE_EXTRA_PER_GD * mult : 0);
}

/** Charges FOUND_DIG_COST_PER_BITE once per dig-bite the queen starts. */
function chargeBites(q: Ant): void {
  const f = q.queen?.founding;
  const a = q.action;
  if (!f || !a || a.id !== 'dig-bite') return;
  if (bbGet(q, FB.biteStart) === a.startTick) return;
  bbSet(q, FB.biteStart, a.startTick);
  bbSet(q, FB.bites, bbGet(q, FB.bites, 0) + 1);
  f.reserveLoads -= FOUND_DIG_COST_PER_BITE;
}

export type ExposureDeath = 'exhaustion' | 'desiccation' | null;

/** One tick of reserves, desiccation and health for the founding queen. */
export function exposureTick(sim: Sim, q: Ant, drainReserves = true): ExposureDeath {
  const f = q.queen?.founding;
  if (!f || !q.alive) return null;
  if (drainReserves) {
    f.reserveLoads -= reserveDrainPerGd(sim, q) * DT_GD;
    chargeBites(q);
  }
  f.desiccation = Math.max(0, Math.min(1, f.desiccation + desiccationRate(sim, q) * DT_GD));
  if (nestSealed(sim) && q.hp < q.maxHp) q.hp = Math.min(q.maxHp, q.hp + FOUND_HEALTH_REGEN_SEALED * q.maxHp * DT_GD);
  if (f.desiccation >= 1) { queenDies(sim, q, 'desiccation', 'desiccation'); return 'desiccation'; }
  if (f.reserveLoads <= 0 && drainReserves) { f.reserveLoads = 0; queenDies(sim, q, 'exhaustion', 'exhaustion'); return 'exhaustion'; }
  return null;
}

/** Possessed or not, the founding queen keeps the FOUNDING flag until hand-over. */
export function isFoundingAnt(a: Ant): boolean {
  return (a.flags & AntFlag.FOUNDING) !== 0;
}
