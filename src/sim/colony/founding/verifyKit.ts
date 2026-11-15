// Reviewer's test support (verify tests only; never imported by game code): a sloped founding shaft and cell carved
// with the debug brushes, so the queen can walk between the cell and the throat like a player would.

import type { Sim } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navTo } from '@/sim/locomotion';
import { nestOf, phase, queen, stepUntil } from './testkit';

const SLOPE_DEG = 40;
const DEPTH_BU = 10;

export interface RampCell {
  /** Mouth (ground point), the cell centre and floor, mm. */
  mouth: { x: number; y: number; z: number };
  cell: { x: number; y: number; z: number };
  floor: { x: number; y: number; z: number };
  /** A point on the ramp `bu` BU (along the ramp) below the mouth, mm. */
  rampAt(bu: number): { x: number; y: number; z: number };
}

/** Carves a 40-degree ramp 10 BU deep from the queen's position plus a cell at its foot; puts her in the cell. */
export function carveRampCell(sim: Sim): RampCell {
  const q = queen(sim), bu = sim.world.bu;
  const x0 = q.pos.x, z0 = q.pos.z, g = sim.field.height(x0, z0);
  const run = DEPTH_BU / Math.tan((SLOPE_DEG * Math.PI) / 180), len = Math.hypot(DEPTH_BU, run);
  for (let s = -0.5; s <= len; s += 0.4) {
    const t = s / len;
    sim.enqueue({ type: 'cheat.carveSphere', pos: { x: x0 + t * run * bu, y: g - t * DEPTH_BU * bu, z: z0 }, r: 1.25 * bu });
  }
  const cell = { x: x0 + (run + 2) * bu, y: g - (DEPTH_BU + 0.5) * bu, z: z0 };
  sim.enqueue({ type: 'cheat.carveEllipsoid', center: cell, radii: { x: 2.5 * bu, y: 1.1 * bu, z: 2.5 * bu }, yawDeg: 0 });
  sim.tick();
  const floor = { x: cell.x, y: cell.y - 0.9 * bu, z: cell.z };
  sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: floor });
  sim.tick();
  return {
    mouth: { x: x0, y: g, z: z0 }, cell, floor,
    rampAt: (b: number) => { const t = b / len; return { x: x0 + t * run * bu, y: g - t * DEPTH_BU * bu, z: z0 }; },
  };
}

/** Walks the queen (locomotion, not a teleport) to p; true when she arrived. */
export function walkTo(sim: Sim, p: { x: number; y: number; z: number }, tolBu = 0.6): boolean {
  const q = queen(sim);
  navTo(sim, q, p, tolBu * sim.world.bu);
  stepUntil(sim, () => q.nav.status !== 'moving', 900);
  return q.nav.status === 'arrived';
}

/** Runs one action of the queen to its end; returns whether it started. */
export function act(sim: Sim, id: Parameters<typeof begin>[2]): boolean {
  const q = queen(sim);
  const ok = begin(sim, q, id, null);
  stepUntil(sim, () => q.action === null, 300);
  return ok;
}

/** Phase `seal` in the ramp cell: the dig is ready and the queen stands on the cell floor. */
export function readyInRampCell(sim: Sim): RampCell {
  const nest = nestOf(sim);
  sim.enqueue({ type: 'cheat.setFoundingState', nestId: nest.id, state: 'digging' });
  const r = carveRampCell(sim);
  stepUntil(sim, () => phase(sim) === 'seal', 900);
  return r;
}
