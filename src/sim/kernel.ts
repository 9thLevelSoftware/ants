// Kernel factory: builds the world field, carve grid, nest navigation and walker parameters from the static
// world and the persisted carve data, and wires them together (breach probe, nav change listener, default dig
// predicate). API reference: docs/design/tdd/02-kernel.md.
//
// This file does not import the wider contracts: the game's WorldData satisfies KernelWorldInput structurally.

import type { ByteMap, CarveData, GroundLayers, HeightField, MaterialId, Primitive } from '@/sim/types/geom';
import { MATERIAL_IDS, PrimFlag } from '@/sim/types/geom';
import type { Vec3 } from '@/core/math/vec3';
import { createCarveGrid, type CarveGrid } from './nest/carve/grid';
import type { BrushOptions, BrushResult } from './nest/carve/brushes';
import { keyCx, keyCy, keyCz } from './nest/carve/keys';
import { meshChunk, type ChunkMesh, type MeshOptions } from './nest/carve/mc';
import { createNestNav, type NestNav, type NestNavOptions } from './nest/nav/nestNav';
import { createWorldField, type FieldParams, type WorldField } from './world/field';
import { byteAt } from './world/terrainSample';
import { walkerParamsForBU, type WalkerParams } from './locomotion/walkerParams';

/** What the kernel needs from the static world; the game's WorldData satisfies it structurally. */
export interface KernelWorldInput {
  /** World edge length, mm. */
  size: number;
  /** Body unit, mm (voxel = 0.5 BU). */
  bu: number;
  terrain: HeightField;
  ground: GroundLayers;
  prims: Primitive[];
  /** Cells where the ground term is removed (drains etc.). */
  terrainHoles?: ByteMap;
}

/**
 * Materials the reference species (Lasius niger) can excavate; a placeholder default for tests and demos.
 * The game passes the played species' rule (SpeciesDef.dig) as `canDigMaterial`.
 */
export const DEFAULT_DIGGABLE_MATERIALS: readonly MaterialId[] = ['loam', 'humus', 'sand', 'clay', 'gravel', 'wood-decayed', 'insulation'];

export interface KernelOptions {
  /** May the played species excavate this material? Decides the default dig predicate for terrain layers. */
  canDigMaterial?: (m: MaterialId) => boolean;
  /** Primitives in the field's diggable group. Default: DIGGABLE flag and canDigMaterial(material). */
  isDiggablePrim?: (p: Primitive) => boolean;
  field?: Partial<FieldParams>;
  nav?: Omit<NestNavOptions, 'isBlocked'>;
}

export interface Kernel {
  readonly bu: number;
  readonly world: KernelWorldInput;
  readonly field: WorldField;
  readonly carve: CarveGrid;
  readonly nav: NestNav;
  /** Walker parameters (mm) for this BU. */
  readonly walker: WalkerParams;
  /**
   * Default dig predicate: false inside a hard primitive (deeper than half a voxel), true inside a diggable
   * primitive or in open air, else by the terrain layer at that depth (crust within crustMm, subsoil below).
   */
  canDigAt(x: number, y: number, z: number): boolean;
  /** Brushes with canDig defaulting to canDigAt (pass `force` for world-generation pre-carves). */
  carveSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult;
  carveCapsule(a: Vec3, b: Vec3, r: number, opts?: BrushOptions): BrushResult;
  carveEllipsoid(c: Vec3, radii: Vec3, opts?: BrushOptions): BrushResult;
  fillSphere(c: Vec3, r: number, opts?: BrushOptions): BrushResult;
  /** Mesh of one chunk key; the substrate attribute is the field's soil (diggable group) distance. */
  meshChunk(key: number, opts?: MeshOptions): ChunkMesh | null;
  /** Every chunk key that may carry a mesh (initial meshing after load). */
  meshKeys(): number[];
  /** After replacing CarveData contents (load): rebuild grid index and navigation. */
  rebuild(): void;
}

export function createKernel(world: KernelWorldInput, carveData: CarveData, opts: KernelOptions = {}): Kernel {
  const bu = world.bu;
  if (Math.abs(carveData.voxel - bu / 2) > 1e-9) throw new Error(`CarveData.voxel ${carveData.voxel} != 0.5 BU (${bu / 2})`);
  const diggableSet = new Set(DEFAULT_DIGGABLE_MATERIALS);
  const canDigMaterial = opts.canDigMaterial ?? ((m: MaterialId) => diggableSet.has(m));
  const digTable = new Uint8Array(256);
  MATERIAL_IDS.forEach((m, i) => { digTable[i] = canDigMaterial(m) ? 1 : 0; });
  const isDiggablePrim = opts.isDiggablePrim ?? ((p: Primitive) => (p.flags & PrimFlag.DIGGABLE) !== 0 && canDigMaterial(p.material));

  const carve = createCarveGrid(carveData);
  const field = createWorldField(world, carve, { isDiggablePrim, params: opts.field });
  carve.setSubstrateProbe((x, y, z) => field.substrateXYZ(x, y, z));
  const nav = createNestNav(carve, { ...opts.nav, isBlocked: (x, y, z) => field.hardXYZ(x, y, z) <= 0 });
  const halfVoxel = carveData.voxel * 0.5;
  const ground = world.ground;
  const probe = { x: 0, y: 0, z: 0 };

  const canDigAt = (x: number, y: number, z: number): boolean => {
    if (field.hardXYZ(x, y, z) < -halfVoxel) return false;
    probe.x = x; probe.y = y; probe.z = z;
    const prim = field.primAt(probe, 0);
    if (prim && isDiggablePrim(prim)) return true;
    const depth = field.height(x, z) - y;
    if (depth < 0) return true; // open air above the terrain (a sample exactly on the surface belongs to the crust)
    const code = depth < byteAt(ground.crustMm, x, z) ? byteAt(ground.surface, x, z) : byteAt(ground.subsoil, x, z);
    return digTable[code] === 1;
  };
  const withDefault = (o?: BrushOptions): BrushOptions => ({ ...o, canDig: o?.canDig ?? canDigAt });
  const soil = (x: number, y: number, z: number) => field.soilXYZ(x, y, z);

  return {
    bu, world, field, carve, nav, walker: walkerParamsForBU(bu), canDigAt,
    carveSphere: (c, r, o) => carve.carveSphere(c, r, withDefault(o)),
    carveCapsule: (a, b, r, o) => carve.carveCapsule(a, b, r, withDefault(o)),
    carveEllipsoid: (c, radii, o) => carve.carveEllipsoid(c, radii, withDefault(o)),
    fillSphere: (c, r, o) => carve.fillSphere(c, r, o),
    meshChunk: (key, o) => meshChunk(carve, keyCx(key), keyCy(key), keyCz(key), { substrate: soil, ...o }),
    meshKeys: () => carve.meshKeys(),
    rebuild: () => { carve.rebuild(); nav.rebuildAll(); },
  };
}
