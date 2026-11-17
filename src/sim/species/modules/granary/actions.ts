// The granary's action primitives (GDD 01 §7 shells, GDD 07 §6.3): `mill-seed` (continuous, in a granary),
// `gnaw-radicle` (timed, in a granary with germinating seed) and `cut-seed-head` (timed, at a seed plant). The
// possessed ant and the AI go through the same definitions. Registered into the primitive catalogue at load
// (ACTION_DEFS has no definition for these ids; the catalogue refuses ids without one).

import { rngInt } from '@/core/rng';
import type { ActionFailReason, Ant, Sim, TargetRef } from '@/sim/types';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import type { ActionDef } from '@/sim/ants/actions/types';
import { GNAW_BATCH_LOADS, MILL_BATCH_LOADS } from '@/sim/balance/species-harvester';
import { granaryParams, type GranaryParams } from './params';
import { germinatingLoads, gnawLoads } from './cohorts';
import { millCohort, millLoads, millSecondsPerLoad } from './paste';
import { granaryOf } from './state';
import { siteOfSource } from './seeds';

/** bb keys of the mill action: loads asked for (AI batch) and loads done. */
export const MILL_WANT = 'mb.millWant';
const MILL_DONE = 'mb.millDone';

function paramsOf(sim: Sim, ant: Ant): GranaryParams | null {
  const col = sim.stores.colonies.get(ant.colony);
  return col?.granary ? granaryParams(sim.getSpecies(col.species)) : null;
}

/** The granary record of the chamber the ant stands in, or undefined. */
export function granaryHere(sim: Sim, ant: Ant): ReturnType<typeof granaryOf> {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col?.granary || ant.chamberId < 0) return undefined;
  return granaryOf(col.granary, ant.chamberId);
}

/** Whether the ant could mill here now: a granary with a cohort her caste and size can crack. */
export function canMillHere(sim: Sim, ant: Ant): boolean {
  const g = paramsOf(sim, ant);
  const gr = granaryHere(sim, ant);
  return !!g && !!gr && millCohort(g, ant, gr) !== null;
}

export const millSeedDef: ActionDef = {
  id: 'mill-seed', kind: 'continuous', targets: ['none'], cancellable: true, scalesWithWork: true, pose: 'mill', cue: 'seed-crack',
  // minors are not given mill-seed by the species data; they may mill sprouted (soft) seed (GDD 07 §6.3.4, §6.3.6)
  who: (sim, ant) => ant.caste === 'minor' && canMillHere(sim, ant),
  check(sim, ant): ActionFailReason | null {
    const g = paramsOf(sim, ant);
    if (!g) return 'species';
    const gr = granaryHere(sim, ant);
    if (!gr || gr.cohorts.length === 0) return 'no-target';
    return millCohort(g, ant, gr) ? null : 'too-heavy';
  },
  durationS: () => 0,
  onBegin(_sim, ant) {
    ant.bb[MILL_DONE] = 0;
    if (!(ant.bb[MILL_WANT] > 0)) ant.bb[MILL_WANT] = MILL_BATCH_LOADS;
  },
  tick(sim, ant, _t, dt) {
    const g = paramsOf(sim, ant);
    const gr = granaryHere(sim, ant);
    const col = sim.stores.colonies.get(ant.colony);
    if (!g || !gr || !col?.granary) return 'no-target';
    const c = millCohort(g, ant, gr);
    if (!c) return 'done';
    const want = ant.bb[MILL_WANT] ?? MILL_BATCH_LOADS;
    const done = ant.bb[MILL_DONE] ?? 0;
    const step = Math.min(dt / millSecondsPerLoad(g, ant, c), want - done);
    const out = millLoads(col.granary, gr, g, c, step);
    ant.bb[MILL_DONE] = done + step;
    if (ant.bb[MILL_DONE] >= want - 1e-9) {
      sim.emit({ type: 'seed-milled', antId: ant.id, loads: ant.bb[MILL_DONE], pasteOut: ant.bb[MILL_DONE] * g.pasteYield });
      return 'done';
    }
    return out.paste + out.chaff > 0 ? 'continue' : 'done';
  },
  onEnd(_sim, ant) {
    ant.bb[MILL_WANT] = 0;
  },
};

export const gnawRadicleDef: ActionDef = {
  id: 'gnaw-radicle', kind: 'timed', targets: ['none'], cancellable: true, pose: 'gnaw', cue: null,
  check(sim, ant) {
    if (!paramsOf(sim, ant)) return 'species';
    const gr = granaryHere(sim, ant);
    if (!gr) return 'no-target';
    const sprouted = gr.cohorts.some((c) => c.state === 'sprouted' && c.loads > 0);
    return germinatingLoads(gr) > 0 || sprouted ? null : 'no-target';
  },
  durationS(sim, ant) {
    const g = paramsOf(sim, ant);
    return (g ? g.gnawRadicleS : 5) * GNAW_BATCH_LOADS;
  },
  effect(sim, ant) {
    const g = paramsOf(sim, ant);
    const gr = granaryHere(sim, ant);
    if (!g || !gr) return 'no-target';
    const n = gnawLoads(gr, g, GNAW_BATCH_LOADS);
    if (n <= 0) return 'no-target';
    sim.emit({ type: 'radicle-gnawed', antId: ant.id, loads: n });
    return n;
  },
};

function seedSiteOf(sim: Sim, ant: Ant, t: TargetRef): ReturnType<typeof siteOfSource> {
  const col = sim.stores.colonies.get(ant.colony);
  return col?.granary && t.kind === 'source' ? siteOfSource(col.granary, t.id) : undefined;
}

export const cutSeedHeadDef: ActionDef = {
  id: 'cut-seed-head', kind: 'timed', targets: ['source'], cancellable: true, pose: 'cut', cue: null,
  check(sim, ant, t) {
    const g = paramsOf(sim, ant);
    if (!g) return 'species';
    if (ant.caste === 'media' && ant.lengthBu < g.millMediaMinBu) return 'caste';
    const site = seedSiteOf(sim, ant, t);
    return site && site.seedHeads > 0 && sim.stores.sources.has(t.id) ? null : 'no-target';
  },
  durationS(sim, ant) {
    return paramsOf(sim, ant)?.cutSeedHeadS ?? 20;
  },
  effect(sim, ant, t) {
    const g = paramsOf(sim, ant);
    const site = seedSiteOf(sim, ant, t);
    const s = sim.stores.sources.get(t.id);
    if (!g || !site || !s || site.seedHeads <= 0) return 'no-target';
    const n = rngInt(sim.stream('rng.ecology'), g.cutSeedHeadSeedsMin, g.cutSeedHeadSeedsMax);
    site.seedHeads--;
    s.units += n;
    s.capacity = Math.max(s.capacity, s.units);
    return n;
  },
};

/** Puts the definitions into the primitive catalogue (idempotent). */
export function registerGranaryActions(): void {
  ACTION_DEFS['mill-seed'] = millSeedDef;
  ACTION_DEFS['gnaw-radicle'] = gnawRadicleDef;
  ACTION_DEFS['cut-seed-head'] = cutSeedHeadDef;
}
