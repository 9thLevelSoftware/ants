// The nest's materials: one wall ShaderMaterial per substrate (triplanar texture set from the shared world material
// library, detail normals, strata or wood grain, moisture darkening, the nest lighting model), the shadow depth
// material with the same soil-skin discard, and the two x-ray passes (depth prepass + translucent cast).
import {
  Color, DoubleSide, FrontSide, LessEqualDepth, MeshDepthMaterial, RGBADepthPacking, ShaderMaterial, UniformsLib, UniformsUtils,
  type IUniform, type Material,
} from 'three';
import { MATERIAL_IDS, type MaterialId } from '@/sim/types';
import { materialDef, type MaterialLibrary } from '@/render/world/materials';
import { DETAIL_NORMAL_SCALE, DETAIL_NORMAL_WEIGHT, WALL_DEPTH_OFFSET, WALL_LOOKS, WOODY, XRAY, type WallLook } from '../params';
import type { WallMaterialSet } from '../mesh/chunkMeshManager';
import { fragmentPrelude, NEST_VERT, wallFragment, XRAY_FRAGMENT } from './glsl';
import type { NestUniforms } from './nestUniforms';

export function wallLook(m: MaterialId): WallLook {
  return WALL_LOOKS[m] ?? WALL_LOOKS.loam!;
}

export class NestMaterials implements WallMaterialSet {
  readonly depth: MeshDepthMaterial;
  readonly xrayPrepass: ShaderMaterial;
  readonly xrayColor: ShaderMaterial;
  private walls = new Map<number, ShaderMaterial>();
  private detail: boolean;

  constructor(private readonly library: MaterialLibrary, private readonly u: NestUniforms, opts: { detail: boolean }) {
    this.detail = opts.detail;
    this.depth = this.makeDepth();
    this.xrayPrepass = this.makeXray(true);
    this.xrayColor = this.makeXray(false);
  }

  /** Wall material for a MATERIAL_IDS code (cached; materials of the same look share a program). */
  wall(code: number): ShaderMaterial {
    let m = this.walls.get(code);
    if (m) return m;
    const id = MATERIAL_IDS[code] ?? 'loam';
    const look = wallLook(id);
    const set = this.library.textureSet(materialDef(look.textureFrom));
    const woody = WOODY.has(id);
    m = new ShaderMaterial({
      name: `nest:wall:${id}`,
      vertexShader: NEST_VERT,
      fragmentShader: fragmentPrelude() + wallFragment({ woody }),
      uniforms: {
        ...UniformsUtils.merge([UniformsLib.fog]),
        ...(this.u as unknown as Record<string, IUniform>),
        tWrA: { value: set.albedo }, tWrN: { value: set.normal }, tWrR: { value: set.rough },
        uWrScale: { value: look.scaleMm }, uWrNs: { value: look.normalScale }, uWrTint: { value: new Color(...look.tint) },
        uStrata: { value: look.strata }, uGrain: { value: look.grain }, uWetDark: { value: look.wetDarken },
        uDetailScale: { value: DETAIL_NORMAL_SCALE }, uDetailW: { value: DETAIL_NORMAL_WEIGHT },
      },
      fog: true,
      side: FrontSide,
      // wall tops flush with the terrain at a hole's lip lose the depth test to it (see the skin band in glsl.ts)
      polygonOffset: true, polygonOffsetFactor: WALL_DEPTH_OFFSET.factor, polygonOffsetUnits: WALL_DEPTH_OFFSET.units,
    });
    m.defines = this.detail ? { NEST_DETAIL: 1 } : {};
    this.walls.set(code, m);
    return m;
  }

  /** Detail normals on/off (quality change). */
  setDetail(on: boolean): void {
    if (on === this.detail) return;
    this.detail = on;
    for (const m of this.walls.values()) { m.defines = on ? { NEST_DETAIL: 1 } : {}; m.needsUpdate = true; }
  }

  all(): Material[] {
    return [...this.walls.values(), this.depth, this.xrayPrepass, this.xrayColor];
  }

  dispose(): void {
    for (const m of this.all()) m.dispose();
    this.walls.clear();
  }

  private makeDepth(): MeshDepthMaterial {
    const m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
    m.name = 'nest:depth';
    m.onBeforeCompile = (s) => {
      s.uniforms.uSkin = this.u.uSkin;
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSub;\nvarying float vNestSub;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvNestSub = aSub;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSkin;\nvarying float vNestSub;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vNestSub > -uSkin) discard;');
    };
    m.customProgramCacheKey = () => 'nest-depth';
    return m;
  }

  private makeXray(prepass: boolean): ShaderMaterial {
    const m = new ShaderMaterial({
      name: prepass ? 'nest:xray-depth' : 'nest:xray-cast',
      vertexShader: NEST_VERT,
      fragmentShader: fragmentPrelude() + XRAY_FRAGMENT,
      uniforms: { ...UniformsUtils.merge([UniformsLib.fog]), ...(this.u as unknown as Record<string, IUniform>) },
      side: DoubleSide,
      fog: false,
      transparent: true,
      depthTest: true,
      depthWrite: prepass,
      colorWrite: !prepass,
      depthFunc: LessEqualDepth,
    });
    m.opacity = XRAY.opacity;
    return m;
  }
}
