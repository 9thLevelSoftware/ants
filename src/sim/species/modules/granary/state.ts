// Granary records of a colony (GDD 07 §6.3.3): one GranaryState per chamber that stores seed. Before the colony has
// a chamber of type `granary`, seeds stay in the chamber they were put down in (a proto-granary); once a granary
// exists, new seeds go there. Capacity is loadsPerBu3 x the chamber's open volume.

import type { Chamber, Colony, GranaryModule, GranaryState, Sim } from '@/sim/types';
import { chamberById, colonyChambers } from '@/sim/colony/census';
import { chamberRh, chamberTempC } from '@/sim/colony/envAdapter';
import type { GranaryParams } from './params';
import { addSeeds, totalsOf } from './cohorts';

/** The colony's granary module block (null when the colony has none). */
export function moduleOf(col: Colony | undefined): GranaryModule | null {
  return col?.granary ?? null;
}

/** Granary of a chamber, or undefined. */
export function granaryOf(mod: GranaryModule, chamberId: number): GranaryState | undefined {
  return mod.granaries.find((g) => g.chamberId === chamberId);
}

/** Seed loads stored in a granary. */
export function stockOf(gr: GranaryState): number {
  let n = 0;
  for (const c of gr.cohorts) n += c.loads;
  return n;
}

/** Seed loads stored over all granaries of the colony. */
export function colonyStock(mod: GranaryModule): number {
  let n = 0;
  for (const g of mod.granaries) n += stockOf(g);
  return n;
}

export function capacityOf(g: GranaryParams, ch: Chamber | undefined): number {
  return ch ? Math.max(0, g.loadsPerBu3 * ch.volume) : 0;
}

/** Humidity 0..1 and temperature °C of a granary's chamber now. */
export function climateOf(sim: Sim, chamberId: number): { rh: number; tempC: number } {
  const ch = chamberById(sim, chamberId);
  return { rh: chamberRh(sim, chamberId, ch ? ch.center : { x: 0, y: 0, z: 0 }), tempC: chamberTempC(sim, chamberId) };
}

/** The granary record of a chamber, created when missing (capacity and climate filled in). */
export function ensureGranary(sim: Sim, mod: GranaryModule, g: GranaryParams, chamberId: number): GranaryState {
  let gr = granaryOf(mod, chamberId);
  if (!gr) {
    gr = { chamberId, cohorts: [], capacityLoads: 0, humidity: 0, tempC: 0 };
    mod.granaries.push(gr);
  }
  refreshGranary(sim, gr, g);
  return gr;
}

/** Re-reads a granary's capacity and climate. */
export function refreshGranary(sim: Sim, gr: GranaryState, g: GranaryParams): void {
  gr.capacityLoads = capacityOf(g, chamberById(sim, gr.chamberId));
  const cl = climateOf(sim, gr.chamberId);
  gr.humidity = cl.rh;
  gr.tempC = cl.tempC;
}

/** Chambers of type `granary` of the colony. */
export function granaryChambers(sim: Sim, col: Colony): Chamber[] {
  return colonyChambers(sim, col).filter((ch) => ch.type === 'granary');
}

/** Free seed room of a granary, loads. */
export function freeOf(gr: GranaryState): number {
  return Math.max(0, (gr.capacityLoads ?? 0) - stockOf(gr));
}

/**
 * Where seeds put down in chamber `atChamberId` are stored: the colony's granary with the most free room among
 * those whose humidity is lowest (GDD 07 §6.3.2, humidity binned to 0.1); with no granary chamber yet, the chamber
 * itself (proto-granary). Null when nothing has room.
 */
export function storeTarget(sim: Sim, col: Colony, mod: GranaryModule, g: GranaryParams, atChamberId: number): GranaryState | null {
  const grans = granaryChambers(sim, col);
  if (grans.length === 0) {
    if (atChamberId < 0 || !chamberById(sim, atChamberId)) return null;
    const gr = ensureGranary(sim, mod, g, atChamberId);
    return freeOf(gr) > 0 ? gr : null;
  }
  let best: GranaryState | null = null, bestKey = Infinity;
  for (const ch of grans) {
    const gr = ensureGranary(sim, mod, g, ch.id);
    const free = freeOf(gr);
    if (free <= 0) continue;
    const key = Math.round((gr.humidity ?? 0) * 10) * 1e6 - free;
    if (key < bestKey || (key === bestKey && best && ch.id < best.chamberId)) { best = gr; bestKey = key; }
  }
  return best;
}

/**
 * Drops records of chambers that no longer exist; their seeds move to another granary of the colony when one has
 * room, else they are lost (returned as rotten loads).
 */
export function syncGranaries(sim: Sim, mod: GranaryModule, g: GranaryParams): number {
  let lost = 0;
  const gone = mod.granaries.filter((gr) => !chamberById(sim, gr.chamberId));
  if (gone.length === 0) return 0;
  mod.granaries = mod.granaries.filter((gr) => chamberById(sim, gr.chamberId));
  for (const gr of gone) {
    for (const c of gr.cohorts) {
      const to = mod.granaries.find((x) => freeOf(x) >= c.loads);
      if (to) addSeeds(to, g, c.seedClass, c.hardness, c.loads, c.u, c.g, !!c.degermed);
      else lost += c.loads;
    }
  }
  return lost;
}

/** Colony-wide totals by cohort state, loads. */
export function colonyTotals(mod: GranaryModule): ReturnType<typeof totalsOf> {
  const t = { loads: 0, stored: 0, damp: 0, germinating: 0, sprouted: 0, rotting: 0 };
  for (const gr of mod.granaries) {
    const x = totalsOf(gr);
    t.loads += x.loads; t.stored += x.stored; t.damp += x.damp; t.germinating += x.germinating;
    t.sprouted += x.sprouted; t.rotting += x.rotting;
  }
  return t;
}
