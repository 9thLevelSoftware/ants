// Soak invariants of the wood-nesting module: wood moisture and decay in range and finite, sites refer to living
// nests, CP brood is destined to a CP caste.

import type { SimInvariant } from '@/sim/types';
import { MC_MAX_PCT, MC_MIN_PCT } from '@/sim/balance/species-carpenter';
import { colonyWoodParams } from './params';

export const woodInvariants: readonly SimInvariant[] = [
  {
    name: 'wood-state-range',
    check(sim, fail) {
      for (const w of sim.state.worldDelta.wood) {
        for (const s of w.segments ?? []) {
          if (!Number.isFinite(s.mc) || s.mc < MC_MIN_PCT - 1e-6 || s.mc > MC_MAX_PCT + 1e-6) fail(`wood ${w.primId} mc ${s.mc}`);
          if (!Number.isInteger(s.decay) || s.decay < 0 || s.decay > 4) fail(`wood ${w.primId} decay ${s.decay}`);
        }
        const f = w.carvedFrac ?? 0;
        if (!Number.isFinite(f) || f < 0 || f > 1) fail(`wood ${w.primId} carvedFrac ${f}`);
      }
    },
  },
  {
    name: 'wood-sites-live',
    check(sim, fail) {
      for (const col of sim.state.colonies) {
        if (!col.alive || !col.wood) continue;
        for (const s of col.wood.sites) {
          if (s.state !== 'abandoned' && s.nestId >= 0 && !sim.stores.nests.get(s.nestId)) fail(`colony ${col.id} site ${s.id} nest ${s.nestId} gone`);
        }
        if (!Number.isFinite(col.wood.frassVisibility) || col.wood.frassVisibility < 0) fail(`colony ${col.id} frassVisibility ${col.wood.frassVisibility}`);
      }
    },
  },
  {
    name: 'wood-brood-caste',
    check(sim, fail) {
      for (const b of sim.state.brood) {
        if (!b.alive || b.stage === 'egg') continue;
        const col = sim.stores.colonies.get(b.colony);
        if (!col || col.fidelity !== 'full' || !colonyWoodParams(sim, col)) continue;
        if (b.destined === 'worker') fail(`brood ${b.id} of wood colony ${col.id} still destined worker as a ${b.stage}`);
      }
    },
  },
];
