// World discovery (GDD 04 events `world.zone-first-entry`, `world.micro-discovered`), which no module emitted: the
// milestones `ms-zone-crossed`, `ms-micro-connection`, the aim `aim-cross-zone` and the codex habitat and joint
// entries could never fire. Until the world module owns it, progression's poll detects both for the player colony:
// the first ant of the colony outside the nest in each zone type, and the first ant of the colony on the centreline of
// each micro-connection. Both are recorded in state (trigger memory, worldDelta.microState), so a load does not
// re-announce them.
//
// `ms-zone-crossed` is narrower than the world event (GDD 06 §8: "a worker first enters a zone type other than the
// nest zone"): the foundress searching the surface during the opening, or a male, must not take it. The first such
// worker entry is kept apart in trigger memory (WORKER_CROSS_KEY), because the zone may already have had its
// first-entry event from the queen.

import type { Vec3 } from '@/core/math/vec3';
import type { MicroConn, Sim } from '@/sim/types';
import { ZONE_TYPES } from '@/sim/types';
import { MICRO_DISCOVER_BU, MICRO_GRID_CELL_BU } from '@/sim/balance';
import { zoneAt } from '@/sim/world';
import { memGet, memSet, playerColony } from './engine';
import { playerNests, WORKER_CASTES } from './triggers';

/** Trigger memory key: bit i set = ZONE_TYPES[i] entered by an ant of the colony. */
const ZONES_SEEN = 'zonesSeen';
const ALL_ZONES = (1 << ZONE_TYPES.length) - 1;
/** Trigger memory key: 1 + index in ZONE_TYPES of the zone a worker first entered other than the nest zone; 0 = none. */
export const WORKER_CROSS_KEY = 'zoneCrossedTo';

/** Static lookup of micro-connection centrelines by plan-view cell (derived from the world, never persisted). */
interface MicroGrid { cell: number; byCell: Map<number, MicroConn[]>; nx: number }
const grids = new WeakMap<object, MicroGrid>();

function centreline(m: MicroConn): Vec3[] {
  return [m.posA, ...(m.path ?? []), m.posB];
}

function microGrid(sim: Sim): MicroGrid {
  const hit = grids.get(sim.world);
  if (hit) return hit;
  const cell = MICRO_GRID_CELL_BU * sim.world.bu;
  const nx = Math.ceil(sim.world.size / cell) + 1;
  const r = MICRO_DISCOVER_BU * sim.world.bu;
  const byCell = new Map<number, MicroConn[]>();
  for (const m of sim.world.micro) {
    const pts = centreline(m);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
    for (let iz = Math.floor((z0 - r) / cell); iz <= Math.floor((z1 + r) / cell); iz++) {
      for (let ix = Math.floor((x0 - r) / cell); ix <= Math.floor((x1 + r) / cell); ix++) {
        const k = iz * nx + ix;
        const list = byCell.get(k) ?? [];
        list.push(m);
        byCell.set(k, list);
      }
    }
  }
  const g = { cell, byCell, nx };
  grids.set(sim.world, g);
  return g;
}

/** Squared distance from p to segment ab, mm². */
function segDist2(p: Vec3, a: Vec3, b: Vec3): number {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const len2 = dx * dx + dy * dy + dz * dz;
  let t = len2 > 0 ? ((p.x - a.x) * dx + (p.y - a.y) * dy + (p.z - a.z) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const ex = a.x + dx * t - p.x, ey = a.y + dy * t - p.y, ez = a.z + dz * t - p.z;
  return ex * ex + ey * ey + ez * ez;
}

function onCentreline(p: Vec3, m: MicroConn, r2: number): boolean {
  const pts = centreline(m);
  for (let i = 1; i < pts.length; i++) if (segDist2(p, pts[i - 1], pts[i]) <= r2) return true;
  return false;
}

/** One discovery pass over the colony's ants outside the nest (called from progression's poll). */
export function detectDiscoveries(sim: Sim): void {
  const col = playerColony(sim);
  if (!col) return;
  let zones = memGet(sim, ZONES_SEEN);
  const nest = playerNests(sim)[0];
  let crossLeft = !!nest && memGet(sim, WORKER_CROSS_KEY) === 0;
  const states = sim.state.worldDelta.microState;
  const microLeft = sim.world.micro.length > 0 && states.some((s) => !s.discovered);
  if (zones === ALL_ZONES && !crossLeft && !microLeft) return;
  const nestZone = nest ? zoneAt(sim.world, nest.origin.x, nest.origin.z) : null;
  const grid = microLeft ? microGrid(sim) : null;
  const r2 = (MICRO_DISCOVER_BU * sim.world.bu) ** 2;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.nestId >= 0) continue;
    if (zones !== ALL_ZONES || crossLeft) {
      const z = zoneAt(sim.world, a.pos.x, a.pos.z);
      const bit = 1 << ZONE_TYPES.indexOf(z);
      if ((zones & bit) === 0) {
        zones |= bit;
        memSet(sim, ZONES_SEEN, zones);
        sim.emit({ type: 'world.zone-first-entry', zoneType: z, antId: a.id });
      }
      if (crossLeft && z !== nestZone && WORKER_CASTES.has(a.caste)) {
        crossLeft = false;
        memSet(sim, WORKER_CROSS_KEY, 1 + ZONE_TYPES.indexOf(z));
      }
    }
    if (!grid) continue;
    const list = grid.byCell.get(Math.floor(a.pos.z / grid.cell) * grid.nx + Math.floor(a.pos.x / grid.cell));
    if (!list) continue;
    for (const m of list) {
      const st = states.find((s) => s.id === m.id);
      if (!st || st.discovered || !onCentreline(a.pos, m, r2)) continue;
      st.discovered = true;
      st.discoveredTick = sim.state.tick;
      sim.emit({ type: 'world.micro-discovered', microId: m.id, kind: m.kind, antId: a.id, pos: { ...a.pos } });
    }
  }
}
