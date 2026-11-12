// Pure environment queries other modules call: rain, wind, forecast hints. Allocation-free; positions are optional
// (the sky is global; a point only matters indoors or underground, where weather does not reach).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { RAIN_INTENSITY, RAIN_INTENSITY_STORM, RAIN_MIN_RATE_MMH, UNDERGROUND_MM, WIND_GROUND_FACTOR } from '@/sim/balance';
import { isInteriorAt } from './ground';

function sheltered(sim: Sim, p: Vec3 | undefined): boolean {
  if (!p) return false;
  return isInteriorAt(sim.world, p.x, p.z);
}

/** Whether it is raining (at p when given: not indoors). Sprinklers are added by the human-events module. */
export function isRaining(sim: Sim, p?: Vec3): boolean {
  return rainRate(sim, p) >= RAIN_MIN_RATE_MMH;
}

/** Rain rate at p, mm/h (indoors 0). */
export function rainRate(sim: Sim, p?: Vec3): number {
  if (sheltered(sim, p)) return 0;
  return sim.state.env.weather.rainRateMmH;
}

/** Entrance inflow factor `I` (GDD 06 §2.9, GDD 03 §11) by rain class: drizzle 0.1, shower 0.4, downpour 0.7, storm 1.0. */
export function rainIntensityAt(sim: Sim, p?: Vec3): number {
  const w = sim.state.env.weather;
  if (sheltered(sim, p) || w.rainRateMmH < RAIN_MIN_RATE_MMH) return 0;
  if (w.state === 'storm') return RAIN_INTENSITY_STORM;
  return RAIN_INTENSITY[w.intensityClass ?? 'shower'];
}

/** Wind speed at 2 m, m/s (gusts included); 0 indoors and underground. */
export function windAt(sim: Sim, p?: Vec3): number {
  if (p) {
    if (isInteriorAt(sim.world, p.x, p.z)) return 0;
    if (sim.field.height(p.x, p.z) - p.y > UNDERGROUND_MM) return 0;
  }
  return sim.state.env.weather.wind2m;
}

/** Ground-level wind, m/s: 0.2 of the 2 m wind (GDD 06 §3.4). */
export function windGround(sim: Sim, p?: Vec3): number {
  return WIND_GROUND_FACTOR * windAt(sim, p);
}

/** Unit wind direction (the way the wind blows, in the XZ plane) into out; returns out. */
export function windDirection(sim: Sim, out: Vec3): Vec3 {
  const d = sim.state.env.weather.windDir;
  out.x = d.x;
  out.y = 0;
  out.z = d.z;
  return out;
}
