// Mounds and spoil heaps (GDD 03 1.4): pile heightfields on top of the terrain. Each mound is its own small
// displaced mesh cropped to the cells that carry soil, in a granular fresh-soil material. Where the pile thins out
// (the rim, the kept-clear entrance) fragments are discarded so the terrain shows through and the entrance hole
// stays open; the hole mask is applied as well. Meshes rebuild when the mound's change signature moves.
import { BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Uniform, Vector3, type MeshStandardMaterial } from 'three';
import type { Mound } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { MATERIAL_DEFS, MOUND_SOIL, type MaterialDef } from '../materials/materialDefs';
import { moundSignature } from '../lighting/simAdapter';
import { HOLE_MASK_GLSL, type HoleMaskUniforms } from './holeMask';

/** Pile height below which the mound is not drawn (the terrain shows), mm. */
export const MOUND_MIN_PILE_MM = 0.05;
/** Pile height over which the rim colour blends into the full crumb colour, mm. */
export const MOUND_RIM_BLEND_MM = 2.5;

interface MoundMesh {
  sig: string;
  mesh: Mesh;
}

/** Geometry of one mound (pure arrays, tested): returns null when no cell has soil. */
export function buildMoundArrays(m: Mound): { pos: Float32Array; normal: Float32Array; pile: Float32Array; index: Uint32Array } | null {
  const n = m.n, h = m.h, base = m.base;
  let i0 = n, i1 = -1, j0 = n, j1 = -1;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    if (h[j * n + i] > 0) { i0 = Math.min(i0, i); i1 = Math.max(i1, i); j0 = Math.min(j0, j); j1 = Math.max(j1, j); }
  }
  if (i1 < 0) return null;
  i0 = Math.max(0, i0 - 1); j0 = Math.max(0, j0 - 1); i1 = Math.min(n - 1, i1 + 1); j1 = Math.min(n - 1, j1 + 1);
  const w = i1 - i0 + 1, d = j1 - j0 + 1;
  const half = ((n - 1) * m.cell) / 2;
  const top = (i: number, j: number) => {
    const ii = Math.min(n - 1, Math.max(0, i)), jj = Math.min(n - 1, Math.max(0, j));
    const b = base[jj * n + ii];
    return (Number.isFinite(b) ? b : NaN) + h[jj * n + ii];
  };
  const pos = new Float32Array(w * d * 3), normal = new Float32Array(w * d * 3), pile = new Float32Array(w * d);
  for (let j = 0; j < d; j++) for (let i = 0; i < w; i++) {
    const gi = i0 + i, gj = j0 + j, k = j * w + i;
    const y = top(gi, gj);
    pos[k * 3] = m.centerX - half + gi * m.cell;
    pos[k * 3 + 1] = Number.isFinite(y) ? y : 0;
    pos[k * 3 + 2] = m.centerZ - half + gj * m.cell;
    pile[k] = Number.isFinite(y) ? h[gj * n + gi] : -1;
    let dx = top(gi - 1, gj) - top(gi + 1, gj), dz = top(gi, gj - 1) - top(gi, gj + 1);
    if (!Number.isFinite(dx)) dx = 0;
    if (!Number.isFinite(dz)) dz = 0;
    const l = Math.hypot(dx, 2 * m.cell, dz);
    normal[k * 3] = dx / l; normal[k * 3 + 1] = (2 * m.cell) / l; normal[k * 3 + 2] = dz / l;
  }
  const idx: number[] = [];
  for (let j = 0; j < d - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, e = c + 1;
    if (pile[a] < 0 || pile[b] < 0 || pile[c] < 0 || pile[e] < 0) continue; // unusable cells
    if (pile[a] <= 0 && pile[b] <= 0 && pile[c] <= 0 && pile[e] <= 0) continue;
    idx.push(a, c, b, b, c, e);
  }
  if (!idx.length) return null;
  return { pos, normal, pile, index: new Uint32Array(idx) };
}

export class MoundRenderer {
  readonly group = new Group();
  private meshes = new Map<number, MoundMesh>();
  /** Materials by def id. Owned here (not cached in the library): they bind THIS world's hole mask. */
  private materials = new Map<string, MeshStandardMaterial>();
  /** Rebuilds so far (statistics / tests). */
  rebuilds = 0;

  constructor(private readonly lib: MaterialLibrary, private readonly holeMask: HoleMaskUniforms) {
    this.group.name = 'world:mounds';
  }

  private materialFor(m: Mound) {
    const known = (MATERIAL_DEFS as Record<string, MaterialDef>)[m.material];
    const def: MaterialDef = known && m.material !== 'loam' && m.material !== 'humus' ? { ...known, scaleMm: known.scaleMm * 0.5, dualScale: 0 } : MOUND_SOIL;
    let mat = this.materials.get(def.id);
    if (!mat) this.materials.set(def.id, (mat = this.createMaterial(def)));
    return mat;
  }

  private createMaterial(def: MaterialDef): MeshStandardMaterial {
    return this.lib.createSurfaceMaterial(def, {
      key: 'mound', space: 'world', prim: null, macro: 0.1,
      extra: {
        key: 'mound-v1',
        uniforms: this.holeMask as unknown as Record<string, Uniform<unknown>>,
        vertDecl: 'attribute float aPile; varying float vPile;',
        vertMain: 'vPile = aPile;',
        fragDecl: `varying float vPile;\n${HOLE_MASK_GLSL}`,
        fragMain: `
if (vPile < ${MOUND_MIN_PILE_MM.toFixed(3)} || wrHoleMask(vWrW.xz) > 0.5) discard;
// thin rim: flatter, lighter soil like the surrounding ground; thick pile: dark fresh crumbs
float wrRim = smoothstep(0.0, ${MOUND_RIM_BLEND_MM.toFixed(2)}, vPile);
wrAlb *= mix(1.2, 1.0, wrRim);
wrWet = max(wrWet, 0.25 * wrRim);`,
      },
    });
  }

  /** Syncs meshes with the simulation's mounds (rebuilds only changed ones). */
  sync(list: readonly Mound[]): void {
    const seen = new Set<number>();
    for (const m of list) {
      seen.add(m.id);
      const sig = moundSignature(m);
      const cur = this.meshes.get(m.id);
      if (cur && cur.sig === sig) continue;
      if (cur) { this.group.remove(cur.mesh); cur.mesh.geometry.dispose(); this.meshes.delete(m.id); }
      const arrays = buildMoundArrays(m);
      this.rebuilds++;
      if (!arrays) { this.meshes.set(m.id, { sig, mesh: new Mesh() }); continue; }
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(arrays.pos, 3));
      g.setAttribute('normal', new BufferAttribute(arrays.normal, 3));
      g.setAttribute('aPile', new BufferAttribute(arrays.pile, 1));
      g.setIndex(new BufferAttribute(arrays.index, 1));
      g.computeBoundingSphere();
      g.boundingSphere ??= new Sphere(new Vector3(m.centerX, 0, m.centerZ), m.n * m.cell);
      const mesh = new Mesh(g, this.materialFor(m));
      mesh.name = `world:mound:${m.id}`;
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.group.add(mesh);
      this.meshes.set(m.id, { sig, mesh });
    }
    for (const [id, cur] of this.meshes) {
      if (seen.has(id)) continue;
      this.group.remove(cur.mesh);
      cur.mesh.geometry.dispose();
      this.meshes.delete(id);
    }
  }

  /** Forces a rebuild of one mound on the next sync (the 'mound-changed' event). */
  invalidate(id: number): void {
    const cur = this.meshes.get(id);
    if (cur) cur.sig = '';
  }

  get count(): number {
    return this.meshes.size;
  }

  dispose(): void {
    for (const cur of this.meshes.values()) cur.mesh.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.meshes.clear();
    this.group.clear();
  }
}
