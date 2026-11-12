// Cooperative transport hook (GDD 02 §11): group carrying, recruiting helpers to a heavy item, alignment and
// cutting are Tier 2. In Tier 1 an ant meets only items it can carry alone or sources it tears pieces from
// (harvest-solid), so this hook just records that the ant met something too heavy; the Tier 2 transport module
// replaces it (grip 10 s, return laying trail x1.5, recruit with the item as lead).

import type { Ant, FoodSource, Sim } from '@/sim/types';
import { logDecision } from './common';

export type TransportHook = (sim: Sim, ant: Ant, s: FoodSource) => void;

let hook: TransportHook = (sim, ant, s) => logDecision(sim, ant, 'job:transport', s.id);

/** The Tier 2 transport module installs its rules here. */
export function setTransportHook(h: TransportHook): void {
  hook = h;
}

export function transportHook(sim: Sim, ant: Ant, s: FoodSource): void {
  hook(sim, ant, s);
}
