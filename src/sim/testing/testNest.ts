// The standard small test nest: an entrance shaft, three chambers one below the other (food, nursery, royal) and
// a blind branch, carved with the kernel's force brushes and registered as the player colony's nest with its
// entrance, chambers and nest-nav fields. Sizes in BU (GDD 03: tunnels 2 BU, chambers 8-16 BU wide).

import type { Vec3 } from '@/core/math/vec3';
import type { Chamber, ChamberType, Entrance, Nest, Sim } from '@/sim/types';
import { registerNestTargets } from '@/sim/services';
import { capacityOf } from '@/sim/nest/chambers/registry';
import { packSample } from '@/sim/nest/voxelKey';

/** Layout, BU. The entrance sits ENTRANCE_DX east of the queen start; depths are below the entrance ground. */
const ENTRANCE_DX = 14;
const TUNNEL_R = 1;
const ENTRANCE_R = 1.25;
const CHAMBERS: { name: ChamberType; dx: number; dz: number; depth: number; r: [number, number, number] }[] = [
  { name: 'food', dx: 6, dz: 2, depth: 7, r: [4.5, 1.5, 4] },
  { name: 'nursery', dx: 1, dz: 10, depth: 13, r: [5, 1.5, 4.5] },
  { name: 'royal', dx: 7, dz: 17, depth: 19, r: [4.5, 1.75, 4.5] },
];
/** Blind branch from the food-nursery tunnel: horizontal offset and drop of its end, BU. */
const BRANCH = { dx: 7, dz: 1, drop: 1 };

export interface SmallNest {
  nest: Nest;
  entrance: Entrance;
  /** Chambers shallow to deep (food, nursery, royal). */
  chambers: Chamber[];
}

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/**
 * A chamber record as the nest module would detect it, from the carved ellipsoid's analytic shape: capacity from
 * the nest module's per-type table (capacityOf), voxel count from the volume, seed voxel at the centre sample.
 */
function newChamber(id: number, type: ChamberType, center: Vec3, radii: Vec3, bu: number, groundY: number, tick: number, voxel: number): Chamber {
  const load = () => ({ adults: 0, brood: 0, food: 0, other: 0 });
  const volBu3 = (4 / 3) * Math.PI * (radii.x * radii.y * radii.z) / (bu * bu * bu);
  const seed = packSample(Math.round(center.x / voxel), Math.round(center.y / voxel), Math.round(center.z / voxel));
  return {
    id, type, designatedBy: 'player', center, radii, volume: volBu3, floorArea: Math.PI * radii.x * radii.z / (bu * bu),
    depthBu: (groundY - center.y) / bu, depthMm: groundY - center.y, roofMin: (groundY - center.y - radii.y) / bu,
    covered: false, seedVoxel: seed, voxelCount: Math.round((volBu3 * bu * bu * bu) / (voxel * voxel * voxel)),
    capacity: capacityOf(type, volBu3), occupancy: load(), temp: 20, humidity: 0.7,
    wetUntilTick: -1, flooded: 0, floodRisk: 0, flags: 0, createdTick: tick,
  };
}

/**
 * Carves the small nest into the sim's carve grid (force: a world-generation style pre-carve) and makes it the
 * player colony's nest (its founding record is cleared: the nest is established). Registers the nest-nav fields.
 */
export function installSmallNest(sim: Sim): SmallNest {
  const { state, world, kernel } = sim;
  const bu = world.bu;
  const colony = state.colonies[0];
  const nest = sim.stores.nests.get(colony.nestIds[0]);
  if (!nest) throw new Error('installSmallNest: the player colony has no nest');
  const start = world.queenStart.pos;
  const ex = start.x + ENTRANCE_DX * bu, ez = start.z;
  const g = kernel.field.height(ex, ez);
  const centres = CHAMBERS.map((c) => v(ex + c.dx * bu, g - c.depth * bu, ez + c.dz * bu));
  const radii = CHAMBERS.map((c) => v(c.r[0] * bu, c.r[1] * bu, c.r[2] * bu));
  // tunnel centre at floor height of a chamber, entering at its rim on the side facing p
  const floorAt = (i: number) => centres[i].y - radii[i].y + TUNNEL_R * bu;
  const rimToward = (i: number, p: Vec3, inset: number): Vec3 => {
    const dx = p.x - centres[i].x, dz = p.z - centres[i].z, l = Math.hypot(dx, dz) || 1;
    const k = Math.max(0, 1 - inset);
    return v(centres[i].x + (dx / l) * radii[i].x * k, floorAt(i), centres[i].z + (dz / l) * radii[i].z * k);
  };
  const r = TUNNEL_R * bu, force = { force: true };
  for (let i = 0; i < centres.length; i++) kernel.carveEllipsoid(centres[i], radii[i], force);
  // shaft: from just above the ground down to the food chamber's rim
  const top = v(ex, g + 0.5 * bu, ez);
  const shaftEnd = rimToward(0, top, 0.3);
  kernel.carveCapsule(top, v(ex + 1.5 * bu, g - 3 * bu, ez + 0.5 * bu), r, force);
  kernel.carveCapsule(v(ex + 1.5 * bu, g - 3 * bu, ez + 0.5 * bu), shaftEnd, r, force);
  for (let i = 0; i + 1 < centres.length; i++) {
    const a = rimToward(i, centres[i + 1], 0.3), b = rimToward(i + 1, centres[i], 0.3);
    const mid = v((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    kernel.carveCapsule(a, mid, r, force);
    kernel.carveCapsule(mid, b, r, force);
    if (i === 0) kernel.carveCapsule(mid, v(mid.x + BRANCH.dx * bu, mid.y - BRANCH.drop * bu, mid.z + BRANCH.dz * bu), r, force);
  }
  const tick = state.tick;
  const entrance: Entrance = {
    id: state.nextId++, kind: 'dug', status: 'open', pos: v(ex, g, ez), dir: v(0, 1, 0), radius: ENTRANCE_R * bu,
    moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: tick, trafficIn: 0, trafficOut: 0,
  };
  const chambers = centres.map((c, i) => newChamber(state.nextId++, CHAMBERS[i].name, c, radii[i], bu, g, tick, kernel.carve.voxel));
  nest.origin = v(ex, g, ez);
  nest.entrances.push(entrance);
  nest.chambers.push(...chambers);
  nest.founding = null;
  nest.volumeOpen = kernel.carve.openVolume() / (bu * bu * bu);
  registerNestTargets(sim.nestNav, nest, bu);
  return { nest, entrance, chambers };
}
