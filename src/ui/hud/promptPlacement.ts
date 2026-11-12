// Where a context prompt may sit (GDD 08 5.3): at its anchor, clamped inside the viewport, and moved off the other HUD
// regions it would cover (alert cards, the inspect card, the colony pulse ...). Pure geometry, no DOM.

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

const overlaps = (a: Rect, b: Rect, gap: number): boolean =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

const areaOver = (a: Rect, b: Rect): number => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};

/**
 * The position nearest to `want` where a box of `size` is inside `bounds` (with `margin`) and clear of every `keepOut`
 * rectangle by `gap`. Candidates are the wanted spot and the places just beside, above and below each region (in every
 * combination, so a box can go "right of the pulse and below the card"). When no clear place exists (a very small
 * window) the candidate that covers the least is used: a prompt that covers a little is better than none.
 */
export function placeAvoiding(want: Point, size: { w: number; h: number }, bounds: { w: number; h: number }, margin: number, keepOut: readonly Rect[], gap = 8): Point {
  const maxX = Math.max(margin, bounds.w - size.w - margin);
  const maxY = Math.max(margin, bounds.h - size.h - margin);
  const clampX = (x: number): number => Math.min(Math.max(x, margin), maxX);
  const clampY = (y: number): number => Math.min(Math.max(y, margin), maxY);
  const start: Point = { x: clampX(want.x), y: clampY(want.y) };
  if (keepOut.length === 0) return start;
  const covered = (x: number, y: number, slack: number): number => {
    let sum = 0;
    for (const r of keepOut) sum += areaOver({ x, y, w: size.w, h: size.h }, { x: r.x - slack, y: r.y - slack, w: r.w + 2 * slack, h: r.h + 2 * slack });
    return sum;
  };
  if (covered(start.x, start.y, gap) === 0) return start;
  const xs = [start.x], ys = [start.y];
  for (const r of keepOut) {
    xs.push(clampX(r.x + r.w + gap), clampX(r.x - size.w - gap));
    ys.push(clampY(r.y + r.h + gap), clampY(r.y - size.h - gap));
  }
  let best = start;
  let bestCover = covered(start.x, start.y, 0) + 1; // every candidate must beat the wanted spot
  let bestD = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const c = covered(x, y, gap);
      const d = (x - start.x) ** 2 + (y - start.y) ** 2;
      const cover = c === 0 ? 0 : covered(x, y, 0) + 1; // a clear box beats any that covers something
      if (cover < bestCover || (cover === bestCover && d < bestD)) { best = { x, y }; bestCover = cover; bestD = d; }
    }
  }
  return best;
}
