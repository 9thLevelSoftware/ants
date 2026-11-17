// The queen eats fungus (GDD 07 §5.4.1-5.4.2: queen upkeep 0.5 FL plus 0.03 FL per egg, "brood and queen eat only
// fungus"). The minims that tend the garden she lives in feed her staphylae there: each garden step, while she stands
// in (or beside) a living garden with gardeners at work, her gut is topped up toward the colony's queen targets from
// the harvested staphylae, then from the pool (which this species fills only with fungus food and sap), at one
// QUEEN_FEED_LOADS per QUEEN_FEED_S per gardener present.
// Why here and not through queen-care: the shared queen-care feed needs a crop of QUEEN_FEED_LOADS x 0.5 (0.05
// loads); a first-brood minim holds 0.037, so carers never feed an Atta queen (core defect, reported).

import type { Colony, Sim } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';
import { withdraw } from '@/sim/colony/stores';
import { QUEEN_GUT_CAP, QUEEN_TARGET_GUT_C, QUEEN_TARGET_GUT_P } from '@/sim/balance/colony';
import { QUEEN_FEED_LOADS, QUEEN_FEED_S } from '@/sim/balance/nestwork';
import { FL_P_SHARE } from '@/sim/balance/species-leafcutter';
import { SECONDS_PER_DAY } from '@/sim/time';
import { gardenWorkers } from './work';

/** The live garden whose chamber holds (or is beside) the queen, or null. */
function queenGarden(sim: Sim, col: Colony): number {
  const q = sim.stores.ants.get(col.queenId);
  if (!q || !q.alive) return -1;
  for (const g of col.fungus!.gardens) {
    if (g.state === 'dead') continue;
    if (q.chamberId === g.chamberId) return g.chamberId;
    const ch = chamberById(sim, g.chamberId);
    if (!ch) continue;
    const dx = (q.pos.x - ch.center.x) / (ch.radii.x * 1.5), dy = (q.pos.y - ch.center.y) / (ch.radii.y * 2.5), dz = (q.pos.z - ch.center.z) / (ch.radii.z * 1.5);
    if (dx * dx + dy * dy + dz * dz <= 1) return g.chamberId;
  }
  return -1;
}

/** Feeds the established queen fungus food over dtGd; returns FL given. */
export function feedQueenFungus(sim: Sim, col: Colony, dtGd: number): number {
  const q = sim.stores.ants.get(col.queenId);
  const qs = q?.queen;
  if (!q || !q.alive || !qs || qs.founding) return 0;
  const room = queenGarden(sim, col);
  if (room < 0) return 0;
  const tenders = gardenWorkers(sim, col).get(room)?.gardeners ?? 0;
  if (tenders <= 0) return 0;
  const wantP = Math.max(0, QUEEN_TARGET_GUT_P - qs.gut.p), wantC = Math.max(0, QUEEN_TARGET_GUT_C - qs.gut.c);
  const room0 = Math.max(0, QUEEN_GUT_CAP - qs.gut.c - qs.gut.p);
  const rate = (QUEEN_FEED_LOADS / QUEEN_FEED_S) * SECONDS_PER_DAY * tenders * dtGd;
  let fl = Math.min(rate, room0, Math.max(wantP / FL_P_SHARE, wantC / (1 - FL_P_SHARE)));
  if (!(fl > 1e-9)) return 0;
  const mod = col.fungus!;
  const fromStaph = Math.min(fl, mod.staphylae ?? 0);
  mod.staphylae = (mod.staphylae ?? 0) - fromStaph;
  let p = fromStaph * FL_P_SHARE, c = fromStaph * (1 - FL_P_SHARE);
  fl -= fromStaph;
  if (fl > 0) {
    const got = withdraw(col, fl * (1 - FL_P_SHARE), fl * FL_P_SHARE, 'queen');
    p += got.p; c += got.c;
  }
  qs.gut.p += p;
  qs.gut.c += c;
  if (p + c > 1e-9) sim.emit({ type: 'feed', giverId: -1, receiverId: q.id, broodId: -1, c, p });
  return p + c;
}
