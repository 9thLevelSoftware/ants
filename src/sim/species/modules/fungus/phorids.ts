// Hitchhikers and phorid flies (GDD 07 §6.4.7): a fragment carried >= hitchMinCarryBu is boarded by a hitchhiking
// minim with p hitchBoardP (hitchBoardPEscort with the hitchhikerEscort toggle). Laden carriers on the surface by day
// or at dusk are struck by phorids with p phorid100sP x PHORID_PRESSURE per 100 s (x phoridHitchMult with a rider);
// a parasitised forager dies phoridDeathGd later (cause `parasitoid`).
// Abstractions (reported): the rider is not a simulated minim (no minim agent leaves the nest to ride), and the fly
// is a pressure, not a `phorid-fly` creature (GDD 05 lists it as T3; none is spawned on these maps).

import { rngFloat } from '@/core/rng';
import type { Ant, Colony, Sim, System } from '@/sim/types';
import { PHORID_DEATH_STEP_TICKS } from '@/sim/balance/species-leafcutter';
import { processAntDeath } from '@/sim/ants/lifecycle';
import { calendarNow } from '@/sim/environment/calendar';
import { PHORID_PRESSURE, PHORID_ROLL_TICKS } from '@/sim/balance/species-leafcutter';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { fungusParams } from './params';
import { AK } from './work';
import { atColonies } from './economy';

/** Rider states in ant.bb at.rider: -1 undecided, 0 none, 1 a minim rides. */
const UNDECIDED = -1;
/** bb: this trip's carrier is already counted among the day's laden foragers (1) or not (0). */
const COUNTED = 'at.phCnt';

function dayCounters(sim: Sim, col: Colony): void {
  const mod = col.fungus!;
  const day = Math.floor(sim.state.tick / TICKS_PER_DAY);
  if (mod.phoridDay !== day) {
    if (mod.phoridDay !== undefined && mod.phoridDay >= 0) {
      mod.phoridLastDayRate = (mod.phoridForagersToday ?? 0) > 0 ? (mod.phoridToday ?? 0) / (mod.phoridForagersToday ?? 1) : 0;
    }
    mod.phoridDay = day;
    mod.phoridToday = 0;
    mod.phoridForagersToday = 0;
  }
}

/** One laden think of a carrier on the surface. */
export function phoridStep(sim: Sim, ant: Ant, col: Colony): void {
  const P = fungusParams(sim.getSpecies(col.species));
  if (!P || !col.fungus) return;
  dayCounters(sim, col);
  const bu = sim.world.bu;
  const lx = ant.bb[AK.lastX], lz = ant.bb[AK.lastZ];
  if (lx !== undefined && lz !== undefined) ant.bb[AK.ladenMm] = (ant.bb[AK.ladenMm] ?? 0) + Math.sqrt((ant.pos.x - lx) ** 2 + (ant.pos.z - lz) ** 2);
  ant.bb[AK.lastX] = ant.pos.x;
  ant.bb[AK.lastZ] = ant.pos.z;
  // every laden carrier is a forager the flies can strike (the diag-at-phorid rate's denominator), counted once a trip
  if ((ant.bb[COUNTED] ?? 0) === 0) {
    ant.bb[COUNTED] = 1;
    col.fungus.phoridForagersToday = (col.fungus.phoridForagersToday ?? 0) + 1;
  }
  const rng = sim.stream('rng.behaviour');
  if ((ant.bb[AK.rider] ?? UNDECIDED) === UNDECIDED && (ant.bb[AK.ladenMm] ?? 0) >= P.hitchMinCarryBu * bu) {
    const escort = col.directives.hitchhikerEscort === true;
    const rides = rngFloat(rng) < (escort ? P.hitchBoardPEscort : P.hitchBoardP);
    ant.bb[AK.rider] = rides ? 1 : 0;
    if (rides) sim.emit({ type: 'hitchhiker-mounted', antId: -1, carrier: ant.id });
  }
  // the fly works by day and at dusk
  const phase = calendarNow(sim).phase;
  if (phase === 'night' || (ant.bb[AK.phoridDie] ?? -1) >= 0) return;
  if (sim.state.tick < (ant.bb[AK.phoridRoll] ?? 0)) return;
  ant.bb[AK.phoridRoll] = sim.state.tick + PHORID_ROLL_TICKS;
  const per100 = P.phorid100sP * PHORID_PRESSURE * ((ant.bb[AK.rider] ?? 0) === 1 ? P.phoridHitchMult : 1);
  if (rngFloat(rng) < per100 * (PHORID_ROLL_TICKS / (100 * TICKS_PER_SECOND))) {
    ant.bb[AK.phoridDie] = sim.state.tick + Math.round(P.phoridDeathGd * TICKS_PER_DAY);
    col.fungus.phoridToday = (col.fungus.phoridToday ?? 0) + 1;
    sim.emit({ type: 'phorid-strike', antId: ant.id, carrier: ant.id });
  }
}

/** A new trip: the rider is decided afresh on the next laden walk. */
export function resetRider(ant: Ant): void {
  ant.bb[AK.rider] = UNDECIDED;
  ant.bb[AK.ladenMm] = 0;
  ant.bb[COUNTED] = 0;
}

/** Parasitised foragers die when their larva has eaten them (cause `parasitoid`). */
export const phoridDeathSystem: System = {
  name: 'fungus-phorid-deaths', phase: 'lifecycle', every: PHORID_DEATH_STEP_TICKS,
  run(sim) {
    for (const { col } of atColonies(sim)) {
      for (const a of sim.stores.ants.list) {
        if (!a.alive || a.colony !== col.id) continue;
        const t = a.bb[AK.phoridDie];
        if (t !== undefined && t >= 0 && sim.state.tick >= t) processAntDeath(sim, a.id, 'parasitoid');
      }
    }
  },
};
