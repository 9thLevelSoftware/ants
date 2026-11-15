// `cheat.completeFounding` (GDD 06 App. B; task deliverable 4): runs every remaining step of the opening through
// the same state machine, as fast as the ticks allow. Instead of the player's bites, holds and batches it uses the
// debug world edits that exist as commands (carve the species' founding template at the queen, move her into the
// cell) and the colony's own laying; the throat is sealed the passive player's way (sealGuide.ts: the real
// seal-entrance at the leak); the readiness, sealing, clutch, time-lapse (marked skipped,
// so the game runs it at full rate) and hand-over are the normal code.

import type { Ant, Nest, OpeningState, Sim, SpeciesId } from '@/sim/types';
import { FOUNDING_TEMPLATE } from '@/sim/balance/nest';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { AUTO_CARVE_STEP_BU, AUTO_CELL_OVERLAP_BU, AUTO_CLUTCH_SURVIVAL, AUTO_SHAFT_PITCH_DEG } from '@/sim/balance/founding';
import { layEgg } from '../queen';
import { FB, bbGet, bbSet, setPhase, speciesOf } from './access';
import { clutchLimit, eggsLaid } from './clutch';
import { requestSeal } from './sealGuide';

const STEP = 'fd.autoStep';
/** The cheat possessed the queen for the seal (and releases her after it). */
const AUTO_POSSESSED = 'fd.autoPossessed';
const AUTO_LAY_MOVED = 'fd.autoLayMoved';

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

/**
 * Carves the founding template below the queen through the debug carve commands: the shaft as a ramp at
 * AUTO_SHAFT_PITCH_DEG (the slope a dig with dig-bite produces; a sealable throat, founding-close §1) toward +x,
 * then the species' cell at its foot.
 */
function carveTemplate(sim: Sim, q: Ant, nest: Nest): void {
  const bu = sim.world.bu, t = template(sim);
  const x = q.pos.x, z = q.pos.z, g = sim.field.height(x, z);
  const r = (t.shaftD / 2) * bu;
  const pitch = (AUTO_SHAFT_PITCH_DEG * Math.PI) / 180;
  const run = t.shaftDepth / Math.tan(pitch), len = t.shaftDepth / Math.sin(pitch);
  for (let s = 0; s <= len; s += AUTO_CARVE_STEP_BU) {
    const f = s / len;
    sim.enqueue({ type: 'cheat.carveSphere', pos: { x: x + f * run * bu, y: g - f * t.shaftDepth * bu, z }, r });
  }
  const cx = x + (run + t.cell.w / 2 - AUTO_CELL_OVERLAP_BU) * bu, cy = g - (t.shaftDepth + t.cell.h / 2 - AUTO_CELL_OVERLAP_BU) * bu;
  sim.enqueue({
    type: 'cheat.carveEllipsoid', center: { x: cx, y: cy, z },
    radii: { x: (t.cell.w / 2) * bu, y: (t.cell.h / 2) * bu, z: (t.cell.l / 2) * bu }, yawDeg: 0,
  });
  if (nest.founding && nest.founding.state === 'site-search') nest.founding.state = 'digging';
  nest.origin = { x, y: g, z };
  if (nest.founding) nest.founding.cavitySeed = { x: cx, y: cy, z };
}

/** Floor point in the middle of the template cell. */
function cellFloor(sim: Sim, nest: Nest): { x: number; y: number; z: number } {
  const bu = sim.world.bu, t = template(sim), o = nest.origin;
  const cell = nest.chambers.find((c) => c.type === 'founding');
  if (cell) return { x: cell.center.x, y: cell.center.y - cell.radii.y * 0.5, z: cell.center.z };
  const run = t.shaftDepth / Math.tan((AUTO_SHAFT_PITCH_DEG * Math.PI) / 180);
  return { x: o.x + (run + t.cell.w / 2 - AUTO_CELL_OVERLAP_BU) * bu, y: o.y - (t.shaftDepth + t.cell.h / 2) * bu, z: o.z };
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
    case 'seal':
      // the passive player's sealing: the guide walks her to the leak and plugs it with seal-entrance, moving her
      // as the game does, by her own movement input (she is possessed through the opening; a test sim may not be)
      if (step < 3) {
        if (sim.state.player.possessedAntId !== q.id) { sim.enqueue({ type: 'possess', antId: q.id }); bbSet(q, AUTO_POSSESSED, 1); }
        bbSet(q, STEP, 3);
      } else if (step < 4) {
        requestSeal(sim, q, true);
        bbSet(q, STEP, 4);
      }
      return;
    case 'lay': {
      if (bbGet(q, AUTO_POSSESSED, 0) === 1) { sim.enqueue({ type: 'release', reason: 'player' }); bbSet(q, AUTO_POSSESSED, 0); }
      // into the cell once (where the walker settles may not read as inside the chamber: she lays there anyway,
      // and her care keeps the pile in the cell)
      if (q.chamberId < 0 && bbGet(q, AUTO_LAY_MOVED, 0) === 0) {
        sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: cellFloor(sim, nest) });
        bbSet(q, AUTO_LAY_MOVED, 1);
        return;
      }
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
