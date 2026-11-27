// Water standing in flooded nest cavities (GDD 03 App. F12): the surface of the nest's water at its level over the
// flooded carve samples that are open but dry above (src/sim/nest/flood floodSurface), meshed as a lattice with the
// carve grid's openness at that height as the shore value (floodShore.ts), so it ends at the cavity's outline with a
// soft shore. Rebuilt when the level or the cell count changes, at most every FLOOD_REBUILD_S. The shader (water
// look of the outdoor puddle, decor/water: depth tint, Fresnel opacity, meniscus line, faint ripples) is below.
import { BufferGeometry, Color, DoubleSide, Group, Mesh, MeshStandardMaterial, Uniform } from 'three';
import type { Sim } from '@/sim/types';
import { floodSurface } from '@/sim/nest/flood/surface';
import { GLSL_NOISE } from '../materials/glsl';
import { opennessAt, shoreGeometry, SHORE_ISO, waterDepthMm } from './floodShore';
import { FLOOD_LEVEL_EPS_MM, FLOOD_REBUILD_S, FLOOD_WATER } from './tuning';

interface Sheet { mesh: Mesh; level: number; cells: number }

const f3 = (a: readonly number[]) => `vec3(${a.map((x) => x.toFixed(4)).join(', ')})`;
const W = FLOOD_WATER;

/** The shader patch of the flood sheet (exported for the tests: it must compile in three's chunk layout). */
export function floodWaterFragment(frag: string): string {
  return frag
    .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\nuniform float uFloodTime;\nvarying float vShore; varying float vFlDepth; varying vec3 vFlW;`)
    .replace('#include <map_fragment>', `
// the sheet ends where the wall closes the cavity (shore value at its iso level) and where the floor comes up to the water (depth 0): both lines are
// interpolated across the lattice, so the outline is smooth to well under a voxel
float flS = min((vShore - ${SHORE_ISO.toFixed(3)}) / ${(1 - SHORE_ISO).toFixed(3)}, vFlDepth / ${W.depthSoftMm.toFixed(3)});   // 0 at the shore .. 1 well inside
if (flS <= 0.0) discard;
float flDeep = smoothstep(0.0, ${W.deepAt.toFixed(3)}, min(flS, vFlDepth / ${W.depthDeepMm.toFixed(3)}));
float flEdge = 1.0 - smoothstep(0.0, ${W.meniscus.toFixed(3)}, flS);
diffuseColor.rgb = mix(${f3(W.shallowTint)}, ${f3(W.deepTint)}, flDeep);`)
    .replace('#include <normal_fragment_maps>', `
{ vec2 p = vFlW.xz / ${W.rippleMm.toFixed(2)} + vec2(0.7, 0.4) * uFloodTime * ${(W.rippleSpeed / W.rippleMm).toFixed(3)};
  vec2 rp = vec2(wrNoise(p), wrNoise(p + 7.3)) - 0.5;
  vec3 nw = normalize(vec3(rp.x * ${W.rippleTilt.toFixed(3)}, 1.0, rp.y * ${W.rippleTilt.toFixed(3)}));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`)
    .replace('#include <opaque_fragment>', `
{ float nv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  float soft = smoothstep(0.0, ${W.softEdge.toFixed(3)}, flS);
  float flGraze = mix(${W.edgeOnAlpha.toFixed(3)}, 1.0, smoothstep(0.0, ${W.edgeOnFrom.toFixed(3)}, nv));
  diffuseColor.a = clamp(mix(${W.alphaShallow.toFixed(3)}, ${W.alphaDeep.toFixed(3)}, flDeep) * flGraze + fres * ${W.fresnelAlpha.toFixed(3)} * flGraze + flEdge * 0.15, 0.0, 1.0) * soft;
  outgoingLight += flEdge * (reflectedLight.directSpecular * 0.4 + totalEmissiveRadiance + vec3(${W.meniscusGain.toFixed(3)}) * 0.25); }
#include <opaque_fragment>`);
}

export class FloodWater {
  readonly group = new Group();
  private readonly material: MeshStandardMaterial;
  private readonly time = new Uniform(0);
  private readonly sheets = new Map<number, Sheet>();
  private sinceBuild = Infinity;
  /** Cells drawn over all nests, and triangles of the sheets (stats; the cells x 2 of the cell-square sheet it replaced, for the cost comparison). */
  cells = 0;
  triangles = 0;

  constructor() {
    this.group.name = 'weather.flood-water';
    this.material = new MeshStandardMaterial({
      color: 0xffffff, roughness: W.roughness, metalness: 0, transparent: true, side: DoubleSide,
      emissive: new Color(0.5, 0.6, 0.55).multiplyScalar(W.emissive), envMapIntensity: W.env, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -1,
    });
    this.material.name = 'flood-water';
    this.material.onBeforeCompile = (s) => {
      s.uniforms.uFloodTime = this.time;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aShore; attribute float aDepth; varying float vShore; varying float vFlDepth; varying vec3 vFlW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShore = aShore; vFlDepth = aDepth; vFlW = transformed;');
      s.fragmentShader = floodWaterFragment(s.fragmentShader);
    };
    this.material.customProgramCacheKey = () => 'flood-water-shore';
  }

  /** Follows the nests' water (dt real seconds; 0 = settle now). */
  update(sim: Sim | null, dt: number): void {
    if (dt > 0) this.time.value += dt;
    this.sinceBuild += dt > 0 ? dt : Infinity;
    if (this.sinceBuild < FLOOD_REBUILD_S) return;
    this.sinceBuild = 0;
    const seen = new Set<number>();
    let total = 0;
    if (sim) {
      for (const nest of sim.stores.nests.list) {
        if (!nest.alive || nest.flood.water <= 0) continue;
        const s = floodSurface(sim, nest.id);
        if (!s || s.cells.length === 0) continue;
        seen.add(nest.id);
        total += s.cells.length / 2;
        const old = this.sheets.get(nest.id);
        if (old && Math.abs(old.level - s.level) < FLOOD_LEVEL_EPS_MM && old.cells === s.cells.length) continue;
        if (old) { this.group.remove(old.mesh); old.mesh.geometry.dispose(); this.sheets.delete(nest.id); }
        const g = sheetOf(sim, s.cells, s.cell, s.level);
        if (!g) continue;
        const mesh = new Mesh(g, this.material);
        mesh.name = `flood-water:${nest.id}`;
        mesh.renderOrder = 5;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.sheets.set(nest.id, { mesh, level: s.level, cells: s.cells.length });
      }
    }
    for (const [id, sh] of this.sheets) {
      if (seen.has(id)) continue;
      this.group.remove(sh.mesh);
      sh.mesh.geometry.dispose();
      this.sheets.delete(id);
    }
    this.cells = total;
    let tris = 0;
    for (const sh of this.sheets.values()) tris += (sh.mesh.geometry.getIndex()?.count ?? 0) / 3;
    this.triangles = tris;
  }

  clear(): void {
    for (const sh of this.sheets.values()) { this.group.remove(sh.mesh); sh.mesh.geometry.dispose(); }
    this.sheets.clear();
    this.cells = 0;
    this.triangles = 0;
    this.sinceBuild = Infinity;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}

/** The sheet at `level` over the surface cells, with the carve's openness at that height (between sample rows j and j + 1) as the shore value. */
function sheetOf(sim: Sim, cells: number[], cell: number, level: number): BufferGeometry | null {
  const j = Math.floor(level / cell), t = level / cell - j;
  return shoreGeometry(
    cells, cell, level, (i, k) => opennessAt(sim.carve.sampleAt(i, j, k), sim.carve.sampleAt(i, j + 1, k), t),
    (i, k) => waterDepthMm((row) => sim.carve.sampleAt(i, row, k), j, level, cell),
  );
}
