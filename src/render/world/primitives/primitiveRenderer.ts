// Draws every solid primitive (static world + dynamic + moved objects) as InstancedMeshes, one per
// (shape geometry, material, diggable, level of detail). Instances carry rotation+translation in instanceMatrix,
// size+rounding in `iSize` and a tint in instanceColor; the shader expands the shared parametric geometry.
//
// Two layers with their own meshes: the static world (prepared once per world in a spatial grid) and the dynamic
// primitives (moved objects, toys, cars; a small set rebuilt whenever one of them changes, so adds, removes and
// moves show in the very next frame). A dynamic change never touches the static meshes. Both layers draw only
// what can be seen: nothing past the haze (`cullMm`), nothing smaller than about a pixel, detailed geometry near.
import {
  BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, MeshDepthMaterial, RGBADepthPacking, Sphere, Uniform, Vector3, Vector4,
} from 'three';
import type { Primitive } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { primMaterialDef } from '../materials/materialDefs';
import { addPatch, BREACH_UNIFORM_MAX, primVertexPatch, type BreachList } from '../materials/surfacePatch';
import { isDiggablePrim } from '../lighting/simAdapter';
import { PRIM_DETAIL, roundedBoxData, roundedCylinderData, sphereData, toBufferGeometry } from './primGeometry';
import { PrimSet, type BatchDef, type LookFn, type PartitionView } from './primCells';
import { LEAF_OUTLINE_GLSL, LOOK_DEPTH_FRAG } from '../dressing/finishGlsl';
import { PrimLayer } from './primLayer';
import { primSignature, type GeomKind, type Lod } from './primInstances';

/** Macro albedo variation on primitives. */
const PRIM_MACRO = 0.08;
/**
 * A primitive is not drawn once its distance exceeds its bounding radius times this: at 1080p and a 50 degree
 * field of view it then covers less than about one pixel (1 / (1500 * tan 25 deg / 540) ~ 0.8 px).
 */
export const PRIM_SIZE_CULL_K = 1500;
/** Spatial grid cell of the static set, in near-detail distances (cells near the camera hold few primitives). */
const STATIC_CELL_IN_NEAR = 2;
/** Re-partition when the cull distance changed by more than this fraction (haze easing between habitats). */
const CULL_CHANGE_FRACTION = 0.05;

export class PrimitiveRenderer {
  readonly group = new Group();
  readonly breaches: BreachList;
  private readonly staticLayer: PrimLayer;
  private readonly dynamicLayer: PrimLayer;
  private baseGeoms = new Map<string, BufferGeometry>();
  private depthMats = new Map<string, MeshDepthMaterial>();
  private statics: readonly Primitive[] = [];
  /** Current dynamic list (dynamic prims + moved static copies) and their signatures. */
  private dynamicSigs = new Map<number, number>();
  private movedIds = new Set<number>();
  private staticDirty = true;
  private dynamicDirty = true;
  private lastCam = new Vector3(1e12, 0, 0);
  private lastCull = -1;
  private view: PartitionView = { x: 0, y: 0, z: 0, nearMm: 0, cullMm: Infinity, sizeK: PRIM_SIZE_CULL_K };
  /** Within this distance (mm, from the bounding sphere) primitives use the detailed geometry. */
  nearMm: number;
  /** Updates that re-partitioned anything (statistics / tests). */
  rebuilds = 0;
  /** Render-only look of each primitive (dressing/looks.ts); none = default colours, natural finish. */
  private look: LookFn | undefined;

  constructor(private readonly lib: MaterialLibrary, nearMm: number) {
    this.group.name = 'world:primitives';
    this.nearMm = nearMm;
    const spheres: Vector4[] = [];
    for (let i = 0; i < BREACH_UNIFORM_MAX; i++) spheres.push(new Vector4(0, -1e9, 0, 0));
    this.breaches = { spheres: new Uniform(spheres), count: new Uniform(0) };
    const factory = (def: BatchDef, lod: Lod, cap: number, name: string) => this.makeMesh(def, lod, cap, name);
    this.staticLayer = new PrimLayer('world:prims:', factory, this.group);
    this.dynamicLayer = new PrimLayer('world:prims:dyn:', factory, this.group);
  }

  /** Sets the look function used by the next setStatic / dynamic sync (null = default looks). */
  setLooks(look: LookFn | null): void {
    this.look = look ?? undefined;
  }

  /** Replaces the static primitive set (new world). */
  setStatic(prims: readonly Primitive[]): void {
    this.statics = prims;
    this.staticLayer.setSet(new PrimSet(prims, isDiggablePrim, Math.max(1, this.nearMm * STATIC_CELL_IN_NEAR), this.look));
    this.movedIds.clear();
    this.dynamicSigs.clear();
    this.dynamicLayer.setSet(null);
    this.staticDirty = this.dynamicDirty = true;
  }

  /** Drops every primitive (world being replaced). */
  clear(): void {
    this.setStatic([]);
  }

  /**
   * Syncs dynamic primitives and moved static ones. Cheap when nothing changed (one signature per dynamic prim).
   * `moved` maps static primitive id -> replacement (object moved); the replacement is drawn in the dynamic layer
   * and the original is hidden in the static one.
   */
  syncDynamic(dynamic: readonly Primitive[], moved: ReadonlyMap<number, Primitive>): void {
    const count = dynamic.length + moved.size;
    let changed = count !== this.dynamicSigs.size;
    if (!changed) {
      for (const p of dynamic) if (this.dynamicSigs.get(p.id) !== primSignature(p)) { changed = true; break; }
    }
    if (!changed) {
      for (const [id, p] of moved) if (!this.movedIds.has(id) || this.dynamicSigs.get(id) !== primSignature(p)) { changed = true; break; }
    }
    if (!changed) return;
    const list: Primitive[] = [...dynamic];
    for (const p of moved.values()) list.push(p);
    this.dynamicSigs.clear();
    for (const p of list) this.dynamicSigs.set(p.id, primSignature(p));
    this.dynamicLayer.setSet(new PrimSet(list, isDiggablePrim, Math.max(1, this.nearMm * STATIC_CELL_IN_NEAR), this.look));
    this.dynamicDirty = true;
    // hide / show static originals only when the set of moved objects changed
    const set = this.staticLayer.set;
    const sameMoved = moved.size === this.movedIds.size && [...moved.keys()].every((id) => this.movedIds.has(id));
    if (set && !sameMoved) {
      set.hidden.fill(0);
      for (const id of moved.keys()) { const i = set.indexOf(id); if (i >= 0) set.hidden[i] = 1; }
      this.staticDirty = true;
    }
    this.movedIds = new Set(moved.keys());
  }

  /** Nearest breach spheres (diggable primitives discard inside them). */
  setBreaches(list: readonly { pos: { x: number; y: number; z: number }; r: number }[], cam: Vector3): void {
    const n = Math.min(list.length, BREACH_UNIFORM_MAX);
    const sorted = list.length > BREACH_UNIFORM_MAX
      ? [...list].sort((a, b) => cam.distanceToSquared(a.pos as Vector3) - cam.distanceToSquared(b.pos as Vector3))
      : list;
    for (let i = 0; i < n; i++) this.breaches.spheres.value[i].set(sorted[i].pos.x, sorted[i].pos.y, sorted[i].pos.z, sorted[i].r);
    this.breaches.count.value = n;
  }

  /**
   * Re-partitions what is drawn when the camera moved a quarter of the near distance, the cull distance changed,
   * or a layer's content changed. `cullMm` = distance past which nothing is visible (haze), mm.
   */
  update(cam: Vector3, cullMm = Infinity): void {
    const cull = Number.isFinite(cullMm) && cullMm > 0 ? cullMm : Infinity;
    const moved = cam.distanceTo(this.lastCam) >= this.nearMm * 0.25;
    const cullChanged = this.lastCull < 0 || Math.abs(cull - this.lastCull) > CULL_CHANGE_FRACTION * Math.min(cull, this.lastCull);
    const doStatic = this.staticDirty || moved || cullChanged;
    const doDynamic = this.dynamicDirty || moved || cullChanged;
    if (!doStatic && !doDynamic) return;
    if (moved || cullChanged) { this.lastCam.copy(cam); this.lastCull = cull; }
    const v = this.view;
    v.x = this.lastCam.x; v.y = this.lastCam.y; v.z = this.lastCam.z;
    v.nearMm = this.nearMm;
    v.cullMm = this.lastCull;
    if (doStatic) this.staticLayer.partition(v);
    if (doDynamic) this.dynamicLayer.partition(v);
    this.staticDirty = this.dynamicDirty = false;
    this.rebuilds++;
  }

  private baseGeometry(geom: GeomKind, lod: Lod): BufferGeometry {
    const key = `${geom}|${lod}`;
    let g = this.baseGeoms.get(key);
    if (!g) {
      const d = PRIM_DETAIL[lod];
      g = geom === 'box' ? toBufferGeometry(roundedBoxData(d.arc), false)
        : geom === 'cyl' ? toBufferGeometry(roundedCylinderData(d.arc + 1, d.around), false)
          : toBufferGeometry(sphereData(d.around), true);
      this.baseGeoms.set(key, g);
    }
    return g;
  }

  private depthMaterial(family: 'rounded' | 'ellipsoid'): MeshDepthMaterial {
    let m = this.depthMats.get(family);
    if (!m) {
      m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      addPatch(m, `prim-depth-${family}-looks`, (s) => {
        primVertexPatch(s, family);
        // leaf silhouettes cut in the shadow map too (dressing/finishGlsl.ts)
        s.vertexShader = s.vertexShader
          .replace('#include <common>', '#include <common>\nattribute vec4 iLook; varying vec4 vWrLook; varying vec4 vWrSize; varying vec3 vWrP;')
          .replace('#include <project_vertex>', '#include <project_vertex>\nvWrLook = iLook; vWrSize = iSize; vWrP = transformed;');
        s.fragmentShader = s.fragmentShader
          .replace('#include <common>', `#include <common>\nvarying vec4 vWrLook; varying vec4 vWrSize; varying vec3 vWrP;\n${LEAF_OUTLINE_GLSL}`)
          .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${LOOK_DEPTH_FRAG}`);
      });
      this.depthMats.set(family, m);
    }
    return m;
  }

  private makeMesh(def: BatchDef, lod: Lod, capacity: number, name: string): { mesh: InstancedMesh; size: InstancedBufferAttribute; look: InstancedBufferAttribute } {
    const base = this.baseGeometry(def.geom, lod);
    const g = new BufferGeometry();
    for (const attr of ['position', 'normal', 'aCorner']) g.setAttribute(attr, base.getAttribute(attr));
    g.setIndex(base.getIndex());
    const size = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    g.setAttribute('iSize', size);
    const look = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    g.setAttribute('iLook', look);
    const family = def.geom === 'sphere' ? 'ellipsoid' : 'rounded';
    const mat = this.lib.surfaceMaterialFor(
      primMaterialDef(def.material),
      { key: `prim-${family}${def.diggable ? '-dig' : ''}-looks`, space: 'instance', prim: family, macro: PRIM_MACRO, looks: true },
      def.diggable ? this.breaches : undefined,
    );
    const mesh = new InstancedMesh(g, mat, capacity);
    mesh.name = name;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.depthMaterial(family);
    mesh.boundingSphere = new Sphere();
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    return { mesh, size, look };
  }

  /** Draw statistics (visible meshes and instances). */
  stats(): { prims: number; buckets: number; instancesNear: number; instancesFar: number; instancesTiny: number; uploads: number } {
    const a = this.staticLayer.stats(), b = this.dynamicLayer.stats();
    const set = this.staticLayer.set;
    let hidden = 0;
    if (set) for (const id of this.movedIds) if (set.indexOf(id) >= 0) hidden++;
    return {
      prims: this.statics.length - hidden + this.dynamicSigs.size, buckets: a.meshes + b.meshes,
      instancesNear: a.near + b.near, instancesFar: a.far + b.far, instancesTiny: a.tiny + b.tiny, uploads: this.staticLayer.uploads + this.dynamicLayer.uploads,
    };
  }

  has(id: number): boolean {
    return this.dynamicSigs.has(id) || (this.staticLayer.set?.indexOf(id) ?? -1) >= 0;
  }

  dispose(): void {
    this.staticLayer.dispose();
    this.dynamicLayer.dispose();
    for (const g of this.baseGeoms.values()) g.dispose();
    for (const m of this.depthMats.values()) m.dispose();
    this.baseGeoms.clear();
    this.depthMats.clear();
    this.group.clear();
  }
}
