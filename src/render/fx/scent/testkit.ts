// Test support for the scent view (never imported by game code): a synthetic cell source and a flat-ground snapper.
import type { PheroCellVisitor, PheroChannel } from '@/sim/types';
import type { ScentCellSource, SurfaceSnapper } from './ScentCache';

/** Cells per (colony, channel) as flat [x, y, z, value] arrays (cell centres, mm). */
export class FakeCells implements ScentCellSource {
  readonly layers = new Map<string, number[]>();
  private versions = new Map<string, number>();

  set(colony: number, channel: PheroChannel, cells: number[]): void {
    const k = `${colony}:${channel}`;
    this.layers.set(k, cells);
    this.versions.set(k, (this.versions.get(k) ?? 0) + 1);
  }

  forEachActiveCell(colony: number, channel: PheroChannel, fn: PheroCellVisitor): number {
    const a = this.layers.get(`${colony}:${channel}`);
    if (!a) return 0;
    for (let i = 0; i < a.length; i += 4) fn(a[i], a[i + 1], a[i + 2], a[i + 3]);
    return a.length / 4;
  }

  layerVersion(colony: number, channel: PheroChannel): number {
    return this.versions.get(`${colony}:${channel}`) ?? 0;
  }
}

/** Ground at y = 0 (normal +Y); fails above `maxY`. */
export function flatSnapper(maxY = Infinity): SurfaceSnapper {
  return {
    snap(x, y, z, outPos, outNrm) {
      if (y > maxY) return false;
      outPos.x = x; outPos.y = 0; outPos.z = z;
      outNrm.x = 0; outNrm.y = 1; outNrm.z = 0;
      return true;
    },
  };
}

/** A straight line of n cells along +x from x0 at y = cell / 2 (cell centres), value v each. */
export function lineCells(cell: number, x0: number, n: number, v: number, z = cell / 2): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(x0 + (i + 0.5) * cell, cell / 2, z, v);
  return out;
}
