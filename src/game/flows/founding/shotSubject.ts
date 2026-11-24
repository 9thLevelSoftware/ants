// What the founding chamber shot (render/camera/foundingShot.ts) looks at: the queen's cell, where the colony's life is. Pure reads of the
// sim, nothing stored between calls (the camera asks every frame and eases what it gets, ViewDirector.nextShotSubject).
//
// The centre is the queen and her brood, not the fitted chamber record: in a real founding the queen lays in the throat of the shaft,
// above and away from the cavity the chamber detection reports (look pass 5, firstplay seed 1: queen at y +4.5 mm, chamber centre at
// y -11 mm, 18 mm apart), and a cut through the chamber shows nothing of her. The chamber is the fallback (no queen, no brood left).
import { foundingNest } from '@/sim/colony/founding';
import { FSHOT_CUT_ABOVE_BU, type FoundingShotSubject } from '@/render/camera';
import type { Sim } from '@/sim/types';

/**
 * First workers close to the cell's centre count as being in it (the others went out or stay deeper down): in full up to this many BU,
 * fading to nothing at WORKER_REACH_BU, so a worker walking across the edge widens the frame gradually, never in one step.
 */
const WORKER_FULL_BU = 7;
const WORKER_REACH_BU = 10;
/** A worker above the slice plane is cut away with the soil, so it does not count; it fades out over this height (BU) above the plane. */
const WORKER_ABOVE_FADE_BU = 1;
/** Roof probe: the carve field is sampled upward from the queen in steps of this many BU, from this far above her reference point. */
const ROOF_STEP_BU = 0.1;
const ROOF_START_BU = 0.15;
/** The slice plane stays this far under the roof (BU). */
const ROOF_MARGIN_BU = 0.1;
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
  if (q) { n++; sx += q.pos.x; sy += q.pos.y; sz += q.pos.z; top = q.pos.y; }
  for (const b of st.brood) {
    if (!b.alive || b.colony !== col || b.carriedBy >= 0) continue;
    n++; sx += b.pos.x; sy += b.pos.y; sz += b.pos.z;
    if (b.pos.y > top) top = b.pos.y;
  }
  if (n === 0) {
    const nest = foundingNest(sim);
    const ch = nest?.chambers.length ? nest.chambers.reduce((a, b) => (b.volume > a.volume ? b : a)) : null;
    if (!ch) return null;
    out.x = ch.center.x; out.y = ch.center.y; out.z = ch.center.z;
    out.radius = Math.max(ch.radii.x, ch.radii.z) + SPREAD_PAD_BU * bu;
    out.cutY = ch.center.y + FALLBACK_HALF_HEIGHT_BU * bu;
    out.ant = undefined;
    return out;
  }
  const cx = sx / n, cy = sy / n, cz = sz / n;
  // the plane passes just above the queen's and the brood's backs (an animal above the plane is cut away with the soil; the fitted chamber
  // is no limit, see the header), but under the roof of the cell over the queen
  const cutY = top + FSHOT_CUT_ABOVE_BU * bu;
  const anchor = q ?? { pos: { x: cx, y: top, z: cz } };
  const roofY = roofUnder(sim, anchor.pos.x, anchor.pos.y, anchor.pos.z, bu, cutY);
  const planeY = Math.min(cutY, Math.max(roofY, top + ROOF_START_BU * bu));
  let spread = 0;
  const widen = (x: number, y: number, z: number, weight: number): void => {
    const d = Math.hypot(x - cx, y - cy, z - cz) * weight;
    if (d > spread) spread = d;
  };
  if (q) widen(q.pos.x, q.pos.y, q.pos.z, 1);
  for (const b of st.brood) if (b.alive && b.colony === col && b.carriedBy < 0) widen(b.pos.x, b.pos.y, b.pos.z, 1);
  for (const a of st.ants) {
    if (!a.alive || a.colony !== col || a.id === queenId) continue;
    const dx = a.pos.x - cx, dy = a.pos.y - cy, dz = a.pos.z - cz;
    const w = reachWeight(Math.hypot(dx, dy, dz) / bu) * aboveWeight((a.pos.y - planeY) / bu);
    if (w > 0) widen(a.pos.x, a.pos.y, a.pos.z, w);
  }
  out.x = cx; out.y = cy; out.z = cz;
  out.radius = spread + SPREAD_PAD_BU * bu;
  out.cutY = planeY;
  // the queen's frame: on a steep wall of the throat the view director shows the side view instead of the slice from above (look pass 6)
  out.ant = q ? { pos: q.pos, up: q.up, fwd: q.fwd, lengthMm: q.lengthBu * bu } : undefined;
  return out;
}

/** 1 up to WORKER_FULL_BU from the centre, 0 from WORKER_REACH_BU on, smooth between. */
function reachWeight(distBu: number): number {
  if (distBu <= WORKER_FULL_BU) return 1;
  if (distBu >= WORKER_REACH_BU) return 0;
  const t = (WORKER_REACH_BU - distBu) / (WORKER_REACH_BU - WORKER_FULL_BU);
  return t * t * (3 - 2 * t);
}

/** 1 at or under the plane, 0 WORKER_ABOVE_FADE_BU above it. */
function aboveWeight(heightAbovePlaneBu: number): number {
  return Math.min(1, Math.max(0, 1 - heightAbovePlaneBu / WORKER_ABOVE_FADE_BU));
}

/**
 * The highest slice height under the roof of the cell above (x, y, z): the carve field (positive in free space) is sampled upward from the
 * queen; the first solid sample ends the cell. Returns `limit` when the cell is open that far (or the sim has no field, as in small tests).
 */
function roofUnder(sim: Sim, x: number, y: number, z: number, bu: number, limit: number): number {
  const field = (sim as Partial<Sim>).field;
  if (!field) return limit;
  for (let h = y + ROOF_START_BU * bu; h <= limit; h += ROOF_STEP_BU * bu) {
    if (field.sampleXYZ(x, h, z) <= 0) return h - ROOF_MARGIN_BU * bu;
  }
  return limit;
}
