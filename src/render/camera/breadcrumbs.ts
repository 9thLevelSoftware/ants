// Render-side ring buffer of the target's recent positions and ups (GDD 01 6.4): the tunnel boom camera sits on
// this polyline because it is known free space, so it follows bends without clipping.
import type { Vec3 } from '@/core';

export class Breadcrumbs {
  private readonly px: Float64Array;
  private readonly py: Float64Array;
  private readonly pz: Float64Array;
  private readonly ux: Float64Array;
  private readonly uy: Float64Array;
  private readonly uz: Float64Array;
  private head = -1;
  private count = 0;

  constructor(readonly capacity: number, public spacing: number) {
    this.px = new Float64Array(capacity); this.py = new Float64Array(capacity); this.pz = new Float64Array(capacity);
    this.ux = new Float64Array(capacity); this.uy = new Float64Array(capacity); this.uz = new Float64Array(capacity);
  }

  get size(): number {
    return this.count;
  }

  clear(): void {
    this.head = -1;
    this.count = 0;
  }

  push(p: Vec3, up: Vec3): void {
    this.head = (this.head + 1) % this.capacity;
    const h = this.head;
    this.px[h] = p.x; this.py[h] = p.y; this.pz[h] = p.z;
    this.ux[h] = up.x; this.uy[h] = up.y; this.uz[h] = up.z;
    this.count = Math.min(this.capacity, this.count + 1);
  }

  /** Record a sample when the target has moved at least `spacing` from the newest sample. */
  sample(p: Vec3, up: Vec3): void {
    if (this.count === 0) { this.push(p, up); return; }
    const h = this.head;
    const d = Math.hypot(p.x - this.px[h], p.y - this.py[h], p.z - this.pz[h]);
    if (d >= this.spacing) this.push(p, up);
  }

  /** i = 0 is the newest sample. */
  private idx(i: number): number {
    return (this.head - i + this.capacity * 2) % this.capacity;
  }

  /**
   * Walk back from `from` (the current target position) along the polyline by arc length `dist`; writes the point
   * and the interpolated up. Returns the arc length actually available (< dist when the buffer is too short; the
   * point is then the oldest sample).
   */
  walkBack(from: Vec3, dist: number, outPos: Vec3, outUp: Vec3): number {
    let ax = from.x, ay = from.y, az = from.z;
    let travelled = 0;
    outPos.x = ax; outPos.y = ay; outPos.z = az;
    for (let i = 0; i < this.count; i++) {
      const j = this.idx(i);
      const bx = this.px[j], by = this.py[j], bz = this.pz[j];
      const seg = Math.hypot(bx - ax, by - ay, bz - az);
      if (travelled + seg >= dist && seg > 1e-9) {
        const t = (dist - travelled) / seg;
        outPos.x = ax + (bx - ax) * t; outPos.y = ay + (by - ay) * t; outPos.z = az + (bz - az) * t;
        outUp.x = this.ux[j]; outUp.y = this.uy[j]; outUp.z = this.uz[j];
        return dist;
      }
      travelled += seg;
      ax = bx; ay = by; az = bz;
      outPos.x = ax; outPos.y = ay; outPos.z = az;
      outUp.x = this.ux[j]; outUp.y = this.uy[j]; outUp.z = this.uz[j];
    }
    return travelled;
  }
}
