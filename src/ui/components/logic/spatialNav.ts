// Spatial focus navigation for gamepad D-pad / stick (GDD 08 section 8): from the focused element, pick the
// nearest focusable in the pressed direction. Pure geometry on rectangles.
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Dir = 'up' | 'down' | 'left' | 'right';

/**
 * Index of the best candidate in direction `dir` from rect `from`, or -1. A candidate must lie mostly beyond the
 * current rectangle's edge in that direction; the score prefers small distance along the axis and small
 * misalignment across it (cross-axis offset counts double so rows and columns feel natural).
 */
export function pickSpatial(from: Rect, candidates: readonly Rect[], dir: Dir): number {
  const cx = from.x + from.w / 2, cy = from.y + from.h / 2;
  let best = -1, bestScore = Infinity;
  for (let i = 0; i < candidates.length; i++) {
    const r = candidates[i];
    const rx = r.x + r.w / 2, ry = r.y + r.h / 2;
    let along: number, across: number, beyond: boolean;
    switch (dir) {
      case 'right': along = rx - cx; across = Math.abs(ry - cy); beyond = r.x + r.w / 2 > from.x + from.w - 1; break;
      case 'left': along = cx - rx; across = Math.abs(ry - cy); beyond = r.x + r.w / 2 < from.x + 1; break;
      case 'down': along = ry - cy; across = Math.abs(rx - cx); beyond = r.y + r.h / 2 > from.y + from.h - 1; break;
      case 'up': along = cy - ry; across = Math.abs(rx - cx); beyond = r.y + r.h / 2 < from.y + 1; break;
    }
    if (!beyond || along <= 0) continue;
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  }
  return best;
}
