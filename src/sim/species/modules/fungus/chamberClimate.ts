// The climate a garden reads (GDD 07 §6.4.2 fT, fRH): the chamber's temperature through the colony's climate seam
// (chamberTempC: test and debug overrides win), and its humidity from the chamber record, which the nest module
// keeps at GDD 03 §9.2's soil humidity of the chamber's depth (cheat.setChamberClimate overrides it). The colony
// seam's chamberRh reads the open air's humidity, which is not a chamber's (it swings with the weather).

import type { Sim } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';
import { chamberRh, chamberTempC } from '@/sim/colony/envAdapter';

export function gardenTempC(sim: Sim, chamberId: number): number {
  return chamberTempC(sim, chamberId);
}

export function gardenRh(sim: Sim, chamberId: number): number {
  const ch = chamberById(sim, chamberId);
  if (ch && Number.isFinite(ch.humidity) && ch.humidity > 0) return ch.humidity;
  return chamberRh(sim, chamberId, ch ? ch.center : { x: 0, y: 0, z: 0 });
}
