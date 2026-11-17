// Where garden waste goes (GDD 07 §5.4.6, §6.4.6 stage 8): a `midden` chamber at least WASTE_DUMP_MIN_BU from every
// fungus chamber, else the surface refuse heap beside an open entrance, else a midden chamber that is too close (the
// architect dug it there; better than none). With none of these (a young nest closed by its plug or by rain) there
// is nowhere to take it: the waste stays in the garden (W, so contamination sees it) and nobody picks it up.

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, Nest, Sim } from '@/sim/types';
import { floorPoint } from '@/sim/ants/behaviours/nest/places';
import { perTick } from '@/sim/ants/behaviours/nest/perTick';
import { MIDDEN_DIRECTIONS, MIDDEN_DIST_BU } from '@/sim/balance/nestwork';
import { WASTE_DUMP_MIN_BU } from '@/sim/balance/species-leafcutter';

/** Gap between a chamber's centre and the nearest point of a fungus chamber's ellipsoid (approximate), mm. */
function gapToFungus(nest: Nest, c: Chamber): number {
  let gap = Infinity;
  for (const f of nest.chambers) {
    if (f.type !== 'fungus' || f.id === c.id) continue;
    const dx = c.center.x - f.center.x, dy = c.center.y - f.center.y, dz = c.center.z - f.center.z;
    const r = Math.max(f.radii.x, f.radii.y, f.radii.z);
    gap = Math.min(gap, Math.sqrt(dx * dx + dy * dy + dz * dz) - r);
  }
  return gap;
}

/** The surface heap beside the first open entrance: the lowest unblocked point on a ring around it. */
function heapPoint(sim: Sim, nest: Nest, out: Vec3): Vec3 | null {
  const e = nest.entrances.find((x) => x.status === 'open');
  if (!e) return null;
  const r = MIDDEN_DIST_BU * sim.world.bu;
  let bestY = Infinity, found = false;
  for (let k = 0; k < MIDDEN_DIRECTIONS; k++) {
    const a = (k / MIDDEN_DIRECTIONS) * 2 * Math.PI;
    const x = e.pos.x + Math.cos(a) * r, z = e.pos.z + Math.sin(a) * r;
    if (x < 0 || z < 0 || x > sim.world.size || z > sim.world.size || sim.navGrid.blocked(x, z)) continue;
    const y = sim.field.height(x, z);
    if (y < bestY - 1e-9) { bestY = y; out.x = x; out.y = y; out.z = z; found = true; }
  }
  return found ? out : null;
}

function compute(sim: Sim, nest: Nest): Vec3 | null {
  const min = WASTE_DUMP_MIN_BU * sim.world.bu;
  const middens = nest.chambers.filter((c) => c.type === 'midden');
  const far = middens.find((c) => gapToFungus(nest, c) >= min);
  if (far) return floorPoint(far, 0, 0, { x: 0, y: 0, z: 0 });
  const heap = heapPoint(sim, nest, { x: 0, y: 0, z: 0 });
  if (heap) return heap;
  return middens.length > 0 ? floorPoint(middens[0], 0, 0, { x: 0, y: 0, z: 0 }) : null;
}

/** The garden-waste dump point of a nest now (memoised per tick), copied into `out`; null = nowhere. */
export function wasteDumpPoint(sim: Sim, nest: Nest, out: Vec3): Vec3 | null {
  const p = perTick(sim, `at.dump:${nest.id}`, () => compute(sim, nest));
  if (!p) return null;
  out.x = p.x; out.y = p.y; out.z = p.z;
  return out;
}
