// Nest lifecycle helpers: founding nests, a pre-carved template nest (the founding template plus template chambers
// carved instantly through validated plans: GDD 03 §15, used later for rival colonies), nest statistics.

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, ChamberSize, ChamberType, Nest, Sim } from '@/sim/types';
import {
  BULKING, FOUNDING_TEMPLATE, TEMPLATE_NEST_CHAMBERS, nestTemplate,
} from '@/sim/balance/nest';
import { createNest } from '@/sim/entities';
import { markNestDirty } from './runtime';
import { OPEN_MIN } from './carve/keys';
import { carveCapsule, carveEllipsoid } from './carveOps';
import { nestOpenVolume } from './chambers/upkeep';
import { registerChamber, regionStats } from './chambers/registry';
import { nestSampleBox } from './chambers/detect';
import { createMound, deposit, moundById, publishMound } from './mounds';
import { createPlanImpl, instantCarvePlan } from './plans/plans';
import { packSample } from './voxelKey';

/** A new nest record with a founding dig (`site-search`) for a colony at `origin` (daughters, rivals). */
export function createFoundingNest(sim: Sim, colonyId: number, origin: Vec3): Nest {
  const substrate = sim.field.materialAt({ x: origin.x, y: origin.y - sim.world.bu, z: origin.z });
  const nest = createNest(sim, { colony: colonyId, origin, founding: true, substrate });
  markNestDirty(sim, nest.id); // open space already in its box (a natural cavity) is detected at its next turn
  return nest;
}

export interface TemplateNestOptions {
  /** Extra chambers: type, size and depth of their anchor on the shaft, BU. Default TEMPLATE_NEST_CHAMBERS. */
  chambers?: { type: ChamberType; size: ChamberSize; depthBu: number }[];
  /** Register the founding cell as `royal` (an established colony). Default true. */
  royal?: boolean;
}

/**
 * Pre-carves a small nest at the nest's origin: the species' founding shaft and cell (GDD 03 §13.1 template),
 * then each template chamber as a validated `worldgen` plan carved at once (yaw tried in quarter turns until one
 * validates). The removed volume x BULKING goes onto the entrance mound. The founding record is cleared.
 */
export function carveTemplateNest(sim: Sim, nestId: number, opts: TemplateNestOptions = {}): { nest: Nest; chambers: Chamber[] } {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) throw new Error(`carveTemplateNest: no nest ${nestId}`);
  const bu = sim.world.bu, o = nest.origin;
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
  const ft = FOUNDING_TEMPLATE[species as keyof typeof FOUNDING_TEMPLATE] ?? FOUNDING_TEMPLATE['lasius-niger'];
  const g = sim.field.height(o.x, o.z);
  const wanted = opts.chambers ?? TEMPLATE_NEST_CHAMBERS;
  const top = { x: o.x, y: g + 0.5 * bu, z: o.z }, bottom = { x: o.x, y: g - ft.shaftDepth * bu, z: o.z };
  let removed = carveCapsule(sim, top, bottom, (ft.shaftD / 2) * bu).volume;
  const deepest = Math.max(0, ...wanted.map((c) => c.depthBu + 1));
  if (deepest > ft.shaftDepth) removed += carveCapsule(sim, bottom, { x: o.x, y: g - deepest * bu, z: o.z }, (ft.shaftD / 2) * bu).volume;
  const cellC = { x: o.x + (ft.cell.w / 2) * bu, y: bottom.y - (ft.cell.h / 2 - ft.shaftD / 4) * bu, z: o.z };
  const cellR = { x: (ft.cell.w / 2) * bu, y: (ft.cell.h / 2) * bu, z: (ft.cell.l / 2) * bu };
  removed += carveEllipsoid(sim, cellC, cellR).volume;
  nest.founding = null;
  const chambers: Chamber[] = [];
  const cellKeys = samplesIn(sim, cellC, cellR);
  if (cellKeys.length > 0) {
    chambers.push(registerChamber(sim, nest, opts.royal === false ? 'founding' : 'royal', 'auto', regionStats(sim, cellKeys)));
  }
  const e = nest.entrances[0];
  if (e && removed > 0) {
    const m = (e.moundId >= 0 ? moundById(sim, e.moundId) : undefined) ?? createMound(sim, nest, e, e.pos.x, e.pos.z, sim.field.materialAt(bottom));
    deposit(sim, m, e.pos.x + e.radius + 2 * bu, e.pos.z, (removed / bu ** 3) * BULKING * bu ** 3);
    publishMound(sim, m);
  }
  const r = (nestTemplate(species).tunnelD / 2) * bu;
  for (const c of wanted) {
    const y = g - c.depthBu * bu;
    for (let q = 0; q < 4; q++) {
      const a = (q * Math.PI) / 2 + Math.PI;
      const dir = { x: Math.cos(a), y: 0, z: Math.sin(a) };
      const anchor = { pos: { x: o.x + dir.x * r * 0.9, y, z: o.z + dir.z * r * 0.9 }, normal: { x: -dir.x, y: 0, z: -dir.z } };
      const id = createPlanImpl(sim, {
        nestId: nest.id, kind: 'chamber', chamberType: c.type, size: c.size, anchor, priority: 'normal', confirmWarnings: true,
      }, 'worldgen');
      if (id < 0) continue;
      instantCarvePlan(sim, id);
      const made = nest.chambers[nest.chambers.length - 1];
      if (made) chambers.push(made);
      break;
    }
  }
  nest.volumeOpen = nestOpenVolume(sim, nest);
  return { nest, chambers };
}

function samplesIn(sim: Sim, c: Vec3, radii: Vec3): number[] {
  const v = sim.carve.voxel, out: number[] = [];
  for (let k = Math.floor((c.z - radii.z) / v); k <= Math.ceil((c.z + radii.z) / v); k++)
    for (let j = Math.floor((c.y - radii.y) / v); j <= Math.ceil((c.y + radii.y) / v); j++)
      for (let i = Math.floor((c.x - radii.x) / v); i <= Math.ceil((c.x + radii.x) / v); i++) {
        const q = ((i * v - c.x) / radii.x) ** 2 + ((j * v - c.y) / radii.y) ** 2 + ((k * v - c.z) / radii.z) ** 2;
        if (q <= 1 && sim.carve.sampleAt(i, j, k) >= OPEN_MIN) out.push(packSample(i, j, k));
      }
  return out.sort((a, b) => a - b);
}

export interface NestStats {
  /** Open volume, BU^3. */
  volume: number;
  /** Deepest open sample below the surface, BU. */
  depthBu: number;
  /** Tunnel length estimate: open volume outside chambers / standard tunnel cross-section, BU. */
  tunnelLengthBu: number;
  chambers: number;
  openEntrances: number;
  /** Bounding box of the open samples, mm. */
  min: Vec3;
  max: Vec3;
}

/** Nest statistics (UI, architect, tests). */
export function nestStatsImpl(sim: Sim, nestId: number): NestStats | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return null;
  const bu = sim.world.bu, v = sim.carve.voxel, b = nestSampleBox(sim, nest);
  const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
  let depth = 0;
  for (const key of sim.carve.data.keys) {
    sim.carve.forEachOpenSample(key, (i, j, k) => {
      if (i < b.i0 || i > b.i1 || j < b.j0 || j > b.j1 || k < b.k0 || k > b.k1) return;
      const x = i * v, y = j * v, z = k * v;
      if (sim.field.substrateXYZ(x, y, z) >= 0) return;
      min.x = Math.min(min.x, x); min.y = Math.min(min.y, y); min.z = Math.min(min.z, z);
      max.x = Math.max(max.x, x); max.y = Math.max(max.y, y); max.z = Math.max(max.z, z);
      depth = Math.max(depth, sim.field.height(x, z) - y);
    });
  }
  const volume = nestOpenVolume(sim, nest);
  const inChambers = nest.chambers.reduce((s, c) => s + c.volume, 0);
  const t = nestTemplate(sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id);
  return {
    volume, depthBu: depth / bu, tunnelLengthBu: Math.max(0, volume - inChambers) / (Math.PI * (t.tunnelD / 2) ** 2),
    chambers: nest.chambers.length, openEntrances: nest.entrances.filter((e) => e.status === 'open').length, min, max,
  };
}
