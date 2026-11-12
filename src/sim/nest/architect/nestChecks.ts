// Test support (imported by *.test.ts only): checks of a finished nest against the species template and the
// navigability and spacing rules (GDD 03 §5.3, §8.2, §8.5), measured on the carve grid itself.

import type { Nest, PlanSpec, Sim } from '@/sim/types';
import { FLOOR_MIN_BU, FOUNDING_TEMPLATE, ROOF_MIN_BU, ANCHOR_CONNECTION_BU, maxEntrancesFor, nestTemplate } from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { nestSampleBox } from '../chambers/detect';
import { planG, type PlanGeometry } from '../plans/geometry';
import { forPlanSamples } from '../plans/targets';
import { validatePlanImpl } from '../plans/validate';
import { wallMin } from '../substrate';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { bandOf } from './score';

/** Half a voxel of discretisation slack on every distance measured between samples, BU. */
const TOL_BU = 0.5;

export interface CreatedPlan {
  spec: PlanSpec;
  geometry: PlanGeometry | null;
  /** Validation of the request right before creation (architect rules). */
  ok: boolean;
  codes: string[];
}

/** Records every request the architect creates, validated independently just before creation. */
export function recordCreations(sim: Sim, into: CreatedPlan[]): (spec: PlanSpec) => void {
  return (spec) => {
    const v = validatePlanImpl(sim, spec, 'architect');
    into.push({ spec, geometry: v.geometry, ok: v.ok, codes: [...v.codes] });
  };
}

/** Open room samples of a chamber plan's ellipsoid (the room without its neck). */
function roomSamples(sim: Sim, g: PlanGeometry): number[] {
  const v = sim.carve.voxel, e = g.ellipsoid, out: number[] = [];
  if (!e) return out;
  const room: PlanGeometry = { ...g, capsules: [] };
  forPlanSamples(sim, room, (i, j, k) => { if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN) out.push(packSample(i, j, k)); });
  return out.filter((key) => planG(room, sampleI(key) * v, sampleJ(key) * v, sampleK(key) * v) > 0);
}

/** Open samples of the founding template's cell (carveTemplateNest's ellipsoid at the shaft bottom). */
function templateCellSamples(sim: Sim, nest: Nest, species: string): number[] {
  const bu = sim.world.bu, v = sim.carve.voxel, o = nest.origin;
  const ft = FOUNDING_TEMPLATE[species as keyof typeof FOUNDING_TEMPLATE] ?? FOUNDING_TEMPLATE['lasius-niger'];
  const g = sim.field.height(o.x, o.z);
  const c = { x: o.x + (ft.cell.w / 2) * bu, y: g - ft.shaftDepth * bu - (ft.cell.h / 2 - ft.shaftD / 4) * bu, z: o.z };
  const r = { x: (ft.cell.w / 2) * bu, y: (ft.cell.h / 2) * bu, z: (ft.cell.l / 2) * bu };
  const out: number[] = [];
  for (let k = Math.floor((c.z - r.z) / v); k <= Math.ceil((c.z + r.z) / v); k++)
    for (let j = Math.floor((c.y - r.y) / v); j <= Math.ceil((c.y + r.y) / v); j++)
      for (let i = Math.floor((c.x - r.x) / v); i <= Math.ceil((c.x + r.x) / v); i++) {
        const q = ((i * v - c.x) / r.x) ** 2 + ((j * v - c.y) / r.y) ** 2 + ((k * v - c.z) / r.z) ** 2;
        if (q <= 1 && sim.carve.sampleAt(i, j, k) >= OPEN_MIN) out.push(packSample(i, j, k));
      }
  return out;
}

export interface NestReport {
  chambersByType: Record<string, number>;
  /** Chambers whose centre depth lies outside their band +- slack: "type depth". */
  outOfBand: string[];
  /** Largest horizontal distance of an open nest sample from the origin, BU. */
  footprintBu: number;
  openEntrances: number;
  maxEntrances: number;
  /** Chambers without a nest path to an open entrance, or whose path is longer than maxPathToEntrance. */
  unreachable: string[];
  /** Pairs of rooms closer than WALL_MIN (or FLOOR_MIN stacked): "a-b distance". */
  thinWalls: string[];
  /** Room columns with less than ROOF_MIN of soil above (not covered, away from the anchor connection). */
  thinRoofs: number;
  /** Created plans that failed validation, and plans whose tunnels are thinner than tunnelD. */
  invalidPlans: number;
  thinTunnels: number;
  volume: number;
}

/** Measures a nest (see NestReport). `created` = the architect's plans recorded with recordCreations. */
export function checkNest(sim: Sim, nest: Nest, created: readonly CreatedPlan[], bandSlackBu: number): NestReport {
  const bu = sim.world.bu, v = sim.carve.voxel;
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id, t = nestTemplate(species);
  const chambersByType: Record<string, number> = {};
  const outOfBand: string[] = [], unreachable: string[] = [];
  for (const c of nest.chambers) {
    chambersByType[c.type] = (chambersByType[c.type] ?? 0) + 1;
    const band = bandOf(species, c.type);
    if (c.depthBu < band[0] - bandSlackBu || c.depthBu > band[1] + bandSlackBu) outOfBand.push(`${c.type} ${c.depthBu.toFixed(1)}`);
    const seed = { x: sampleI(c.seedVoxel) * v, y: sampleJ(c.seedVoxel) * v, z: sampleK(c.seedVoxel) * v };
    const at = sim.carve.sampleAt(sampleI(c.seedVoxel), sampleJ(c.seedVoxel), sampleK(c.seedVoxel)) >= OPEN_MIN ? seed : c.center;
    const d = sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, at);
    if (d < 0 || d / bu > t.maxPathToEntrance) unreachable.push(`${c.type}#${c.id} exit ${d}`);
    for (const e of nest.entrances) {
      if (e.status !== 'open') continue;
      const below = { x: e.pos.x - e.dir.x * bu, y: e.pos.y - e.dir.y * bu, z: e.pos.z - e.dir.z * bu };
      if (sim.nestNav.componentAt(below) !== sim.nestNav.componentAt(at)) unreachable.push(`${c.type}#${c.id} entrance ${e.id}`);
    }
  }
  // footprint over the open samples of the nest's box below the surface
  const box = nestSampleBox(sim, nest);
  let footprint = 0;
  for (const key of sim.carve.data.keys) {
    sim.carve.forEachOpenSample(key, (i, j, k) => {
      if (i < box.i0 || i > box.i1 || j < box.j0 || j > box.j1 || k < box.k0 || k > box.k1) return;
      if (sim.field.substrateXYZ(i * v, j * v, k * v) >= 0) return;
      footprint = Math.max(footprint, Math.hypot(i * v - nest.origin.x, k * v - nest.origin.z) / bu);
    });
  }
  // rooms: the architect's chamber plans (their ellipsoids) and the template cell
  const rooms: { name: string; keys: number[]; anchor: { x: number; z: number } | null; g: PlanGeometry | null }[] = [];
  for (const p of created) {
    if (p.spec.kind === 'chamber' && p.geometry) rooms.push({ name: `${p.spec.chamberType}@${rooms.length}`, keys: roomSamples(sim, p.geometry), anchor: p.spec.anchor.pos, g: p.geometry });
  }
  rooms.push({ name: 'cell', keys: templateCellSamples(sim, nest, species), anchor: null, g: null });
  const owner = new Map<number, number>();
  rooms.forEach((r, n) => { for (const key of r.keys) owner.set(key, n); });
  const material = sim.field.materialAt({ x: nest.origin.x, y: nest.origin.y - 10 * bu, z: nest.origin.z });
  const wm = wallMin(material) * bu, reach = Math.ceil(Math.max(wm, FLOOR_MIN_BU * bu) / v);
  const thin = new Map<string, number>();
  rooms.forEach((r, n) => {
    for (const key of r.keys) {
      const i = sampleI(key), j = sampleJ(key), k = sampleK(key);
      for (let dk = -reach; dk <= reach; dk++) for (let dj = -reach; dj <= reach; dj++) for (let di = -reach; di <= reach; di++) {
        const m = owner.get(packSample(i + di, j + dj, k + dk));
        if (m === undefined || m <= n) continue;
        const dist = Math.hypot(di, dj, dk) * v, vertical = di === 0 && dk === 0;
        // soil between the samples = centre distance - one voxel
        const soil = dist - v, need = (vertical ? FLOOR_MIN_BU * bu : wm) - TOL_BU * bu;
        if (soil < need) {
          const name = `${r.name}-${rooms[m].name}`;
          thin.set(name, Math.min(thin.get(name) ?? Infinity, soil / bu));
        }
      }
    }
  });
  // roofs: soil from each room column's top sample up to the next open sample or the surface
  let thinRoofs = 0;
  // junctions: columns within ANCHOR_CONNECTION of any plan's anchor (a later neck leaves a room there); the
  // template cell lies under its own shaft
  const anchors = created.map((p) => p.spec.anchor.pos);
  for (const r of rooms) {
    if (!r.g) continue;
    const tops = new Map<number, number>();
    for (const key of r.keys) {
      const col = packSample(sampleI(key), 0, sampleK(key));
      tops.set(col, Math.max(tops.get(col) ?? -Infinity, sampleJ(key)));
    }
    for (const [col, top] of tops) {
      const i = sampleI(col), k = sampleK(col), x = i * v, z = k * v;
      if (anchors.some((a) => Math.hypot(x - a.x, z - a.z) <= ANCHOR_CONNECTION_BU * bu)) continue;
      let j = top + 1;
      const own = (jj: number) => r.g !== null && planG(r.g, x, jj * v, z) > 0;
      while (j * v < sim.field.height(x, z) && (sim.carve.sampleAt(i, j, k) < OPEN_MIN || own(j)) && sim.field.hardXYZ(x, j * v, z) > 0) j++;
      if (sim.field.hardXYZ(x, j * v, z) <= 0) continue; // covered
      const soil = (j - top - 1) * v;
      if (soil < (ROOF_MIN_BU - TOL_BU) * bu) thinRoofs++;
    }
  }
  let thinTunnels = 0;
  for (const p of created) for (const c of p.geometry?.capsules ?? []) if (c.r < (t.tunnelD / 2) * bu - 1e-9) thinTunnels++;
  return {
    chambersByType, outOfBand, footprintBu: footprint,
    openEntrances: nest.entrances.filter((e) => e.status === 'open').length,
    maxEntrances: maxEntrancesFor(species, sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker').length),
    unreachable, thinWalls: [...thin].map(([n, d]) => `${n} ${d.toFixed(2)}`), thinRoofs,
    invalidPlans: created.filter((p) => !p.ok).length, thinTunnels, volume: nest.volumeOpen,
  };
}
