// Rain and wind on exposed ants (GDD 06 §3.3-3.4) and rain washing of exposed pheromone cells (§3.7).
// Hits are sampled per ant every WX_RAIN_HIT_EVERY ticks from the `rng.events` stream (only for exposed ants, so
// underground colonies draw nothing). Knock-offs use the ballistic fall locomotion already integrates (medium
// 'air'); stuns use the stun key shared with combat and creatures.

import type { Ant, PheroChannelFactors, RainClass, Sim } from '@/sim/types';
import { rngChance } from '@/core/rng';
import { difficultyValue, PHERO_CELL_BU, RAIN_MIN_RATE_MMH, WIND_GROUND_FACTOR } from '@/sim/balance';
import {
  WX_KNOCK_PUSH_MM_S, WX_RAIN_HIT_EVERY, WX_RAIN_HIT_HP, WX_RAIN_HIT_RATE, WX_RAIN_STUN_S, WX_STEM_HEIGHT_BU,
  WX_STEM_TOPPLE_RATE, WX_STEM_TOPPLE_WIND_GROUND, WX_STUN_KEY, WX_VERTICAL_UP_Y,
} from '@/sim/balance/weather';
import { killAnt } from '@/sim/entities';
import { rainWashFactors, washExposed } from '@/sim/pheromones';
import { TICKS_PER_SECOND } from '@/sim/time';
import { isCellExposedAt, isExposedAt } from './effectsExposure';
import { windGround } from './queries';

/** The rain class now (storm counts as its own class), or null when it is not raining. */
export function rainClassNow(sim: Sim): RainClass | 'storm' | null {
  const w = sim.state.env.weather;
  if (w.rainRateMmH < RAIN_MIN_RATE_MMH) return null;
  if (w.state === 'storm') return 'storm';
  if (w.state !== 'rain') return null;
  return w.intensityClass ?? 'shower';
}

const factors: PheroChannelFactors = { trail: 1, home: 1, alarm: 1 };

/** Half height of a pheromone cell, mm (the field's own cell size when it exposes one). */
function pheroHalfCell(sim: Sim): number {
  const cellMm = (sim.phero as { cellMm?: number }).cellMm;
  return 0.5 * (cellMm !== undefined && cellMm > 0 ? cellMm : PHERO_CELL_BU * sim.world.bu);
}

/** washExposed tests cell centres; a cell that contains the ground is tested just above it (trails on soil). */
function exposedCell(sim: Sim): (x: number, y: number, z: number) => boolean {
  const half = pheroHalfCell(sim);
  return (x, y, z) => isCellExposedAt(sim, x, y, z, half);
}

/**
 * Washes exposed pheromone cells for `dtS` seconds of the current rain and ground wind (GDD 06 §3.7). Returns the
 * number of cells changed (0 when there is neither rain nor wind worth applying).
 */
export function washStep(sim: Sim, dtS: number): number {
  const rain = rainClassNow(sim);
  const wind = WIND_GROUND_FACTOR * sim.state.env.weather.wind2m;
  if (!rain && wind <= 0) return 0;
  rainWashFactors(rain, dtS, wind, factors);
  return washExposed(sim, factors, exposedCell(sim));
}

/** Height of an ant's feet above the terrain, mm. */
function heightAboveGround(sim: Sim, ant: Ant): number {
  return ant.pos.y - sim.field.height(ant.pos.x, ant.pos.z);
}

function knockOff(ant: Ant): void {
  ant.medium = 'air';
  ant.vel = { x: ant.up.x * WX_KNOCK_PUSH_MM_S, y: ant.up.y * WX_KNOCK_PUSH_MM_S, z: ant.up.z * WX_KNOCK_PUSH_MM_S };
}

function stun(sim: Sim, ant: Ant, seconds: number): void {
  const until = sim.state.tick + Math.round(seconds * TICKS_PER_SECOND);
  ant.bb[WX_STUN_KEY] = Math.max(ant.bb[WX_STUN_KEY] ?? 0, until);
}

/** Statistics of one hits step (tests, perf). */
export interface HitStepResult {
  exposed: number;
  hits: number;
  blownOff: number;
}

/**
 * One rain-hit and wind step over every surface ant (call every WX_RAIN_HIT_EVERY ticks). A shower drop knocks an
 * ant off a vertical surface and stuns it 1.5 s; a downpour or storm drop stuns 3 s, costs 5 % of max hp and
 * knocks it off any climb. Ants high on stems are blown off in strong ground wind (§3.4).
 */
export function rainHitStep(sim: Sim): HitStepResult {
  const res: HitStepResult = { exposed: 0, hits: 0, blownOff: 0 };
  const rain = rainClassNow(sim);
  const dtS = WX_RAIN_HIT_EVERY / TICKS_PER_SECOND;
  const rate = rain ? WX_RAIN_HIT_RATE[rain] * difficultyValue(sim, 'rainHitMult') : 0;
  const pHit = rate > 0 ? 1 - Math.exp(-rate * dtS) : 0;
  const bu = sim.world.bu;
  const stemMm = WX_STEM_HEIGHT_BU * bu;
  const ants = sim.stores.ants.list;
  let rng = null as ReturnType<Sim['stream']> | null;
  for (let i = 0; i < ants.length; i++) {
    const ant = ants[i];
    if (!ant.alive || ant.medium === 'air' || ant.medium === 'water') continue;
    const high = heightAboveGround(sim, ant) >= stemMm;
    const gw = high ? windGround(sim, ant.pos) : 0;
    const pWind = gw > WX_STEM_TOPPLE_WIND_GROUND ? 1 - Math.exp(-WX_STEM_TOPPLE_RATE * (gw - WX_STEM_TOPPLE_WIND_GROUND) * dtS) : 0;
    if (pHit <= 0 && pWind <= 0) continue;
    if (!isExposedAt(sim, ant.pos.x, ant.pos.y, ant.pos.z)) continue;
    res.exposed++;
    rng ??= sim.stream('rng.events');
    if (pWind > 0 && rngChance(rng, pWind)) {
      knockOff(ant);
      res.blownOff++;
      continue;
    }
    if (pHit <= 0 || !rain || !rngChance(rng, pHit)) continue;
    res.hits++;
    sim.emit({ type: 'cue', cue: 'raindrop-hit', pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z }, strength: rain === 'shower' ? 0.5 : 1 });
    stun(sim, ant, WX_RAIN_STUN_S[rain]);
    const vertical = ant.up.y < WX_VERTICAL_UP_Y;
    if (rain === 'shower') {
      if (vertical) knockOff(ant);
      continue;
    }
    if (vertical || high) knockOff(ant);
    ant.hp -= WX_RAIN_HIT_HP[rain] * ant.maxHp * difficultyValue(sim, 'damageTakenMult');
    if (ant.hp <= 0) killAnt(sim, ant.id, 'crushed');
  }
  return res;
}
