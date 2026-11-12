// Analytic surface levels of built zones (GDD 04 §2.2 levels, §2.1 falls), mm.

import type { BuiltShape, Layout, Rect } from '../layout/types';
import { LEVELS } from '../tuning/terrain';
import { inward } from '../layout/geom';

/** Distance from (x, z) to the rect edge facing `toward` (inside the rect). */
function distFromEdge(r: Rect, edge: 'x0' | 'x1' | 'z0' | 'z1', x: number, z: number): number {
  return edge === 'x0' ? x - r.x0 : edge === 'x1' ? r.x1 - x : edge === 'z0' ? z - r.z0 : r.z1 - z;
}

/** Edge of rect `r` that touches rect `o` (shared boundary), or null. */
function sharedEdge(r: Rect, o: Rect): 'x0' | 'x1' | 'z0' | 'z1' | null {
  const eps = 1;
  const zOver = Math.min(r.z1, o.z1) - Math.max(r.z0, o.z0) > eps, xOver = Math.min(r.x1, o.x1) - Math.max(r.x0, o.x0) > eps;
  if (zOver && Math.abs(r.x0 - o.x1) < eps) return 'x0';
  if (zOver && Math.abs(r.x1 - o.x0) < eps) return 'x1';
  if (xOver && Math.abs(r.z0 - o.z1) < eps) return 'z0';
  if (xOver && Math.abs(r.z1 - o.z0) < eps) return 'z1';
  return null;
}

/** Inner long edge of a band shape (the edge away from its map side). */
function innerEdge(side: BuiltShape['side']): 'x0' | 'x1' | 'z0' | 'z1' {
  return side === 'x0' ? 'x1' : side === 'x1' ? 'x0' : side === 'z0' ? 'z1' : 'z0';
}

/**
 * Level of a built shape at (x, z). `smooth` is the smooth natural level there (paths follow it).
 * L: map side, mm.
 */
export function builtLevel(lay: Layout, s: BuiltShape, x: number, z: number, smooth: number, L: number): number {
  const r = s.rect;
  switch (s.kind) {
    case 'interior': return LEVELS.slabUnderside;
    case 'path': return smooth;
    case 'sand': return LEVELS.sandSurface;
    case 'rubber': return LEVELS.rubberSurface;
    case 'driveway': return LEVELS.drivewaySurface;
    case 'patio': {
      const side = lay.facadeSide;
      const stripDepth = lay.house ? inward(lay.house.side, (lay.house.strip.x0 + lay.house.strip.x1) / 2, (lay.house.strip.z0 + lay.house.strip.z1) / 2, L) * 2 : 0;
      const d = side ? Math.max(0, inward(side, x, z, L) - stripDepth) : 0;
      return LEVELS.patioTop - d * LEVELS.patioFall;
    }
    case 'sidewalk': {
      const cp = lay.carPark;
      const e = cp && r ? sharedEdge(r, cp.rect) : null;
      const d = e && r ? distFromEdge(r, e, x, z) : 0;
      return LEVELS.sidewalkTop + d * LEVELS.sidewalkFall;
    }
    case 'car-park': {
      const d = r ? distFromEdge(r, innerEdge(s.side), x, z) : 0;
      return kerbRamp(d, LEVELS.carParkSurface + d * LEVELS.asphaltFall);
    }
    case 'lane': {
      const d = r ? distFromEdge(r, innerEdge(s.side), x, z) : 0;
      const half = r ? Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2 : 0;
      return kerbRamp(d, LEVELS.laneSurface + Math.min(d, half) * LEVELS.asphaltFall);
    }
  }
}

/** Road level `road` at distance d from the kerb line, ramped smoothly up to the kerb top within the kerb width. */
function kerbRamp(d: number, road: number): number {
  if (d >= LEVELS.kerbRamp) return road;
  const t = Math.max(0, d / LEVELS.kerbRamp), s = t * t * (3 - 2 * t);
  return LEVELS.kerbTop + (road - LEVELS.kerbTop) * s;
}

/** Level natural ground blends to next to a built shape (kerb top beside roads, ground outside the house). */
export function blendLevel(s: BuiltShape, level: number): number {
  if (s.kind === 'car-park' || s.kind === 'lane') return LEVELS.kerbTop;
  if (s.kind === 'interior') return LEVELS.houseOutside;
  return level;
}
