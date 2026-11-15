// Acid and venom doses in progress on a body (GDD 05 §4.4: each spray or sting delivers its damage over 2 s).
// Every dose runs on its own clock, so two sprays landing together deliver both within those 2 s. Kept in the
// body's bb (numbers only, so they persist): slot k holds `cb.acid<k>` (damage left), `cb.acidR<k>` (damage per
// tick) and `cb.acidBy<k>` (the source ant). `cb.acid` is the total left, the "acid in progress" marker.

import { ACID_DOSE_SLOTS } from '@/sim/balance/combat';
import { CB, ticksOf } from './state';

type Bb = Record<string, number>;

const left = (k: number): string => `${CB.acidLeft}${k}`;
const rate = (k: number): string => `${CB.acidRate}${k}`;
const by = (k: number): string => `${CB.acidBy}${k}`;

/** Schedules `total` damage from `sourceId` over `seconds`. */
export function scheduleDose(bb: Bb, total: number, seconds: number, sourceId: number): void {
  if (!(total > 0)) return;
  const perTick = total / Math.max(1, ticksOf(seconds));
  let slot = -1;
  for (let k = 0; k < ACID_DOSE_SLOTS; k++) if (bb[left(k)] === undefined) { slot = k; break; }
  if (slot < 0) {
    // all slots busy: merge into the dose with the most left (it runs longest, so the merged dose ends latest)
    slot = 0;
    for (let k = 1; k < ACID_DOSE_SLOTS; k++) if (bb[left(k)] > bb[left(slot)]) slot = k;
    bb[left(slot)] += total;
    bb[rate(slot)] += perTick;
  } else {
    bb[left(slot)] = total;
    bb[rate(slot)] = perTick;
  }
  bb[by(slot)] = sourceId;
  bb[CB.acidLeft] = (bb[CB.acidLeft] ?? 0) + total;
}

/**
 * One tick of every dose: calls `apply(damage, sourceId)` per running dose, in slot order, until it returns false
 * (the body died). Clears spent doses and the marker.
 */
export function tickDoses(bb: Bb, apply: (dmg: number, sourceId: number) => boolean): void {
  let total = 0;
  let alive = true;
  for (let k = 0; k < ACID_DOSE_SLOTS; k++) {
    const l = bb[left(k)];
    if (l === undefined) continue;
    const d = Math.min(l, bb[rate(k)] ?? l);
    const src = bb[by(k)] ?? -1;
    const rest = l - d;
    if (rest <= 1e-9) { delete bb[left(k)]; delete bb[rate(k)]; delete bb[by(k)]; } else { bb[left(k)] = rest; total += rest; }
    if (alive) alive = apply(d, src);
  }
  if (total > 0) bb[CB.acidLeft] = total;
  else delete bb[CB.acidLeft];
}
