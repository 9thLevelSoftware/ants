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
  // brightness factor per pixel from scattered features (sand grains, pores), 1 = none
  const shade = new Float32Array(size * size).fill(1);
  if (look.weave) addWeave(h, size, look.weave);
  if (look.speckle) scatter(h, shade, size, seed + 101, look.speckle, 1.2, 2.6, 'grain');
  if (look.pores) scatter(h, shade, size, seed + 202, look.pores * 0.3, 0.7, 3.2, 'pore');
  const albedo = new Uint8Array(size * size * 4), normal = new Uint8Array(size * size * 4), rough = new Uint8Array(size * size * 4);
  const bump = look.bump * 6;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x, t = Math.min(1, Math.max(0, h[i]));
      const o = i * 4;
      for (let k = 0; k < 3; k++) albedo[o + k] = Math.max(0, Math.min(255, Math.round((c0[k] + (c1[k] - c0[k]) * t) * shade[i])));
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

/** Over-and-under weave: alternate cells show a thread along u or along v (heights 0..1 blended into h). */
function addWeave(h: Float32Array, size: number, threads: number): void {
  const n = Math.max(2, Math.round(threads / 2) * 2); // even, so the pattern wraps
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = (x / size) * n, v = (y / size) * n;
    const iu = Math.floor(u), iv = Math.floor(v);
    const across = (iu + iv) % 2 === 0 ? Math.sin(Math.PI * (v - iv)) : Math.sin(Math.PI * (u - iu));
    const i = y * size + x;
    h[i] = h[i] * 0.35 + across * 0.65;
  }
}

/**
 * Scattered round features on a jittered lattice (tileable: the lattice wraps): raised sand grains (lighter or
 * darker than the paste) or sunken pores (dark pits). `density` = share of lattice cells that hold one.
 */
function scatter(h: Float32Array, shade: Float32Array, size: number, seed: number, density: number, rMin: number, rMax: number, kind: 'grain' | 'pore'): void {
  const cell = Math.max(3, Math.round(rMax * 2.4));
  const n = Math.max(1, Math.floor(size / cell));
  const step = size / n;
  for (let cy = 0; cy < n; cy++) for (let cx = 0; cx < n; cx++) {
    if (hash(cx, cy, seed) >= density) continue;
    const r = rMin + (rMax - rMin) * hash(cx, cy, seed + 1);
    const px = (cx + 0.2 + 0.6 * hash(cx, cy, seed + 2)) * step, py = (cy + 0.2 + 0.6 * hash(cx, cy, seed + 3)) * step;
    const tone = kind === 'pore' ? 0.45 : hash(cx, cy, seed + 4) < 0.5 ? 0.72 : 1.28;
    const R = Math.ceil(r + 1);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const d = Math.hypot(dx + (Math.floor(px) - px), dy + (Math.floor(py) - py)) / r;
      if (d >= 1) continue;
      const x = (((Math.floor(px) + dx) % size) + size) % size, y = (((Math.floor(py) + dy) % size) + size) % size;
      const i = y * size + x, k = Math.sqrt(1 - d * d);
      if (kind === 'pore') { h[i] -= 0.5 * k; shade[i] *= 1 - (1 - tone) * k; }
      else { h[i] = Math.max(h[i], 0.55 + 0.4 * k); shade[i] *= 1 + (tone - 1) * Math.min(1, k * 1.5); }
    }
  }
}
