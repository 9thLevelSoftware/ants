/**
 * Material swatch world: every MaterialId as a ground patch with a rounded box and a cylinder of the same material
 * standing on it, in rows of SWATCH_COLS, on flat ground (Lasius, BU 4). A worker ant stands beside each row's
 * first swatch for scale.
 */
import { MATERIAL_IDS, materialCode, PrimFlag, type MaterialId, type Primitive, type WorldData, type WorldObject } from '@/sim/types';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { defaultWorldParams } from '@/worldgen/params';

export const SWATCH_BU = 4;
export const SWATCH_COLS = 7;
/** Swatch pitch, mm (a ground patch is 4 terrain cells = 64 mm). */
export const SWATCH_PITCH = 64;
const SIZE = 2048;
const X0 = 512, Z0 = 512;

/** Centre of a material's swatch on the ground, mm. */
export function swatchCentre(i: number): { x: number; z: number } {
  return { x: X0 + (i % SWATCH_COLS) * SWATCH_PITCH + SWATCH_PITCH / 2, z: Z0 + Math.floor(i / SWATCH_COLS) * SWATCH_PITCH + SWATCH_PITCH / 2 };
}

/** Swatch template ids per material (lets the dressing pick a typical finish: the swatch shows the plain look). */
export function buildSwatchWorld(): WorldData {
  const prims: Primitive[] = [];
  const objects: WorldObject[] = [];
  let id = 1;
  MATERIAL_IDS.forEach((m: MaterialId, i) => {
    const c = swatchCentre(i);
    const start = prims.length;
    const flags = PrimFlag.CLIMBABLE;
    prims.push({ id: id++, shape: 'box', pos: { x: c.x - 12, y: 9, z: c.z + 4 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 9, y: 9, z: 9 }, round: 2, material: m, flags, objectId: i + 1 });
    prims.push({ id: id++, shape: 'cylinder', pos: { x: c.x + 12, y: 7, z: c.z + 4 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: 7, y: 7, z: 0 }, round: 1.5, material: m, flags, objectId: i + 1 });
    objects.push({ id: i + 1, templateId: `swatch-${m}`, pos: { x: c.x, y: 0, z: c.z }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: start, primCount: 2, tags: ['swatch'], routeIds: [], poiIds: [] });
  });
  // extra rows: template finishes (the dressing's looks by catalogue template) and plant parts
  const box = (c: { x: number; z: number }, dx: number, m: MaterialId, h: [number, number, number], round = 2, flags = PrimFlag.CLIMBABLE): Primitive =>
    ({ id: id++, shape: 'box', pos: { x: c.x + dx, y: h[1], z: c.z + 4 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: h[0], y: h[1], z: h[2] }, round, material: m, flags, objectId: -1 });
  const cyl = (c: { x: number; z: number }, dx: number, m: MaterialId, r: number, hh: number, lying = false): Primitive =>
    ({ id: id++, shape: 'cylinder', pos: { x: c.x + dx, y: lying ? r : hh, z: c.z + 4 }, rot: lying ? { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 } : { x: 0, y: 0, z: 0, w: 1 }, size: { x: r, y: hh, z: 0 }, round: 1, material: m, flags: PrimFlag.CLIMBABLE, objectId: -1 });
  const ell = (c: { x: number; z: number }, dx: number, y: number, m: MaterialId, r: [number, number, number]): Primitive =>
    ({ id: id++, shape: 'ellipsoid', pos: { x: c.x + dx, y, z: c.z + 4 }, rot: { x: 0, y: 0, z: 0, w: 1 }, size: { x: r[0], y: r[1], z: r[2] }, round: 0, material: m, flags: PrimFlag.CLIMBABLE, objectId: -1 });
  const extras: { t: string; make: (c: { x: number; z: number }) => Primitive[] }[] = [
    { t: 'parked-car', make: (c) => [box(c, -10, 'metal', [12, 8, 9], 4), cyl(c, 14, 'rubber', 9, 4, true)] },
    { t: 'fridge', make: (c) => [box(c, -10, 'metal', [10, 14, 9], 2)] },
    { t: 'sink', make: (c) => [box(c, -10, 'metal', [10, 6, 9], 1), cyl(c, 14, 'metal', 6, 6)] },
    { t: 'chair', make: (c) => [box(c, -10, 'metal', [10, 3, 9], 1), cyl(c, 14, 'metal', 2, 10)] },
    { t: 'window', make: (c) => [box(c, -6, 'glass', [12, 12, 1.5], 0.5)] },
    { t: 'toy-bucket', make: (c) => [cyl(c, -10, 'plastic', 8, 8), box(c, 14, 'plastic', [6, 4, 6], 2)] },
    { t: 'gully-grate', make: (c) => [box(c, -6, 'metal', [14, 2, 10], 0.5)] },
    { t: 'dandelion', make: (c) => [box(c, -8, 'plant', [16, 0.4, 5], 0.2), cyl(c, 10, 'plant', 1.2, 10), ell(c, 10, 22, 'plant', [8, 3.2, 8])] },
    { t: 'daisy', make: (c) => [box(c, -8, 'plant', [10, 0.4, 4], 0.2), cyl(c, 10, 'plant', 0.8, 8), ell(c, 10, 18, 'plant', [6, 2.4, 6])] },
    { t: 'clover-patch', make: (c) => [box(c, -8, 'plant', [7, 0.4, 5], 0.2), ell(c, 10, 9, 'plant', [5, 4, 5])] },
    { t: 'herb-plant', make: (c) => [box(c, -8, 'plant', [12, 0.4, 6], 0.2), ell(c, 10, 9, 'plant', [6, 3, 6])] },
    { t: 'log', make: (c) => [cyl(c, 0, 'wood-decayed', 9, 16, true)] },
    { t: 'fungus-cap', make: (c) => [cyl(c, 0, 'plant', 1.5, 6), ell(c, 0, 12, 'plant', [9, 3, 9])] },
    { t: 'curled-leaf', make: (c) => [box(c, 0, 'leaf', [14, 0.4, 7], 0.2)] },
  ];
  extras.forEach((e, k) => {
    const i = MATERIAL_IDS.length + 1 + k; // one empty cell between the materials and the extras
    const c = swatchCentre(i);
    const list = e.make(c);
    const oid = 1000 + k;
    for (const p of list) p.objectId = oid;
    objects.push({ id: oid, templateId: e.t, pos: { x: c.x, y: 0, z: c.z }, rot: { x: 0, y: 0, z: 0, w: 1 }, primStart: prims.length, primCount: list.length, tags: ['swatch'], routeIds: [], poiIds: [] });
    prims.push(...list);
  });
  const world = buildWorld({
    // an asphalt zone: no grass or joint moss hides the swatches
    params: defaultWorldParams('lasius-niger', 3), size: SIZE, bu: SWATCH_BU, height: () => 0, prims, objects, zone: 'asphalt',
    queenStart: { pos: { x: X0 - 40, y: 0, z: Z0 + 20 }, fwd: { x: 1, y: 0, z: 0 } } as WorldData['queenStart'],
  });
  const g = world.ground.surface;
  for (let k = 0; k < g.nz; k++) for (let i = 0; i < g.nx; i++) {
    const x = (i + 0.5) * g.cell - X0, z = (k + 0.5) * g.cell - Z0;
    const col = Math.floor(x / SWATCH_PITCH), row = Math.floor(z / SWATCH_PITCH);
    const idx = row * SWATCH_COLS + col;
    const inside = x >= 0 && z >= 0 && col < SWATCH_COLS && idx < MATERIAL_IDS.length;
    g.data[k * g.nx + i] = materialCode(inside ? MATERIAL_IDS[idx] : 'loam');
  }
  return world;
}
