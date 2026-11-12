// Cross-section of one cut face: rasterises the field on the face into a small RG8 image (R = solidness with the iso
// line at 0.5, G = hard material) on the CPU, a few rows per frame within a time budget. Pure (no three): the cap
// mesh uploads `current`.
//
// Two kinds of change:
//  - the face moved (a new key): a new image is rasterised while the previous one stays on screen. A job that is
//    already running is finished first and the newest face started after it, so a face that keeps moving still
//    shows a new image every few frames instead of restarting forever.
//  - the carve grid changed (`invalidate(box)`): only the texels near the edit are rasterised again, in place.
import type { NestSource } from '../simAdapter';
import { facePoint, type CapFace, type V3 } from './capFaces';

export interface CapImage {
  width: number;
  height: number;
  /** RG per texel: solidness (128 = surface), hard material flag. */
  data: Uint8Array;
  face: CapFace;
  key: string;
}

/** A texel rectangle to rasterise again: columns i0..i1, rows j0..j1 (inclusive); `row` = next row to do. */
interface Patch { i0: number; i1: number; j0: number; j1: number; row: number }

interface Job extends CapImage { row: number; patches: Patch[] }

interface Pending { face: CapFace; key: string; texelMm: number; maxTexels: number }

const p: V3 = { x: 0, y: 0, z: 0 };
const corner: V3 = { x: 0, y: 0, z: 0 };

export class CapRaster {
  current: CapImage | null = null;
  private job: Job | null = null;
  private next: Pending | null = null;
  /** Edits waiting to be rasterised into `current`. */
  private patches: Patch[] = [];
  /** `current` may miss edits (the cutaway was off while digging went on): the same key rasterises it again. */
  private stale = false;
  /** Bumped when `current` changes (the mesh re-uploads). */
  revision = 0;

  get busy(): boolean {
    return this.job !== null || this.next !== null || this.patches.length > 0;
  }

  /** Requests a face (no-op if that key is current or in progress; queued behind a running job of another key). */
  start(face: CapFace, key: string, texelMm: number, maxTexels: number): void {
    const latest = this.next?.key ?? this.job?.key ?? (this.stale ? undefined : this.current?.key);
    if (latest === key) return;
    this.stale = false;
    if (this.job) { this.next = { face, key, texelMm, maxTexels }; return; }
    this.next = null;
    this.begin(face, key, texelMm, maxTexels);
  }

  /** Stops all work; the current image stays (shown again while a fresh one is rasterised). */
  cancel(): void {
    this.job = null;
    this.next = null;
    this.patches = [];
    if (this.current) this.stale = true;
  }

  /** The carve grid changed inside the world box (mm): the texels it can affect are rasterised again. */
  invalidate(box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }, padMm: number): void {
    if (this.current) {
      const r = texelRect(this.current, box, padMm);
      if (r) this.patches.push(r);
    }
    const j = this.job;
    if (j && j.row > 0) {
      const r = texelRect(j, box, padMm);
      // rows not reached yet will read the new data anyway
      if (r && r.j0 < j.row) { r.j1 = Math.min(r.j1, j.row - 1); j.patches.push(r); }
    }
  }

  /** Works until `deadline` (performance.now() ms; at least one row); true when a new image completed. */
  step(src: NestSource, deadline: number): boolean {
    let completed = false;
    const j = this.job;
    if (j) {
      while (j.row < j.height) {
        rasterRow(src, j, j.row, 0, j.width - 1);
        j.row++;
        if (performance.now() >= deadline) break;
      }
      if (j.row >= j.height) {
        this.current = { width: j.width, height: j.height, data: j.data, face: j.face, key: j.key };
        this.patches = j.patches;
        this.job = null;
        this.revision++;
        completed = true;
        const n = this.next;
        this.next = null;
        if (n) this.begin(n.face, n.key, n.texelMm, n.maxTexels);
      }
    }
    if (!completed && !j && this.current && this.patches.length > 0) this.stepPatches(src, deadline);
    return completed;
  }

  /** Solidness 0..1 at face coordinates (bilinear, like the GPU); -1 outside the image. */
  solidAt(u: number, v: number): number {
    const c = this.current;
    if (!c) return -1;
    const f = c.face;
    const fx = ((u - f.u0) / (f.u1 - f.u0)) * c.width - 0.5, fy = ((v - f.v0) / (f.v1 - f.v0)) * c.height - 0.5;
    if (fx < -0.5 || fy < -0.5 || fx > c.width - 0.5 || fy > c.height - 0.5) return -1;
    const x0 = Math.max(0, Math.min(c.width - 1, Math.floor(fx))), y0 = Math.max(0, Math.min(c.height - 1, Math.floor(fy)));
    const x1 = Math.min(c.width - 1, x0 + 1), y1 = Math.min(c.height - 1, y0 + 1);
    const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
    const s = (x: number, y: number) => c.data[(y * c.width + x) * 2] / 255;
    return (s(x0, y0) * (1 - tx) + s(x1, y0) * tx) * (1 - ty) + (s(x0, y1) * (1 - tx) + s(x1, y1) * tx) * ty;
  }

  private begin(face: CapFace, key: string, texelMm: number, maxTexels: number): void {
    const w = Math.max(2, Math.min(maxTexels, Math.round((face.u1 - face.u0) / texelMm)));
    const h = Math.max(2, Math.min(maxTexels, Math.round((face.v1 - face.v0) / texelMm)));
    this.job = { width: w, height: h, data: new Uint8Array(w * h * 2), face, key, row: 0, patches: [] };
  }

  /** Re-rasterises edited rectangles of the current image in place; the mesh re-uploads when all are done. */
  private stepPatches(src: NestSource, deadline: number): void {
    const c = this.current!;
    while (this.patches.length > 0) {
      const r = this.patches[0];
      rasterRow(src, c, r.row, r.i0, r.i1);
      r.row++;
      if (r.row > r.j1) this.patches.shift();
      if (performance.now() >= deadline) break;
    }
    if (this.patches.length === 0) this.revision++;
  }
}

function rasterRow(src: NestSource, img: CapImage, row: number, i0: number, i1: number): void {
  const f = img.face, ramp = 2 * src.voxel;
  const du = (f.u1 - f.u0) / img.width, dv = (f.v1 - f.v0) / img.height;
  const v = f.v0 + (row + 0.5) * dv;
  for (let i = i0; i <= i1; i++) {
    facePoint(f, f.u0 + (i + 0.5) * du, v, p);
    const soil = Math.max(src.soil(p.x, p.y, p.z), src.cavity(p.x, p.y, p.z, null));
    const hard = src.hard(p.x, p.y, p.z);
    const d = Math.min(soil, hard);
    const o = (row * img.width + i) * 2;
    img.data[o] = Math.round(Math.min(1, Math.max(0, 0.5 - d / ramp)) * 255);
    img.data[o + 1] = hard < soil ? 255 : 0;
  }
}

/** Texels of an image whose field values a change inside the box (padded) can affect; null when none. */
function texelRect(img: CapImage, box: { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number }, pad: number): Patch | null {
  const f = img.face;
  const x0 = box.x0 - pad, y0 = box.y0 - pad, z0 = box.z0 - pad, x1 = box.x1 + pad, y1 = box.y1 + pad, z1 = box.z1 + pad;
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
  if (f.kind === 'plane') {
    // the box must straddle the plane; then the face rectangle covered by the corners' projections
    const nx = f.a.y * f.b.z - f.a.z * f.b.y, ny = f.a.z * f.b.x - f.a.x * f.b.z, nz = f.a.x * f.b.y - f.a.y * f.b.x;
    let h0 = Infinity, h1 = -Infinity;
    for (let c = 0; c < 8; c++) {
      corner.x = c & 1 ? x1 : x0; corner.y = c & 2 ? y1 : y0; corner.z = c & 4 ? z1 : z0;
      const dx = corner.x - f.o.x, dy = corner.y - f.o.y, dz = corner.z - f.o.z;
      const h = dx * nx + dy * ny + dz * nz, u = dx * f.a.x + dy * f.a.y + dz * f.a.z, v = dx * f.b.x + dy * f.b.y + dz * f.b.z;
      h0 = Math.min(h0, h); h1 = Math.max(h1, h);
      u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v);
    }
    if (h0 > 0 || h1 < 0) return null;
  } else {
    // cylinder around the vertical axis through o: height range, and the arc the box subtends
    v0 = y0 - f.o.y; v1 = y1 - f.o.y;
    const cx = Math.max(x0, Math.min(f.o.x, x1)) - f.o.x, cz = Math.max(z0, Math.min(f.o.z, z1)) - f.o.z;
    const near = Math.hypot(cx, cz);
    const far = Math.hypot(Math.max(Math.abs(x0 - f.o.x), Math.abs(x1 - f.o.x)), Math.max(Math.abs(z0 - f.o.z), Math.abs(z1 - f.o.z)));
    if (near > f.radius || far < f.radius) return null;
    if (near === 0) { u0 = f.u0; u1 = f.u1; } else {
      // u = R * atan2(x, z) in 0..2 pi R; corners' angles unwrapped around the box centre's angle
      const mid = Math.atan2((x0 + x1) / 2 - f.o.x, (z0 + z1) / 2 - f.o.z);
      let a0 = Infinity, a1 = -Infinity;
      for (let c = 0; c < 4; c++) {
        let a = Math.atan2((c & 1 ? x1 : x0) - f.o.x, (c & 2 ? z1 : z0) - f.o.z) - mid;
        a -= Math.round(a / (2 * Math.PI)) * 2 * Math.PI;
        a0 = Math.min(a0, a); a1 = Math.max(a1, a);
      }
      const span = f.u1 - f.u0;
      u0 = (mid + a0) * f.radius; u1 = (mid + a1) * f.radius;
      // wrap into the face's range; an arc across u = 0 is split by covering the whole width (rare, cheap enough)
      const w0 = ((u0 % span) + span) % span, w1 = w0 + (u1 - u0);
      if (w1 > span) { u0 = f.u0; u1 = f.u1; } else { u0 = w0; u1 = w1; }
    }
  }
  const i0 = Math.floor(((u0 - f.u0) / (f.u1 - f.u0)) * img.width - 0.5), i1 = Math.ceil(((u1 - f.u0) / (f.u1 - f.u0)) * img.width - 0.5);
  const j0 = Math.floor(((v0 - f.v0) / (f.v1 - f.v0)) * img.height - 0.5), j1 = Math.ceil(((v1 - f.v0) / (f.v1 - f.v0)) * img.height - 0.5);
  const r: Patch = { i0: Math.max(0, i0), i1: Math.min(img.width - 1, i1), j0: Math.max(0, j0), j1: Math.min(img.height - 1, j1), row: 0 };
  if (r.i0 > r.i1 || r.j0 > r.j1) return null;
  r.row = r.j0;
  return r;
}
