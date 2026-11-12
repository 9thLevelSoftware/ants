// Remembers where the colony carved recently (GDD 08 11.5: freshly carved walls look darker and damper for one game
// hour). Rebuilt chunks bake the carving tick per vertex; the shader fades the look with the current tick, so no
// rebuild is needed when it expires.
import type { CarveEdit } from '../simAdapter';
import { NOT_FRESH } from '../mesh/chunkBuild';

interface Entry { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number; tick: number }

export class FreshWalls {
  private entries: Entry[] = [];

  constructor(private readonly durationTicks: number, private readonly padMm: number) {}

  add(e: CarveEdit, tick: number): void {
    if (e.kind !== 'carve') return;
    const p = this.padMm;
    this.entries.push({ x0: e.x0 - p, y0: e.y0 - p, z0: e.z0 - p, x1: e.x1 + p, y1: e.y1 + p, z1: e.z1 + p, tick });
  }

  /** Drops entries older than the fresh look. */
  prune(tick: number): void {
    if (this.entries.length && this.entries[0].tick < tick - this.durationTicks) {
      this.entries = this.entries.filter((e) => e.tick >= tick - this.durationTicks);
    }
  }

  clear(): void {
    this.entries.length = 0;
  }

  get size(): number {
    return this.entries.length;
  }

  /** Newest carving tick at a point, or NOT_FRESH. */
  readonly carvedAt = (x: number, y: number, z: number): number => {
    let t = NOT_FRESH;
    for (const e of this.entries) {
      if (e.tick > t && x >= e.x0 && x <= e.x1 && y >= e.y0 && y <= e.y1 && z >= e.z0 && z <= e.z1) t = e.tick;
    }
    return t;
  };
}
