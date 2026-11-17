// The fungus-garden action primitives (GDD 01 §7 shells, GDD 07 §6.4.6, GDD 06 §5.15). The possessed ant and the AI
// go through the same definitions. Registered into the primitive catalogue at load (ACTION_DEFS has no definition
// for these ids; the catalogue refuses ids without one).
//   cut-leaf      timed at a leaf site: 15 s at 25 °C (x 3 at 15 °C, x 1.7 at 20, x 0.9 at 30) makes a fragment of
//                 time/15 x carryCap LU into the mandibles; the cutter drinks sapPerCut C of sap into her crop.
//   process-leaf  timed in a fungus chamber with fragments waiting: processSPerLu per LU, fragments into pulp.
//   tend-fungus   timed in a garden chamber, by mode (ant.bb at.tm, else chosen): tend / weed (presence), plant pulp
//                 (plantSPerPulp per LU of pulp into the garden), collect staphylae (staphylaeS -> staphylaeFl FL into
//                 the colony's harvested stock), take garden waste (a garden-waste item, 1 load per trip).
//   plant         founding only: the queen plants the fungus pellet in her cell (hold 4 s).

import type { ActionFailReason, Ant, Colony, GardenRecord, Sim } from '@/sim/types';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import type { ActionDef } from '@/sim/ants/actions/types';
import { takeItem } from '@/sim/ants/actions/carry';
import { workRate } from '@/sim/ants/actions/workRate';
import { ACTION_MIN_TICKS, WORK_RATE_MIN } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { spawnItem } from '@/sim/entities';
import { perTick } from '@/sim/ants/behaviours/nest/perTick';
import {
  FRAGMENT_LENGTH_BU, MINIM_PROCESS_MULT, PLANT_BATCH_LU, PROCESS_BATCH_LU, WASTE_ITEM_LOADS, CUT_AI_S, FALLBACK_ACTION_S,
} from '@/sim/balance/species-leafcutter';
import { plantPellet, plantRefusal } from '@/sim/colony/founding/species/atta';
import { fungusParams, type FungusParams } from './params';
import { gardenOf } from './state';
import { lotsLu, takeLots } from './cache';
import { plantSubstrate } from './substrate';
import { leafSiteNear } from './leaves';
import { chainAdd } from './chain';
import { AK, cutsLeaves } from './work';
import { becomeRefuse, mayHaulGardenWaste } from './refuse';

/** tend-fungus modes (ant.bb at.tm). */
export const TM = { auto: 0, tend: 1, weed: 2, plant: 3, harvest: 4, waste: 5 } as const;
export const TEND_MODE = 'at.tm';
/** bb keys of a carried fragment's traits (the cutter carries it home herself). */
export const LEAF = { q: 'at.lq', p: 'at.lp', t: 'at.lt', plant: 'at.lpl', lu: 'at.llu' } as const;

function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

function paramsOf(sim: Sim, ant: Ant): FungusParams | null {
  const col = colonyOf(sim, ant);
  return col?.fungus ? fungusParams(sim.getSpecies(col.species)) : null;
}

/** The garden of the chamber the ant stands in, or undefined. */
export function gardenHere(sim: Sim, ant: Ant): GardenRecord | undefined {
  const col = colonyOf(sim, ant);
  if (!col?.fungus || ant.chamberId < 0) return undefined;
  return gardenOf(col.fungus, ant.chamberId);
}

/** Cut time multiplier by temperature (GDD 07 §6.4.6): x 3 at 15 °C, x 1.7 at 20, x 1 at 25, x 0.9 at 30. */
export function cutTempMult(P: FungusParams, tempC: number): number {
  const pts: [number, number][] = [[15, P.cutMult15C], [20, P.cutMult20C], [25, 1], [30, P.cutMult30C]];
  if (!Number.isFinite(tempC) || tempC <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (tempC <= pts[i][0]) {
      const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
      return y0 + ((tempC - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pts[pts.length - 1][1];
}

/** The colony has no worker of a cutting caste (the first-brood deviation lets minims cut then). */
export function noCutters(sim: Sim, col: Colony): boolean {
  return perTick(sim, `at.noCut:${col.id}`, () => {
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && cutsLeaves(a)) return false;
    return true;
  });
}

/**
 * No media works the gardens (none alive, or all of them cutting): the first-brood deviation lets minims process the
 * cache and haul waste then, else the fragments the cutters bring spoil in the cache.
 */
export function noProcessors(sim: Sim, col: Colony): boolean {
  return perTick(sim, `at.noProc:${col.id}`, () => {
    for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'media' && a.task === 'garden') return false;
    return true;
  });
}

/** Leaf a cut of `seconds` gives this ant (GDD 07: time/15 x carryCap, media 1 LU at 15 s). */
export function fragmentLu(P: FungusParams, ant: Ant, seconds: number): number {
  return (seconds / P.cutBaseS) * ant.carryCap;
}

function cutSeconds(P: FungusParams, ant: Ant): number {
  const want = ant.bb[AK.cutS] > 0 ? ant.bb[AK.cutS] : CUT_AI_S;
  return Math.max(P.cutMinS, want);
}

export const cutLeafDef: ActionDef = {
  id: 'cut-leaf', kind: 'timed', targets: ['none'], cancellable: true, pose: 'cut', cue: 'leaf-cut',
  // minims are not given cut-leaf by the species data; the first brood may cut while the colony has no media
  who: (sim, ant) => {
    const col = colonyOf(sim, ant);
    return ant.caste === 'minor' && !!col?.fungus && noCutters(sim, col);
  },
  check(sim, ant): ActionFailReason | null {
    const col = colonyOf(sim, ant);
    if (!col?.fungus || !paramsOf(sim, ant)) return 'species';
    if (ant.carry.kind !== 'none') return 'hands-full';
    if (ant.nestId >= 0) return 'not-allowed-here';
    // a rejected plant is refused by the AI's site choice (behaviourCut.ts); a possessed cutter may still cut it
    return leafSiteNear(sim, col, ant.pos, 3) ? null : 'no-target';
  },
  durationS(sim, ant) {
    const P = paramsOf(sim, ant);
    if (!P) return CUT_AI_S;
    // the GDD's temperature multipliers stand in for the work rate's (the runner divides by the work rate)
    return cutSeconds(P, ant) * cutTempMult(P, ant.tb) * Math.max(0.05, workRate(sim, ant));
  },
  effect(sim, ant) {
    const col = colonyOf(sim, ant);
    const P = paramsOf(sim, ant);
    if (!col?.fungus || !P) return 'species';
    const near = leafSiteNear(sim, col, ant.pos, 3);
    if (!near) return 'no-target';
    const lu = Math.min(near.site.lu, fragmentLu(P, ant, cutSeconds(P, ant)));
    if (!(lu > 1e-6)) return 'no-target';
    near.site.lu -= lu;
    const bu = sim.world.bu;
    const it = spawnItem(sim, {
      kind: 'leaf-fragment', pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z },
      init: { bulk: lu, massMg: lu * 5, lengthMm: FRAGMENT_LENGTH_BU * Math.sqrt(lu) * bu, foodKind: 'leaf', colony: col.id },
    });
    takeItem(ant, it);
    ant.bb[LEAF.q] = near.site.q; ant.bb[LEAF.p] = near.site.p; ant.bb[LEAF.t] = near.site.t;
    ant.bb[LEAF.plant] = near.site.plantId; ant.bb[LEAF.lu] = lu;
    // sap at the cut (GDD 07 §5.4.5): the cutter drinks into her crop
    const sap = sim.getSpecies(col.species)?.diet.sapPerCut ?? P.cutSapC;
    ant.cropC = Math.min(ant.cropCap, ant.cropC + sap);
    chainAdd(sim, col, 'cut', lu);
    return lu;
  },
};

export const processLeafDef: ActionDef = {
  id: 'process-leaf', kind: 'timed', targets: ['none'], cancellable: true, pose: 'tend-fungus', cue: 'garden-tend',
  // first-brood deviation: minims process (at MINIM_PROCESS_MULT x the time) while no media works the gardens
  who: (sim, ant) => {
    const col = colonyOf(sim, ant);
    return ant.caste === 'minor' && !!col?.fungus && noProcessors(sim, col);
  },
  check(sim, ant) {
    if (!paramsOf(sim, ant)) return 'species';
    const g = gardenHere(sim, ant);
    if (!g) return 'not-allowed-here';
    return lotsLu(g.cache) > 1e-6 ? null : 'no-target';
  },
  durationS(sim, ant) {
    const P = paramsOf(sim, ant);
    const g = gardenHere(sim, ant);
    const lu = Math.min(PROCESS_BATCH_LU, lotsLu(g?.cache));
    return (P?.processSPerLu ?? FALLBACK_ACTION_S) * Math.max(0.05, lu) * (ant.caste === 'minor' ? MINIM_PROCESS_MULT : 1);
  },
  effect(sim, ant) {
    const P = paramsOf(sim, ant);
    const g = gardenHere(sim, ant);
    const col = colonyOf(sim, ant);
    if (!P || !g || !col) return 'no-target';
    const lot = takeLots(P, g.cache ?? [], PROCESS_BATCH_LU, sim.state.tick, true);
    if (!lot) return 'no-target';
    (g.pulp ??= []).push(lot);
    chainAdd(sim, col, 'processed', lot.lu);
    return lot.lu;
  },
};

/** The tend-fungus mode for this ant now: the AI's asked mode, else (possessed) harvest when there is yield. */
function modeOf(sim: Sim, ant: Ant, g: GardenRecord | undefined, secondary: boolean): number {
  // the secondary variant is always an explicit request (interact hold): it wins over a mode the AI left behind
  if (secondary) return lotsLu(g?.pulp) > 1e-6 ? TM.plant : TM.waste;
  const m = ant.bb[TEND_MODE] ?? 0;
  if (m > 0) return m;
  if (g && g.infection > 0) return TM.weed;
  return (g?.yieldStanding ?? 0) > 1e-6 ? TM.harvest : TM.tend;
}

/** Taking garden waste out: small media, media or a refuse worker, empty mandibles, waste waiting (GDD 07 §6.4.6). */
function wasteCheck(ant: Ant, g: GardenRecord): ActionFailReason | null {
  if (!mayHaulGardenWaste(ant)) return 'caste';
  if (ant.carry.kind !== 'none') return 'hands-full';
  return g.waste > 1e-6 ? null : 'no-target';
}

/** Base seconds of one tend-fungus cycle in the mode this ant would take (plant pulp 5 s per LU, harvest 3 s, else 6 s). */
function tendSeconds(sim: Sim, ant: Ant, secondary: boolean): number {
  const P = paramsOf(sim, ant);
  const g = gardenHere(sim, ant);
  if (!P) return FALLBACK_ACTION_S;
  switch (modeOf(sim, ant, g, secondary)) {
    case TM.plant: return P.plantSPerPulp * Math.max(0.05, Math.min(PLANT_BATCH_LU, lotsLu(g?.pulp)));
    case TM.harvest: return P.staphylaeS;
    default: return P.tendCycleS;
  }
}

export const tendFungusDef: ActionDef = {
  id: 'tend-fungus', kind: 'timed', targets: ['none'], cancellable: true, pose: 'tend-fungus', cue: 'garden-tend',
  check(sim, ant, _t, secondary) {
    if (!paramsOf(sim, ant)) return 'species';
    const g = gardenHere(sim, ant);
    if (!g || g.state === 'dead') {
      // a dead garden's waste can still be taken out
      if (g && g.state === 'dead' && modeOf(sim, ant, g, secondary === true) === TM.waste) return wasteCheck(ant, g);
      return 'not-allowed-here';
    }
    const m = modeOf(sim, ant, g, secondary === true);
    if (m === TM.plant && lotsLu(g.pulp) <= 1e-6) return 'no-target';
    if (m === TM.waste) return wasteCheck(ant, g);
    return null;
  },
  durationS(sim, ant, _t) {
    // the runner asks before ant.action exists, so without the variant; onBegin re-times a secondary request
    return tendSeconds(sim, ant, false);
  },
  onBegin(sim, ant) {
    const a = ant.action;
    if (!a || !a.secondary) return;
    const ticks = (tendSeconds(sim, ant, true) * TICKS_PER_SECOND) / Math.max(WORK_RATE_MIN, workRate(sim, ant));
    a.durationTicks = Math.max(ACTION_MIN_TICKS, Math.ceil(ticks - 1e-9));
  },
  effect(sim, ant) {
    const P = paramsOf(sim, ant);
    const g = gardenHere(sim, ant);
    const col = colonyOf(sim, ant);
    if (!P || !g || !col?.fungus) return 'no-target';
    const m = modeOf(sim, ant, g, ant.action?.secondary === true);
    if (m === TM.plant) {
      const lot = takeLots(P, g.pulp ?? [], PLANT_BATCH_LU, sim.state.tick, false);
      if (!lot) return 'no-target';
      plantSubstrate(P, g, lot, lot.lu, sim.state.tick);
      chainAdd(sim, col, 'planted', lot.lu);
      return lot.lu;
    }
    if (m === TM.harvest) {
      const x = Math.min(P.staphylaeFl, g.yieldStanding ?? 0);
      g.yieldStanding = (g.yieldStanding ?? 0) - x;
      col.fungus.staphylae = (col.fungus.staphylae ?? 0) + x;
      chainAdd(sim, col, 'harvested', x);
      return x;
    }
    if (m === TM.waste) {
      const loads = Math.min(g.waste, WASTE_ITEM_LOADS * Math.max(0.2, ant.carryCap));
      if (!(loads > 1e-6) || ant.carry.kind !== 'none') return 'no-target';
      g.waste -= loads;
      becomeRefuse(sim, ant, P); // GDD 07 §6.4.4: whoever hauls garden waste is a refuse worker from now on
      const it = spawnItem(sim, {
        kind: 'garden-waste', pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z },
        init: { bulk: Math.min(ant.carryCap, loads), colony: col.id, volume: loads, wasteKind: null, nestId: ant.nestId },
      });
      takeItem(ant, it);
      chainAdd(sim, col, 'wasteOut', loads);
      return loads;
    }
    return 1; // tend / weed: the presence is what counts (ftend, weed coverage)
  },
};

export const plantDef: ActionDef = {
  id: 'plant', kind: 'timed', targets: ['none'], cancellable: true, pose: 'place', cue: 'garden-tend',
  check(sim, ant) {
    return plantRefusal(sim, ant);
  },
  durationS(sim, ant) {
    return paramsOf(sim, ant)?.plantHoldS ?? FALLBACK_ACTION_S;
  },
  effect(sim) {
    return plantPellet(sim) ? 1 : 'no-target';
  },
};

/** Puts the definitions into the primitive catalogue (idempotent). */
export function registerFungusActions(): void {
  ACTION_DEFS['cut-leaf'] = cutLeafDef;
  ACTION_DEFS['process-leaf'] = processLeafDef;
  ACTION_DEFS['tend-fungus'] = tendFungusDef;
  ACTION_DEFS['plant'] = plantDef;
}
