// Packs material texture sets into two texture arrays for the terrain splat shader (one sampler pair for any number
// of ground materials): layer i of `albedoRough` = albedo RGB (sRGB) + roughness in A; layer i of `normalHeight` =
// normal XYZ + a height proxy (albedo luminance, for height-aware blending) in A. Images come from the asset loader
// (already decoded) or from procedural pixels; they are resampled to one layer size on a 2D canvas.
import {
  DataArrayTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType,
} from 'three';
import type { PixelSet } from './procedural';

/** One layer source: decoded images (ImageBitmap / canvas / image) or procedural pixels. */
export type LayerSource =
  | { kind: 'images'; albedo: CanvasImageSource | null; normal: CanvasImageSource | null; rough: CanvasImageSource | null }
  | { kind: 'pixels'; set: PixelSet };

export interface TerrainTextureArrays {
  albedoRough: DataArrayTexture;
  normalHeight: DataArrayTexture;
  size: number;
  layers: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function makeContext(size: number): Ctx2D {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(size, size).getContext('2d', { willReadFrequently: true });
    if (c) return c;
  }
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d', { willReadFrequently: true });
  if (!g) throw new Error('2D canvas unavailable');
  return g;
}

/** RGBA pixels of an image resampled to size x size (null image -> flat fill). */
function readImage(g: Ctx2D, img: CanvasImageSource | null, size: number, fill: [number, number, number]): Uint8ClampedArray {
  g.clearRect(0, 0, size, size);
  if (img && (img as { width?: number }).width) {
    g.drawImage(img, 0, 0, size, size);
    return g.getImageData(0, 0, size, size).data;
  }
  const d = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < d.length; i += 4) { d[i] = fill[0]; d[i + 1] = fill[1]; d[i + 2] = fill[2]; d[i + 3] = 255; }
  return d;
}

/** Nearest resample of procedural pixels to the layer size (they are small and tileable). */
function resamplePixels(src: Uint8Array, srcSize: number, size: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    const sy = Math.floor((y * srcSize) / size);
    for (let x = 0; x < size; x++) {
      const sx = Math.floor((x * srcSize) / size);
      const s = (sy * srcSize + sx) * 4, d = (y * size + x) * 4;
      out[d] = src[s]; out[d + 1] = src[s + 1]; out[d + 2] = src[s + 2]; out[d + 3] = src[s + 3];
    }
  }
  return out;
}

export function buildTerrainArrays(sources: LayerSource[], size: number, anisotropy: number): TerrainTextureArrays {
  const n = Math.max(1, sources.length);
  const ar = new Uint8Array(size * size * 4 * n);
  const nh = new Uint8Array(size * size * 4 * n);
  const g = sources.some((s) => s.kind === 'images') ? makeContext(size) : null;
  sources.forEach((src, layer) => {
    let alb: Uint8ClampedArray, nor: Uint8ClampedArray, rou: Uint8ClampedArray;
    if (src.kind === 'images') {
      alb = readImage(g!, src.albedo, size, [120, 100, 80]);
      nor = readImage(g!, src.normal, size, [128, 128, 255]);
      rou = readImage(g!, src.rough, size, [200, 200, 200]);
    } else {
      alb = resamplePixels(src.set.albedo, src.set.size, size);
      nor = resamplePixels(src.set.normal, src.set.size, size);
      rou = resamplePixels(src.set.rough, src.set.size, size);
    }
    const o = layer * size * size * 4;
    for (let i = 0; i < size * size * 4; i += 4) {
      ar[o + i] = alb[i]; ar[o + i + 1] = alb[i + 1]; ar[o + i + 2] = alb[i + 2]; ar[o + i + 3] = rou[i + 1];
      nh[o + i] = nor[i]; nh[o + i + 1] = nor[i + 1]; nh[o + i + 2] = nor[i + 2];
      nh[o + i + 3] = Math.round(alb[i] * 0.2126 + alb[i + 1] * 0.7152 + alb[i + 2] * 0.0722);
    }
  });
  const mk = (data: Uint8Array, srgb: boolean) => {
    const t = new DataArrayTexture(data, size, size, n);
    t.format = RGBAFormat;
    t.type = UnsignedByteType;
    t.wrapS = t.wrapT = RepeatWrapping;
    t.magFilter = LinearFilter;
    t.minFilter = LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = anisotropy;
    t.colorSpace = srgb ? SRGBColorSpace : NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  return { albedoRough: mk(ar, true), normalHeight: mk(nh, false), size, layers: n };
}
