// Chewing wood (GDD 07 §6.2.3): the bite time factor by decay class and moisture, across the grain, by caste; the
// thin-wall and carved-out refusals. Used through the dig-bite hook (src/sim/ants/actions/defs/dig.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { DIG_BITE_S } from '@/sim/balance/actions';
import { DIG_RAMP_RADIUS_BU } from '@/sim/balance/nest';
import { primDistance } from './primGeom';
import { colonyWoodParams, type WoodParams } from './params';
import { depthInWood, segmentIndexAt, woodAt } from './woodState';

/** Bite time factor of wood by decay class and moisture (× DIG_BITE_S), GDD 07 §6.2.3. */
export function woodDecayFactor(p: WoodParams, decay: number, mc: number): number {
  switch (Math.max(0, Math.min(4, Math.round(decay)))) {
    case 0: return mc < p.dryWoodMcPct ? p.biteFactorDecay0Dry : p.biteFactorDecay0Wet;
    case 1: return p.biteFactorDecay1;
    case 2: return p.biteFactorDecay2;
    case 3: return p.biteFactorDecay3;
    default: return p.biteFactorDecay4;
  }
}

/** Caste time factor: minor 1.6, nanitic 1.8, media 1.0, major 0.7 (queen and others as media). */
export function casteBiteFactor(p: WoodParams, ant: Ant): number {
  if ((ant.flags & AntFlag.NANITIC) !== 0) return p.casteFactorNanitic;
  switch (ant.caste) {
    case 'minor': case 'worker': return p.casteFactorMinor;
    case 'major': return p.casteFactorMajor;
    default: return p.casteFactorMedia;
  }
}

/** True when the bite direction is more than crossGrainAngleDeg off the grain axis. */
export function isCrossGrain(p: WoodParams, axis: Vec3, dir: Vec3): boolean {
  const len = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z) || 1;
  const c = Math.abs((axis.x * dir.x + axis.y * dir.y + axis.z * dir.z) / len);
  return c < Math.cos((p.crossGrainAngleDeg * Math.PI) / 180);
}

/**
 * Seconds one bite takes at `sample` (a point inside the solid) for this ant, or null when the sample is not nest
 * wood or the ant's colony does not nest in wood (the default rule applies). `workRate` multiplies speed.
 */
export function woodBiteSeconds(sim: Sim, ant: Ant, sample: Vec3, workRate = 1): number | null {
  const p = colonyWoodParams(sim, sim.stores.colonies.get(ant.colony));
  if (!p) return null;
  const hit = woodAt(sim, sample);
  if (!hit) return null;
  const seg = hit.wood.segments?.[segmentIndexAt(hit.prim, hit.wood, sample)];
  const mc = seg?.mc ?? hit.wood.moisture, decay = seg?.decay ?? hit.wood.decay;
  let f = woodDecayFactor(p, decay, mc) * casteBiteFactor(p, ant);
  if (hit.wood.grainAxis && isCrossGrain(p, hit.wood.grainAxis, ant.fwd)) f *= p.crossGrainMult;
  return (DIG_BITE_S * f) / Math.max(1e-6, workRate);
}

/**
 * Why a bite at `sample` must be refused for a wood nester, or null: the wood is carved out (MAX_CARVED_FRAC,
 * "The wall is too thin"), or an ant inside the wood would chew within MIN_WALL_BU of the outer surface (galleries
 * keep their walls; openings are chewed from outside, by the founding queen or a player, or cut as windows by the
 * module). The ramp brush opens up to DIG_RAMP_RADIUS_BU beyond the sample.
 */
export function woodBiteRefusal(sim: Sim, ant: Ant, sample: Vec3): 'wall-thin' | null {
  const p = colonyWoodParams(sim, sim.stores.colonies.get(ant.colony));
  if (!p) return null;
  const hit = woodAt(sim, sample);
  if (!hit) return null;
  if ((hit.wood.carvedFrac ?? 0) >= p.maxCarvedFrac) return 'wall-thin';
  const inside = primDistance(hit.prim, ant.pos) < 0;
  return inside && depthInWood(hit.prim, sample) < (DIG_RAMP_RADIUS_BU + p.minWallBu) * sim.world.bu ? 'wall-thin' : null;
}
