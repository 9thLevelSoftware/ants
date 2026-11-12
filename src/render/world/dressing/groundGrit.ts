// Ground grit with volume (look-pass): loose grains near the camera focus as two instanced meshes (angular chips
// and rounded crumbs, flat-shaded fractured shapes, not eggs: spike-look problem 9), matched to the ground material
// (tuning.ts GRIT). Re-placed when the focus moved GRIT_REPLACE_MM; grains are world-anchored (gritPlacement.ts).
// Sits on the simulation's terrain height, mostly buried; dithered by the occlusion cone like the terrain; casts
// and receives shadows (contact darkening under the stones comes from the sun's shadow map).
import {
  Color, DynamicDrawUsage, Group, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Quaternion, Vector3,
  type BufferGeometry,
} from 'three';
import type { QualityPreset } from '@/render/app';
import { MATERIAL_IDS, type MaterialId } from '@/sim/types';
import { addPatch } from '../materials/surfacePatch';
import { GLSL_OCCLUSION, occlusionUniforms, WORLD_OCCLUSION_TERRAIN_TMAX } from '../materials/occlusion';
import { GLSL_WET } from '../materials/glsl';
import type { WorldUniforms } from '../materials/uniforms';
import type { TerrainSource } from '../lighting/simAdapter';
import { placeGrit, type GritGround } from './gritPlacement';
import { GRIT_QUALITY, GRIT_REPLACE_MM } from './tuning';

/** Deterministic lumpy unit shape: vertices pushed in and out by a hash, then a fracture plane or two. */
function lumpy(base: BufferGeometry, seed: number, cuts: number): BufferGeometry {
  const pos = base.getAttribute('position');
  const v = new Vector3();
  const planes: Vector3[] = [];
  for (let c = 0; c < cuts; c++) {
    const a = (seed * 7.1 + c * 2.39) % (Math.PI * 2), b = 0.4 + ((seed * 3.3 + c * 1.7) % 1) * 1.2;
    planes.push(new Vector3(Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)));
  }
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const h = Math.sin(n.x * 5.1 + seed) * Math.sin(n.y * 4.3 + seed * 2.1) * Math.sin(n.z * 6.7 + seed * 0.7);
    v.multiplyScalar(1 + 0.18 * h);
    for (const p of planes) { const d = v.dot(p) - 0.62; if (d > 0) v.addScaledVector(p, -d); } // flat fracture faces
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  base.computeVertexNormals();
  return base;
}

export class GroundGrit {
  readonly group = new Group();
  private chips: InstancedMesh;
  private crumbs: InstancedMesh;
  private readonly material: MeshStandardMaterial;
  private src: TerrainSource | null = null;
  private ground: GritGround | null = null;
  private quality: QualityPreset;
  private last = { x: Number.NaN, z: Number.NaN };
  /** Grains drawn (statistics). */
  count = 0;
  private holeTest: ((x: number, z: number) => boolean) | null = null;

  constructor(private readonly uniforms: WorldUniforms, quality: QualityPreset) {
    this.group.name = 'world:grit';
    this.quality = quality;
    this.material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, flatShading: true });
    this.material.name = 'world:grit';
    addPatch(this.material, 'world-grit', (s) => {
      Object.assign(s.uniforms, occlusionUniforms(uniforms), { uWet: uniforms.uWet });
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWrW;')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvWrW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWrW; uniform float uWet;\n${GLSL_OCCLUSION}\n${GLSL_WET}`)
        .replace('#include <map_fragment>', `wrOccDither(vWrW, ${WORLD_OCCLUSION_TERRAIN_TMAX.toFixed(3)});`)
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb = wrWetAlbedo(diffuseColor.rgb, uWet, 0.65);')
        .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wrWetRough(roughness, uWet, 0.25);');
    });
    this.chips = this.makeMesh(lumpy(new IcosahedronGeometry(1, 0), 1.3, 2), 'world:grit:chips');
    this.crumbs = this.makeMesh(lumpy(new OctahedronGeometry(1, 1), 2.7, 1), 'world:grit:crumbs');
    this.setQuality(quality);
  }

  private makeMesh(geom: BufferGeometry, name: string, capacity = 1): InstancedMesh {
    const m = new InstancedMesh(geom, this.material, capacity);
    m.name = name;
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false; // re-placed around the focus; bounds would change every re-placement
    m.receiveShadow = true;
    this.group.add(m);
    return m;
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    const cap = Math.max(1, GRIT_QUALITY[q.id].max);
    for (const key of ['chips', 'crumbs'] as const) {
      const old = this[key];
      if (old.instanceMatrix.count !== cap) {
        this.group.remove(old);
        const m = this.makeMesh(old.geometry, old.name, cap);
        old.dispose();
        this[key] = m;
      }
      this[key].castShadow = q.shadows.enabled && q.id !== 'low';
    }
    this.last.x = Number.NaN; // re-place at the new density
  }

  /** New terrain (world); `hole` reports nest openings and drains where no grain may lie. */
  setSource(src: TerrainSource | null, hole: ((x: number, z: number) => boolean) | null = null): void {
    this.src = src;
    this.holeTest = hole;
    this.ground = src ? this.makeGround(src) : null;
    this.last.x = Number.NaN;
    if (!src) this.chips.count = this.crumbs.count = this.count = 0;
  }

  /** The terrain heights changed (deformation): re-place at the next update. */
  invalidate(): void {
    this.last.x = Number.NaN;
  }

  private makeGround(src: TerrainSource): GritGround {
    const hole = src.holes;
    return {
      bu: src.bu,
      materialAt: (x, z) => {
        if (x < 0 || z < 0 || x >= src.worldSize || z >= src.worldSize) return null;
        if (hole) {
          const hi = Math.floor(x / hole.cell), hk = Math.floor(z / hole.cell);
          if (hi >= 0 && hk >= 0 && hi < hole.nx && hk < hole.nz && hole.data[hk * hole.nx + hi]) return null;
        }
        if (this.holeTest?.(x, z)) return null;
        const i = Math.min(src.matNx - 1, Math.floor(x / src.matCell)), k = Math.min(src.matNz - 1, Math.floor(z / src.matCell));
        return (MATERIAL_IDS[src.matCodes[k * src.matNx + i]] ?? null) as MaterialId | null;
      },
      heightAt: (x, z) => sampleHeights(src, x, z),
    };
  }

  /** Re-places the grains when the focus (camera look point on the ground) moved enough. */
  update(focusX: number, focusZ: number, underground: number): void {
    this.group.visible = underground < 0.99;
    const g = this.ground, q = GRIT_QUALITY[this.quality.id];
    if (!g || q.max <= 0) { this.chips.count = this.crumbs.count = this.count = 0; return; }
    if (Math.hypot(focusX - this.last.x, focusZ - this.last.z) < GRIT_REPLACE_MM) return;
    this.last.x = focusX; this.last.z = focusZ;
    const grains = placeGrit(g, focusX, focusZ, q.radiusMm * (g.bu / 4), q.max);
    let nc = 0, nr = 0;
    for (const gr of grains) {
      if (gr.sx < 0.05) continue;
      const mesh = gr.chip ? this.chips : this.crumbs;
      const k = gr.chip ? nc++ : nr++;
      _q.setFromAxisAngle(_y, gr.yaw).multiply(_t.setFromAxisAngle(_x, gr.tilt));
      _m.compose(_p.set(gr.x, gr.y, gr.z), _q, _s.set(gr.sx, gr.sy, gr.sz));
      mesh.setMatrixAt(k, _m);
      mesh.setColorAt(k, _c.setRGB(gr.color[0], gr.color[1], gr.color[2]));
    }
    this.chips.count = nc; this.crumbs.count = nr;
    this.count = nc + nr;
    for (const m of [this.chips, this.crumbs]) {
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
  }

  /** Triangles of all grains (statistics, budgets). */
  get triangles(): number {
    const t = (m: InstancedMesh) => ((m.geometry.index?.count ?? m.geometry.getAttribute('position').count) / 3) * m.count;
    return t(this.chips) + t(this.crumbs);
  }

  dispose(): void {
    for (const m of [this.chips, this.crumbs]) { m.geometry.dispose(); m.dispose(); }
    this.material.dispose();
    this.group.clear();
  }
}

/** Bilinear terrain height (the same as the kernel's heightAt). */
function sampleHeights(src: TerrainSource, x: number, z: number): number {
  const fx = Math.min(src.nx - 1.000001, Math.max(0, x / src.cell)), fz = Math.min(src.nz - 1.000001, Math.max(0, z / src.cell));
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz, n = src.nx, d = src.heights;
  const a = d[iz * n + ix], b = d[iz * n + ix + 1], c = d[(iz + 1) * n + ix], e = d[(iz + 1) * n + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
}

const _m = new Matrix4(), _p = new Vector3(), _s = new Vector3(), _q = new Quaternion(), _t = new Quaternion(), _c = new Color();
const _x = new Vector3(1, 0, 0), _y = new Vector3(0, 1, 0);
