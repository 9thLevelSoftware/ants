// `cheat.completeFounding` (GDD 06 App. B; task deliverable 4): runs every remaining step of the opening through
// the same state machine, as fast as the ticks allow. Instead of the player's bites, holds and batches it uses the
// debug world edits that exist as commands (carve the species' founding template at the queen, move her into the
// cell, close the throat) and the colony's own laying; the readiness, sealing, clutch, time-lapse (marked skipped,
// so the game runs it at full rate) and hand-over are the normal code.

import type { Ant, Nest, OpeningState, Sim, SpeciesId } from '@/sim/types';
import { FOUNDING_TEMPLATE } from '@/sim/balance/nest';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { AUTO_CLUTCH_SURVIVAL, AUTO_SEAL_FILL } from '@/sim/balance/founding';
import { layEgg } from '../queen';
import { FB, bbGet, bbSet, setPhase, speciesOf } from './access';
import { clutchLimit, eggsLaid } from './clutch';
import { cavityEntrances } from './dig';

const STEP = 'fd.autoStep';

/** Clutch aimed for to end with about `workers` first workers at a fair site (survival AUTO_CLUTCH_SURVIVAL). */
export function autoClutchFor(sim: Sim, workers: number): number {
  const cap = speciesOf(sim).opening.clutchCap;
  const eggs = Math.ceil(Math.max(1, workers) / AUTO_CLUTCH_SURVIVAL / OPEN_LAY_BATCH_EGGS) * OPEN_LAY_BATCH_EGGS;
  return Math.max(OPEN_LAY_BATCH_EGGS, Math.min(cap, eggs));
}

export function startAuto(q: Ant, clutch: number): void {
  bbSet(q, FB.auto, 1);
  bbSet(q, FB.autoClutch, clutch);
  bbSet(q, STEP, 0);
}

export function isAuto(q: Ant | undefined): boolean {
  return !!q && bbGet(q, FB.auto, 0) === 1;
}

function template(sim: Sim) {
  const id = speciesOf(sim).id as SpeciesId;
  return FOUNDING_TEMPLATE[id] ?? FOUNDING_TEMPLATE['lasius-niger'];
}

/** Carves the founding template (shaft + cell) below the queen through the debug carve commands. */
function carveTemplate(sim: Sim, q: Ant, nest: Nest): void {
  const bu = sim.world.bu, t = template(sim);
  const x = q.pos.x, z = q.pos.z, g = sim.field.height(x, z);
  const r = (t.shaftD / 2) * bu;
  for (let d = -0.5; d <= t.shaftDepth; d += 0.5) sim.enqueue({ type: 'cheat.carveSphere', pos: { x, y: g - d * bu, z }, r });
  const cy = g - (t.shaftDepth + t.cell.h / 2 - t.shaftD / 4) * bu;
  sim.enqueue({
    type: 'cheat.carveEllipsoid', center: { x: x + (t.cell.w / 2) * bu, y: cy, z },
    radii: { x: (t.cell.w / 2) * bu, y: (t.cell.h / 2) * bu, z: (t.cell.l / 2) * bu }, yawDeg: 0,
  });
  if (nest.founding && nest.founding.state === 'site-search') nest.founding.state = 'digging';
  nest.origin = { x, y: g, z };
  if (nest.founding) nest.founding.cavitySeed = { x, y: g - t.shaftDepth * bu, z };
}

/** Floor point in the middle of the template cell. */
function cellFloor(sim: Sim, nest: Nest): { x: number; y: number; z: number } {
  const bu = sim.world.bu, t = template(sim), o = nest.origin;
  const cell = nest.chambers.find((c) => c.type === 'founding');
  if (cell) return { x: cell.center.x, y: cell.center.y - cell.radii.y * 0.5, z: cell.center.z };
  return { x: o.x + (t.cell.w / 2) * bu, y: o.y - (t.shaftDepth + t.cell.h / 2) * bu, z: o.z };
}

/** One tick of the automatic opening; returns true when it acted (the normal phase logic still runs after it). */
export function autoTick(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  const step = bbGet(q, STEP, 0);
  switch (op.phase) {
    case 'search':
      if (step < 1) { carveTemplate(sim, q, nest); bbSet(q, STEP, 1); }
      else { setPhase(sim, op, 'dig'); }
      return;
    case 'dig':
      if (step < 2) { sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: cellFloor(sim, nest) }); bbSet(q, STEP, 2); }
      else if (q.chamberId < 0 && q.medium !== 'cavity') sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: cellFloor(sim, nest) });
      return;
    case 'seal': {
      if (step >= 3) return;
      const bu = sim.world.bu;
      for (const e of cavityEntrances(sim, nest)) {
        if (e.status === 'sealed') continue;
        const d = AUTO_SEAL_FILL.depthBu * bu;
        const p = { x: e.pos.x - e.dir.x * d, y: e.pos.y - e.dir.y * d, z: e.pos.z - e.dir.z * d };
        sim.enqueue({ type: 'cheat.fillSphere', pos: p, r: AUTO_SEAL_FILL.rBu * bu, loose: true });
      }
      bbSet(q, STEP, 3);
      return;
    }
    case 'lay': {
      if (q.chamberId < 0) { sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: cellFloor(sim, nest) }); return; }
      const limit = clutchLimit(sim, q, nest);
      while (eggsLaid(q) < limit && layEgg(sim, q, 'worker') >= 0) { /* lay the whole clutch at once */ }
      return;
    }
    case 'timelapse':
      if (op.lapse) op.lapse.skipped = true;
      return;
    default:
  }
}
