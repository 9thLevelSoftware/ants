// What the founding chamber shot (render/camera/foundingShot.ts) looks at: the queen's cell, where the colony's life is. Pure reads of the
// sim, nothing allocated per call but the out record, so the camera can ask every frame.
//
// The centre is the queen and her brood, not the fitted chamber record: in a real founding the queen lays in the throat of the shaft,
// above and away from the cavity the chamber detection reports (look pass 5, firstplay seed 1: queen at y +4.5 mm, chamber centre at
// y -11 mm, 18 mm apart), and a cut through the chamber shows nothing of her. The chamber is the fallback (no queen, no brood left).
import { foundingNest } from '@/sim/colony/founding';
import { FSHOT_CUT_ABOVE_BU, type FoundingShotSubject } from '@/render/camera';
import type { Sim } from '@/sim/types';

/** First workers within this many BU of the cell's centre count as being in it (the others went out or stay deeper down). */
const WORKER_REACH_BU = 10;
/** Room added to the spread of the animals, BU. */
const SPREAD_PAD_BU = 1;
/** With nothing but a chamber record to go on, the cell is taken to be this high (BU, half height) when it says nothing else. */
const FALLBACK_HALF_HEIGHT_BU = 1.5;

export function foundingShotSubject(sim: Sim, out: FoundingShotSubject): FoundingShotSubject | null {
  const st = sim.state, col = st.player.colonyId, bu = sim.world.bu;
  const queenId = sim.stores.colonies.get(col)?.queenId;
  const q = queenId !== undefined && queenId >= 0 ? sim.stores.ants.get(queenId) : undefined;
  // the core: the queen (alive or her body) and the brood in the cell
  let n = 0, sx = 0, sy = 0, sz = 0, top = -Infinity;
  const core = (x: number, y: number, z: number): void => { n++; sx += x; sy += y; sz += z; if (y > top) top = y; };
  if (q) core(q.pos.x, q.pos.y, q.pos.z);
  for (const b of st.brood) if (b.alive && b.colony === col && b.carriedBy < 0) core(b.pos.x, b.pos.y, b.pos.z);
  if (n === 0) {
    const nest = foundingNest(sim);
    const ch = nest?.chambers.length ? nest.chambers.reduce((a, b) => (b.volume > a.volume ? b : a)) : null;
    if (!ch) return null;
    out.x = ch.center.x; out.y = ch.center.y; out.z = ch.center.z;
    out.radius = Math.max(ch.radii.x, ch.radii.z) + SPREAD_PAD_BU * bu;
    out.cutY = ch.center.y + FALLBACK_HALF_HEIGHT_BU * bu;
    return out;
  }
  const cx = sx / n, cy = sy / n, cz = sz / n;
  let spread = 0;
  const widen = (x: number, y: number, z: number): void => { const d = Math.hypot(x - cx, y - cy, z - cz); if (d > spread) spread = d; };
  if (q) widen(q.pos.x, q.pos.y, q.pos.z);
  for (const b of st.brood) if (b.alive && b.colony === col && b.carriedBy < 0) widen(b.pos.x, b.pos.y, b.pos.z);
  const reach = WORKER_REACH_BU * bu;
  for (const a of st.ants) {
    if (!a.alive || a.colony !== col || a.id === queenId) continue;
    if (Math.hypot(a.pos.x - cx, a.pos.y - cy, a.pos.z - cz) <= reach) widen(a.pos.x, a.pos.y, a.pos.z);
  }
  out.x = cx; out.y = cy; out.z = cz;
  out.radius = spread + SPREAD_PAD_BU * bu;
  // the plane passes just above the queen's and the brood's backs (an animal above the plane is cut away with the soil; the fitted chamber
  // is no limit, see the header)
  out.cutY = top + FSHOT_CUT_ABOVE_BU * bu;
  return out;
}
