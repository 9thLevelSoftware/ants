// The micro-connection guarantee (GDD 04 §6.3): evaluate usefulness on the nav grid; while the map has fewer
// than MICRO_USEFUL_MIN (4 / 6 / 8 by size) useful connections, insert a targeted connection under the
// separating barrier where it saves most walking (kerb-gap, fence-gap, wall-crevice by barrier type, else a
// root channel). The placers roll their own sockets with their probabilities; none are left closed to open, so
// step 3 of the algorithm has nothing to do here. If still short, v-micro fails and the pipeline regenerates.

import type { MicroKind } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { primIndex } from '../kit/surface';
import { provide } from '../kit/records';
import { walkable } from '../maps/nav';
import { navDistanceTo, portals } from '../validate/graph';
import { evaluateMicro } from '../validate/micro';
import { MICRO } from '../tuning/pipeline';
import { carveChannel } from './channel';
import { navCentre, objectById } from './common';
import { MICRO_INSERT } from './tuning';

interface Crossing { a: number; b: number; cells: number; gain: number }

const KIND_BY_TEMPLATE: Record<string, MicroKind> = {
  fence: 'fence-gap', kerb: 'kerb-gap', 'edging-kerb': 'kerb-gap', 'garden-wall': 'wall-crevice', 'sand-edging': 'root-channel',
};

/** Kind of connection for the barrier between two cells (the object standing in the middle). */
function kindAt(ctx: GenContext, a: number, b: number): MicroKind {
  const pa = navCentre(ctx, a), pb = navCentre(ctx, b);
  const x = (pa.x + pb.x) / 2, z = (pa.z + pb.z) / 2, r = ctx.dims.navCell;
  const ix = primIndex(ctx);
  const hits: number[] = [];
  ix.query(x - r, z - r, x + r, z + r, hits);
  for (const h of hits) {
    const ob = objectById(ctx, ix.entries[h].prim.objectId);
    const k = ob ? KIND_BY_TEMPLATE[ob.templateId] : undefined;
    if (k) return k;
  }
  return 'root-channel';
}

/** Straight crossings of 1..maxCells non-walkable cells between two outdoor walkable cells, with their gain. */
function crossings(ctx: GenContext, taken: { x: number; z: number }[]): Crossing[] {
  const { navN, navCell, bu } = ctx.dims;
  const cls = ctx.world.nav.cls.data, lay = ctx.layout;
  const outdoor = (c: number) => walkable(cls[c]) && lay.zones[lay.nav[c]].type !== 'interior';
  const ports = portals(ctx);
  const out: Crossing[] = [];
  const spread = 200 * bu;
  for (let k = 0; k < navN; k += MICRO_INSERT.sampleStride) for (let i = 0; i < navN; i += MICRO_INSERT.sampleStride) {
    const a = k * navN + i;
    if (!outdoor(a)) continue;
    for (const [di, dk] of [[1, 0], [0, 1]] as const) {
      let n = 1;
      while (n <= MICRO_INSERT.maxCells + 1) {
        const x = i + di * n, z = k + dk * n;
        if (x >= navN || z >= navN) { n = Infinity; break; }
        if (walkable(cls[z * navN + x])) break;
        n++;
      }
      if (n < 2 || n > MICRO_INSERT.maxCells + 1) continue;
      const b = (k + dk * n) * navN + (i + di * n);
      if (!outdoor(b)) continue;
      const pa = navCentre(ctx, a);
      if (taken.some((t) => (t.x - pa.x) ** 2 + (t.z - pa.z) ** 2 < spread * spread)) continue;
      const len = (n * navCell) / bu;
      const limit = MICRO.shortcutRatio * len;
      const d = navDistanceTo(ctx, a, b, { maxBu: 4 * limit }, ports);
      if (d < limit) continue;
      out.push({ a, b, cells: n - 1, gain: Number.isFinite(d) ? d / len : 1e9 });
    }
  }
  return out.sort((x, y) => y.gain - x.gain || x.cells - y.cells || x.a - y.a);
}

/** Resources step, first: brings the useful connections to the minimum. */
export function ensureMicro(ctx: GenContext): void {
  provide(ctx, 'micro');
  const need = MICRO.usefulMin[ctx.params.sizeClass];
  let useful = evaluateMicro(ctx);
  const taken: { x: number; z: number }[] = [];
  for (let added = 0; useful < need && added < MICRO_INSERT.maxAdded; added++) {
    const best = crossings(ctx, taken)[0];
    if (!best) break;
    const kind = kindAt(ctx, best.a, best.b);
    if (!carveChannel(ctx, { a: best.a, b: best.b, kind, reason: 'inserted (guarantee)', radiusBu: MICRO_INSERT.radiusBu, depthBu: MICRO_INSERT.depthBu })) break;
    taken.push(navCentre(ctx, best.a));
    ctx.notes.push(`micro: inserted ${kind} (gain ${best.gain >= 1e9 ? 'only path' : best.gain.toFixed(1)})`);
    useful = evaluateMicro(ctx);
  }
}
