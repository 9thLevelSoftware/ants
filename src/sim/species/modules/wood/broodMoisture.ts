// Brood moisture rule of wood nests (GDD 07 §6.2.4; the founding cell's moisture clock, §5.2.3, is the same rule):
// eggs and young larvae die at `hazardPerGd` in dry wood and in mouldy wood; late larvae and pupae develop
// DRY_BONUS faster in dry-warm wood (8-18 %) and suffer the mould term too.

import type { Brood, Colony, Nest, Sim, SpeciesDef } from '@/sim/types';
import { rngFloat } from '@/core/rng';
import { WOOD_BROOD_TICKS } from '@/sim/balance/species-carpenter';
import { broodDies } from '@/sim/colony/brood';
import { devRate, stageDu } from '@/sim/colony/life';
import { chamberTemp } from '@/sim/environment/chamber';
import { TICKS_PER_DAY } from '@/sim/time';
import type { WoodParams } from './params';
import { woodClimateAt } from './woodState';

/** GDD 07 §6.2.4: 0.4 × clamp((15 − mc) / 7, 0, 1) + 0.01 × (mc − 30) above 30 %, per GD. */
export function dryHazardPerGd(p: WoodParams, mc: number): number {
  const span = Math.max(1e-6, p.mcFullSurvivalPct - p.mcZeroSurvivalPct);
  return p.hazardDryMaxPerGd * Math.max(0, Math.min(1, (p.mcFullSurvivalPct - mc) / span));
}

export function mouldHazardPerGd(p: WoodParams, mc: number): number {
  return mc > p.mcMouldPct ? p.hazardMouldPerPct * (mc - p.mcMouldPct) : 0;
}

/** Hazard per GD for a brood item at moisture mc (young: dry + mould; late: mould only). */
export function broodHazardPerGd(p: WoodParams, b: Pick<Brood, 'stage' | 'progress'>, mc: number): number {
  const young = b.stage === 'egg' || (b.stage === 'larva' && b.progress < p.youngProgressMax);
  return (young ? dryHazardPerGd(p, mc) : 0) + mouldHazardPerGd(p, mc);
}

/** Is this item late brood (late larva or pupa) for the dry bonus and the shuttle? */
export function isLateBrood(p: WoodParams, b: Pick<Brood, 'stage' | 'progress'>): boolean {
  return b.stage === 'pupa' || (b.stage === 'larva' && b.progress >= p.youngProgressMax);
}

/** Moisture % at a brood item (the wood it lies in, within 1 BU), or null outside wood. */
export function broodMoisture(sim: Sim, b: Brood): number | null {
  return woodClimateAt(sim, b.pos, sim.world.bu)?.mc ?? null;
}

function chamberOf(sim: Sim, b: Brood): { nest: Nest; temp: number } | null {
  const nest = sim.stores.nests.get(b.nestId);
  if (!nest) return null;
  const c = nest.chambers.find((x) => x.id === b.chamberId);
  return { nest, temp: c ? chamberTemp(sim, nest, c) : chamberTemp(sim, nest, nest.chambers[0]) };
}

/** One pass (every WOOD_BROOD_TICKS) over a wood-nesting colony's brood. Returns brood killed. */
export function broodMoisturePass(sim: Sim, def: SpeciesDef, col: Colony, p: WoodParams): number {
  const dtGd = WOOD_BROOD_TICKS / TICKS_PER_DAY;
  const rng = sim.stream('rng.brood');
  const dead: Brood[] = [];
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.carriedBy >= 0) continue;
    const mc = broodMoisture(sim, b);
    if (mc === null) continue;
    const h = broodHazardPerGd(p, b, mc);
    if (h > 0 && rngFloat(rng) < 1 - Math.exp(-h * dtGd)) { dead.push(b); continue; }
    if (isLateBrood(p, b) && mc >= p.dryBonusMcMinPct && mc <= p.dryBonusMcMaxPct && b.progress < 1) {
      // fed late larvae and pupae: the extra development the bonus adds on top of the colony's own step
      if (b.stage === 'larva' && b.hunger >= 1) continue;
      const ch = chamberOf(sim, b);
      if (!ch) continue;
      const rate = devRate(def, ch.temp) / Math.max(1e-6, stageDu(def, b.stage, b.destined));
      b.progress = Math.min(0.999, b.progress + (p.dryBonus - 1) * rate * dtGd);
    }
  }
  for (const b of dead) broodDies(sim, b, 'humidity');
  return dead.length;
}
