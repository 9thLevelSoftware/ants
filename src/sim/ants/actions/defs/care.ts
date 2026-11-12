// lay-egg, feed-larva, groom, antennate, sniff (GDD 01 §7.3; laying and feeding effects owned by the colony).

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ANTENNATE_AI_S, ANTENNATE_RANGE_L, ANTENNATE_S, EGG_COST_P, GROOM_PILE_RADIUS_BU, FEED_LARVA_LOADS, FEED_LARVA_S, FOUNDING_FEED_P_SHARE,
  GROOM_BROOD_S, GROOM_OTHER_S, GROOM_REDUCTION, GROOM_SELF_S, LAY_COOLDOWN_S, LAY_EGG_S, OPEN_LAY_ACTION_S, OPEN_LAY_BATCH_EGGS,
  SNIFF_S,
} from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { removeItem } from '@/sim/entities';
import { carriedItem } from '../carry';
import { antLengthMm, inReach, placeOf } from '../geometry';
import { ports } from '../ports';
import { isFoodItem } from '../sourceKinds';
import type { ActionDef } from '../types';
import { isPossessed, speciesIdOf } from '../workRate';

/** The opening's batch laying applies (GDD 06 §5.10): phase `lay`, no cooldown, 4 s per batch. */
function openingLay(sim: Sim, ant: Ant): boolean {
  return sim.state.player.opening?.phase === 'lay' && (ant.flags & AntFlag.FOUNDING) !== 0;
}

/** Not enough protein for an egg: the founding pool, else gut P (or reserve P while still in founding mode). */
function proteinShort(ant: Ant): boolean {
  const q = ant.queen;
  if (!q) return true;
  if (q.founding) return q.founding.reserveLoads < EGG_COST_P;
  return q.gut.p < EGG_COST_P && !(q.mode === 'founding' && q.reserveP >= EGG_COST_P);
}

/** In a chamber or the founding cell (where `lay-egg` is allowed; also the queen's self prompt, GDD 01 §9.2). */
export function inLayingPlace(sim: Sim, ant: Ant): boolean {
  return ant.chamberId >= 0 || ports.findChamberAt(sim, ant.pos) !== null || (ant.queen?.founding != null && ant.nestId >= 0);
}

export const layEggDef: ActionDef = {
  id: 'lay-egg', kind: 'timed', targets: ['none'], cancellable: true, lockedAfterWindup: true, pose: 'lay',
  cue: 'lay-egg',
  check(sim, ant) {
    if (ant.caste !== 'queen' || !ant.queen) return 'caste';
    if (!inLayingPlace(sim, ant)) return 'not-allowed-here';
    const opening = openingLay(sim, ant);
    // The AI queen is never subject to the cooldown (GDD 02 §3.2); the player's laying only changes timing.
    if (!opening && isPossessed(ant) && sim.state.tick < ant.layCooldownUntilTick) return 'cooldown';
    // Budget, clutch cap and protein rules are the colony's (shared with the AI queen).
    if (!ports.canLay(sim, ant)) return proteinShort(ant) ? 'no-reserve' : 'budget';
    return null;
  },
  durationS: (sim, ant) => (openingLay(sim, ant) ? OPEN_LAY_ACTION_S : LAY_EGG_S),
  // The opening lays a whole batch at the end of active (no partial batch on interrupt); the colony's canLay stops
  // it early at the clutch limits. Counting batches (opening.layBatches) is the opening script's, from the
  // action-completed event.
  effect(sim, ant) {
    const opening = openingLay(sim, ant);
    const want = opening ? OPEN_LAY_BATCH_EGGS : 1;
    let laid = 0;
    while (laid < want && ports.layEgg(sim, ant, 'worker') >= 0) laid++;
    if (!opening) ant.layCooldownUntilTick = sim.state.tick + LAY_COOLDOWN_S * TICKS_PER_SECOND;
    return laid > 0 ? laid : 'budget';
  },
};

/** Larval feeding source of this ant: founding reserves, crop, or a carried protein item. */
function feedSource(sim: Sim, ant: Ant): 'reserves' | 'crop' | 'item' | null {
  if (ant.queen?.founding && ant.queen.founding.reserveLoads > 0) return 'reserves';
  if (ant.cropC + ant.cropP > 1e-9) return 'crop';
  const it = carriedItem(sim, ant);
  return it && isFoodItem(it) && it.p > 1e-9 ? 'item' : null;
}

export const feedLarvaDef: ActionDef = {
  id: 'feed-larva', kind: 'timed', targets: ['brood'], cancellable: true, pose: 'feed', cue: 'trophallaxis',
  check(sim, ant, t) {
    const b = sim.stores.brood.get(t.id);
    if (!b || b.stage !== 'larva') return 'no-target';
    if (speciesIdOf(sim, ant) === 'atta-texana' && carriedItem(sim, ant)?.kind !== 'staphylae') return 'no-reserve';
    return feedSource(sim, ant) ? null : 'crop-empty';
  },
  durationS: () => FEED_LARVA_S,
  // Contract with the colony: feedBrood debits the giver's crop, credits the larva and returns what moved. A founding
  // queen first turns one feed of her reserve pool into crop food; a carried protein item is first chewed into it.
  effect(sim, ant, t) {
    const src = feedSource(sim, ant);
    if (!src) return 'crop-empty';
    if (src === 'reserves') reservesIntoCrop(ant);
    if (src === 'item') chewIntoCrop(sim, ant);
    const crop = ant.cropC + ant.cropP;
    const amount = Math.min(FEED_LARVA_LOADS, crop);
    const c = (amount * ant.cropC) / crop;
    const got = ports.feedBrood(sim, ant, t.id, c, amount - c);
    return got.c + got.p;
  },
};

/** One feed of a founding queen's reserve pool as trophic food in her crop (mix 0.75 P / 0.25 C, GDD 02 §5.4.1). */
function reservesIntoCrop(ant: Ant): void {
  const f = ant.queen?.founding;
  if (!f) return;
  const n = Math.min(FEED_LARVA_LOADS, f.reserveLoads);
  f.reserveLoads -= n;
  ant.cropP += n * FOUNDING_FEED_P_SHARE;
  ant.cropC += n * (1 - FOUNDING_FEED_P_SHARE);
}

/** Moves up to one feed's worth of protein (and its share of C) from the carried item into the crop. */
function chewIntoCrop(sim: Sim, ant: Ant): void {
  const it = carriedItem(sim, ant);
  if (!it) return;
  const p = Math.min(FEED_LARVA_LOADS, it.p);
  const c = it.p > 0 ? Math.min(it.c, (p * it.c) / it.p) : 0;
  it.p -= p; it.c -= c;
  ant.cropP += p; ant.cropC += c;
  if (it.c + it.p <= 1e-9) removeItem(sim, it.id, 'eaten');
}

export const groomDef: ActionDef = {
  id: 'groom', kind: 'timed', targets: ['none', 'ant', 'brood'], cancellable: true, pose: 'groom-other', cue: null,
  check(sim, ant, t) {
    if (t.kind === 'none') return null;
    if (ant.caste === 'male') return 'caste';
    if (t.kind === 'ant') {
      const a = sim.stores.ants.get(t.id);
      if (!a || a.id === ant.id) return 'no-target';
      return a.colony === ant.colony ? null : 'not-allowed-here';
    }
    return null;
  },
  durationS: (_sim, _ant, t) => (t.kind === 'none' ? GROOM_SELF_S : t.kind === 'ant' ? GROOM_OTHER_S : GROOM_BROOD_S),
  effect(sim, ant, t) {
    if (t.kind === 'brood') {
      const b = sim.stores.brood.get(t.id);
      if (!b) return 'no-target';
      b.lastTendedTick = sim.state.tick;
      // grooming one item of a pile tends the pile around it (GDD 02 §10.4 nurse.tend: every item within 2 BU)
      return ports.tendBroodAt(sim, b.colony, b.pos, GROOM_PILE_RADIUS_BU * sim.world.bu);
    }
    const a = t.kind === 'none' ? ant : sim.stores.ants.get(t.id);
    if (!a) return 'no-target';
    const removed = a.dirt * GROOM_REDUCTION;
    a.dirt -= removed;
    return removed;
  },
};

export const antennateDef: ActionDef = {
  id: 'antennate', kind: 'timed', targets: ['ant', 'brood', 'item', 'source', 'creature', 'entrance', 'surface', 'none'],
  cancellable: true, pose: 'antennate', cue: 'antennate',
  reachable: (sim, ant, t) => {
    if (t.kind === 'none') return true;
    const place = placeOf(sim, ant, t, { pos: { x: 0, y: 0, z: 0 }, radius: 0 });
    return place !== null && inReach(sim, ant, place, ANTENNATE_RANGE_L * antLengthMm(sim, ant));
  },
  check: () => null,
  durationS: (_sim, ant) => (isPossessed(ant) ? ANTENNATE_S : ANTENNATE_AI_S),
  // Opens the inspect card for the player (UI reads action-completed); knowledge: a source becomes known.
  effect(sim, ant, t) {
    if (t.kind === 'source') ports.discoverSource(sim, ant.colony, t.id, ant.id);
    return 1;
  },
};

export const sniffDef: ActionDef = {
  id: 'sniff', kind: 'timed', targets: ['none', 'surface', 'point'], cancellable: true, pose: 'sniff', cue: null,
  reachable: () => true,
  check: () => null,
  durationS: () => SNIFF_S,
  // Presentation only (scent haze), and the founding queen's site assessment, which the opening module reads.
  effect: () => 0,
};
