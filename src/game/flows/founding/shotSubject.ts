// What the founding chamber shot looks at (render/camera/foundingShot.ts): the queen's cell with whoever is in it. Pure
// reads of the sim, no allocation per call beyond the out record, so the camera can ask every frame.
import { foundingNest } from '@/sim/colony/founding';
import { FSHOT_CUT_ABOVE_BU, FSHOT_CUT_MAX_OF_RADIUS, type FoundingShotSubject } from '@/render/camera';
import type { Sim } from '@/sim/types';

/** Things further than this many chamber radii from the cell's centre are not "in the cell" (the first workers go out and forage). */
const IN_CELL_REACH = 1.8;
/** The shot centre sits this fraction of the chamber's vertical radius below its centre (the floor is where they stand). */
const CENTRE_DROP = 0.3;
/** Room added to the spread of the animals, BU. */
const SPREAD_PAD_BU = 1;
/** With no chamber on record (a lone queen), her cell is taken to be this high above her back, BU. */
const NO_CHAMBER_ROOF_BU = 2;

export function foundingShotSubject(sim: Sim, out: FoundingShotSubject): FoundingShotSubject | null {
  const st = sim.state, col = st.player.colonyId, bu = sim.world.bu;
  const nest = foundingNest(sim);
  const ch = nest?.chambers.length ? nest.chambers.reduce((a, b) => (b.volume > a.volume ? b : a)) : null;
  const queen = sim.stores.colonies.get(col)?.queenId;
  const q = queen !== undefined && queen >= 0 ? sim.stores.ants.get(queen) : undefined;
  if (!ch && !q) return null;
  const cx = ch ? ch.center.x : q!.pos.x, cz = ch ? ch.center.z : q!.pos.z, cy = ch ? ch.center.y : q!.pos.y;
  const ry = ch ? ch.radii.y : NO_CHAMBER_ROOF_BU * bu;
  const rh = ch ? Math.max(ch.radii.x, ch.radii.z) : 0;
  const reach = Math.max(rh, 2 * bu) * IN_CELL_REACH;
  let spread = 0, top = -Infinity;
  const take = (x: number, y: number, z: number): void => {
    const dx = x - cx, dy = y - cy, dz = z - cz, d = Math.hypot(dx, dy, dz);
    if (Math.hypot(dx, dz) > reach || Math.abs(dy) > reach) return;
    if (d > spread) spread = d;
    if (y > top) top = y;
  };
  for (const a of st.ants) if (a.alive && a.colony === col) take(a.pos.x, a.pos.y, a.pos.z);
  for (const b of st.brood) if (b.alive && b.colony === col && b.carriedBy < 0) take(b.pos.x, b.pos.y, b.pos.z);
  out.x = cx; out.z = cz;
  out.y = cy - CENTRE_DROP * ry;
  out.radius = Math.max(rh, spread) + SPREAD_PAD_BU * bu;
  // the plane passes through the cell: above the animals' backs, never above the roof
  const want = Math.max(cy, top + FSHOT_CUT_ABOVE_BU * bu);
  out.cutY = Math.max(cy - 0.5 * ry, Math.min(cy + FSHOT_CUT_MAX_OF_RADIUS * ry, want));
  return out;
}
