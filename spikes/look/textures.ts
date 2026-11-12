/**
 * Texture loading for the look-dev spike.
 *
 * Real CC0 maps come from public/assets/manifest.json (served at ./assets/...). If the manifest or a map is
 * missing, a procedural DataTexture stands in, so every material keeps working and real textures can be
 * swapped in later without touching the shaders (the material code only sees albedo/normal/rough[/opacity]).
 */
import {
  CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearMipmapLinearFilter, LinearFilter, RepeatWrapping, RGBAFormat,
  SRGBColorSpace, Texture, TextureLoader, UnsignedByteType,
} from 'three';
import { fbm, hash2 } from './rng';

export interface MatTex { albedo: Texture; normal: Texture; rough: Texture; opacity: Texture | null; real: boolean }
export type MatName =
  | 'soil_garden' | 'humus_forest' | 'sand_playground' | 'gravel_fine' | 'bark_oak' | 'concrete_paving' | 'asphalt' | 'brick'
  | 'leaf_atlas_maple' | 'leaf_atlas_oak_dry' | 'grass_blades_atlas' | 'moss';

interface Manifest { materials: Record<string, { maps: Record<string, string>; atlas: boolean; size: [number, number] }> }

const PROC_COLORS: Record<string, [number, number, number, number, number, number]> = {
  // dark, light (sRGB 0-255)
  soil_garden: [70, 48, 30, 120, 88, 58], humus_forest: [80, 66, 50, 140, 124, 104], sand_playground: [150, 128, 96, 205, 185, 150],
  gravel_fine: [110, 108, 104, 190, 186, 180], bark_oak: [50, 38, 28, 110, 92, 72], concrete_paving: [110, 104, 96, 160, 152, 140],
  asphalt: [40, 40, 42, 90, 90, 92], brick: [110, 50, 38, 160, 90, 70], moss: [40, 70, 20, 90, 120, 40],
  leaf_atlas_maple: [150, 60, 20, 230, 170, 40], leaf_atlas_oak_dry: [90, 60, 30, 170, 120, 70], grass_blades_atlas: [40, 90, 20, 120, 170, 60],
};

/** Procedural stand-in: fbm albedo, normal from the same height, constant-ish roughness. */
function proceduralMaterial(name: string, seed: number): MatTex {
  const N = 256; const c = PROC_COLORS[name] ?? [90, 80, 70, 160, 150, 140];
  const h = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // tileable: sample fbm on a torus-ish domain by mixing wrapped coordinates
    const u = x / N, v = y / N;
    const a = fbm(u * 8, v * 8, 4, seed), b = fbm((u + 1) * 8 - 8 * 1, v * 8, 4, seed);
    h[y * N + x] = a * 0.7 + hash2(x, y, seed) * 0.3 + b * 0;
  }
  const alb = new Uint8Array(N * N * 4), nrm = new Uint8Array(N * N * 4), rgh = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = y * N + x, t = h[i]!;
    for (let k = 0; k < 3; k++) alb[i * 4 + k] = Math.round(c[k]! + (c[k + 3]! - c[k]!) * t);
    alb[i * 4 + 3] = 255;
    const dx = h[y * N + ((x + 1) % N)]! - h[y * N + ((x + N - 1) % N)]!, dy = h[((y + 1) % N) * N + x]! - h[((y + N - 1) % N) * N + x]!;
    const s = 3.0; let nx = -dx * s, ny = -dy * s, nz = 1; const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    nrm[i * 4] = Math.round((nx * 0.5 + 0.5) * 255); nrm[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255); nrm[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255); nrm[i * 4 + 3] = 255;
    const r = Math.round(170 + 60 * (1 - t)); rgh[i * 4] = r; rgh[i * 4 + 1] = r; rgh[i * 4 + 2] = r; rgh[i * 4 + 3] = 255;
  }
  const mk = (d: Uint8Array, srgb: boolean) => {
    const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType); t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true; if (srgb) t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t;
  };
  return { albedo: mk(alb, true), normal: mk(nrm, false), rough: mk(rgh, false), opacity: null, real: false };
}

export interface TextureSet { mats: Partial<Record<MatName, MatTex>>; manifestFound: boolean; grassStrip: Texture | null }

export async function loadTextures(names: MatName[], anisotropy: number): Promise<TextureSet> {
  let manifest: Manifest | null = null;
  try {
    const r = await fetch('./assets/manifest.json');
    if (r.ok) manifest = (await r.json()) as Manifest;
  } catch { manifest = null; }
  const loader = new TextureLoader();
  const mats: Partial<Record<MatName, MatTex>> = {};
  let seed = 11;
  await Promise.all(names.map(async (name) => {
    seed += 7;
    const m = manifest?.materials[name];
    if (!m) { mats[name] = proceduralMaterial(name, seed); return; }
    try {
      const get = async (k: string, srgb: boolean): Promise<Texture | null> => {
        const p = m.maps[k]; if (!p) return null;
        const t = await loader.loadAsync('./' + p);
        t.wrapS = t.wrapT = m.atlas ? ClampToEdgeWrapping : RepeatWrapping;
        t.anisotropy = anisotropy; if (srgb) t.colorSpace = SRGBColorSpace; return t;
      };
      const [albedo, normal, rough, opacity] = await Promise.all([get('albedo', true), get('normal', false), get('rough', false), get('opacity', false)]);
      if (!albedo || !normal || !rough) throw new Error('missing map');
      mats[name] = { albedo, normal, rough, opacity, real: true };
    } catch (e) {
      console.warn('[look] texture fallback for', name, e);
      mats[name] = proceduralMaterial(name, seed);
    }
  }));
  let grassStrip: Texture | null = null;
  const g = mats.grass_blades_atlas;
  if (g?.real && g.opacity) grassStrip = straightenGrassAtlas(g.albedo.image as CanvasImageSource, g.opacity.image as CanvasImageSource);
  return { mats, manifestFound: !!manifest, grassStrip };
}

/**
 * The grass atlas (ambientCG Foliage008) holds 7 horizontal, slightly curved blades (base left, tip right).
 * Straighten each into a 256x16 strip (u = base->tip, v = across the measured blade width) so a procedural
 * blade mesh can sample real blade colour/veins with a trivial (h, s) parameterisation. Strips stacked: 256 x 112.
 */
export const GRASS_STRIPS = 7;
function straightenGrassAtlas(albImg: CanvasImageSource, opImg: CanvasImageSource): Texture {
  const S = 1024;
  const read = (img: CanvasImageSource) => {
    const c = document.createElement('canvas'); c.width = S; c.height = S;
    const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, S, S); return g.getImageData(0, 0, S, S).data;
  };
  const A = read(albImg), O = read(opImg);
  const W = 256, HS = 16;
  const out = document.createElement('canvas'); out.width = W; out.height = HS * GRASS_STRIPS;
  const og = out.getContext('2d')!; const od = og.createImageData(W, HS * GRASS_STRIPS);
  for (let b = 0; b < GRASS_STRIPS; b++) {
    const y0 = Math.floor((b * S) / GRASS_STRIPS), y1 = Math.floor(((b + 1) * S) / GRASS_STRIPS);
    const top = new Int32Array(S).fill(-1), bot = new Int32Array(S).fill(-1);
    let xmin = S, xmax = -1;
    for (let x = 0; x < S; x++) {
      for (let y = y0; y < y1; y++) if (O[(y * S + x) * 4]! > 140) { if (top[x] < 0) top[x] = y; bot[x] = y; }
      if (top[x]! >= 0 && bot[x]! - top[x]! >= 1) { xmin = Math.min(xmin, x); xmax = Math.max(xmax, x); } else top[x] = -1;
    }
    if (xmax < 0) continue;
    // fill invalid columns from the nearest valid one
    let last = -1; for (let x = xmin; x <= xmax; x++) { if (top[x]! >= 0) last = x; else if (last >= 0) { top[x] = top[last]!; bot[x] = bot[last]!; } }
    for (let i = 0; i < W; i++) {
      const x = Math.round(xmin + ((i + 0.5) / W) * (xmax - xmin));
      for (let j = 0; j < HS; j++) {
        const y = Math.round(top[x]! + ((j + 0.5) / HS) * (bot[x]! - top[x]!));
        const si = (y * S + x) * 4, di = ((b * HS + j) * W + i) * 4;
        od.data[di] = A[si]!; od.data[di + 1] = A[si + 1]!; od.data[di + 2] = A[si + 2]!; od.data[di + 3] = 255;
      }
    }
  }
  og.putImageData(od, 0, 0);
  const t = new CanvasTexture(out); t.colorSpace = SRGBColorSpace; t.wrapS = t.wrapT = ClampToEdgeWrapping; t.needsUpdate = true;
  return t;
}

/** Small procedural canvas textures (clover leaflet, radial soft disc). */
export function cloverLeafletTexture(): Texture {
  const N = 128; const c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d')!;
  // u = base (0) -> tip (1) along x, v across (y)
  const grd = g.createLinearGradient(0, 0, N, 0); grd.addColorStop(0, '#3f6a22'); grd.addColorStop(1, '#4e7a2a');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  // pale chevron (white clover "V" mark)
  g.strokeStyle = 'rgba(200,225,170,0.55)'; g.lineWidth = 7;
  g.beginPath(); g.moveTo(N * 0.62, 0); g.lineTo(N * 0.42, N / 2); g.lineTo(N * 0.62, N); g.stroke();
  // veins
  g.strokeStyle = 'rgba(120,160,70,0.5)'; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(0, N / 2); g.lineTo(N, N / 2); g.stroke();
  for (let i = 1; i < 9; i++) { const x = (i / 9) * N; g.beginPath(); g.moveTo(x - 6, N / 2); g.lineTo(x + 14, 2); g.moveTo(x - 6, N / 2); g.lineTo(x + 14, N - 2); g.stroke(); }
  const t = new CanvasTexture(c); t.colorSpace = SRGBColorSpace; t.needsUpdate = true; return t;
}

export function softDiscTexture(): Texture {
  const N = 64; const c = document.createElement('canvas'); c.width = N; c.height = N; const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, N, N);
  const t = new CanvasTexture(c); t.needsUpdate = true; return t;
}
