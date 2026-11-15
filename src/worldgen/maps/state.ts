// Results of the derived-maps step kept beside the context (float versions of the byte maps), for the later
// steps: suitability of rival profiles, start pose, validation and repairs. Also the signature of everything the
// geometric maps (columns, nav, shade, water, surface) read: heights, ground layers, terrain holes, primitives and
// which of them are ground, water bodies, canopy discs. Steps 7-9 often add only anchors and sites, which feed
// suitability alone: an unchanged signature lets the re-derivation keep the geometric maps (maps/index.ts). Two
// independent 32-bit FNV-1a lanes, so a false match is out of reach.

import type { GenContext } from '../kit/context';
import type { ColumnFn } from '../kit/column';
import type { Columns } from './columns';
import type { NavDerived } from './nav';
import type { ShadeResult } from './shade';
import type { WaterResult } from './water';
import type { SurfaceResult } from './surface';

export interface MapState {
  col: Columns;
  nav: NavDerived;
  shade: ShadeResult;
  water: WaterResult;
  surface: SurfaceResult;
  /** Static Q per nav cell per species id (0..1). */
  q: Record<string, Float32Array>;
  /** geometrySignature() of the inputs the geometric maps were built from. */
  geometry?: string;
  /** Column routine they were built with (undefined = the default analytic one). */
  column?: ColumnFn;
}

const states = new WeakMap<GenContext, MapState>();

export function setMapState(ctx: GenContext, s: MapState): void {
  states.set(ctx, s);
}

/** The derived maps of this context; throws before the maps step ran. */
export function mapState(ctx: GenContext): MapState {
  const s = states.get(ctx);
  if (!s) throw new Error('worldgen: derived maps are not built yet (step 6)');
  return s;
}

export function hasMapState(ctx: GenContext): boolean {
  return states.has(ctx);
}

const P1 = 0x01000193, P2 = 0x01000197;

class Sig {
  a = 0x811c9dc5 | 0;
  b = 0x2b8d4e3f | 0;
  u32(v: number): void {
    this.a = Math.imul(this.a ^ v, P1);
    this.b = Math.imul(this.b ^ (v + 0x9e3779b9), P2);
  }
  num(v: number): void {
    F64[0] = v;
    this.u32(U32[0]);
    this.u32(U32[1]);
  }
  words(arr: ArrayBufferView): void {
    const n = arr.byteLength >> 2;
    const w = new Uint32Array(arr.buffer, arr.byteOffset, n);
    for (let i = 0; i < n; i++) this.u32(w[i]);
    const tail = new Uint8Array(arr.buffer, arr.byteOffset + 4 * n, arr.byteLength - 4 * n);
    for (let i = 0; i < tail.length; i++) this.u32(tail[i]);
    this.u32(arr.byteLength);
  }
  str(s: string): void {
    for (let i = 0; i < s.length; i++) this.u32(s.charCodeAt(i));
    this.u32(s.length);
  }
}

const F64 = new Float64Array(1), U32 = new Uint32Array(F64.buffer);

/** Signature of the inputs of the geometric derived maps (see the file comment). */
export function geometrySignature(ctx: GenContext): string {
  const w = ctx.world, s = new Sig();
  s.words(w.terrain.data);
  s.words(w.ground.surface.data);
  s.words(w.ground.crustMm.data);
  s.words(w.ground.subsoil.data);
  if (w.terrainHoles) s.words(w.terrainHoles.data);
  s.u32(w.prims.length);
  for (const p of w.prims) {
    s.u32(p.id);
    s.str(p.shape);
    s.str(p.material);
    s.u32(p.flags);
    s.u32(ctx.groundPrims.has(p.id) ? 1 : 0);
    s.num(p.pos.x); s.num(p.pos.y); s.num(p.pos.z);
    s.num(p.rot.x); s.num(p.rot.y); s.num(p.rot.z); s.num(p.rot.w);
    s.num(p.size.x); s.num(p.size.y); s.num(p.size.z); s.num(p.round);
  }
  s.u32(w.waterBodies.length);
  for (const b of w.waterBodies) { s.str(b.kind); s.num(b.pos.x); s.num(b.pos.y); s.num(b.pos.z); s.num(b.radius); }
  s.u32(ctx.canopies.length);
  for (const d of ctx.canopies) { s.num(d.x); s.num(d.y); s.num(d.z); s.num(d.r); s.num(d.transmittance); }
  return `${(s.a >>> 0).toString(16)}:${(s.b >>> 0).toString(16)}`;
}
