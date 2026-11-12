// Region shapes for wipes (human-event footprints): containment of a cell centre and integer cell bounds.

import type { PheroRegion } from '@/sim/types';

export interface CellBox {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}

/** A prepared containment test (yaw sine/cosine precomputed). */
export type RegionTest = (x: number, y: number, z: number) => boolean;

export function regionTest(r: PheroRegion): RegionTest {
  const c = r.center;
  switch (r.kind) {
    case 'sphere': {
      const rr = r.radius * r.radius;
      return (x, y, z) => {
        const dx = x - c.x, dy = y - c.y, dz = z - c.z;
        return dx * dx + dy * dy + dz * dz <= rr;
      };
    }
    case 'cylinder': {
      const rr = r.radius * r.radius, hh = r.halfHeight;
      return (x, y, z) => {
        const dx = x - c.x, dz = z - c.z;
        return Math.abs(y - c.y) <= hh && dx * dx + dz * dz <= rr;
      };
    }
    case 'box': {
      const co = Math.cos(r.yaw ?? 0), si = Math.sin(r.yaw ?? 0);
      const hx = r.halfX, hy = r.halfY, hz = r.halfZ;
      // Local frame: world = R_y(yaw) * local, so local = R_y(-yaw) * (world - centre).
      return (x, y, z) => {
        const dx = x - c.x, dz = z - c.z;
        const lx = co * dx - si * dz, lz = si * dx + co * dz;
        return Math.abs(lx) <= hx && Math.abs(y - c.y) <= hy && Math.abs(lz) <= hz;
      };
    }
  }
}

/** Axis-aligned world-mm extent of a region: [minX, minY, minZ, maxX, maxY, maxZ] into out. */
export function regionExtent(r: PheroRegion, out: Float64Array): void {
  const c = r.center;
  let ex: number, ey: number, ez: number;
  switch (r.kind) {
    case 'sphere': ex = ey = ez = r.radius; break;
    case 'cylinder': ex = ez = r.radius; ey = r.halfHeight; break;
    case 'box': {
      const co = Math.abs(Math.cos(r.yaw ?? 0)), si = Math.abs(Math.sin(r.yaw ?? 0));
      ex = co * r.halfX + si * r.halfZ;
      ez = si * r.halfX + co * r.halfZ;
      ey = r.halfY;
      break;
    }
  }
  out[0] = c.x - ex; out[1] = c.y - ey; out[2] = c.z - ez;
  out[3] = c.x + ex; out[4] = c.y + ey; out[5] = c.z + ez;
}

/** Integer cells whose centres can lie inside [min, max] (cell edge in mm). */
export function cellBoxOf(ext: Float64Array, cell: number, out: CellBox): void {
  out.x0 = Math.ceil(ext[0] / cell - 0.5); out.x1 = Math.floor(ext[3] / cell - 0.5);
  out.y0 = Math.ceil(ext[1] / cell - 0.5); out.y1 = Math.floor(ext[4] / cell - 0.5);
  out.z0 = Math.ceil(ext[2] / cell - 0.5); out.z1 = Math.floor(ext[5] / cell - 0.5);
}

/** Clips a cell box to [-limit, limit - 1] on every axis (the chunk-key range; may leave it empty). */
export function clampCellBox(b: CellBox, limit: number): void {
  if (b.x0 < -limit) b.x0 = -limit;
  if (b.y0 < -limit) b.y0 = -limit;
  if (b.z0 < -limit) b.z0 = -limit;
  if (b.x1 > limit - 1) b.x1 = limit - 1;
  if (b.y1 > limit - 1) b.y1 = limit - 1;
  if (b.z1 > limit - 1) b.z1 = limit - 1;
}

/** Number of cells in a box (0 if empty). */
export function cellBoxSize(b: CellBox): number {
  if (b.x1 < b.x0 || b.y1 < b.y0 || b.z1 < b.z0) return 0;
  return (b.x1 - b.x0 + 1) * (b.y1 - b.y0 + 1) * (b.z1 - b.z0 + 1);
}

export function regionValid(r: PheroRegion): boolean {
  const c = r.center;
  if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) return false;
  switch (r.kind) {
    case 'sphere': return r.radius >= 0 && Number.isFinite(r.radius);
    case 'cylinder': return r.radius >= 0 && r.halfHeight >= 0 && Number.isFinite(r.radius + r.halfHeight);
    case 'box': return r.halfX >= 0 && r.halfY >= 0 && r.halfZ >= 0 && Number.isFinite(r.halfX + r.halfY + r.halfZ);
    default: return false;
  }
}
