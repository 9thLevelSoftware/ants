// Textures of the draped decor and grass, all through the one AssetLoader (architecture 8): the two CC0 leaf atlases
// (with opacity), the moss scan and the grass-blade atlas (straightened at load). Without a loader (tests) or when a
// map is missing, small generated stand-ins keep every shader path valid.
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType, type Texture } from 'three';
import type { AssetLoader } from '@/render/assets';
import { straightenGrassAtlas } from '../vegetation/grassStrip';
import type { DrapedTextures } from './drapedMaterial';

export const DECOR_TEXTURE_IDS = ['leaf_atlas_maple', 'leaf_atlas_oak_dry', 'moss', 'grass_blades_atlas'] as const;

/** 4 x 4 cells of soft ellipses (alpha) or brown-orange tones (albedo): a leaf atlas stand-in. */
function standInAtlas(kind: 'albedo' | 'alpha'): DataTexture {
  const N = 128, c = N / 4, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const cx = (x % c) / c - 0.5, cy = (y % c) / c - 0.5, cell = Math.floor(y / c) * 4 + Math.floor(x / c);
    const inside = (cx / 0.42) ** 2 + (cy / 0.3) ** 2 < 1;
    const i = (y * N + x) * 4;
    if (kind === 'alpha') { const v = inside ? 255 : 0; d[i] = d[i + 1] = d[i + 2] = v; } else {
      d[i] = 120 + ((cell * 37) % 80); d[i + 1] = 70 + ((cell * 23) % 50); d[i + 2] = 30;
    }
    d[i + 3] = 255;
  }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.magFilter = LinearFilter; t.minFilter = LinearMipmapLinearFilter; t.generateMipmaps = true;
  if (kind === 'albedo') t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function standInMoss(): DataTexture {
  const N = 32, d = new Uint8Array(N * N * 4);
  for (let i = 0; i < N * N; i++) { const v = ((i * 2654435761) >>> 24) / 255; d[i * 4] = 50 + v * 40; d[i * 4 + 1] = 80 + v * 50; d[i * 4 + 2] = 25; d[i * 4 + 3] = 255; }
  const t = new DataTexture(d, N, N, RGBAFormat, UnsignedByteType);
  t.wrapS = t.wrapT = RepeatWrapping; t.magFilter = LinearFilter; t.colorSpace = SRGBColorSpace; t.needsUpdate = true;
  return t;
}

export interface DecorTextureSet {
  draped: DrapedTextures;
  grassStrip: Texture | null;
  /** Generated stand-ins this set owns (disposed with it). */
  owned: Texture[];
}

export async function loadDecorTextures(assets: AssetLoader | null): Promise<DecorTextureSet> {
  if (!assets) {
    const owned = [standInAtlas('albedo'), standInAtlas('alpha'), standInMoss()];
    return { draped: { freshAlbedo: owned[0], freshAlpha: owned[1], dryAlbedo: owned[0], dryAlpha: owned[1], moss: owned[2] }, grassStrip: null, owned };
  }
  await assets.init();
  const get = (id: string, map: string) => assets.textureAsync(id, map);
  const [fa, fo, da, dop, moss, ga, go] = await Promise.all([
    get('leaf_atlas_maple', 'albedo'), get('leaf_atlas_maple', 'opacity'), get('leaf_atlas_oak_dry', 'albedo'), get('leaf_atlas_oak_dry', 'opacity'),
    get('moss', 'albedo'), get('grass_blades_atlas', 'albedo'), get('grass_blades_atlas', 'opacity'),
  ]);
  let grassStrip: Texture | null = null;
  try { grassStrip = straightenGrassAtlas(ga.image, go.image); } catch { grassStrip = null; }
  return { draped: { freshAlbedo: fa, freshAlpha: fo, dryAlbedo: da, dryAlpha: dop, moss }, grassStrip, owned: grassStrip ? [grassStrip] : [] };
}
