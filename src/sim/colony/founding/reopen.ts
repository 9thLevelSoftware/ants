// The first workers reopen the plug (GDD 06 §5.13 (b), GDD 03 §13.2 `reopening`: "nanitics dig it"). The nest's
// own `reopen` plan cannot be dug yet (its slot is placed straight below the opening along the vertical surface
// normal, inside the soil beside a sloped throat, and seal/reopen plans carry no dig targets for the diggers'
// aim), so the founding module asks the nest for an ordinary `entrance` plan instead: from the plug's inner face
// (the open throat just below the plug, connected to the cell) up to the old opening. The workers' own dig
// behaviour claims it, bites through the loose plug and the entrance opens again (event `founding-reopened`).
// The plan uses the nest module's public createPlan with source `founding`; nothing is scripted on the workers.

import type { Vec3 } from '@/core/math/vec3';
import type { Entrance, Nest, Sim } from '@/sim/types';
import { REOPEN_FACE_INSIDE_BU, REOPEN_FACE_SEARCH_BU, REOPEN_FACE_STEP_BU, REOPEN_PLAN_PRIORITY } from '@/sim/balance/founding';
import { createPlan } from '@/sim/nest';
import { cavityEntrances } from './dig';

/** The cell the opening was founded in (its centre is in the cavity's nav component). */
function cellCentre(nest: Nest): Vec3 | null {
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  return cell ? cell.center : nest.founding?.cavitySeed ?? null;
}

/**
 * The plug's inner face: the open point nearest to the opening (within REOPEN_FACE_SEARCH_BU) that lies in the
 * cell's cavity, carved space well inside the soil (not the open air above the plug), or null when none does.
 */
export function plugInnerFace(sim: Sim, nest: Nest, e: Entrance): Vec3 | null {
  const centre = cellCentre(nest);
  if (!centre) return null;
  const comp = sim.nestNav.componentAt(centre);
  if (comp < 0) return null;
  const bu = sim.world.bu, r = REOPEN_FACE_SEARCH_BU * bu, step = REOPEN_FACE_STEP_BU * bu, inside = REOPEN_FACE_INSIDE_BU * bu;
  const p = { x: 0, y: 0, z: 0 };
  let best: Vec3 | null = null, bestD = Infinity;
  for (let dy = -r; dy <= 0; dy += step) {
    for (let dz = -r; dz <= r; dz += step) {
      for (let dx = -r; dx <= r; dx += step) {
        const d = Math.hypot(dx, dy, dz);
        if (d > r || d >= bestD) continue;
        p.x = e.pos.x + dx; p.y = e.pos.y + dy; p.z = e.pos.z + dz;
        if (sim.field.sample(p) <= 0 || sim.field.substrate(p) > -inside || sim.nestNav.componentAt(p) !== comp) continue;
        best = { x: p.x, y: p.y, z: p.z };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * Asks the nest for the reopening dig of every plugged entrance of the founding cavity; returns the plan ids
 * created (an entrance whose inner face cannot be found, or whose plan the nest refuses, is reported by the
 * `opening.reopen-refused` diagnostic event).
 */
export function requestReopen(sim: Sim, nest: Nest): number[] {
  const ids: number[] = [];
  for (const e of cavityEntrances(sim, nest)) {
    if (e.status !== 'sealed' && e.status !== 'sealing' && e.status !== 'reopening') continue;
    const face = plugInnerFace(sim, nest, e);
    const id = face ? createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: face, normal: { x: 0, y: 1, z: 0 } }, end: { ...e.pos },
      priority: REOPEN_PLAN_PRIORITY, confirmWarnings: true,
    }, 'founding') : -1;
    if (id >= 0) ids.push(id);
  }
  return ids;
}
