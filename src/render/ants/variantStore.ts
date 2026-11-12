/**
 * Lazily built ant variants (species x caste x size class) and their GPU batches: four LOD batches, the wing batch
 * and carried-item batches (near/mid) that reuse the carrier's instance data, so items and wings follow the head and
 * body exactly through the same vertex shader (also in the shadow pass).
 */
import { Matrix4, type BufferGeometry, type Material, type Object3D } from 'three';
import { buildAntVariant } from './geometry/buildAnt';
import type { AntVariant } from './geometry/rig';
import { morphCaste, resolveMorph, variantKey, type AppearanceLike } from './morph/catalog';
import { InstanceBatch } from './batches';
import { makeAntDepthMaterial, makeAntMaterial, makeWingMaterial, type SharedAntUniforms } from './shader/materials';
import { PART } from './geometry/rig';
import type { ItemDef } from './items/itemDef';

export interface VariantEntry {
  variant: AntVariant;
  lods: InstanceBatch[];
  wings: InstanceBatch | null;
  items: Map<string, InstanceBatch>;
  materials: Material[];
  /** Geometries built for this entry's carried-item batches (the variant's own geometry is not listed). */
  itemGeometries: BufferGeometry[];
}

export interface VariantStoreOptions { physicalLod0: boolean; shadows: boolean }

export class VariantStore {
  readonly entries: VariantEntry[] = [];
  private byKey = new Map<string, number>();
  buildMs = 0;

  constructor(
    private readonly parent: Object3D, private readonly shared: SharedAntUniforms,
    private readonly appearance: (species: string) => AppearanceLike | null, private opts: VariantStoreOptions,
  ) {}

  /** Variant index for a sim species/caste/size class and wing state (built on first use; see morphCaste). */
  index(species: string, caste: string, sizeClass: string | null, winged: boolean | null = null): number {
    const mc = morphCaste(species, caste, sizeClass, winged);
    const key = variantKey(species, mc);
    let i = this.byKey.get(key);
    if (i === undefined) {
      const t0 = performance.now();
      const v = buildAntVariant(resolveMorph(species, mc, this.appearance(species)), this.entries.length);
      v.key = key;
      this.entries.push(this.makeEntry(v));
      this.buildMs += performance.now() - t0;
      i = this.entries.length - 1;
      this.byKey.set(key, i);
    }
    return i;
  }

  variant(species: string, caste: string, sizeClass: string | null): AntVariant {
    return this.entries[this.index(species, caste, sizeClass)]!.variant;
  }

  private makeEntry(v: AntVariant): VariantEntry {
    const m = v.morph; const sh = this.shared;
    const m0 = makeAntMaterial(v.rig, sh, this.opts.physicalLod0 ? { physical: true, roughness: m.roughness, sheen: m.sheen, clearcoat: m.clearcoat, clearcoatRoughness: m.clearcoatRoughness } : { roughness: m.roughness });
    const m1 = makeAntMaterial(v.rig, sh, { roughness: m.roughness + 0.05 });
    const depth = makeAntDepthMaterial(v.rig, sh);
    const lods = [
      new InstanceBatch(v.lods[0]!, m0, this.parent, this.opts.shadows ? depth : null, 0, 32),
      new InstanceBatch(v.lods[1]!, m1, this.parent, null),
      new InstanceBatch(v.lods[2]!, m1, this.parent, null),
      new InstanceBatch(v.lods[3]!, m1, this.parent, null),
    ];
    const materials: Material[] = [m0, m1, depth];
    let wings: InstanceBatch | null = null;
    if (v.wings) {
      const wm = makeWingMaterial(v.rig, sh, m.colors.wingMembrane, m.colors.wingVein);
      wings = new InstanceBatch(v.wings, wm, this.parent, null, 2, 16);
      wings.mesh.receiveShadow = false;
      materials.push(wm);
    }
    return { variant: v, lods, wings, items: new Map(), materials, itemGeometries: [] };
  }

  /** Carried-item batch of a variant: the item mesh baked at this carrier's grip. */
  itemBatch(e: VariantEntry, def: ItemDef, near: boolean): InstanceBatch {
    const key = def.kind + (near ? ':n' : ':m');
    let b = e.items.get(key);
    if (!b) {
      const r = e.variant.rig;
      const g = def.geometry.clone();
      g.applyMatrix4(new Matrix4().makeTranslation(r.grip[0], r.grip[1], r.grip[2]).multiply(new Matrix4().makeRotationX(r.headTilt + def.carry.pitch)));
      const rig = g.getAttribute('aRig');
      for (let i = 0; i < rig.count; i++) rig.setX(i, PART.ITEM);
      g.computeBoundingSphere();
      const t = def.transparent;
      const mat = makeAntMaterial(r, this.shared, { physical: t, roughness: 0.6, transparent: t, opacity: t ? 0.62 : 1 });
      const shadow = near && this.opts.shadows && !t ? makeAntDepthMaterial(r, this.shared) : null;
      b = new InstanceBatch(g, mat, this.parent, shadow, t ? 3 : 0, 16);
      e.materials.push(mat); if (shadow) e.materials.push(shadow);
      e.items.set(key, b); e.itemGeometries.push(g);
    }
    return b;
  }

  /** Empties every batch (start of a frame). */
  resetAll(): void {
    for (const e of this.entries) { for (const b of e.lods) b.reset(); e.wings?.reset(); for (const b of e.items.values()) b.reset(); }
  }

  /** Flags the used ranges of every batch for upload (end of a frame). */
  commitAll(): void {
    for (const e of this.entries) { for (const b of e.lods) b.commit(); e.wings?.commit(); for (const b of e.items.values()) b.commit(); }
  }

  forEachBatch(fn: (b: InstanceBatch) => void): void {
    for (const e of this.entries) { for (const b of e.lods) fn(b); if (e.wings) fn(e.wings); for (const b of e.items.values()) fn(b); }
  }

  /**
   * Changing the material class or shadows rebuilds the materials and batches of every variant in place. Entries keep
   * their index and geometry, so variant indices cached by callers (per-ant render state) stay valid.
   */
  setOptions(o: VariantStoreOptions): void {
    if (o.physicalLod0 === this.opts.physicalLod0 && o.shadows === this.opts.shadows) return;
    this.opts = o;
    for (let i = 0; i < this.entries.length; i++) {
      const old = this.entries[i]!;
      this.disposeGpu(old);
      this.entries[i] = this.makeEntry(old.variant);
    }
  }

  private disposeGpu(e: VariantEntry): void {
    for (const b of e.lods) b.dispose();
    e.wings?.dispose();
    for (const b of e.items.values()) b.dispose();
    for (const m of e.materials) m.dispose();
    for (const g of e.itemGeometries) g.dispose();
  }

  dispose(): void {
    for (const e of this.entries) { this.disposeGpu(e); for (const g of e.variant.lods) g.dispose(); e.variant.wings?.dispose(); }
    this.entries.length = 0;
    this.byKey.clear();
  }
}
