// Procedural texture sets for materials without a CC0 scan (plant, plastic, glass, fabric ...). Pure pixel maths
// (no DOM): tileable value noise on an integer lattice with a period, so the result wraps like a scanned tile.
// Output layout matches the scanned sets: albedo (sRGB), normal (OpenGL, +Y up), roughness in G.
import type { ProceduralLook } from './materialDefs';

export interface PixelSet {
  size: number;
  albedo: Uint8Array;
  normal: Uint8Array;
  rough: Uint8Array;
}

function hash(ix: number, iy: number, seed: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 977)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** Tileable albedo / normal / rough pixels for a procedural look. */
export function proceduralPixels(look: ProceduralLook, size: number, seed: number): PixelSet {
  const h = proceduralHeightTileable(look, size, seed);
  const c0 = hexToRgb(look.base), c1 = hexToRgb(look.alt);
  const albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const bump = look.bump * 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, t = h[i];
      const o = i * 4;
      for (let k = 0; k < 3; k++) albedo[o + k] = Math.round(c0[k] + (c1[k] - c0[k]) * t);
      albedo[o + 3] = 255;
      const dx = h[y * size + ((x + 1) % size)] - h[y * size + ((x + size - 1) % size)];
      const dy = h[((y + 1) % size) * size + x] - h[((y + size - 1) % size) * size + x];
      let nx = -dx * bump, ny = -dy * bump, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      normal[o] = Math.round((nx * 0.5 + 0.5) * 255);
      normal[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      normal[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
      normal[o + 3] = 255;
      const r = Math.round(Math.min(1, Math.max(0, look.rough * (0.85 + 0.3 * (1 - t)))) * 255);
      rough[o] = r; rough[o + 1] = r; rough[o + 2] = r; rough[o + 3] = 255;
    }
  }
  return { size, albedo, normal, rough };
}

/** fbm whose every octave has an integer period across the tile, so the texture wraps seamlessly. */
function proceduralHeightTileable(look: ProceduralLook, size: number, seed: number): Float32Array {
  const h = new Float32Array(size * size);
  const base = Math.max(1, Math.round(1 / Math.max(0.01, look.grain)));
  const fibre = look.fibre ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      let s = 0, amp = 0.5, norm = 0, p = base;
      for (let o = 0; o < 4; o++) {
        const pu = Math.max(1, Math.round(p * (1 - 0.85 * fibre)));
        // two lattices with their own periods: u wraps every pu cells, v every p cells
        s += amp * pnoise2(u * pu, v * p, pu, p, seed + o * 31);
        norm += amp;
        amp *= 0.5;
        p *= 2;
      }
      h[y * size + x] = s / norm;
    }
  }
  return h;
}

function pnoise2(x: number, y: number, px: number, py: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const wx = (i: number) => ((i % px) + px) % px, wy = (i: number) => ((i % py) + py) % py;
  const a = hash(wx(xi), wy(yi), seed), b = hash(wx(xi + 1), wy(yi), seed);
  const c = hash(wx(xi), wy(yi + 1), seed), d = hash(wx(xi + 1), wy(yi + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
