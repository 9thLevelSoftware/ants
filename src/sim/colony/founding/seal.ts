// Soil for the plug (GDD 06 §5.9, GDD 03 §4.2 / §13.2): holding E at the shaft repeats `seal-entrance`, which needs
// a soil pellet in the mandibles. During the founding dig every bite was expelled to the mound (automatic
// expulsion), so the queen reaches the seal phase empty-handed. Founding-phase rule (GDD 03 §13.2 `ready`: "each
// further bite puts a soil-pellet in the queen's mandibles"): while the dig is `ready` and an entrance of her cavity
// is still open, the queen inside the cavity never stays empty-handed: she scrapes a bite of soil off the wall beside
// her (the nest module's own dig bite, which gives a pellet once the cell is ready) and holds it, so every press of
// E at the shaft finds soil to tamp. The bite costs the pool like any founding bite.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, Sim } from '@/sim/types';
import { SEAL_THROAT_BU } from '@/sim/balance/actions';
import { FOUND_DIG_COST_PER_BITE, FOUND_SEAL_SCRAPE_MIN_DEPTH_BU, FOUND_SEAL_SCRAPE_SLOPES_DEG } from '@/sim/balance/founding';
import { digBite } from '@/sim/nest';
import { FB, bbGet, bbSet, depthBelowGround } from './access';
import { cavityEntrances } from './dig';

/**
 * Is the ant in the throat of entrance e (within SEAL_THROAT_BU of the opening, not outside above it)? The same
 * test as the `seal-entrance` primitive's reach (src/sim/ants/actions/defs/dig.ts inThroat; not imported: the
 * colony module may not import the action library, which imports the colony).
 */
export function inThroatOf(sim: Sim, a: Ant, e: Entrance): boolean {
  const dx = a.pos.x - e.pos.x, dy = a.pos.y - e.pos.y, dz = a.pos.z - e.pos.z;
  if (Math.hypot(dx, dy, dz) > SEAL_THROAT_BU * sim.world.bu + e.radius) return false;
  return dx * e.dir.x + dy * e.dir.y + dz * e.dir.z <= e.radius;
}

/** The unsealed entrance of the founding cavity whose throat the queen is in, or null. */
export function throatToSeal(sim: Sim, nest: Nest, q: Ant): Entrance | null {
  for (const e of cavityEntrances(sim, nest)) if (e.status !== 'sealed' && inThroatOf(sim, q, e)) return e;
  return null;
}

/** Is the queen inside her founding cavity (below the ground), with an entrance of it still to seal? */
function needsSoil(sim: Sim, nest: Nest, q: Ant): boolean {
  if (depthBelowGround(sim, q) < FOUND_SEAL_SCRAPE_MIN_DEPTH_BU * sim.world.bu) return false;
  return cavityEntrances(sim, nest).some((e) => e.status !== 'sealed');
}

const feet: Vec3 = { x: 0, y: 0, z: 0 };
const heading: Vec3 = { x: 0, y: 0, z: 0 };

/** Horizontal unit heading at `angle` (rad) from the queen's own horizontal heading, into `heading`. */
function headingAt(q: Ant, angle: number): Vec3 {
  let x = q.fwd.x, z = q.fwd.z;
  const len = Math.hypot(x, z);
  if (len < 1e-6) { x = 1; z = 0; } else { x /= len; z /= len; }
  const c = Math.cos(angle), s = Math.sin(angle);
  heading.x = x * c - z * s; heading.y = 0; heading.z = x * s + z * c;
  return heading;
}

/**
 * One tick of the rule (phase `seal`): scrapes a pellet when the queen needs one. Tries the wall to her left and to
 * her right, then behind her (never ahead: in the throat that is the opening), at the slopes of
 * FOUND_SEAL_SCRAPE_SLOPES_DEG.
 * Returns true when she picked up soil this tick.
 */
export function soilForSeal(sim: Sim, q: Ant, nest: Nest): boolean {
  if (nest.founding?.state !== 'ready' || q.carry.kind !== 'none' || q.action) return false;
  if (!needsSoil(sim, nest, q)) return false;
  feet.x = q.pos.x - q.up.x * q.footOffset;
  feet.y = q.pos.y - q.up.y * q.footOffset;
  feet.z = q.pos.z - q.up.z * q.footOffset;
  for (const angle of [Math.PI / 2, -Math.PI / 2, Math.PI]) {
    for (const slope of FOUND_SEAL_SCRAPE_SLOPES_DEG) {
      const res = digBite(sim, q, feet, headingAt(q, angle), slope);
      if (!res.ok) continue;
      const it = res.pelletId >= 0 ? sim.stores.items.get(res.pelletId) : undefined;
      const f = q.queen?.founding;
      if (f) f.reserveLoads -= FOUND_DIG_COST_PER_BITE;
      bbSet(q, FB.bites, bbGet(q, FB.bites, 0) + 1);
      if (!it) return false;
      // into her mandibles (the pick-up of the action library's carry.ts takeItem)
      if (!it.carrierIds.includes(q.id)) it.carrierIds.push(q.id);
      it.reservedBy = -1;
      it.inNest = false;
      q.carry = { kind: 'item', id: it.id };
      return true;
    }
  }
  return false;
}
