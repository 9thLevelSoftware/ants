// World fingerprint (GDD 04 DET-6): FNV-1a 32 over every value of WorldData except `meta`, walked in sorted key
// order; typed arrays are hashed by their bytes, numbers by their float64 bits, strings by UTF-16 code units.
// Covers params, generator version, primitives, heightfield, all byte maps, zones, micro-connections, pre-carves,
// placements and the start pose, so any drift in the generator changes it.

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

class Fnv {
  h = FNV_OFFSET;
  private f64 = new Float64Array(1);
  private f64b = new Uint8Array(this.f64.buffer);

  byte(b: number): void {
    this.h = Math.imul(this.h ^ (b & 255), FNV_PRIME);
  }
  bytes(a: Uint8Array): void {
    let h = this.h;
    for (let i = 0; i < a.length; i++) h = Math.imul(h ^ a[i], FNV_PRIME);
    this.h = h;
  }
  num(v: number): void {
    this.f64[0] = v === 0 ? 0 : v; // -0 and 0 hash alike
    this.bytes(this.f64b);
  }
  str(s: string): void {
    for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.byte(c); this.byte(c >>> 8); }
    this.byte(0);
  }
}

function walk(f: Fnv, v: unknown): void {
  if (v === null || v === undefined) { f.byte(0); return; }
  switch (typeof v) {
    case 'number': f.byte(1); f.num(v); return;
    case 'string': f.byte(2); f.str(v); return;
    case 'boolean': f.byte(v ? 3 : 4); return;
    case 'object': break;
    default: throw new Error(`fingerprint: unsupported ${typeof v}`);
  }
  if (ArrayBuffer.isView(v)) {
    f.byte(5);
    f.str(v.constructor.name);
    f.num(v.byteLength);
    f.bytes(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
    return;
  }
  if (Array.isArray(v)) {
    f.byte(6);
    f.num(v.length);
    for (const e of v) walk(f, e);
    return;
  }
  f.byte(7);
  const o = v as Record<string, unknown>;
  for (const k of Object.keys(o).sort()) {
    if (o[k] === undefined) continue;
    f.str(k);
    walk(f, o[k]);
  }
}

/** uint32 fingerprint of a world (meta excluded). Typed arrays must be little-endian views (all JS engines). */
export function worldFingerprint(world: object): number {
  const f = new Fnv();
  const o = world as Record<string, unknown>;
  for (const k of Object.keys(o).sort()) {
    if (k === 'meta' || o[k] === undefined) continue;
    f.str(k);
    walk(f, o[k]);
  }
  return f.h >>> 0;
}
