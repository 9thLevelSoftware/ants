// Searching and digging (GDD 06 §5.1 phases `search` / `dig` / `seal`, GDD 03 §13.2-§13.4): the first bite on
// diggable ground starts the founding dig (`site-search` -> `digging`), readiness is measured by the nest module
// (`foundingReadiness`) and drives `ready`, the queen may walk away (back to `search`) and a bite far from the old
// cavity starts a new site (§13.4). Sealing is decided against the entrances that open into the founding cavity.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Entrance, Nest, OpeningState, Sim, SpeciesId } from '@/sim/types';
import {
  FOUND_ABANDON_BU, FOUND_ABANDON_RECORD_MAX, FOUND_IN_CELL_MARGIN_BU, FOUND_READINESS_EVERY_TICKS, FOUND_THROAT_PROBE_BU,
} from '@/sim/balance/founding';
import { canDigAt, foundingReadiness, type FoundingReadiness } from '@/sim/nest';
import { FB, bbGet, bbSet, depthBelowGround, foundingQueen, setPhase, speciesOf } from './access';
import { floodCavity, floodStart, sampleKey, throatClosed } from './leak';

/** Where the queen's current dig bite aims (its target point, else her head), or null when she is not biting. */
export function bitePoint(sim: Sim, q: Ant): Vec3 | null {
  const a = q.action;
  if (!a || a.id !== 'dig-bite') return null;
  if (a.target && (a.target.kind === 'point' || a.target.kind === 'surface')) return a.target.pos;
  const d = 0.5 * q.lengthBu * sim.world.bu;
  return { x: q.pos.x + q.fwd.x * d, y: q.pos.y + q.fwd.y * d - 0.5 * sim.world.bu, z: q.pos.z + q.fwd.z * d };
}

function biteIsDiggable(sim: Sim, p: Vec3): boolean {
  return canDigAt(sim, speciesOf(sim).id as SpeciesId, p);
}

function horizontal(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/** Moves the nest's founding record to a new site (GDD 03 §13.4), remembering the old site's entrances. */
function restartSite(sim: Sim, nest: Nest, p: Vec3): void {
  const f = nest.founding;
  if (!f) return;
  for (const e of nest.entrances) if (!f.abandoned.includes(e.id)) f.abandoned.push(e.id);
  while (f.abandoned.length > FOUND_ABANDON_RECORD_MAX) f.abandoned.shift(); // bounded record (ids only)
  nest.origin = { x: p.x, y: sim.field.height(p.x, p.z), z: p.z };
  f.cavitySeed = { x: p.x, y: p.y, z: p.z };
  f.readiness = 0;
  f.readyTick = -1;
}

/** Search phase: the first bite on diggable ground starts the dig (before the bite lands, so its soil is expelled). */
export function searchTick(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  const p = bitePoint(sim, q);
  if (!p || !nest.founding || !biteIsDiggable(sim, p)) return;
  const f = nest.founding;
  if (f.state === 'site-search') {
    f.state = 'digging';
  } else if (f.state === 'digging' && nest.entrances.length > 0 && horizontal(p, nest.origin) >= FOUND_ABANDON_BU * sim.world.bu
    && !inCavityOf(sim, nest, q)) {
    restartSite(sim, nest, p);
  }
  setPhase(sim, op, 'dig');
}

function inCavityOf(sim: Sim, nest: Nest, q: Ant): boolean {
  return q.nestId === nest.id || q.medium === 'cavity';
}

/** Readiness of the founding cavity, re-measured once per FOUND_READINESS_EVERY_TICKS (cached on the nest record). */
export function measureReadiness(sim: Sim, nest: Nest): FoundingReadiness | null {
  const r = foundingReadiness(sim, nest);
  if (r && nest.founding) {
    nest.founding.readiness = r.readiness;
    sim.emit({
      type: 'founding-readiness', nestId: nest.id, readiness: r.readiness,
      parts: { depth: Math.min(1, r.dMaxBu / Math.max(1e-6, r.dMinBu)), volume: Math.min(1, r.vDeepBu3 / Math.max(1e-6, speciesOf(sim).opening.vMinBu3)) },
    });
  }
  return r;
}

/** Is the queen in the founding cell: in its chamber, or deep enough in the cavity once it is ready? */
export function queenInCell(sim: Sim, nest: Nest, q: Ant, r: FoundingReadiness): boolean {
  const cell = nest.chambers.find((c) => c.type === 'founding');
  if (cell && q.chamberId === cell.id) return true;
  const depth = depthBelowGround(sim, q) / sim.world.bu;
  return q.medium === 'cavity' && depth >= r.dMinBu - FOUND_IN_CELL_MARGIN_BU;
}

/** Dig phase: readiness, `ready` when met with the queen inside, back to `search` when she walks away. */
export function digTick(sim: Sim, op: OpeningState, q: Ant, nest: Nest): void {
  const f = nest.founding;
  if (!f) return;
  const bu = sim.world.bu;
  if (q.medium !== 'cavity' && q.nestId < 0 && horizontal(q.pos, nest.origin) > FOUND_ABANDON_BU * bu && !q.action) {
    setPhase(sim, op, 'search');
    return;
  }
  if (sim.state.tick - bbGet(q, FB.readinessTick, -1e9) < FOUND_READINESS_EVERY_TICKS) return;
  bbSet(q, FB.readinessTick, sim.state.tick);
  const r = measureReadiness(sim, nest);
  if (!r) return;
  op.shaftDepthBu = r.dMaxBu;
  op.chamberVoxels = Math.round(r.vDeepBu3 / (sim.carve.voxel / bu) ** 3);
  // the nest module registers the founding cell once the geometry is met (applyFoundingCell): wait for it, so the
  // clutch is laid into a registered chamber
  const cell = nest.chambers.find((c) => c.type === 'founding');
  if (r.ready && cell && f.state === 'digging' && queenInCell(sim, nest, q, r)) {
    f.state = 'ready';
    f.readyTick = sim.state.tick;
    op.chamberId = cell.id;
    sim.emit({ type: 'founding-ready', nestId: nest.id });
    setPhase(sim, op, 'seal');
  }
}

/** Entrances of the nest whose throat leads into the founding cell's cavity (trial pits elsewhere excluded). */
export function cavityEntrances(sim: Sim, nest: Nest): Entrance[] {
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  const seed = cell ? cell.center : nest.founding?.cavitySeed;
  if (!seed) return nest.entrances.slice();
  const comp = sim.nestNav.componentAt(seed);
  const bu = sim.world.bu;
  // connected down its throat, or (a plug or fill now cuts the throat off) the opening of the current site itself
  return nest.entrances.filter((e) => horizontal(e.pos, nest.origin) <= FOUND_ABANDON_BU * bu || FOUND_THROAT_PROBE_BU.some((d) => {
    const p = { x: e.pos.x - e.dir.x * d * bu, y: e.pos.y - e.dir.y * d * bu, z: e.pos.z - e.dir.z * d * bu };
    return sim.nestNav.componentAt(p) === comp;
  }));
}

/** Is the founding queen in the cavity of her cell (not shut out above a plug)? */
function queenSealedIn(sim: Sim, nest: Nest): boolean {
  const q = foundingQueen(sim);
  if (!q) return true;
  const v = sim.carve.voxel, cav = floodCavity(sim, floodStart(nest)).cavity;
  const ci = Math.round(q.pos.x / v), cj = Math.round(q.pos.y / v), ck = Math.round(q.pos.z / v);
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    if (cav.has(sampleKey(ci + di, cj + dj, ck + dk))) return true;
  }
  return false;
}

/**
 * Seal phase: sealed when every entrance into the founding cavity is sealed (GDD 06 §5.9). The nest module flips
 * the record itself when ALL its entrances are sealed; trial pits of the same nest must not block it, so this
 * applies the same transition for the founding cavity's own entrances.
 */
export function sealTick(sim: Sim, op: OpeningState, nest: Nest): boolean {
  const f = nest.founding;
  if (!f) return false;
  if (f.state === 'ready' || (f.state === 'sealed' && op.phase === 'seal')) {
    const mine = cavityEntrances(sim, nest);
    // sealed with the queen inside (a plug between her and the cell is no seal of her cell)
    // no registered opening at all (a shaft closed under a crust, or one that broke into a natural cavity whose
    // openings the nest module has not registered): nothing the nest module counts as open, so sealed, as it sees it
    const closed = mine.every((e) => throatClosed(sim, e));
    const done = closed && queenSealedIn(sim, nest);
    if (done && f.state === 'ready') {
      f.state = 'sealed';
      f.sealedTick = sim.state.tick;
      sim.emit({ type: 'founding-sealed', nestId: nest.id, entranceId: mine[0]?.id ?? -1 });
    } else if (!done && f.state === 'sealed') {
      f.state = 'ready'; // the nest flipped the record while she is shut out (or a throat is open again)
    }
  }
  if (f.state !== 'sealed') return false;
  op.sealed = true;
  op.entranceId = cavityEntrances(sim, nest)[0]?.id ?? nest.entrances[0]?.id ?? -1;
  return true;
}
