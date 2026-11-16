// `cheat.completeFounding` (GDD 06 App. B; task deliverable 4): runs every remaining step of the opening through
// the same state machine, as fast as the ticks allow. Instead of the player's bites, holds and batches it uses the
// debug world edits that exist as commands (carve the species' founding template at the queen, move her into the
// cell) and the colony's own laying; the throat is sealed the passive player's way (sealGuide.ts: the real
// seal-entrance at the leak); the readiness, sealing, clutch, time-lapse (marked skipped,
// so the game runs it at full rate) and hand-over are the normal code.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, OpeningState, Sim, SpeciesId } from '@/sim/types';
import { FOUNDING_TEMPLATE } from '@/sim/balance/nest';
import { OPEN_LAY_BATCH_EGGS } from '@/sim/balance/actions';
import { AUTO_CARVE_STEP_BU, AUTO_CELL_OVERLAP_BU, AUTO_CLUTCH_SURVIVAL, AUTO_SHAFT_PITCH_DEG, AUTO_SITE_SEARCH_BU, AUTO_TEMPLATE_PROBE_FRAC } from '@/sim/balance/founding';
import { canDigAt } from '@/sim/nest';
import { layEgg } from '../queen';
import { FB, bbGet, bbSet, setPhase, speciesOf } from './access';
import { clutchLimit, eggsLaid } from './clutch';
import { requestSeal } from './sealGuide';
import { floodStart } from './leak';

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

/** The template's horizontal headings (the kernel's ellipsoid brush is axis-aligned: quarter turns only). */
const HEADINGS: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/** Points of the template (shaft every BU, the cell's centre, ends, sides and floor) for a heading, mm. */
function templatePoints(sim: Sim, x: number, z: number, g: number, hx: number, hz: number): Vec3[] {
  const bu = sim.world.bu, t = template(sim), pitch = (AUTO_SHAFT_PITCH_DEG * Math.PI) / 180;
  const run = t.shaftDepth / Math.tan(pitch), len = t.shaftDepth / Math.sin(pitch);
  const out: Vec3[] = [];
  for (let s = 1; s <= len; s += 1) {
    const f = s / len;
    out.push({ x: x + hx * f * run * bu, y: g - f * t.shaftDepth * bu, z: z + hz * f * run * bu });
  }
  const along = run + t.cell.w / 2 - AUTO_CELL_OVERLAP_BU, cy = g - (t.shaftDepth + t.cell.h / 2 - AUTO_CELL_OVERLAP_BU) * bu;
  const a = (t.cell.w / 2) * AUTO_TEMPLATE_PROBE_FRAC, l = (t.cell.l / 2) * AUTO_TEMPLATE_PROBE_FRAC;
  for (const [da, dl, dy] of [[0, 0, 0], [a, 0, 0], [-a, 0, 0], [0, l, 0], [0, -l, 0], [0, 0, -t.cell.h / 2]] as const) {
    out.push({ x: x + (hx * (along + da) - hz * dl) * bu, y: cy + dy * bu, z: z + (hz * (along + da) + hx * dl) * bu });
  }
  return out;
}

/** The template's points in diggable soil under the ground itself (not in the fill of an object standing on it,
 * e.g. a sand pit's box: a cavity carved in a primitive is no place a walker can stay), counted. */
function soilPoints(sim: Sim, pts: readonly Vec3[]): number {
  const id = speciesOf(sim).id as SpeciesId, bu = sim.world.bu;
  return pts.filter((p) => {
    const g = sim.field.height(p.x, p.z);
    return canDigAt(sim, id, p) && p.y < g && sim.field.substrateXYZ(p.x, g + 0.5 * bu, p.z) > 0;
  }).length;
}

/**
 * Where the template goes: the queen's own place and the first heading whose template lies wholly in soil; else the
 * nearest place within AUTO_SITE_SEARCH_BU that has one (she is moved there: the cheat founds AT the site, beside an
 * object rather than inside it); else her place and the heading with the most points in soil.
 */
function templateSite(sim: Sim, q: Ant): { x: number; z: number; h: readonly [number, number] } {
  const bu = sim.world.bu;
  let best = { x: q.pos.x, z: q.pos.z, h: HEADINGS[0] }, bestN = -1;
  for (let r = 0; r <= AUTO_SITE_SEARCH_BU; r += 1) {
    const n = r === 0 ? 1 : Math.max(8, Math.round(2 * Math.PI * r));
    for (let i = 0; i < n; i++) {
      const th = (i / n) * 2 * Math.PI, x = q.pos.x + Math.cos(th) * r * bu, z = q.pos.z + Math.sin(th) * r * bu;
      const g = sim.field.height(x, z);
      if (sim.field.substrateXYZ(x, g + 0.5 * bu, z) <= 0) continue; // under an object
      for (const h of HEADINGS) {
        const pts = templatePoints(sim, x, z, g, h[0], h[1]);
        const k = soilPoints(sim, pts);
        if (k === pts.length) return { x, z, h };
        if (r === 0 && k > bestN) { best = { x, z, h }; bestN = k; }
      }
    }
  }
  return best;
}

/**
 * Carves the founding template below the queen through the debug carve commands: the shaft as a ramp at
 * AUTO_SHAFT_PITCH_DEG (the slope a dig with dig-bite produces; a sealable throat, founding-close §1) along the
 * heading whose template lies in diggable ground (a buried stone or footing beside a good site, viab-founding),
 * then the species' cell at its foot.
 */
function carveTemplate(sim: Sim, q: Ant, nest: Nest): void {
  const bu = sim.world.bu, t = template(sim);
  const site = templateSite(sim, q);
  const x = site.x, z = site.z, g = sim.field.height(x, z);
  const [hx, hz] = site.h;
  if (Math.hypot(x - q.pos.x, z - q.pos.z) > 0.5 * bu) sim.enqueue({ type: 'cheat.teleport', antId: q.id, pos: { x, y: g + 0.5 * bu, z } });
  const r = (t.shaftD / 2) * bu;
  const pitch = (AUTO_SHAFT_PITCH_DEG * Math.PI) / 180;
  const run = t.shaftDepth / Math.tan(pitch), len = t.shaftDepth / Math.sin(pitch);
  for (let s = 0; s <= len; s += AUTO_CARVE_STEP_BU) {
    const f = s / len;
    sim.enqueue({ type: 'cheat.carveSphere', pos: { x: x + hx * f * run * bu, y: g - f * t.shaftDepth * bu, z: z + hz * f * run * bu }, r });
  }
  const along = (run + t.cell.w / 2 - AUTO_CELL_OVERLAP_BU) * bu;
  const cx = x + hx * along, cz = z + hz * along, cy = g - (t.shaftDepth + t.cell.h / 2 - AUTO_CELL_OVERLAP_BU) * bu;
  sim.enqueue({
    type: 'cheat.carveEllipsoid', center: { x: cx, y: cy, z: cz },
    radii: { x: (t.cell.w / 2) * bu, y: (t.cell.h / 2) * bu, z: (t.cell.l / 2) * bu }, yawDeg: hz !== 0 ? 90 : 0,
  });
  if (nest.founding && nest.founding.state === 'site-search') nest.founding.state = 'digging';
  nest.origin = { x, y: g, z };
  if (nest.founding) nest.founding.cavitySeed = { x: cx, y: cy, z: cz };
}

/** Floor point in the middle of the template cell. */
function cellFloor(sim: Sim, nest: Nest): Vec3 {
  const cell = nest.chambers.find((c) => c.type === 'founding');
  // an open sample of the registered room (its centre may lie in soil: the walker would be moved out to the surface)
  if (cell) return floodStart(sim, nest);
  const s = nest.founding?.cavitySeed ?? nest.origin;
  return { x: s.x, y: s.y - AUTO_CELL_OVERLAP_BU * sim.world.bu, z: s.z };
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
