// Step 10 — start pose of the dealate queen (GDD 04 §12.5): maximise 0.5 (good sites within 250 BU, capped 4)/4
// + 0.3 shelter + 0.2 (1 - exposure) over outdoor, non-asphalt, walkable cells with flood risk <= 0.3, not
// themselves good, >= 300 BU from the map edge. The best candidates are re-checked with path distances so the
// chosen pose satisfies v-found. Built-in placer 'default/start-pose' (worldgen-life may replace it).

import type { GenContext } from '../kit/context';
import type { PlacerDef } from '../kit/registry';
import { supportAt } from '../kit/surface';
import { qmm } from '../kit/quantize';
import { mapState } from './state';
import { walkable } from './nav';
import { navDistances } from '../validate/graph';
import { SUIT } from '../tuning/maps';
import { START, VALID } from '../tuning/pipeline';

interface Cand { c: number; score: number; good: number }

function candidates(ctx: GenContext, relaxGood: boolean): Cand[] {
  const { navN, navCell, size: L, bu } = ctx.dims;
  const st = mapState(ctx);
  const w = ctx.world, lay = ctx.layout;
  const q = st.q[ctx.params.speciesId];
  const nn = navN * navN;
  // summed-area table of good cells for the window count
  const sat = new Int32Array((navN + 1) * (navN + 1));
  for (let k = 0; k < navN; k++) for (let i = 0; i < navN; i++) {
    sat[(k + 1) * (navN + 1) + i + 1] = (q[k * navN + i] >= SUIT.good ? 1 : 0) + sat[k * (navN + 1) + i + 1] + sat[(k + 1) * (navN + 1) + i] - sat[k * (navN + 1) + i];
  }
  const r = Math.max(1, Math.round((VALID.startRadiusBu * bu) / navCell));
  const edge = VALID.startEdgeMinBu * bu;
  const out: Cand[] = [];
  for (let c = 0; c < nn; c++) {
    const i = c % navN, k = Math.floor(c / navN);
    const x = (i + 0.5) * navCell, z = (k + 0.5) * navCell;
    if (x < edge || z < edge || x > L - edge || z > L - edge) continue;
    if (!walkable(w.nav.cls.data[c])) continue;
    const zt = lay.zones[lay.nav[c]].type;
    if (zt === 'interior' || zt === 'asphalt') continue;
    if (st.water.flood[c] > VALID.startFloodMax) continue;
    if (!relaxGood && q[c] >= SUIT.good) continue;
    const i0 = Math.max(0, i - r), i1 = Math.min(navN, i + r + 1), k0 = Math.max(0, k - r), k1 = Math.min(navN, k + r + 1);
    const good = sat[k1 * (navN + 1) + i1] - sat[k0 * (navN + 1) + i1] - sat[k1 * (navN + 1) + i0] + sat[k0 * (navN + 1) + i0];
    if (good === 0) continue;
    const shelter = w.maps.shelter.data[c] / 255, exposure = st.surface.exposure[c];
    out.push({ c, good, score: START.wGood * Math.min(good, START.goodCap) / START.goodCap + START.wShelter * shelter + START.wExposure * (1 - exposure) });
  }
  // ties (the good-site term is capped): more good sites in the window first, then cell index
  return out.sort((a, b) => b.score - a.score || b.good - a.good || a.c - b.c);
}

/** Good cells within the start radius (path distance) of cell c, and the nearest one. */
export function goodNear(ctx: GenContext, c: number): { count: number; nearest: number } {
  const q = mapState(ctx).q[ctx.params.speciesId];
  const d = navDistances(ctx, [c], { maxBu: VALID.startRadiusBu });
  let count = 0, nearest = -1;
  for (let j = 0; j < d.length; j++) {
    if (q[j] < SUIT.good || !(d[j] <= VALID.startRadiusBu)) continue;
    count++;
    if (nearest < 0 || d[j] < d[nearest]) nearest = j;
  }
  return { count, nearest };
}

export function placeStartPose(ctx: GenContext): void {
  const { navN, navCell } = ctx.dims;
  let list = candidates(ctx, false);
  if (list.length === 0) { list = candidates(ctx, true); ctx.notes.push('start: no non-good candidate, relaxed'); }
  if (list.length === 0) { ctx.notes.push('start: no candidate'); return; }
  let pick = list[0].c, pickNear = -1, pickCount = -1;
  for (const cand of list.slice(0, START.candidates)) {
    const g = goodNear(ctx, cand.c);
    if (g.count > pickCount) { pick = cand.c; pickCount = g.count; pickNear = g.nearest; }
    if (g.count >= VALID.startGoodMin) break;
  }
  const x = ((pick % navN) + 0.5) * navCell, z = (Math.floor(pick / navN) + 0.5) * navCell;
  let fx = 1, fz = 0;
  if (pickNear >= 0) {
    const tx = ((pickNear % navN) + 0.5) * navCell - x, tz = (Math.floor(pickNear / navN) + 0.5) * navCell - z;
    const l = Math.sqrt(tx * tx + tz * tz);
    if (l > 0) { fx = tx / l; fz = tz / l; }
  }
  ctx.world.queenStart = { pos: { x: qmm(x), y: qmm(supportAt(ctx, x, z)), z: qmm(z) }, fwd: { x: Math.round(fx * 1e6) / 1e6, y: 0, z: Math.round(fz * 1e6) / 1e6 } };
}

export const startPlacer: PlacerDef = { id: 'default/start-pose', step: 'start', order: -100, run: placeStartPose };
