// Garden records of a colony (GDD 07 §6.4.1): one GardenRecord per `fungus` chamber that holds a garden (the founding
// cell holds the first). Gcap = GARDEN_GU_PER_BU3 x the chamber's open volume; the founding cell is given at least
// the room of the chapter's 10 BU founding chamber (§5.4.3: "so the founding garden has room for 2 GU") because the
// shared founding template cell is smaller (9 x 3 x 9 BU, about 0.5 GU).

import { CHAMBER_LOST_CAUSE } from '@/sim/balance/species-leafcutter';
import type { Chamber, Colony, FungusModule, GardenRecord, Sim } from '@/sim/types';
import { chamberById, colonyChambers } from '@/sim/colony/census';
import type { FungusParams } from './params';

/** Living full-fidelity colonies with a fungus module, and their parameters (the systems' loop). */
export function fungusColonies(sim: Sim, getParams: (sim: Sim, col: Colony) => FungusParams | null): { col: Colony; P: FungusParams }[] {
  const out: { col: Colony; P: FungusParams }[] = [];
  for (const col of sim.state.colonies) {
    if (!col.alive || !col.fungus || col.fidelity !== 'full') continue;
    const P = getParams(sim, col);
    if (P) out.push({ col, P });
  }
  return out;
}

/** Garden of a chamber, or undefined. */
export function gardenOf(mod: FungusModule, chamberId: number): GardenRecord | undefined {
  return mod.gardens.find((g) => g.chamberId === chamberId);
}

/** Gardens that are not dead. */
export function liveGardens(mod: FungusModule): GardenRecord[] {
  return mod.gardens.filter((g) => g.state !== 'dead');
}

/** Total live garden mass, GU (Σ G). */
export function totalGarden(mod: FungusModule): number {
  let s = 0;
  for (const g of mod.gardens) if (g.state !== 'dead') s += g.biomass;
  return s;
}

/** Gcap of a chamber, GU. */
export function gcapOf(P: FungusParams, ch: Chamber | undefined): number {
  if (!ch) return 0;
  const byVolume = P.guPerBu3 * Math.max(0, ch.volume);
  if (ch.type !== 'founding') return byVolume;
  const r = P.foundChamberBu / 2;
  return Math.max(byVolume, P.guPerBu3 * (4 / 3) * Math.PI * r * r * r);
}

/** Starts a garden in a chamber (a planted pellet or a fungus piece put down): GDD 07 §6.4.2 re-seeding. */
export function seedGarden(sim: Sim, mod: FungusModule, P: FungusParams, chamberId: number, g0: number, h: number, i: number): GardenRecord {
  let g = gardenOf(mod, chamberId);
  if (!g) {
    g = { chamberId, state: 'seeded', biomass: 0, health: 1, infection: 0, substrate: 0, waste: 0 };
    mod.gardens.push(g);
  }
  // re-seeding a dead garden's chamber (its waste stays to be removed) or adding a piece to a live one
  const live = g.state !== 'dead';
  const before = live ? g.biomass : 0;
  g.biomass = before + g0;
  g.health = live && before > 0 ? (g.health * before + h * g0) / (before + g0) : h;
  g.infection = live && before > 0 ? (g.infection * before + i * g0) / (before + g0) : i;
  if (!live) {
    g.state = g.infection > 0 ? 'infected' : 'seeded';
    g.preInfectState = 'seeded';
    g.contamination = g.contamination ?? 0;
  }
  g.gcap = gcapOf(P, chamberById(sim, chamberId));
  g.createdTick ??= sim.state.tick;
  g.cache ??= [];
  g.pulp ??= [];
  g.subBins ??= [];
  g.healthLog ??= [];
  g.yieldStanding ??= 0;
  g.climBadSince ??= -1;
  return g;
}

/** Re-reads every garden's Gcap from its chamber; a garden whose chamber is gone dies (its mass is lost). */
export function syncGardens(sim: Sim, col: Colony, P: FungusParams): void {
  const mod = col.fungus!;
  const ids = new Set(colonyChambers(sim, col).map((c) => c.id));
  for (const g of mod.gardens) {
    if (!ids.has(g.chamberId)) {
      if (g.state !== 'dead') {
        // the chamber caved in or was lost: the garden dies with it (its mass is gone, not waste)
        g.state = 'dead'; g.biomass = 0; g.diedTick = sim.state.tick; g.lastCause = CHAMBER_LOST_CAUSE;
        mod.lostCause = CHAMBER_LOST_CAUSE;
        sim.emit({ type: 'garden-state', chamberId: g.chamberId, state: 'dead', cause: CHAMBER_LOST_CAUSE });
      }
      continue;
    }
    g.gcap = gcapOf(P, chamberById(sim, g.chamberId));
  }
  // a dead garden with no waste left in a chamber that is gone is dropped
  mod.gardens = mod.gardens.filter((g) => ids.has(g.chamberId) || g.waste > 1e-6);
}

/**
 * A fungus chamber can take a new garden: it has none, or only a dead one whose waste is all removed (GDD 07 §6.4.3
 * `dead`: "chamber reusable after W = 0").
 */
export function reusableForGarden(mod: FungusModule, chamberId: number): boolean {
  const g = gardenOf(mod, chamberId);
  return !g || (g.state === 'dead' && g.waste <= 1e-6);
}

/** Fungus chambers of the colony that can be seeded (re-seeding targets). */
export function emptyFungusChambers(sim: Sim, col: Colony): Chamber[] {
  const mod = col.fungus!;
  return colonyChambers(sim, col).filter((c) => c.type === 'fungus' && reusableForGarden(mod, c.id));
}
