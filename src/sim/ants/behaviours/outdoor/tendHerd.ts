// `tend` for the honeydew-ranching species (GDD 07 §6.1: Lasius niger; Camponotus is its Tier 3 variant): the herd
// branch (tendHerdStates.ts) on top of the outdoor engine's tend flavour. Registered as a species-specific behaviour
// (it wins over the generic `tend` for these species, src/sim/systems.ts createBehaviourTable), so the engine's
// Tier 1 tending of static honeydew films stays the generic behaviour and the fallback here.
//
// Who runs the ant:
//   herd branch  travel -> solicit / wait / guard / full at the herd  (TH.st >= 0)
//   engine       return, deliver, wait in the nest, rest, flee, and herd-less trips to honeydew films
// Hand-overs: a waiting tender in the nest with a workable herd departs straight for it (GDD 07 "delivered ->
// travel (same herd)"), after the end of its task cycle is booked; an engine phase heading to a herd source (a
// flee resumed) comes back into the branch; the branch leaves through the engine's startReturn.
//
// Contradiction (reported): GDD 02 §10.3 has tenders wait for activation in the nest like foragers; GDD 07 §6.1.4
// (the honeydew module, the more specific owner) sends them back to their herd after delivering. Followed GDD 07.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { REST_ENTER } from '@/sim/balance';
import { CROP_RETURN_FRACTION } from '@/sim/balance/actions';
import { poolSpace, taskCycleDone } from '@/sim/colony';
import { herdOfSource, herdSourceOf } from '@/sim/ecology';
import { curfewNow, num, phaseOf } from './common';
import { makeBehaviour } from './engine';
import { TEND } from './flavours';
import { K, PHASE } from './keys';
import { chooseHerd } from './tendHerdChoice';
import { TH } from './tendHerdKeys';
import { clearHerdBranch, herdActive, resumeTravel, startTravel, updateHerd } from './tendHerdStates';

const engine = makeBehaviour(TEND);

/** Engine phases on the way to (or at) a source: a herd source there belongs to the herd branch. */
function headingToSource(ant: Ant): boolean {
  const p = phaseOf(ant);
  return p === PHASE.outbound || p === PHASE.search || p === PHASE.queue || p === PHASE.collect;
}

/** The engine was taking the ant to a herd source (after a flee): hand it back to the branch. */
function reclaim(sim: Sim, ant: Ant): boolean {
  if (ant.nestId >= 0 || !headingToSource(ant) || ant.task !== 'tend') return false;
  const src = sim.stores.sources.get(num(ant, K.src, -1));
  if (!src || !herdOfSource(sim, src.id)) return false;
  resumeTravel(sim, ant, src);
  return herdActive(ant);
}

/**
 * The crops (CROP_RETURN_FRACTION x crop capacity, C) of each colony's tenders on their way out or outside: what they
 * will bring home. Runtime cache, rebuilt once per tick from the ant list and added to by every departure in the same
 * tick. "On the way" starts at the decision to leave: the herd branch is
 * active (startTravel) or the engine has her outbound, even while she still walks up the tunnel. Counted from
 * `nestId < 0` only, every waiting tender that thought before the first one reached the surface saw the same room and
 * left too (sweep-6 finding 2: room for 1.5 crops, 6 tenders out within 9 ticks).
 */
const outCache = new WeakMap<Sim, { tick: number; byColony: Map<number, number> }>();

function cropOf(a: Ant): number {
  return CROP_RETURN_FRACTION * a.cropCap;
}

function onTheWay(a: Ant): boolean {
  return a.alive && a.task === 'tend' && (a.nestId < 0 || herdActive(a) || phaseOf(a) === PHASE.outbound);
}

function cropsOnTheWay(sim: Sim): Map<number, number> {
  let c = outCache.get(sim);
  if (!c || c.tick !== sim.state.tick) {
    const byColony = new Map<number, number>();
    for (const a of sim.stores.ants.list) if (onTheWay(a)) byColony.set(a.colony, (byColony.get(a.colony) ?? 0) + cropOf(a));
    c = { tick: sim.state.tick, byColony };
    outCache.set(sim, c);
  }
  return c.byColony;
}

/**
 * The engine for a tender who may not leave now (no room for her crop): it runs her wait in the nest as usual (place,
 * re-evaluation, task cycle) but picks no honeydew source, so the engine's own departure cannot take her out past the
 * room rule (sweep-6 finding 2: the herd branch held her, the engine's wait sent her to the same herd's source).
 */
const heldEngine = makeBehaviour({ ...TEND, accept: () => false });

/**
 * A tender waiting in the nest leaves for its herd (after booking the end of the last cycle): 'done' when she left or
 * her task changed, 'held' when the stores have no room for her crop, 'pass' to let the engine run her.
 */
function departForHerd(sim: Sim, ant: Ant): 'done' | 'held' | 'pass' {
  if (ant.nestId < 0 || phaseOf(ant) !== PHASE.wait || ant.task !== 'tend') return 'pass';
  if (num(ant, TH.cycle, 0) === 1) {
    ant.bb[TH.cycle] = 0;
    if (taskCycleDone(sim, ant) !== 'tend') return 'done'; // the runner switches the task
  }
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || ant.fatigue >= REST_ENTER || curfewNow(sim, col)) return 'pass';
  // stores full (GDD 02 §5.5 item 5: failed unloads suppress activation): no honeydew trip while the pool has no room
  // for the crop she brings home, after the crops of the tenders already on their way; she waits in the nest (ageing
  // at the nest rate, not 3x outside) until there is. (Kitchen-door #2, pool C at 13-15 of ~14 all season: with room
  // checked for her crop alone, the 3 tenders left together whenever a crop's room opened and 30 of 64 trips were
  // still refused.)
  const out = cropsOnTheWay(sim);
  if (poolSpace(col).c < (out.get(col.id) ?? 0) + cropOf(ant)) return 'held';
  const h = chooseHerd(sim, ant);
  if (!h || !herdSourceOf(sim, h) || !startTravel(sim, ant, h)) return 'pass';
  // she counts from this tick on for the tenders who think after her in the same tick
  if (onTheWay(ant)) out.set(ant.colony, (out.get(ant.colony) ?? 0) + cropOf(ant));
  return 'done';
}

export const tendHerdBehaviour: Behaviour = {
  task: 'tend',
  species: ['lasius-niger', 'camponotus-pennsylvanicus'],
  enter(sim, ant) {
    clearHerdBranch(ant);
    // back from a reactive override (a fight at the herd) or a release outside: straight back to the herd
    const h = sim.stores.herds.get(num(ant, TH.herd, -1));
    const src = h ? herdSourceOf(sim, h) : undefined;
    if (ant.nestId < 0 && src && h && h.a >= 1 && ant.cropC + ant.cropP < CROP_RETURN_FRACTION * ant.cropCap) {
      ant.bb[K.phase] = PHASE.outbound;
      ant.bb[K.out0] = sim.state.tick;
      ant.bb[K.wentOut] = 1;
      resumeTravel(sim, ant, src);
      if (herdActive(ant)) return;
    }
    engine.enter(sim, ant);
  },
  update(sim, ant) {
    if (herdActive(ant)) { updateHerd(sim, ant); return; }
    if (reclaim(sim, ant)) return;
    const d = departForHerd(sim, ant);
    if (d === 'done') return;
    (d === 'held' ? heldEngine : engine).update(sim, ant);
  },
  exit(sim, ant) {
    // the herd is kept (TH.herd): a tender pulled into a fight goes back to it when the task resumes
    clearHerdBranch(ant);
    engine.exit(sim, ant);
  },
  delivering: (sim, ant) => engine.delivering?.(sim, ant) ?? false,
};
