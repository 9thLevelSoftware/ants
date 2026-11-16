// Ground field raster (no three): an RGBA8 image over a square world region, filled a few rows per frame into a
// back buffer and swapped in whole when a pass completes, so the drawn field never mixes two passes or regions.
// What the four channels mean depends on the overlay (see samplers.ts).

export interface Region {
  /** World x / z of the region's minimum corner, mm, and its edge, mm. */
  x0: number;
  z0: number;
  size: number;
}

/** Writes the four channel values 0..1 of the texel centred at world (x, z) into out. */
export interface TexelSampler {
  sample(x: number, z: number, out: Float32Array): void;
}

export class FieldRaster {
  /** Completed image (row-major, z rows, x columns), and the region it covers. */
  front: Uint8Array;
  frontRegion: Region | null = null;
  /** Incremented whenever front changes (upload then). */
  version = 0;
  private back: Uint8Array;
  private backRegion: Region | null = null;
  private row = -1;
  private sampler: TexelSampler | null = null;
  private readonly px = new Float32Array(4);

  constructor(readonly n: number) {
    this.front = new Uint8Array(n * n * 4);
    this.back = new Uint8Array(n * n * 4);
  }

  get busy(): boolean { return this.row >= 0; }

  /** Starts a new pass (any pass under way is abandoned). */
  start(region: Region, sampler: TexelSampler): void {
    this.backRegion = { ...region };
    this.sampler = sampler;
    this.row = 0;
  }

  /** Rasters up to `rows` rows; returns true when the pass completed (front swapped) during this call. */
  step(rows: number): boolean {
    if (this.row < 0 || !this.sampler || !this.backRegion) return false;
    const n = this.n, r = this.backRegion, step = r.size / n, px = this.px, img = this.back;
    const end = Math.min(n, this.row + rows);
    for (let j = this.row; j < end; j++) {
      const z = r.z0 + (j + 0.5) * step;
      for (let i = 0; i < n; i++) {
        px[0] = 0; px[1] = 0; px[2] = 0; px[3] = 0;
        this.sampler.sample(r.x0 + (i + 0.5) * step, z, px);
        const o = (j * n + i) * 4;
        img[o] = to8(px[0]); img[o + 1] = to8(px[1]); img[o + 2] = to8(px[2]); img[o + 3] = to8(px[3]);
      }
    }
    this.row = end;
    if (end < n) return false;
    const t = this.front;
    this.front = this.back;
    this.back = t;
    this.frontRegion = this.backRegion;
    this.row = -1;
    this.sampler = null;
    this.version++;
    return true;
  }

  /** Channel c (0..3) of the completed image at texel (i, j), 0..1. */
  texel(i: number, j: number, c: number): number {
    return this.front[(j * this.n + i) * 4 + c] / 255;
  }
}

function to8(v: number): number {
  return v <= 0 ? 0 : v >= 1 ? 255 : Math.round(v * 255);
}

/**
 * Region centred on (cx, cz) whose edge follows the camera height above the ground (mm), snapped to a fraction
 * of the edge so small camera moves do not restart passes.
 */
export function regionFor(cx: number, cz: number, heightMm: number, bu: number, k: number, minBu: number, maxBu: number, snap: number): Region {
  const raw = Math.max(minBu * bu, Math.min(maxBu * bu, Math.abs(heightMm) * k));
  // edge from a fixed ladder (powers of 2^(1/2) times minBu) so it does not change with every zoom step
  const ladder = minBu * bu * Math.pow(Math.SQRT2, Math.ceil(Math.log(raw / (minBu * bu)) / Math.log(Math.SQRT2) - 1e-9));
  const size = Math.min(maxBu * bu, ladder);
  const g = size / snap;
  const x0 = Math.round((cx - size / 2) / g) * g;
  const z0 = Math.round((cz - size / 2) / g) * g;
  return { x0, z0, size };
}

export function sameRegion(a: Region | null, b: Region | null): boolean {
  return !!a && !!b && a.x0 === b.x0 && a.z0 === b.z0 && a.size === b.size;
}

/**
 * Isotherm label spots: texels where the decoded temperature crosses a multiple of `stepC` between horizontal or
 * vertical neighbours, at most `max`, spaced at least `minSep` texels apart. decode maps channel 0 to °C.
 */
export function isothermSpots(r: FieldRaster, decode: (v: number) => number, stepC: number, max: number, minSep: number): { i: number; j: number; c: number }[] {
  const out: { i: number; j: number; c: number }[] = [];
  const n = r.n;
  const stride = Math.max(1, Math.floor(minSep / 2));
  for (let j = stride; j < n - 1 && out.length < max; j += stride) {
    for (let i = 1; i < n - 1 && out.length < max; i++) {
      if (r.texel(i, j, 1) === 0 || r.texel(i + 1, j, 1) === 0) continue;
      const a = decode(r.texel(i, j, 0)), b = decode(r.texel(i + 1, j, 0));
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const c = Math.ceil(lo / stepC) * stepC;
      if (!(c <= hi) || c === lo && lo === hi) continue;
      if (out.some((o) => Math.hypot(o.i - i, o.j - j) < minSep)) continue;
      out.push({ i, j, c });
    }
  }
  return out;
}
