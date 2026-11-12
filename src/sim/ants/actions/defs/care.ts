// lay-egg, feed-larva, groom, antennate, sniff (GDD 01 §7.3; laying and feeding effects owned by the colony).

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  ANTENNATE_AI_S, ANTENNATE_RANGE_L, ANTENNATE_S, EGG_COST_P, FEED_LARVA_LOADS, FEED_LARVA_S, FOUNDING_FEED_P_SHARE,
  GROOM_BROOD_S, GROOM_OTHER_S, GROOM_REDUCTION, GROOM_SELF_S, LAY_COOLDOWN_S, LAY_EGG_S, OPEN_LAY_ACTION_S, SNIFF_S,
} from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { removeItem } from '@/sim/entities';
import { carriedItem } from '../carry';
import { antLengthMm, inReach, placeOf } from '../geometry';
import { ports } from '../ports';
import { isFoodItem } from '../sourceKinds';
import type { ActionDef } from '../types';
import { isPossessed } from '../workRate';

/** The opening's batch laying applies (GDD 06 §5.10): phase `lay`, no cooldown, 4 s per batch. */
function openingLay(sim: Sim, ant: Ant): boolean {
  return sim.state.player.opening?.phase === 'lay' && (ant.flags & AntFlag.FOUNDING) !== 0;
}

function proteinAvailable(ant: Ant): number {
  const q = ant.queen;
  if (!q) return 0;
  return q.founding ? q.founding.reserveLoads : q.reserveP + q.gut.p;
}

function inLayingPlace(sim: Sim, ant: Ant): boolean {
  return ant.chamberId >= 0 || ports.findChamberAt(sim, ant.pos) !== null || (ant.queen?.founding != null && ant.nestId >= 0);
}

export const layEggDef: ActionDef = {
  id: 'lay-egg', kind: 'timed', targets: ['none'], cancellable: true, lockedAfterWindup: true, pose: 'lay',
  cue: 'lay-egg',
  check(sim, ant) {
    const q = ant.queen;
    if (ant.caste !== 'queen' || !q) return 'caste';
    if (!inLayingPlace(sim, ant)) return 'not-allowed-here';
    if (proteinAvailable(ant) < EGG_COST_P) return 'no-reserve';
    const opening = openingLay(sim, ant);
    if (opening) {
      const cap = sim.species.opening.clutchCap;
      if (q.clutchLaid >= cap) return 'budget';
    } else if (q.eggBudget < 1) return 'budget';
    // The AI queen is never subject to the cooldown (GDD 02 §3.2); the player's laying only changes timing.
    if (!opening && isPossessed(ant) && sim.state.tick < ant.layCooldownUntilTick) return 'cooldown';
    return null;
  },
  durationS: (sim, ant) => (openingLay(sim, ant) ? OPEN_LAY_ACTION_S : LAY_EGG_S),
  effect(sim, ant) {
    const opening = openingLay(sim, ant);
    const id = ports.layEgg(sim, ant, 'worker');
    if (!opening) ant.layCooldownUntilTick = sim.state.tick + LAY_COOLDOWN_S * TICKS_PER_SECOND;
    return id >= 0 ? 1 : 'budget';
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
    if (sim.species.id === 'atta-texana' && carriedItem(sim, ant)?.kind !== 'staphylae') return 'no-reserve';
    return feedSource(sim, ant) ? null : 'crop-empty';
  },
  durationS: () => FEED_LARVA_S,
  // Contract with the colony: feedBrood debits the giver's crop (or a founding queen's reserve pool), credits the
  // larva and returns what moved. A carried protein item is first chewed into the crop.
  effect(sim, ant, t) {
    const src = feedSource(sim, ant);
    if (!src) return 'crop-empty';
    let c = 0, p = 0;
    if (src === 'reserves') {
      p = FEED_LARVA_LOADS * FOUNDING_FEED_P_SHARE;
      c = FEED_LARVA_LOADS - p;
    } else {
      if (src === 'item') chewIntoCrop(sim, ant);
      const crop = ant.cropC + ant.cropP;
      const amount = Math.min(FEED_LARVA_LOADS, crop);
      c = (amount * ant.cropC) / crop;
      p = amount - c;
    }
    const got = ports.feedBrood(sim, ant, t.id, c, p);
    return got.c + got.p;
  },
};

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
      if (b) b.lastTendedTick = sim.state.tick;
      return 0;
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
