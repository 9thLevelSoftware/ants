// Keeps the drawn copies of snapped primitives right while the world changes (look-pass 2, work item 3). The static
// layer is snapped once per world (groundSnap.ts). Two things happen afterwards that would leave a prop hanging in
// the air again: the sim moves an object (the moved copy is built from the unsnapped primitives), and the terrain
// changes under a prop (erosion, a dug-out mound, a collapse). This class snaps the moved copies and re-snaps the
// props on changed ground; both are drawn in the dynamic layer, which hides the static original of each id.
import type { Primitive } from '@/sim/types';
import { isSnappable, snapOne, snapPrimitivesToGround, type SnapStats } from './groundSnap';

type HeightAt = (x: number, z: number) => number;
/** A resnapped copy that differs from what the static layer drew by less than this is not worth a redraw, mm. */
const SAME_MM = 0.05;

export class SnapLayer {
  /** Snappable static primitives (unsnapped) and what the static layer drew for each. */
  private cand: Primitive[] = [];
  private drawn: Primitive[] = [];
  private bu = 4;
  /** Re-snapped replacements of props whose ground changed, by primitive id. */
  private resnapped = new Map<number, Primitive>();
  /** True when `resnapped` changed since the last merge. */
  dirty = false;

  /** Snaps a world's static primitives; returns the list the static layer draws. */
  setWorld(prims: readonly Primitive[], height: HeightAt, bu: number, stats?: SnapStats): Primitive[] {
    const out = snapPrimitivesToGround(prims, height, bu, stats);
    this.bu = bu;
    this.cand = []; this.drawn = []; this.resnapped.clear(); this.dirty = false;
    for (let i = 0; i < prims.length; i++) if (isSnappable(prims[i])) { this.cand.push(prims[i]); this.drawn.push(out[i]); }
    return out;
  }

  clear(): void {
    this.cand = []; this.drawn = []; this.resnapped.clear(); this.dirty = false;
  }

  /** The terrain heights changed: re-snaps every candidate against the new ground. */
  heightsChanged(height: HeightAt): void {
    for (let i = 0; i < this.cand.length; i++) {
      const p = this.cand[i], was = this.drawn[i];
      const now = snapOne(p, height, this.bu)?.prim ?? p;
      const same = Math.abs(now.pos.y - was.pos.y) < SAME_MM && Math.abs(now.size.y - was.size.y) < SAME_MM
        && Math.abs(now.pos.x - was.pos.x) < SAME_MM && Math.abs(now.pos.z - was.pos.z) < SAME_MM;
      const had = this.resnapped.has(p.id);
      if (same && had) { this.resnapped.delete(p.id); this.dirty = true; }
      else if (!same) {
        const prev = this.resnapped.get(p.id);
        if (!prev || Math.abs(prev.pos.y - now.pos.y) >= SAME_MM || Math.abs(prev.size.y - now.size.y) >= SAME_MM) this.dirty = true;
        this.resnapped.set(p.id, now);
      }
    }
  }

  /**
   * The dynamic layer's replacement map: the moved objects' copies (snapped to the ground they now stand on) plus
   * the re-snapped props; a moved copy wins. `moved` is not modified; the result is a reused map owned by the caller.
   */
  merge(moved: ReadonlyMap<number, Primitive>, height: HeightAt, out: Map<number, Primitive>): Map<number, Primitive> {
    out.clear();
    for (const [id, p] of this.resnapped) out.set(id, p);
    for (const [id, p] of moved) out.set(id, isSnappable(p) ? (snapOne(p, height, this.bu)?.prim ?? p) : p);
    this.dirty = false;
    return out;
  }
}
