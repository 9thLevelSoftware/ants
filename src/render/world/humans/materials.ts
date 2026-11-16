// Materials of the human-event actors (GDD 08 §11.6-11.7: real materials at true scale — rubber crumb, canvas
// weave, painted metal flakes, plastic, wood, straw bristles; no logos, no saturated colours). Small procedural
// textures (seeded integer hash, no DOM, no fetch) give each surface grain an ant can read up close.

import {
  ClampToEdgeWrapping, Color, DataTexture, DoubleSide, LinearFilter, LinearMipmapLinearFilter, MeshBasicMaterial,
  MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Material,
} from 'three';

function hash(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x: number, y: number, s: number, period: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
  const w = (v: number) => ((v % period) + period) % period;
  const a = hash(w(xi), w(yi), s), b = hash(w(xi + 1), w(yi), s), c = hash(w(xi), w(yi + 1), s), d = hash(w(xi + 1), w(yi + 1), s);
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export type GrainKind = 'crumb' | 'weave' | 'flake' | 'grain' | 'straw' | 'fur' | 'smooth' | 'check';

/** A tileable RGBA texture: tint x grain pattern (sRGB colour map). */
function grainTexture(kind: GrainKind, base: string, alt: string, seed: number, size = 128): DataTexture {
  const a = new Color(base), b = new Color(alt);
  a.convertLinearToSRGB(); b.convertLinearToSRGB();
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v: number;
      const n1 = valueNoise(x / 8, y / 8, seed, size / 8), n2 = valueNoise(x / 2, y / 2, seed + 1, size / 2);
      switch (kind) {
        case 'crumb': v = 0.55 * n2 + 0.45 * n1 + (hash(x, y, seed) > 0.93 ? 0.35 : 0); break;
        case 'weave': v = 0.5 + 0.25 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2) * ((x + y) % 4 < 2 ? 1 : -1) + 0.25 * n1; break;
        case 'flake': v = 0.6 + 0.3 * (hash(x >> 1, y >> 1, seed) - 0.5) + 0.2 * n1; break;
        case 'grain': v = 0.5 + 0.35 * Math.sin(y * 0.35 + n1 * 6) * 0.5 + 0.25 * n2; break;
        case 'straw': v = 0.45 + 0.4 * valueNoise(x / 1.5, y / 24, seed, size / 1.5) + 0.15 * n1; break;
        case 'fur': v = 0.4 + 0.5 * valueNoise(x / 1.2, y / 10, seed, size / 1.2); break;
        case 'check': {
          // a woven dish-towel check: wide pale squares, darker bands where the coloured threads cross
          const bx = Math.floor(x / 16) % 2, by = Math.floor(y / 16) % 2;
          v = 0.85 - 0.3 * bx - 0.3 * by + 0.12 * Math.sin((x * Math.PI) / 2) * Math.sin((y * Math.PI) / 2) + 0.1 * n1;
          break;
        }
        default: v = 0.5 + 0.15 * n1;
      }
      v = Math.min(1, Math.max(0, v));
      const i = (y * size + x) * 4;
      data[i] = Math.round((a.r + (b.r - a.r) * v) * 255);
      data[i + 1] = Math.round((a.g + (b.g - a.g) * v) * 255);
      data[i + 2] = Math.round((a.b + (b.b - a.b) * v) * 255);
      data[i + 3] = 255;
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Soft round shadow (alpha falls off from the centre), for the blob shadows under falling and moving actors. */
function blobTexture(size = 64): DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x + 0.5) / size * 2 - 1, dy = (y + 0.5) / size * 2 - 1;
      const r = Math.min(1, Math.hypot(dx, dy));
      const a = Math.pow(1 - r, 1.6);
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = 0;
      data[i + 3] = Math.round(a * 255);
    }
  }
  const t = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = ClampToEdgeWrapping;
  t.magFilter = LinearFilter; t.minFilter = LinearFilter;
  t.needsUpdate = true;
  return t;
}

export interface HumanMaterials {
  rubber: MeshStandardMaterial;
  rubberTread: MeshStandardMaterial;
  leather: MeshStandardMaterial;
  canvas: MeshStandardMaterial;
  childCanvas: MeshStandardMaterial;
  lace: MeshStandardMaterial;
  trouser: MeshStandardMaterial;
  fur: MeshStandardMaterial;
  pad: MeshStandardMaterial;
  paint: MeshStandardMaterial;
  carPaint: MeshStandardMaterial;
  chassis: MeshStandardMaterial;
  metal: MeshStandardMaterial;
  blade: MeshStandardMaterial;
  plastic: MeshStandardMaterial;
  greyPlastic: MeshStandardMaterial;
  toyPlastic: MeshStandardMaterial;
  wood: MeshStandardMaterial;
  straw: MeshStandardMaterial;
  cloth: MeshStandardMaterial;
  towel: MeshStandardMaterial;
  deckInner: MeshStandardMaterial;
  steel: MeshStandardMaterial;
  engine: MeshStandardMaterial;
  brass: MeshStandardMaterial;
  wetFilm: MeshStandardMaterial;
  /** Flying water drops: brighter and more opaque than standing water, so a jet reads against the sky. */
  drop: MeshStandardMaterial;
  crumb: MeshStandardMaterial;
  kibble: MeshStandardMaterial;
  syrup: MeshStandardMaterial;
  water: MeshStandardMaterial;
  shadow: MeshBasicMaterial;
  all(): Material[];
}

function std(o: ConstructorParameters<typeof MeshStandardMaterial>[0]): MeshStandardMaterial {
  return new MeshStandardMaterial(o);
}

export function createHumanMaterials(): HumanMaterials {
  const tex = {
    rubber: grainTexture('crumb', '#1d1c1b', '#3a3734', 11),
    leather: grainTexture('grain', '#4a3424', '#6d4f37', 12),
    canvas: grainTexture('weave', '#28303d', '#3f4a5c', 13),
    childCanvas: grainTexture('weave', '#5a2f2c', '#7b4a40', 14),
    denim: grainTexture('weave', '#25324a', '#3c4c68', 15),
    fur: grainTexture('fur', '#4d3a28', '#8a6a48', 16),
    paint: grainTexture('flake', '#3e4a2c', '#56653c', 17),
    carPaint: grainTexture('flake', '#3a434d', '#56606b', 18),
    wood: grainTexture('grain', '#6e5135', '#94704a', 19),
    straw: grainTexture('straw', '#8f7442', '#c4a868', 20),
    cloth: grainTexture('weave', '#7d93a6', '#a9bccb', 21),
    crumb: grainTexture('crumb', '#a8763c', '#e0bd7c', 22),
    plastic: grainTexture('smooth', '#cfc8b8', '#ddd6c6', 23),
    towel: grainTexture('check', '#4f6274', '#dcd8cc', 24),
  };
  const m: Omit<HumanMaterials, 'all'> = {
    rubber: std({ map: tex.rubber, roughness: 0.92, metalness: 0 }),
    rubberTread: std({ map: tex.rubber, roughness: 0.97, metalness: 0, color: '#9a9a9a' }),
    leather: std({ map: tex.leather, roughness: 0.55, metalness: 0 }),
    canvas: std({ map: tex.canvas, roughness: 0.85, metalness: 0 }),
    childCanvas: std({ map: tex.childCanvas, roughness: 0.85, metalness: 0 }),
    lace: std({ color: '#cfc6b4', roughness: 0.8 }),
    trouser: std({ map: tex.denim, roughness: 0.9, transparent: true, vertexColors: true, depthWrite: false, side: DoubleSide }),
    fur: std({ map: tex.fur, roughness: 0.95, transparent: true, vertexColors: true, depthWrite: false }),
    pad: std({ color: '#2e2522', roughness: 0.75 }),
    paint: std({ map: tex.paint, roughness: 0.45, metalness: 0.3 }),
    carPaint: std({ map: tex.carPaint, roughness: 0.4, metalness: 0.45 }),
    chassis: std({ color: '#26272a', roughness: 0.8, metalness: 0.4 }),
    metal: std({ color: '#8c8f93', roughness: 0.35, metalness: 0.85 }),
    blade: std({ color: '#3a3d40', roughness: 0.6, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false }),
    plastic: std({ map: tex.plastic, roughness: 0.4, metalness: 0 }),
    greyPlastic: std({ color: '#55595e', roughness: 0.45, metalness: 0, transparent: true, vertexColors: true }),
    toyPlastic: std({ color: '#4d7598', roughness: 0.35, metalness: 0, transparent: true, vertexColors: true }),
    wood: std({ map: tex.wood, roughness: 0.7, metalness: 0, transparent: true, vertexColors: true }),
    straw: std({ map: tex.straw, roughness: 0.9, metalness: 0 }),
    cloth: std({ map: tex.cloth, roughness: 0.95, metalness: 0 }),
    towel: std({ map: tex.towel, roughness: 0.97, metalness: 0, side: DoubleSide }),
    deckInner: std({ color: '#121211', roughness: 0.9, metalness: 0.2, side: DoubleSide }),
    steel: std({ color: '#c3c7cc', roughness: 0.22, metalness: 0.95 }),
    engine: std({ color: '#1c1d1f', roughness: 0.55, metalness: 0.35 }),
    brass: std({ color: '#8f7240', roughness: 0.35, metalness: 0.9 }),
    drop: std({ color: '#f2f8fc', roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85, emissive: '#3c4a54' }),
    wetFilm: std({ color: '#dfe7ec', roughness: 0.02, metalness: 0, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 }),
    crumb: std({ map: tex.crumb, roughness: 0.9, metalness: 0 }),
    kibble: std({ color: '#5e3d22', roughness: 0.85 }),
    syrup: std({ color: '#c98b2b', roughness: 0.08, metalness: 0, transparent: true, opacity: 0.78 }),
    water: std({ color: '#b9d3e3', roughness: 0.04, metalness: 0, transparent: true, opacity: 0.55, depthWrite: false }),
    shadow: new MeshBasicMaterial({ map: blobTexture(), color: '#000000', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }),
  };
  const all = () => Object.values(m) as Material[];
  return { ...m, all };
}

export function disposeHumanMaterials(m: HumanMaterials): void {
  for (const mat of m.all()) {
    const map = (mat as MeshStandardMaterial).map;
    map?.dispose();
    mat.dispose();
  }
}
