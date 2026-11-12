// Terrain hole mask (spike-nest.md 5.7): instead of a uniform list of breach spheres (which does not scale), a
// sparse virtual texture says where carved space opens the ground. The world is cut into square tiles; only tiles
// that contain a hole get a slot in an R8 atlas (one border texel on each side so bilinear filtering never bleeds
// between slots). An RG8 index texture (one texel per world tile) holds slot coordinates + 1 (0 = no hole).
//
// Texels store the field value just below the terrain surface, remapped so 0.5 = the iso line: the shader
// thresholds the bilinear value at 0.5, which gives smooth hole outlines at sub-texel precision.
// Rasterisation is incremental: callers mark regions dirty (carve listener boxes, new breaches) and `update()`
// re-probes a budgeted number of tiles per frame.
import { DataTexture, LinearFilter, NearestFilter, RedFormat, RGFormat, UnsignedByteType, Uniform, Vector4 } from 'three';

/** Signed openness probe: > 0 where the ground at (x, z) is open (mm, roughly a distance). */
export type HoleProbe = (x: number, z: number) => number;

export interface HoleMaskConfig {
  /** World edge, mm. */
  worldSize: number;
  /** Mask texel edge, mm. */
  texelMm: number;
  /** Texels per tile edge (without the border). */
  tileTexels: number;
  /** Atlas slots per edge. */
  atlasSlots: number;
}

export interface HoleMaskUniforms {
  tHoleIdx: Uniform<DataTexture>;
  tHoleAtlas: Uniform<DataTexture>;
  /** x tile edge mm, y tiles per world edge, z texels per tile, w atlas size px. */
  uHoleP: Uniform<Vector4>;
}

export const HOLE_MASK_GLSL = /* glsl */ `
uniform sampler2D tHoleIdx; uniform sampler2D tHoleAtlas; uniform vec4 uHoleP;
// 1 inside an opened hole, 0 elsewhere (bilinear value thresholded at 0.5).
float wrHoleMask(vec2 xz) {
  vec2 tf = xz / uHoleP.x;
  if (tf.x < 0.0 || tf.y < 0.0 || tf.x >= uHoleP.y || tf.y >= uHoleP.y) return 0.0;
  ivec2 t = ivec2(floor(tf));
  vec2 slot = texelFetch(tHoleIdx, t, 0).rg * 255.0;
  if (slot.x + slot.y < 0.5) return 0.0;
  vec2 a = (slot - 1.0) * (uHoleP.z + 2.0);
  vec2 px = a + 1.0 + fract(tf) * uHoleP.z;
  return step(0.5, texture2D(tHoleAtlas, px / uHoleP.w).r);
}
`;

const BORDER = 1;

export class HoleMask {
  readonly cfg: HoleMaskConfig;
  readonly tileMm: number;
  readonly tiles: number;
  readonly slotPx: number;
  readonly atlasPx: number;
  /** Per world tile: slot index + 1, 0 = none. */
  readonly tileSlot: Int32Array;
  readonly indexData: Uint8Array;
  readonly atlasData: Uint8Array;
  readonly indexTex: DataTexture;
  readonly atlasTex: DataTexture;
  readonly uniforms: HoleMaskUniforms;
  private freeSlots: number[] = [];
  private dirty = new Set<number>();
  private probe: HoleProbe | null = null;
  /** Tiles rasterised so far (statistics). */
  rasterised = 0;
  /** Set when a texture changed; cleared by update(). */
  private texDirty = false;

  constructor(cfg: HoleMaskConfig) {
    this.cfg = cfg;
    this.tileMm = cfg.texelMm * cfg.tileTexels;
    this.tiles = Math.max(1, Math.ceil(cfg.worldSize / this.tileMm));
    this.slotPx = cfg.tileTexels + 2 * BORDER;
    this.atlasPx = this.slotPx * cfg.atlasSlots;
    this.tileSlot = new Int32Array(this.tiles * this.tiles);
    this.indexData = new Uint8Array(this.tiles * this.tiles * 2);
    this.atlasData = new Uint8Array(this.atlasPx * this.atlasPx);
    for (let s = cfg.atlasSlots * cfg.atlasSlots - 1; s >= 0; s--) this.freeSlots.push(s);
    this.indexTex = new DataTexture(this.indexData, this.tiles, this.tiles, RGFormat, UnsignedByteType);
    this.indexTex.magFilter = this.indexTex.minFilter = NearestFilter;
    this.indexTex.generateMipmaps = false;
    this.indexTex.unpackAlignment = 1;
    this.indexTex.needsUpdate = true;
    this.atlasTex = new DataTexture(this.atlasData, this.atlasPx, this.atlasPx, RedFormat, UnsignedByteType);
    this.atlasTex.magFilter = this.atlasTex.minFilter = LinearFilter;
    this.atlasTex.generateMipmaps = false;
    this.atlasTex.unpackAlignment = 1;
    this.atlasTex.needsUpdate = true;
    this.uniforms = {
      tHoleIdx: new Uniform(this.indexTex),
      tHoleAtlas: new Uniform(this.atlasTex),
      uHoleP: new Uniform(new Vector4(this.tileMm, this.tiles, cfg.tileTexels, this.atlasPx)),
    };
  }

  setProbe(probe: HoleProbe | null): void {
    this.probe = probe;
  }

  /** Number of atlas slots in use. */
  get usedSlots(): number {
    return this.cfg.atlasSlots * this.cfg.atlasSlots - this.freeSlots.length;
  }

  get pending(): number {
    return this.dirty.size;
  }

  /** Marks every tile overlapping the rectangle [x0, x1] x [z0, z1] (mm) for re-rasterisation. */
  markRect(x0: number, z0: number, x1: number, z1: number): void {
    const t = this.tileMm, n = this.tiles;
    const i0 = Math.max(0, Math.floor(x0 / t)), i1 = Math.min(n - 1, Math.floor(x1 / t));
    const k0 = Math.max(0, Math.floor(z0 / t)), k1 = Math.min(n - 1, Math.floor(z1 / t));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) this.dirty.add(k * n + i);
  }

  /** Marks the tiles around a circle (breach footprint). */
  markCircle(x: number, z: number, r: number): void {
    const m = r + 2 * this.cfg.texelMm;
    this.markRect(x - m, z - m, x + m, z + m);
  }

  /** Drops every slot (new world). */
  clear(): void {
    this.tileSlot.fill(0);
    this.indexData.fill(0);
    this.atlasData.fill(0);
    this.freeSlots = [];
    for (let s = this.cfg.atlasSlots * this.cfg.atlasSlots - 1; s >= 0; s--) this.freeSlots.push(s);
    this.dirty.clear();
    this.texDirty = true;
  }

  /**
   * Re-rasterises up to `budget` dirty tiles (nearest to (cx, cz) first). Returns the number processed.
   * Marks the textures for upload when anything changed.
   */
  update(budget: number, cx = 0, cz = 0): number {
    if (!this.probe || this.dirty.size === 0) return this.flush();
    let list = [...this.dirty];
    if (list.length > budget) {
      const n = this.tiles, t = this.tileMm;
      const d = (k: number) => Math.hypot(((k % n) + 0.5) * t - cx, (Math.floor(k / n) + 0.5) * t - cz);
      list.sort((a, b) => d(a) - d(b));
      list = list.slice(0, budget);
    }
    for (const k of list) { this.dirty.delete(k); this.rasterTile(k); }
    this.flush();
    return list.length;
  }

  private flush(): number {
    if (this.texDirty) {
      this.indexTex.needsUpdate = true;
      this.atlasTex.needsUpdate = true;
      this.texDirty = false;
    }
    return 0;
  }

  /** Probes one tile (border included); stores it in a slot if any texel is open, frees its slot otherwise. */
  private rasterTile(k: number): void {
    const probe = this.probe!;
    const n = this.tiles, T = this.cfg.tileTexels, S = this.slotPx, tex = this.cfg.texelMm;
    const ti = k % n, tk = Math.floor(k / n);
    const x0 = ti * this.tileMm, z0 = tk * this.tileMm;
    const scratch = new Uint8Array(S * S);
    let open = false;
    for (let j = 0; j < S; j++) {
      const z = z0 + (j - BORDER + 0.5) * tex;
      for (let i = 0; i < S; i++) {
        const x = x0 + (i - BORDER + 0.5) * tex;
        const v = probe(x, z);
        // 0.5 at the iso line, +-0.5 over two texels
        const b = Math.max(0, Math.min(255, Math.round(127.5 + (v / (2 * tex)) * 127.5)));
        scratch[j * S + i] = b;
        if (b >= 128 && i >= BORDER && j >= BORDER && i < T + BORDER && j < T + BORDER) open = true;
      }
    }
    this.rasterised++;
    let slot = this.tileSlot[k] - 1;
    if (!open) {
      if (slot >= 0) this.release(k, slot);
      return;
    }
    if (slot < 0) {
      const s = this.freeSlots.pop();
      if (s === undefined) return; // atlas full: this hole stays closed (logged by the caller's statistics)
      slot = s;
      this.tileSlot[k] = slot + 1;
      const per = this.cfg.atlasSlots;
      this.indexData[k * 2] = (slot % per) + 1;
      this.indexData[k * 2 + 1] = Math.floor(slot / per) + 1;
    }
    const per = this.cfg.atlasSlots;
    const ax = (slot % per) * S, ay = Math.floor(slot / per) * S;
    for (let j = 0; j < S; j++) this.atlasData.set(scratch.subarray(j * S, j * S + S), (ay + j) * this.atlasPx + ax);
    this.texDirty = true;
  }

  private release(k: number, slot: number): void {
    this.tileSlot[k] = 0;
    this.indexData[k * 2] = 0;
    this.indexData[k * 2 + 1] = 0;
    this.freeSlots.push(slot);
    this.texDirty = true;
  }

  /** CPU lookup of the mask (tests / debugging): true where the shader would discard. */
  isOpen(x: number, z: number): boolean {
    const tf = x / this.tileMm, tz = z / this.tileMm;
    if (tf < 0 || tz < 0 || tf >= this.tiles || tz >= this.tiles) return false;
    const k = Math.floor(tz) * this.tiles + Math.floor(tf);
    const slot = this.tileSlot[k] - 1;
    if (slot < 0) return false;
    const per = this.cfg.atlasSlots, S = this.slotPx, T = this.cfg.tileTexels;
    const ax = (slot % per) * S, ay = Math.floor(slot / per) * S;
    // bilinear like the GPU: pixel centres at +0.5
    const px = ax + BORDER + (tf - Math.floor(tf)) * T - 0.5, py = ay + BORDER + (tz - Math.floor(tz)) * T - 0.5;
    const x0 = Math.floor(px), y0 = Math.floor(py), fx = px - x0, fy = py - y0;
    const at = (xx: number, yy: number) => this.atlasData[yy * this.atlasPx + xx] / 255;
    const v = (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy;
    return v >= 0.5;
  }

  dispose(): void {
    this.indexTex.dispose();
    this.atlasTex.dispose();
  }
}
