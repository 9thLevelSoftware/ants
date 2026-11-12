// Ant thermal response (GDD 06 §2.6-2.7): speed multiplier curve, forage gate, light preference, surface activity,
// body temperature relaxation and the heat / cold dose. Pure functions over species thermal data and plain numbers.

import type { ColonySpeciesId, DayPhase, Season, Sim, ThermalDef, ThermalState } from '@/sim/types';
import {
  COLD_DOSE_K, COLD_RECOVERY_S, HEAT_DOSE_K, HEAT_RECOVERY_S, HEAT_STUPOR_LOAD, HEAT_STUPOR_OVER_C, HEAT_STUPOR_RECOVER_LOAD,
  RAIN_ACTIVITY, SPEED_CURVE_C, SPEED_CURVE_MULT, STUPOR_SPEED_MULT, TB_TAU_S, WEATHER_ACTIVITY,
} from '@/sim/balance';
import { calendarNow } from './calendar';
import { airTemp } from './temperature';

/** The thermal profile of a species (rival species without one use the player species'). */
export function thermalDefOf(sim: Sim, species: ColonySpeciesId): ThermalDef {
  return sim.getSpecies(species)?.thermal ?? sim.species.thermal;
}

/** Lasius speed curve at a body temperature: piecewise linear on the table, 0 below 5 C and above 40 C. */
export function speedCurve(tb: number): number {
  const n = SPEED_CURVE_C.length;
  if (tb <= SPEED_CURVE_C[0] || tb >= SPEED_CURVE_C[n - 1]) return 0;
  for (let i = 1; i < n; i++) {
    if (tb <= SPEED_CURVE_C[i]) {
      const t = (tb - SPEED_CURVE_C[i - 1]) / (SPEED_CURVE_C[i] - SPEED_CURVE_C[i - 1]);
      return SPEED_CURVE_MULT[i - 1] + (SPEED_CURVE_MULT[i] - SPEED_CURVE_MULT[i - 1]) * t;
    }
  }
  return 0;
}

/** Speed multiplier at body temperature `tb` for a thermal profile: the curve shifted by `thermalShiftC`. */
export function speedMultFor(def: ThermalDef, tb: number): number {
  return speedCurve(tb - def.thermalShiftC);
}

/** Speed multiplier from body temperature for a species (GDD 06 §2.6, = GDD 01 `tempFactor`). */
export function speedMult(sim: Sim, tb: number, species: ColonySpeciesId): number {
  return speedMultFor(thermalDefOf(sim, species), tb);
}

/** Forage gate trapezoid: 0 at or below a, 1 on b..c, 0 at or above d. */
export function forageGateFor(def: ThermalDef, tair: number): number {
  const g = def.forageGate;
  if (tair <= g.a || tair >= g.d) return 0;
  if (tair < g.b) return (tair - g.a) / (g.b - g.a);
  if (tair <= g.c) return 1;
  return (g.d - tair) / (g.d - g.c);
}

/** Forage gate of a species at an air temperature (default: now). */
export function forageGate(sim: Sim, species: ColonySpeciesId, tair?: number): number {
  return forageGateFor(thermalDefOf(sim, species), tair ?? airTemp(sim));
}

/** Willingness to leave the nest in a day phase, with the species' seasonal overrides (GDD 06 §1.5). */
export function lightPrefFor(def: ThermalDef, phase: DayPhase, season: Season): number {
  return def.lightPrefSeason[season]?.[phase] ?? def.lightPref[phase];
}

/** Surface activity weight of the current weather (`fW`, GDD 06 §3.1). */
export function weatherActivity(sim: Sim): number {
  const w = sim.state.env.weather;
  if (w.state === 'rain') return RAIN_ACTIVITY[w.intensityClass ?? 'shower'];
  return WEATHER_ACTIVITY[w.state];
}

/**
 * Willingness of the species to be active on the surface now, 0..1: forage gate x light preference x weather x
 * (1 - heatStress). `heatStress` is the share of the colony's trail cells at or above `shadeSeekC`; the foraging
 * module supplies it (the environment does not know the trails).
 */
export function surfaceActivity(sim: Sim, species: ColonySpeciesId, heatStress = 0): number {
  const def = thermalDefOf(sim, species);
  const cal = calendarNow(sim);
  return forageGateFor(def, airTemp(sim)) * lightPrefFor(def, cal.phase, cal.season) * weatherActivity(sim) * (1 - heatStress);
}

/** The thermal fields of an ant that the dose model reads and writes. */
export interface ThermalBody {
  tb: number;
  heatLoad: number;
  coldLoad: number;
  thermalState: ThermalState;
}

/** Body temperature relaxes toward the micro temperature with tau 6 game seconds (exact for any step length). */
export function relaxBodyTemp(tb: number, tmicro: number, dtS: number): number {
  return tb + (tmicro - tb) * (1 - Math.exp(-dtS / TB_TAU_S));
}

export type ThermalOutcome = 'ok' | 'heat-death' | 'cold-death';

/**
 * Applies heat and cold dose for `dtS` game seconds at the body's current `tb` (GDD 06 §2.7) and updates the
 * thermal state: stupor at heatLoad >= 0.5 or Tb >= stressC + 5 (recovers below 0.3), chill coma below chillC.
 * Returns whether the dose was lethal. `stressC` includes difficulty offset and acclimation.
 */
export function applyThermalDose(b: ThermalBody, def: ThermalDef, stressC: number, dtS: number): ThermalOutcome {
  if (b.tb > stressC) b.heatLoad += ((b.tb - stressC) / HEAT_DOSE_K) * dtS;
  else b.heatLoad = Math.max(0, b.heatLoad - dtS / HEAT_RECOVERY_S);
  if (b.tb < def.freezeC) b.coldLoad += ((def.freezeC - b.tb) / COLD_DOSE_K) * dtS;
  else b.coldLoad = Math.max(0, b.coldLoad - dtS / COLD_RECOVERY_S);
  if (b.heatLoad >= 1) return 'heat-death';
  if (b.coldLoad >= 1) return 'cold-death';
  const overheated = b.heatLoad >= HEAT_STUPOR_LOAD || b.tb >= stressC + HEAT_STUPOR_OVER_C;
  if (overheated) b.thermalState = 'heat-stupor';
  else if (b.thermalState === 'heat-stupor' && b.heatLoad < HEAT_STUPOR_RECOVER_LOAD) b.thermalState = 'normal';
  if (b.thermalState !== 'heat-stupor') b.thermalState = b.tb < def.chillC ? 'cold-coma' : 'normal';
  return 'ok';
}

/** Speed multiplier of an ant from its thermal state: chill coma 0, heat stupor x0.2, else the species curve. */
export function bodySpeedMult(def: ThermalDef, b: ThermalBody): number {
  if (b.thermalState === 'cold-coma') return 0;
  const m = speedMultFor(def, b.tb);
  return b.thermalState === 'heat-stupor' ? m * STUPOR_SPEED_MULT : m;
}
