// A wall layer with openings, as few boxes as possible: the rectangle (along-wall a x height y) minus the
// openings is cut into horizontal bands at every opening edge, each band into the free intervals, and boxes of
// equal width in consecutive bands are merged. Openings are free space between primitives (directions §K).

/** Rectangle in wall coordinates: a along the wall, y height (mm). */
export interface Span2 { a0: number; a1: number; y0: number; y1: number }

const EPS = 1e-6;

/** Boxes covering `rect` minus `holes` (holes are clipped to the rect; zero-size pieces are dropped). */
export function partition(rect: Span2, holes: readonly Span2[]): Span2[] {
  const hs = holes
    .map((h) => ({ a0: Math.max(rect.a0, h.a0), a1: Math.min(rect.a1, h.a1), y0: Math.max(rect.y0, h.y0), y1: Math.min(rect.y1, h.y1) }))
    .filter((h) => h.a1 - h.a0 > EPS && h.y1 - h.y0 > EPS);
  const ys = uniqueSorted([rect.y0, rect.y1, ...hs.flatMap((h) => [h.y0, h.y1])]);
  const done: Span2[] = [];
  let open: Span2[] = [];
  for (let b = 0; b + 1 < ys.length; b++) {
    const y0 = ys[b], y1 = ys[b + 1];
    const cover = hs.filter((h) => h.y0 < y1 - EPS && h.y1 > y0 + EPS).map((h) => [h.a0, h.a1] as [number, number]);
    const free = complement(rect.a0, rect.a1, cover);
    const next: Span2[] = [];
    for (const [a0, a1] of free) {
      const k = open.findIndex((o) => Math.abs(o.a0 - a0) < EPS && Math.abs(o.a1 - a1) < EPS);
      if (k >= 0) { const o = open[k]; o.y1 = y1; next.push(o); open.splice(k, 1); }
      else next.push({ a0, a1, y0, y1 });
    }
    done.push(...open);
    open = next;
  }
  done.push(...open);
  return done.sort((p, q) => p.y0 - q.y0 || p.a0 - q.a0);
}

function uniqueSorted(v: number[]): number[] {
  const s = [...v].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (out.length === 0 || x - out[out.length - 1] > EPS) out.push(x);
  return out;
}

/** Free intervals of [lo, hi] not covered by the given intervals. */
function complement(lo: number, hi: number, cover: [number, number][]): [number, number][] {
  const c = [...cover].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let x = lo;
  for (const [a, b] of c) {
    if (a > x + EPS) out.push([x, Math.min(a, hi)]);
    x = Math.max(x, b);
    if (x >= hi - EPS) break;
  }
  if (hi - x > EPS) out.push([x, hi]);
  return out;
}

/** The band of width `w` around a hole (clipped to `rect`) minus the hole itself: a cavity closer. */
export function frameAround(rect: Span2, hole: Span2, w: number): Span2[] {
  const outer = { a0: Math.max(rect.a0, hole.a0 - w), a1: Math.min(rect.a1, hole.a1 + w), y0: Math.max(rect.y0, hole.y0 - w), y1: Math.min(rect.y1, hole.y1 + w) };
  return partition(outer, [hole]);
}
