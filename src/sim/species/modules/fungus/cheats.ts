// Debug commands of the fungus module (GDD 07 App. B): setGarden, supplySubstrate, infectGarden. A chamber that holds
// no garden yet gets one (setGarden, supplySubstrate) so scripted tests can start from any state.

import type { CommandHandlerMap, GardenRecord, GardenState, Sim } from '@/sim/types';
import { GARDEN_STATES } from '@/sim/types';
import { chamberEntry } from '@/sim/colony/census';
import { fungusParams, type FungusParams } from './params';
import { gardenOf, seedGarden } from './state';

function reject(sim: Sim, type: string, detail: string): void {
  sim.emit({ type: 'command-rejected', commandType: type, reason: 'invalid-target', detail });
}

/** The fungus colony owning a chamber, its parameters and the garden (created when `create`). */
function target(sim: Sim, type: string, chamberId: number, create: boolean): { P: FungusParams; g: GardenRecord } | null {
  const e = chamberEntry(sim, chamberId);
  const col = e ? sim.stores.colonies.get(e.colony) : undefined;
  const P = col ? fungusParams(sim.getSpecies(col.species)) : null;
  if (!e || !col?.fungus || !P) { reject(sim, type, `no fungus colony owns chamber ${chamberId}`); return null; }
  let g = gardenOf(col.fungus, chamberId);
  if (!g && create) g = seedGarden(sim, col.fungus, P, chamberId, 1, 1, 0);
  if (!g) { reject(sim, type, `no garden in chamber ${chamberId}`); return null; }
  return { P, g };
}

const fin = (v: unknown, lo: number, hi: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : null;

export const fungusCheats: Partial<CommandHandlerMap> = {
  'cheat.setGarden': (sim, c) => {
    const t = target(sim, c.type, c.chamberId, true);
    if (!t) return;
    const { g, P } = t;
    const v = c.values ?? {};
    const G = fin(v.G, 0, 1e4), h = fin(v.h, 0, 1), i = fin(v.i, 0, 1), cc = fin(v.c, 0, 1), W = fin(v.W, 0, 1e4);
    if (G !== null) g.biomass = G;
    if (h !== null) g.health = h;
    if (i !== null) g.infection = i;
    if (cc !== null) g.contamination = cc;
    if (W !== null) g.waste = W;
    // a state index (GARDEN_STATES order) may be given; else the state follows the numbers
    const s = fin(v.state, 0, GARDEN_STATES.length - 1);
    if (s !== null) g.state = GARDEN_STATES[Math.round(s)] as GardenState;
    else if (g.biomass <= 0) g.state = 'dead';
    else if (g.state === 'dead') g.state = 'seeded';
    if (g.infection > 0 && g.state !== 'dead' && g.state !== 'infected') { g.preInfectState = g.state; g.state = 'infected'; }
    if (g.state === 'dead') { g.waste += g.biomass; g.biomass = 0; g.diedTick = sim.state.tick; }
    void P;
  },
  'cheat.supplySubstrate': (sim, c) => {
    const t = target(sim, c.type, c.chamberId, true);
    if (!t) return;
    const lu = fin(c.luPerGd, 0, 1e4);
    if (lu === null) { reject(sim, c.type, 'luPerGd'); return; }
    t.g.supply = lu > 0 ? { luPerGd: lu, q: fin(c.q, 0, 1) ?? 1, p: fin(c.p, 0, 1) ?? 0.1, t: fin(c.t, 0, 1) ?? 0, plantId: Number.isFinite(c.plantId) ? c.plantId : -1 } : null;
  },
  'cheat.infectGarden': (sim, c) => {
    const t = target(sim, c.type, c.chamberId, false);
    if (!t) return;
    const i = fin(c.i, 0, 1);
    if (i === null) { reject(sim, c.type, 'i'); return; }
    if (t.g.state === 'dead') { reject(sim, c.type, 'the garden is dead'); return; }
    t.g.infection = i;
    if (i > 0 && t.g.state !== 'infected') { t.g.preInfectState = t.g.state; t.g.state = 'infected'; }
  },
};
