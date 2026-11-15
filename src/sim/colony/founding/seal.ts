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
import {
  FOUND_DIG_COST_PER_BITE, FOUND_SEAL_SCRAPE_HEADINGS_DEG, FOUND_SEAL_SCRAPE_MARGIN_BU, FOUND_SEAL_SCRAPE_MIN_DEPTH_BU,
  FOUND_SEAL_SCRAPE_REACH_BU, FOUND_SEAL_SCRAPE_SLOPES_DEG, FOUND_SEAL_SCRAPE_SOIL_BU,
} from '@/sim/balance/founding';
import { DIG_RAMP_RADIUS_BU } from '@/sim/balance/nest';
import { VoxelFlag } from '@/sim/types';
import { digBite, voxelAt } from '@/sim/nest';
import { FB, bbGet, bbSet, depthBelowGround } from './access';
import { cavityEntrances } from './dig';
import { throatClosed } from './leak';

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
  for (const e of cavityEntrances(sim, nest)) if (!throatClosed(sim, e) && inThroatOf(sim, q, e)) return e;
  return null;
}

/** Is the queen inside her founding cavity (below the ground), with an entrance of it still to seal? */
function needsSoil(sim: Sim, nest: Nest, q: Ant): boolean {
  if (q.medium !== 'cavity' && depthBelowGround(sim, q) < FOUND_SEAL_SCRAPE_MIN_DEPTH_BU * sim.world.bu) return false;
  return cavityEntrances(sim, nest).some((e) => !throatClosed(sim, e));
}

const feet: Vec3 = { x: 0, y: 0, z: 0 };
/** Carve-grid iso level (design seed §4: openness 0 solid .. 255 open, iso 127.5). */
const CARVE_OPEN = 127.5;
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

const VOXEL_PLUG = VoxelFlag.PLUG;
const probe: Vec3 = { x: 0, y: 0, z: 0 };

/**
 * Would a bite from the queen's feet along `h` at `slope` reach the plug or the ground surface? The bite's ramp (the nest's dig
 * geometry, GDD 03 §1.2: a capsule of DIG_RAMP_RADIUS_BU whose floor runs through the feet) is probed along
 * FOUND_SEAL_SCRAPE_REACH_BU; any solid plug voxel, or solid within FOUND_SEAL_SCRAPE_SOIL_BU of the ground
 * surface, within the radius plus a margin of it vetoes the bite.
 */
function biteNearPlug(sim: Sim, h: Vec3, slopeDeg: number): boolean {
  const bu = sim.world.bu, v = sim.carve.voxel, r = (DIG_RAMP_RADIUS_BU + FOUND_SEAL_SCRAPE_MARGIN_BU) * bu;
  const s = (slopeDeg * Math.PI) / 180, cs = Math.cos(s), sn = Math.sin(s);
  const ax = feet.x + h.x * sn * DIG_RAMP_RADIUS_BU * bu, ay = feet.y + cs * DIG_RAMP_RADIUS_BU * bu, az = feet.z + h.z * sn * DIG_RAMP_RADIUS_BU * bu;
  for (let t = 0; t <= FOUND_SEAL_SCRAPE_REACH_BU * bu; t += 2 * v) {
    const cx = ax + h.x * cs * t, cy = ay - sn * t, cz = az + h.z * cs * t;
    for (let dz = -r; dz <= r; dz += v) for (let dy = -r; dy <= r; dy += v) for (let dx = -r; dx <= r; dx += v) {
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      probe.x = cx + dx; probe.y = cy + dy; probe.z = cz + dz;
      const vx = voxelAt(sim, probe);
      if (vx.open >= CARVE_OPEN) continue; // already open: the bite removes nothing there
      if ((vx.flags & VOXEL_PLUG) !== 0) return true;
      // never toward the ground surface: a scrape there could open a new hole beside the plug
      if (sim.field.substrateXYZ(probe.x, probe.y, probe.z) > -FOUND_SEAL_SCRAPE_SOIL_BU * bu) return true;
    }
  }
  return false;
}

/**
 * One tick of the rule (phase `seal`): scrapes a pellet when the queen needs one. Tries the wall at the headings of
 * FOUND_SEAL_SCRAPE_HEADINGS_DEG from her own (behind first: down the shaft, away from the plug; never straight
 * ahead, the opening) and the slopes of FOUND_SEAL_SCRAPE_SLOPES_DEG, skipping any bite that would reach the
 * plug's voxels or come near the ground surface.
 * Returns true when she picked up soil this tick.
 */
export function soilForSeal(sim: Sim, q: Ant, nest: Nest): boolean {
  if (nest.founding?.state !== 'ready' || q.carry.kind !== 'none' || q.action) return false;
  if (!needsSoil(sim, nest, q)) return false;
  feet.x = q.pos.x - q.up.x * q.footOffset;
  feet.y = q.pos.y - q.up.y * q.footOffset;
  feet.z = q.pos.z - q.up.z * q.footOffset;
  for (const deg of FOUND_SEAL_SCRAPE_HEADINGS_DEG) {
    for (const slope of FOUND_SEAL_SCRAPE_SLOPES_DEG) {
      const h = headingAt(q, (deg * Math.PI) / 180);
      if (biteNearPlug(sim, h, slope)) continue; // never scrape the plug she is building
      const res = digBite(sim, q, feet, h, slope);
      if (!res.ok) continue;
      return keepBite(sim, q, res.pelletId);
    }
  }
  return false;
}

/** The bite's cost to the pool; its pellet into her mandibles when they are free. True when she holds it. */
function keepBite(sim: Sim, q: Ant, pelletId: number): boolean {
  const f = q.queen?.founding;
  if (f) f.reserveLoads -= FOUND_DIG_COST_PER_BITE;
  bbSet(q, FB.bites, bbGet(q, FB.bites, 0) + 1);
  const it = pelletId >= 0 ? sim.stores.items.get(pelletId) : undefined;
  if (!it || q.carry.kind !== 'none') return false;
  // into her mandibles (the pick-up of the action library's carry.ts takeItem)
  if (!it.carrierIds.includes(q.id)) it.carrierIds.push(q.id);
  it.reservedBy = -1;
  it.inNest = false;
  q.carry = { kind: 'item', id: it.id };
  return true;
}

/**
 * Shut off from her cell (a plug closed between them): she bites toward the cell (through the loose plug fill),
 * the nest's own dig bite at the slope toward it. True when soil was removed.
 */
export function biteToward(sim: Sim, q: Ant, to: Vec3): boolean {
  if (q.action) return false;
  feet.x = q.pos.x - q.up.x * q.footOffset;
  feet.y = q.pos.y - q.up.y * q.footOffset;
  feet.z = q.pos.z - q.up.z * q.footOffset;
  const dx = to.x - q.pos.x, dy = to.y - q.pos.y, dz = to.z - q.pos.z, hl = Math.hypot(dx, dz);
  heading.x = hl > 1e-6 ? dx / hl : q.fwd.x; heading.y = 0; heading.z = hl > 1e-6 ? dz / hl : q.fwd.z;
  const slope = (Math.atan2(-dy, Math.max(hl, 1e-6)) * 180) / Math.PI;
  for (const s of [slope, 0, slope / 2]) {
    const res = digBite(sim, q, feet, heading, s);
    if (res.ok) { keepBite(sim, q, res.pelletId); return true; }
  }
  return false;
}
