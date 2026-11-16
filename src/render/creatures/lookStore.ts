/**
 * Lazily built geometry, materials and instance batches per look x detail (geometry is built the first time a look is
 * drawn at that detail, then kept). Every look shares the same few shader programs.
 */
import type { BufferGeometry, Material, Object3D } from 'three';
import { CreatureBatch } from './batch';
import type { Detail } from './geometry/builder';
import { LOOK_KEYS, LOOKS, lookIdOf, type LookDef } from './looks';
import { makeCreatureDepthMaterial, makeCreatureMaterial, type MotionUniforms, type SharedCreatureUniforms } from './shader/materials';
import { lookStrideMm } from './cullBounds';

export interface LookLod { body: CreatureBatch; wings: CreatureBatch | null; tris: number; wingTris: number }

export class LookEntry {
  readonly lods: (LookLod | null)[] = [null, null, null];
  private readonly owned: (BufferGeometry | Material)[] = [];
  constructor(readonly key: string, readonly def: LookDef) {}

  lod(d: Detail, parent: Object3D, shared: SharedCreatureUniforms, shadows: boolean): LookLod {
    let l = this.lods[d];
    if (l) return l;
    const built = this.def.build(d);
    const geo = built.body.toCreatureGeometry();
    const motion = withStride(this.def);
    const mat = makeCreatureMaterial(motion, shared, { roughness: this.def.roughness, pit: this.def.renderOrder === 3 });
    const depth = d === 0 && this.def.renderOrder === undefined ? makeCreatureDepthMaterial(motion, shared) : null;
    const body = new CreatureBatch(geo, mat, parent, depth, this.def.renderOrder ?? 0);
    body.setShadows(shadows);
    this.owned.push(geo, mat);
    if (depth) this.owned.push(depth);
    let wings: CreatureBatch | null = null, wingTris = 0;
    if (built.wings && built.wings.vcount > 0 && d < 2) {
      const wg = built.wings.toCreatureGeometry();
      const wm = makeCreatureMaterial(motion, shared, { roughness: 0.3, transparent: true, opacity: this.def.wingOpacity ?? 0.35 });
      wings = new CreatureBatch(wg, wm, parent, null, 1);
      wingTris = wings.tris;
      this.owned.push(wg, wm);
    }
    l = { body, wings, tris: body.tris, wingTris };
    this.lods[d] = l;
    return l;
  }

  setShadows(on: boolean): void { this.lods[0]?.body.setShadows(on); }

  reset(): void { for (const l of this.lods) { l?.body.reset(); l?.wings?.reset(); } }
  commit(): void { for (const l of this.lods) { l?.body.commit(); l?.wings?.commit(); } }

  /** Draw calls and triangles submitted this frame. */
  count(out: { calls: number; tris: number }): void {
    for (const l of this.lods) {
      if (!l) continue;
      if (l.body.n > 0) { out.calls++; out.tris += l.body.n * l.tris; }
      if (l.wings && l.wings.n > 0) { out.calls++; out.tris += l.wings.n * l.wingTris; }
    }
  }

  dispose(): void {
    for (const l of this.lods) { l?.body.dispose(); l?.wings?.dispose(); }
    for (const o of this.owned) o.dispose();
  }
}

/** The look's motion uniforms with its gait stride in uLeg.w (planted feet, gait.ts). */
function withStride(def: LookDef): MotionUniforms {
  const l = def.motion.leg;
  return { ...def.motion, leg: [l[0], l[1], l[2], lookStrideMm(def)] };
}

export class LookStore {
  readonly entries = new Map<string, LookEntry>();
  /** The same entries by look id (looks.ts LOOK_KEYS order), for the per-creature loop. */
  private readonly byId: (LookEntry | undefined)[] = [];
  buildMs = 0;

  constructor(private readonly parent: Object3D, private readonly shared: SharedCreatureUniforms, private shadows: boolean) {}

  /** The batches of `key` at detail d (built on first use). */
  lod(key: string, d: Detail): LookLod {
    const id = lookIdOf(key);
    if (id < 0) throw new Error(`creatures: unknown look '${key}'`);
    return this.lodAt(id, d);
  }

  /** The batches of look `id` at detail d (built on first use). */
  lodAt(id: number, d: Detail): LookLod {
    let e = this.byId[id];
    if (e && e.lods[d]) return e.lods[d]!;
    if (!e) {
      const key = LOOK_KEYS[id]!;
      e = new LookEntry(key, LOOKS[key]!);
      this.entries.set(key, e);
      this.byId[id] = e;
    }
    const t0 = performance.now();
    const l = e.lod(d, this.parent, this.shared, this.shadows);
    this.buildMs += performance.now() - t0;
    return l;
  }

  setShadows(on: boolean): void { this.shadows = on; for (const e of this.entries.values()) e.setShadows(on); }
  resetAll(): void { for (const e of this.entries.values()) e.reset(); }
  commitAll(): void { for (const e of this.entries.values()) e.commit(); }
  dispose(): void { for (const e of this.entries.values()) e.dispose(); this.entries.clear(); this.byId.length = 0; }
}
