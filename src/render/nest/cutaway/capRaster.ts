// Cross-section of one cut face: rasterises the field on the face into a small RG8 image (R = solidness with the iso
// line at 0.5, G = hard material) on the CPU, a few rows per frame within a time budget. The previous image stays on
// screen until the new one is complete. Pure (no three): the cap mesh uploads `current`.
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

interface Job extends CapImage { row: number }

const p: V3 = { x: 0, y: 0, z: 0 };

export class CapRaster {
  current: CapImage | null = null;
  private job: Job | null = null;
  /** Bumped when `current` changes (the mesh re-uploads). */
  revision = 0;

  get busy(): boolean {
    return this.job !== null;
  }

  /** Starts rasterising a face (no-op if the same key is current or in progress). */
  start(face: CapFace, key: string, texelMm: number, maxTexels: number): void {
    if (this.job?.key === key || (!this.job && this.current?.key === key)) return;
    const w = Math.max(2, Math.min(maxTexels, Math.round((face.u1 - face.u0) / texelMm)));
    const h = Math.max(2, Math.min(maxTexels, Math.round((face.v1 - face.v0) / texelMm)));
    this.job = { width: w, height: h, data: new Uint8Array(w * h * 2), face, key, row: 0 };
  }

  cancel(): void {
    this.job = null;
  }

  /** Works on the job until `deadline` (performance.now() ms; at least one row); true when an image completed. */
  step(src: NestSource, deadline: number): boolean {
    const j = this.job;
    if (!j) return false;
    const f = j.face, ramp = 2 * src.voxel;
    const du = (f.u1 - f.u0) / j.width, dv = (f.v1 - f.v0) / j.height;
    while (j.row < j.height) {
      const v = f.v0 + (j.row + 0.5) * dv;
      for (let i = 0; i < j.width; i++) {
        facePoint(f, f.u0 + (i + 0.5) * du, v, p);
        const soil = Math.max(src.soil(p.x, p.y, p.z), src.cavity(p.x, p.y, p.z, null));
        const hard = src.hard(p.x, p.y, p.z);
        const d = Math.min(soil, hard);
        const o = (j.row * j.width + i) * 2;
        j.data[o] = Math.round(Math.min(1, Math.max(0, 0.5 - d / ramp)) * 255);
        j.data[o + 1] = hard < soil ? 255 : 0;
      }
      j.row++;
      if (performance.now() >= deadline) break;
    }
    if (j.row < j.height) return false;
    this.current = { width: j.width, height: j.height, data: j.data, face: j.face, key: j.key };
    this.job = null;
    this.revision++;
    return true;
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
}
