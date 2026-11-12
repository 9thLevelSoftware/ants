// The colony module's window on the environment (temperatures, humidity, surface activity, calendar).
// Everything goes through here so tests can install a climate fake per sim (runtime only, never persisted).

import type { Vec3 } from '@/core/math/vec3';
import type { Brood, ColonySpeciesId, Sim } from '@/sim/types';
import { chamberTemp, relHumidity, surfaceActivity, surfaceTemp } from '@/sim/environment';
import { currentDefaultYearDay } from '@/sim/time';
import { chamberById } from './census';

/** Test fake: any function given replaces the environment query of the same meaning. */
export interface ClimateOverride {
  chamberTemp?: (chamberId: number) => number;
  /** Temperature at a point outside chambers (Tmicro), °C. */
  pointTemp?: (p: Vec3) => number;
  /** Relative humidity 0..1 of a chamber (-1 = outside). */
  rh?: (chamberId: number) => number;
  surfaceActivity?: () => number;
  /** Default-year fractional day d28 (0-based). */
  d28?: () => number;
}

const overrides = new WeakMap<Sim, ClimateOverride>();

/** Installs (or with null removes) a climate fake for this sim. Tests only. */
export function setClimateOverride(sim: Sim, o: ClimateOverride | null): void {
  if (o) overrides.set(sim, o);
  else overrides.delete(sim);
}

export function chamberTempC(sim: Sim, chamberId: number): number {
  const o = overrides.get(sim);
  if (o?.chamberTemp) return o.chamberTemp(chamberId);
  return chamberTemp(sim, chamberId);
}

export function pointTempC(sim: Sim, p: Vec3): number {
  const o = overrides.get(sim);
  if (o?.pointTemp) return o.pointTemp(p);
  return surfaceTemp(sim, p);
}

/** Chamber relative humidity 0..1 (chamber -1: at the point). */
export function chamberRh(sim: Sim, chamberId: number, p: Vec3): number {
  const o = overrides.get(sim);
  if (o?.rh) return o.rh(chamberId);
  const ch = chamberId >= 0 ? chamberById(sim, chamberId) : undefined;
  return relHumidity(sim, ch ? ch.center : p);
}

/** Temperature a brood item experiences: its chamber, its carrier's chamber, or the micro temperature at it. */
export function broodTempC(sim: Sim, b: Brood): number {
  let chamberId = b.chamberId;
  let pos = b.pos;
  if (b.carriedBy !== -1) {
    const carrier = sim.stores.ants.get(b.carriedBy);
    if (carrier) { chamberId = carrier.chamberId; pos = carrier.pos; }
  }
  return chamberId >= 0 ? chamberTempC(sim, chamberId) : pointTempC(sim, pos);
}

export function surfaceActivityOf(sim: Sim, species: ColonySpeciesId): number {
  const o = overrides.get(sim);
  if (o?.surfaceActivity) return o.surfaceActivity();
  return surfaceActivity(sim, species);
}

/** Default-year fractional day of year d28 (0-based; GDD 00-index C1). */
export function d28Now(sim: Sim): number {
  const o = overrides.get(sim);
  if (o?.d28) return o.d28();
  return currentDefaultYearDay(sim.state);
}

export function isStorm(sim: Sim): boolean {
  return sim.state.env.weather.state === 'storm';
}
