// The single asset loader (architecture section 8): textures, audio bytes and JSON, from embedded packs or relative
// fetch. Textures come back cached and configured (colour space, wrapping, anisotropy, mipmaps). A missing asset
// yields a generated placeholder and exactly one warning, never an exception.
import {
  ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, NoColorSpace, RepeatWrapping, RGBAFormat, SRGBColorSpace, Texture,
  UnsignedByteType,
} from 'three';
import { createLogger } from '@/core';
import type { AssetBackend } from './backends';
import { MANIFEST_PATH, parseManifest, textureAssetId, type AssetEntry, type Manifest, type TextureMap } from './manifest';
import { PLACEHOLDER_SIZE, placeholderPixels } from './placeholder';

/** Decoded image source three can upload (ImageBitmap in browsers; anything in tests). */
export type ImageSourceLike = TexImageSource | { width: number; height: number };

export interface AssetLoaderOptions {
  backends: AssetBackend[];
  /** Bytes -> image. Default: createImageBitmap(Blob) flipped to match three's default UV orientation. */
  decodeImage?: (bytes: ArrayBuffer, mime: string, maxSize: number) => Promise<ImageSourceLike>;
  /** RGBA pixels -> image, for placeholders on textures already handed out. Default: createImageBitmap(ImageData). */
  makeImage?: (rgba: Uint8Array, w: number, h: number) => Promise<ImageSourceLike>;
  warn?: (msg: string) => void;
  anisotropy?: number;
  /** Largest texture edge to upload (px); larger images are downscaled at decode. 0 = no cap. */
  maxTextureSize?: number;
  manifestPath?: string;
}

const log = createLogger('assets');

function mimeOf(path: string): string {
  const ext = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : ext === 'mp3' ? 'audio/mpeg' : ext === 'ogg' ? 'audio/ogg' : ext === 'json' ? 'application/json' : 'image/jpeg';
}

async function defaultDecode(bytes: ArrayBuffer, mime: string, maxSize: number): Promise<ImageSourceLike> {
  const blob = new Blob([bytes], { type: mime });
  const bmp = await createImageBitmap(blob, { imageOrientation: 'flipY', premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  if (maxSize > 0 && Math.max(bmp.width, bmp.height) > maxSize) {
    const k = maxSize / Math.max(bmp.width, bmp.height);
    const small = await createImageBitmap(bmp, { resizeWidth: Math.round(bmp.width * k), resizeHeight: Math.round(bmp.height * k), resizeQuality: 'high' });
    bmp.close();
    return small;
  }
  return bmp;
}

async function defaultMakeImage(rgba: Uint8Array, w: number, h: number): Promise<ImageSourceLike> {
  return createImageBitmap(new ImageData(new Uint8ClampedArray(rgba), w, h));
}

export interface PreloadResult { loaded: string[]; failed: string[] }

export class AssetLoader {
  manifest: Manifest | null = null;
  private readonly backends: AssetBackend[];
  private readonly decodeImage: NonNullable<AssetLoaderOptions['decodeImage']>;
  private readonly makeImage: NonNullable<AssetLoaderOptions['makeImage']>;
  private readonly warnFn: (m: string) => void;
  private readonly warned = new Set<string>();
  private textures = new Map<string, { tex: Texture; ready: Promise<Texture>; failed: boolean }>();
  private audio = new Map<string, Promise<ArrayBuffer>>();
  private placeholders = new Map<string, DataTexture>();
  private anisotropy: number;
  private readonly maxTextureSize: number;
  private readonly manifestPath: string;
  private initPromise: Promise<void> | null = null;

  constructor(opts: AssetLoaderOptions) {
    this.backends = opts.backends;
    this.decodeImage = opts.decodeImage ?? defaultDecode;
    this.makeImage = opts.makeImage ?? defaultMakeImage;
    this.warnFn = opts.warn ?? ((m) => log.warn(m));
    this.anisotropy = opts.anisotropy ?? 1;
    this.maxTextureSize = opts.maxTextureSize ?? 0;
    this.manifestPath = opts.manifestPath ?? MANIFEST_PATH;
  }

  /** Which back end served (or would serve) a path, for diagnostics. */
  backendFor(path: string): string | null {
    return this.backends.find((b) => b.has(path))?.name ?? null;
  }

  private warnOnce(key: string, msg: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    this.warnFn(msg);
  }

  /** Load the manifest. Never rejects: without a manifest every texture is a placeholder (with one warning). */
  init(): Promise<void> {
    if (!this.initPromise) {
      this.initPromise = this.json(this.manifestPath).then((j) => {
        const { manifest, warnings } = parseManifest(j);
        this.manifest = manifest;
        for (const w of warnings) this.warnOnce(w, w);
      }).catch((e: unknown) => {
        this.warnOnce('manifest', `asset manifest unavailable (${(e as Error).message}); using placeholders`);
      });
    }
    return this.initPromise;
  }

  /** Raw bytes of a path, trying each back end that claims it. */
  async bytes(path: string): Promise<ArrayBuffer> {
    let last: unknown = new Error(`no asset back end for ${path}`);
    for (const b of this.backends) {
      if (!b.has(path)) continue;
      try { return await b.bytes(path); } catch (e) { last = e; }
    }
    throw last;
  }

  async json<T = unknown>(path: string): Promise<T> {
    const buf = await this.bytes(path);
    return JSON.parse(new TextDecoder().decode(buf)) as T;
  }

  /** Audio file bytes by manifest id; a fresh copy each call (decodeAudioData detaches its input). */
  async audioData(id: string): Promise<ArrayBuffer> {
    await this.init();
    let p = this.audio.get(id);
    if (!p) {
      const entry = this.manifest?.assets.get(id);
      p = entry && entry.kind === 'audio' ? this.bytes(entry.path) : Promise.reject(new Error(`unknown audio asset ${id}`));
      this.audio.set(id, p);
      p.catch(() => this.audio.delete(id));
    }
    return (await p).slice(0);
  }

  /** A 8x8 placeholder DataTexture for a map kind (shared, never disposed by texture users). */
  placeholder(map: TextureMap): DataTexture {
    let t = this.placeholders.get(map);
    if (!t) {
      t = new DataTexture(placeholderPixels(map), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE, RGBAFormat, UnsignedByteType);
      this.configure(t, map, false);
      t.magFilter = LinearFilter;
      t.needsUpdate = true;
      this.placeholders.set(map, t);
    }
    return t;
  }

  private configure(t: Texture, map: TextureMap, atlas: boolean): void {
    t.colorSpace = map === 'albedo' ? SRGBColorSpace : NoColorSpace;
    t.wrapS = t.wrapT = atlas ? ClampToEdgeWrapping : RepeatWrapping;
    t.anisotropy = this.anisotropy;
    t.generateMipmaps = true;
    t.minFilter = LinearMipmapLinearFilter;
    t.magFilter = LinearFilter;
    t.flipY = false; // decoded with imageOrientation 'flipY' instead (ImageBitmaps ignore flipY)
  }

  /**
   * Cached texture for a material map. Returned at once; its image arrives asynchronously (await textureAsync or
   * preload before the first frame that needs it). On failure the image becomes a generated placeholder.
   */
  texture(materialId: string, map: TextureMap): Texture {
    return this.entry(materialId, map).tex;
  }

  textureAsync(materialId: string, map: TextureMap): Promise<Texture> {
    return this.entry(materialId, map).ready;
  }

  /** Has the texture fallen back to a placeholder? */
  isPlaceholder(materialId: string, map: TextureMap): boolean {
    return this.textures.get(textureAssetId(materialId, map))?.failed ?? false;
  }

  private entry(materialId: string, map: TextureMap) {
    const key = textureAssetId(materialId, map);
    let e = this.textures.get(key);
    if (e) return e;
    const tex = new Texture();
    tex.name = key;
    const rec = { tex, ready: Promise.resolve(tex), failed: false };
    rec.ready = this.loadInto(rec, materialId, map);
    this.textures.set(key, rec);
    e = rec;
    return e;
  }

  private async loadInto(rec: { tex: Texture; failed: boolean }, materialId: string, map: TextureMap): Promise<Texture> {
    const t = rec.tex;
    try {
      await this.init();
      const mat = this.manifest?.materials.get(materialId);
      const path = mat?.maps[map];
      if (!path) throw new Error(this.manifest ? `no map '${map}' for material '${materialId}'` : 'no manifest');
      this.configure(t, map, !!mat?.atlas);
      t.image = await this.decodeImage(await this.bytes(path), mimeOf(path), this.maxTextureSize);
      t.needsUpdate = true;
      return t;
    } catch (e) {
      rec.failed = true;
      this.warnOnce(`tex:${materialId}/${map}`, `texture ${materialId}/${map} unavailable (${(e as Error).message}); using a placeholder`);
      this.configure(t, map, false);
      try {
        t.image = await this.makeImage(placeholderPixels(map), PLACEHOLDER_SIZE, PLACEHOLDER_SIZE);
        t.needsUpdate = true;
      } catch {
        // no image API at all: leave the texture empty (renders as the GL default) rather than throw
      }
      return t;
    }
  }

  setAnisotropy(n: number): void {
    this.anisotropy = n;
    for (const { tex } of this.textures.values()) { tex.anisotropy = n; tex.needsUpdate = !!tex.image; }
  }

  /** Preload manifest assets by id (textures and audio). Never rejects. */
  async preload(ids: string[], onProgress?: (done: number, total: number, id: string) => void): Promise<PreloadResult> {
    await this.init();
    const res: PreloadResult = { loaded: [], failed: [] };
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      const a: AssetEntry | undefined = this.manifest?.assets.get(id);
      let ok = false;
      if (a?.kind === 'texture' && a.material && a.map) {
        await this.textureAsync(a.material, a.map);
        ok = !this.isPlaceholder(a.material, a.map);
      } else if (a?.kind === 'audio') {
        ok = await this.audioData(id).then(() => true, () => false);
        if (!ok) this.warnOnce(`audio:${id}`, `audio ${id} unavailable`);
      } else {
        this.warnOnce(`unknown:${id}`, `preload: unknown asset id ${id}`);
      }
      (ok ? res.loaded : res.failed).push(id);
      onProgress?.(++done, ids.length, id);
    }));
    return res;
  }

  /** Material ids of the manifest's textures for one material: all its map asset ids (handy for preload). */
  materialAssetIds(materialId: string): string[] {
    const m = this.manifest?.materials.get(materialId);
    return m ? Object.keys(m.maps).map((k) => textureAssetId(materialId, k)) : [];
  }

  dispose(): void {
    for (const { tex } of this.textures.values()) {
      const img = tex.image as { close?: () => void } | undefined;
      tex.dispose();
      img?.close?.();
    }
    for (const t of this.placeholders.values()) t.dispose();
    this.textures.clear();
    this.placeholders.clear();
    this.audio.clear();
  }
}
