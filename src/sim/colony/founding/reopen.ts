// The first workers reopen the plug (GDD 06 §5.13 (b), GDD 03 §13.2 `reopening`: "nanitics dig it"). The nest's
// own `reopen` plan cannot be dug yet (no behaviour runs `unseal-entrance` for it, and its slot is placed straight
// below the opening along the vertical surface normal, inside the soil beside a sloped throat), so the founding
// module asks the nest for ordinary dig plans instead (public createPlan, source `founding`); the workers' own dig
// behaviour claims them and bites through the loose plug. Nothing is scripted on the workers.
//
// One plan is not always enough: a 2 BU shaft through a plug laid into a 2.5 BU throat leaves a rim of plug voxels,
// and the nest keeps an entrance with plug voxels left in its throat `sealing` (GDD 03 §4.2), which no forager uses
// as an exit. So after the hand-over `reopenTick` keeps one founding plan at a time going: the passage first, then
// a short plan through each plug remnant, until the entrance is `open` (see reopenTick for how long it watches).
// Plug voxels no plan can take are unplugged by the nest's own unplug function (`unplugRemnants`, a local adapter).
// The seal guide aims its plugs at the throat's narrowest layer (sealPlan.ts), often its inner end beside the cell:
// the nest refuses every founding plan there (`too-close` to the cell), so such a plug is unplugged the same way,
// reaching past the throat sphere where the plug does (`unplugDeep`, viab-founding).

import type { Vec3 } from '@/core/math/vec3';
import type { DigPlan, Entrance, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import {
  REOPEN_CHECK_TICKS, REOPEN_DEEP_REACH_BU, REOPEN_FACE_INSIDE_BU, REOPEN_FACE_PLUG_TRIES, REOPEN_FACE_SEARCH_BU, REOPEN_FACE_STEP_BU, REOPEN_MAX_GD, REOPEN_PAST_BU,
  REOPEN_UNPLUG_BITES, REOPEN_PLAN_PRIORITY, REOPEN_PLAN_STALL_GD,
} from '@/sim/balance/founding';
import { cancelPlan, createPlan, unsealEntrance, voxelAt } from '@/sim/nest';
import { unplugAt } from '@/sim/nest/entrances';
import { TICKS_PER_DAY } from '@/sim/time';
import { foundingNest, openingOf } from './access';
import { cavityEntrances } from './dig';

/** Carve-grid iso level (design seed §4: openness 0 solid .. 255 open, iso 127.5): above it a sample is open. */
const CARVE_ISO = 127.5;
const UP = { x: 0, y: 1, z: 0 };

/** The cell the opening was founded in (its centre is in the cavity's nav component). */
function cellCentre(nest: Nest): Vec3 | null {
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  return cell ? cell.center : nest.founding?.cavitySeed ?? null;
}

/**
 * The open point nearest to `from` (within `radius`, at or below `from` when `belowOnly`) that lies in the cell's
 * cavity: carved space well inside the soil (not the open air above the plug), connected to the cell.
 */
function cavityPointNear(sim: Sim, nest: Nest, from: Vec3, radius: number, belowOnly: boolean): Vec3 | null {
  const centre = cellCentre(nest);
  if (!centre) return null;
  const comp = sim.nestNav.componentAt(centre);
  if (comp < 0) return null;
  const bu = sim.world.bu, step = REOPEN_FACE_STEP_BU * bu, inside = REOPEN_FACE_INSIDE_BU * bu;
  const p = { x: 0, y: 0, z: 0 };
  let best: Vec3 | null = null, bestD = Infinity;
  for (let dy = -radius; dy <= (belowOnly ? 0 : radius); dy += step) {
    for (let dz = -radius; dz <= radius; dz += step) {
      for (let dx = -radius; dx <= radius; dx += step) {
        const d = Math.hypot(dx, dy, dz);
        if (d > radius || d >= bestD) continue;
        p.x = from.x + dx; p.y = from.y + dy; p.z = from.z + dz;
        if (sim.field.sample(p) <= 0 || sim.field.substrate(p) > -inside || sim.nestNav.componentAt(p) !== comp) continue;
        best = { x: p.x, y: p.y, z: p.z };
        bestD = d;
      }
    }
  }
  return best;
}

/**
 * The plug's inner face: the cavity point nearest to the opening (within REOPEN_FACE_SEARCH_BU, not above it); for
 * a plug laid deeper in the throat (the seal guide aims it at the throat's narrowest layer, sealPlan.ts) the cavity
 * point nearest to its deepest voxels.
 */
export function plugInnerFace(sim: Sim, nest: Nest, e: Entrance): Vec3 | null {
  const r = REOPEN_FACE_SEARCH_BU * sim.world.bu;
  const atMouth = cavityPointNear(sim, nest, e.pos, r, true);
  if (atMouth) return atMouth;
  const plug = plugRemnants(sim, e, 'soil');
  for (let i = plug.length - 1; i >= Math.max(0, plug.length - REOPEN_FACE_PLUG_TRIES); i--) {
    const face = cavityPointNear(sim, nest, plug[i], r, false);
    if (face) return face;
  }
  return null;
}

/**
 * Closed plug voxels left in the throat of e (the nest's throat sphere; `reachBu` past the opening's rim instead of
 * THROAT_BU for a wider search), nearest to the opening first. `soil`: the
 * ones inside the ground, which a dig can remove; `ghost`: carve samples at or above the ground surface (the plug
 * fill reached them), already free space in the field, so no dig bite finds anything there, yet the nest still
 * counts them as plug (nest defect, see the founding report).
 */
export function plugRemnants(sim: Sim, e: Entrance, which: 'soil' | 'ghost' | 'all' = 'all', reachBu = THROAT_BU): Vec3[] {
  const v = sim.carve.voxel, R = e.radius + reachBu * sim.world.bu;
  const out: Vec3[] = [];
  const p = { x: 0, y: 0, z: 0 };
  const i0 = Math.floor((e.pos.x - R) / v), i1 = Math.ceil((e.pos.x + R) / v);
  const j0 = Math.floor((e.pos.y - R) / v), j1 = Math.ceil((e.pos.y + R) / v);
  const k0 = Math.floor((e.pos.z - R) / v), k1 = Math.ceil((e.pos.z + R) / v);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    p.x = i * v; p.y = j * v; p.z = k * v;
    if ((p.x - e.pos.x) ** 2 + (p.y - e.pos.y) ** 2 + (p.z - e.pos.z) ** 2 > R * R) continue;
    const s = voxelAt(sim, p);
    if ((s.flags & VoxelFlag.PLUG) === 0 || s.open >= CARVE_ISO) continue;
    const ghost = sim.field.substrate(p) >= 0;
    if (which === 'all' || (which === 'ghost') === ghost) out.push({ x: p.x, y: p.y, z: p.z });
  }
  const d = (q: Vec3) => (q.x - e.pos.x) ** 2 + (q.y - e.pos.y) ** 2 + (q.z - e.pos.z) ** 2;
  return out.sort((a, b) => d(a) - d(b));
}

/** A founding shaft plan from the cavity point `from` to `to` (extended REOPEN_PAST_BU beyond it); plan id or -1. */
function shaftPlan(sim: Sim, nest: Nest, from: Vec3, to: Vec3): number {
  const bu = sim.world.bu;
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, len = Math.hypot(dx, dy, dz);
  const k = len > 1e-6 ? (REOPEN_PAST_BU * bu) / len : 0;
  const end = { x: to.x + dx * k, y: to.y + dy * k, z: to.z + dz * k };
  return createPlan(sim, {
    nestId: nest.id, kind: 'shaft', anchor: { pos: from, normal: UP }, end, priority: REOPEN_PLAN_PRIORITY, confirmWarnings: true,
  }, 'founding');
}

/** The dig through the plug of one entrance: the passage from the inner face up to the opening; plan id or -1. */
function passagePlan(sim: Sim, nest: Nest, e: Entrance): number {
  const face = plugInnerFace(sim, nest, e);
  return face ? shaftPlan(sim, nest, face, e.pos) : -1;
}

/**
 * The dig through a plug laid deep in the throat (the nest refuses a shaft from its inner face all the way to the
 * opening: it runs beside the open outer throat, `too-close`): from the inner face through the plug voxel nearest
 * the opening (REOPEN_PAST_BU beyond it), short enough to stay within the anchor's connection reach; plan id or -1.
 */
function deepPlugPlan(sim: Sim, nest: Nest, e: Entrance): number {
  const face = plugInnerFace(sim, nest, e), outer = plugRemnants(sim, e, 'soil')[0];
  return face && outer ? shaftPlan(sim, nest, face, outer) : -1;
}

/**
 * A short dig through the plug remnant nearest the opening: a plan anchored at the remnant itself (beside the open
 * passage) and rising REOPEN_PAST_BU, so it reaches up towards the surface and stays within the anchor's
 * connection reach (the nest's plan checks); plan id or -1 when the nest refuses every remnant.
 */
function remnantPlan(sim: Sim, nest: Nest, e: Entrance): number {
  const lift = REOPEN_PAST_BU * sim.world.bu;
  for (const r of plugRemnants(sim, e, 'soil')) {
    const id = createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: r, normal: UP }, end: { x: r.x, y: r.y + lift, z: r.z },
      priority: REOPEN_PLAN_PRIORITY, confirmWarnings: true,
    }, 'founding');
    if (id >= 0) return id;
  }
  return -1;
}

/** Plugged entrances of the founding cavity (not yet `open`). */
function pluggedEntrances(sim: Sim, nest: Nest): Entrance[] {
  return cavityEntrances(sim, nest).filter((e) => e.status !== 'open');
}

/**
 * Asks the nest for the reopening dig of every plugged entrance of the founding cavity (at hand-over); returns the
 * plan ids created.
 */
export function requestReopen(sim: Sim, nest: Nest): number[] {
  const ids: number[] = [];
  for (const e of pluggedEntrances(sim, nest)) {
    const id = passagePlan(sim, nest, e);
    if (id >= 0) ids.push(id);
  }
  return ids;
}

/**
 * Local adapter (see the founding report, needs from nest and beh-nest): plug voxels that no plan can take are
 * cleared with the nest's own unplugging function (`unsealEntrance`, the `unseal-entrance` effect, which opens
 * only plug voxels: GDD 03 §4.2 "unseal = dig-bite on plug voxels"). These are the samples the fill left at or
 * above the ground surface (free space already, which no bite finds) and the rim the nest's plan checks refuse
 * (`too-close` / `undermines` / `non-diggable` right at the opening). At most REOPEN_UNPLUG_BITES per check.
 */
function unplugRemnants(sim: Sim, e: Entrance): boolean {
  let any = false;
  for (let n = 0; n < REOPEN_UNPLUG_BITES && plugRemnants(sim, e).length > 0; n++) {
    unsealEntrance(sim, e.id, -1);
    any = true;
  }
  return any;
}

/**
 * Local adapter for a plug laid at the throat's inner end, which no founding plan can take and which reaches past
 * the throat sphere (by up to its plug radius): its voxels within REOPEN_DEEP_REACH_BU of the opening's rim are
 * unplugged with the nest's own unseal bite (`unplugAt`), the deepest first, as the workers would from the cell
 * side; at most REOPEN_UNPLUG_BITES per check. True when it bit.
 */
function unplugDeep(sim: Sim, e: Entrance): boolean {
  let any = false;
  for (let n = 0; n < REOPEN_UNPLUG_BITES; n++) {
    const rem = plugRemnants(sim, e, 'soil', REOPEN_DEEP_REACH_BU);
    if (rem.length === 0) break;
    unplugAt(sim, e.id, rem[rem.length - 1]);
    any = true;
  }
  return any;
}

const live = (p: DigPlan) => p.status !== 'complete' && p.status !== 'cancelled';

function livePlan(nest: Nest, test: (source: string, kind: string) => boolean): boolean {
  return nest.digPlans.some((p) => live(p) && test(p.source, p.kind));
}

/** Cancels founding plans that have been live longer than REOPEN_PLAN_STALL_GD (nobody could dig them). */
function cancelStalled(sim: Sim, nest: Nest): void {
  const limit = REOPEN_PLAN_STALL_GD * TICKS_PER_DAY;
  for (const p of nest.digPlans) {
    if (p.source === 'founding' && live(p) && sim.state.tick - p.createdTick > limit) cancelPlan(sim, p.id, 'stalled');
  }
}

/** Somebody is closing an entrance on purpose: a `seal` plan, or an ant of the colony tamping a plug now. */
function sealingOnPurpose(sim: Sim, nest: Nest): boolean {
  if (livePlan(nest, (_s, kind) => kind === 'seal')) return true;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === nest.colony && a.action?.id === 'seal-entrance') return true;
  return false;
}

/**
 * After the hand-over, while the entrances of the founding cavity are closed: whenever no founding plan is left,
 * asks for the next one. A throat with a passage but plug voxels left in it (`sealing`: the rim of the old plug,
 * or loose soil later tamped onto stale plug voxels) gets a plan through the remnant nearest the opening, at any
 * time; a throat with no passage gets the passage plan for REOPEN_MAX_GD after the hand-over (later a closed nest
 * is the colony's own business, e.g. sealing for winter). Once a throat reads `open`, plug voxels left in it are
 * unplugged within REOPEN_MAX_GD. Nothing is done while the colony seals on purpose.
 * Runs every REOPEN_CHECK_TICKS; returns the plan created, or -1.
 */
export function reopenTick(sim: Sim): number {
  const op = openingOf(sim);
  if (!op || (op.phase !== 'handover' && op.phase !== 'done') || !op.lapse || op.lapse.endTick < 0) return -1;
  const since = sim.state.tick - op.lapse.endTick;
  if (since <= 0 || since % REOPEN_CHECK_TICKS !== 0) return -1;
  const nest = foundingNest(sim);
  if (!nest) return -1;
  cancelStalled(sim, nest);
  if (livePlan(nest, (source) => source === 'founding')) return -1;
  const mine = cavityEntrances(sim, nest);
  if (mine.length === 0 || sealingOnPurpose(sim, nest)) return -1;
  const early = since <= REOPEN_MAX_GD * TICKS_PER_DAY;
  const opened = mine.find((e) => e.status === 'open');
  if (opened) {
    // the way out is dug, yet the nest may call a throat `open` with plug voxels left beside the passage (or fill
    // at the ground surface): they are unplugged while the reopening window lasts, no plan is needed for them
    if (early && plugRemnants(sim, opened).length > 0) unplugRemnants(sim, opened);
    return -1;
  }
  for (const e of mine) {
    // a passage exists and only the rim of the old plug is left: the rim goes first (the workers dug the way
    // through; the rim keeps the nest's status at `sealing`), and a plan only for what the unplugging leaves
    if (e.status === 'sealing' && e.plugVoxelCount > 0) unplugRemnants(sim, e);
    if (e.status === 'open') return -1;
    const remnant = e.status === 'sealing' && e.plugVoxelCount > 0;
    let id = remnant ? remnantPlan(sim, nest, e) : early ? passagePlan(sim, nest, e) : -1;
    if (id < 0 && early && !remnant) id = deepPlugPlan(sim, nest, e);
    if (id >= 0) return id;
    // no plan at all: the plug is unplugged from the cell side (local adapter); its first bite marks the entrance
    // `reopening`, which also sends the workers' own unplugging (the dig behaviour's `unseal-entrance`) to it
    if (early && !remnant && (unplugRemnants(sim, e) || unplugDeep(sim, e))) return -1;
  }
  return -1;
}
