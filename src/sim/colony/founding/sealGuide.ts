// Sealing the founding cavity (GDD 06 §5.9; task founding-close §1). In phase `seal`, pressing E (any E-action of
// the queen: seal-entrance, or the put-down / groom / lay-egg that E offers away from the throat) asks the guide to
// seal: it plans from the actual leak (sealPlan.ts), walks the queen to a stand from which the real `seal-entrance`
// plug lands across the leak (by her own movement input when possessed, by locomotion otherwise), begins the
// action, and repeats until the entrance is `sealed` (GDD 06 §5.9: holding E repeats the plug about 3 times until
// sealed) or SEAL_MAX_PLUGS plugs were placed. Movement input from the player takes the queen back at once. The
// passive player (OPEN_AUTO_SEAL_GD without input) and cheat.completeFounding use the same guide.

import type { Vec3 } from '@/core/math/vec3';
import type { ActionId, Ant, Nest, Sim } from '@/sim/types';
import { INPUT_DEADZONE } from '@/sim/balance/actions';
import {
  OPEN_AUTO_SEAL_GD, SEAL_EXCLUDE_BU, SEAL_FACE_MAG, SEAL_FACE_STEP_BU, SEAL_FACE_TICKS, SEAL_MAX_PLUGS, SEAL_MAX_REPLANS,
  SEAL_SOIL_WAIT_TICKS, SEAL_STAND_TOL_BU, SEAL_WALK_MAX_TICKS,
} from '@/sim/balance/founding';
import { begin } from '@/sim/ants/actions/runner';
import { navStop, navTo } from '@/sim/locomotion';
import { TICKS_PER_DAY } from '@/sim/time';
import { bbGet, bbSet, foundingQueen, openingOf, phaseAgeGd } from './access';
import { floodStart } from './leak';
import { planSeal } from './sealPlan';

/** Guide state on the queen (ant.bb, numbers only). */
export const SG = {
  state: 'fd.sg', // 0 idle, 1 walking to the stand, 2 plugging, 3 stuck (no stand reachable), 4 facing the leak
  ask: 'fd.sgAsk', // tick of the latest E press in phase `seal`
  seen: 'fd.sgSeen', // the ask tick already acted on
  auto: 'fd.sgAuto',
  autoTick: 'fd.sgAutoTick', // last passive request
  since: 'fd.sgTick',
  sx: 'fd.sgSx', sy: 'fd.sgSy', sz: 'fd.sgSz',
  tx: 'fd.sgTx', ty: 'fd.sgTy', tz: 'fd.sgTz', // where the leak crosses the throat
  dx: 'fd.sgDx', dy: 'fd.sgDy', dz: 'fd.sgDz', // movement input the guide wrote (to tell the player's apart)
  plugs: 'fd.sgPlugs', // plugs of this request
  total: 'fd.sgTotal', // seal-entrance actions begun by the guide in this opening
  replans: 'fd.sgReplans',
  ex: 'fd.sgEx', // excluded stands: fd.sgEx0x.. (up to SEAL_MAX_REPLANS)
} as const;

const IDLE = 0, WALK = 1, PLUG = 2, STUCK = 3, FACE = 4;

/** E-actions that mean "seal" while the opening is in phase `seal`. */
const E_ACTIONS: readonly ActionId[] = ['seal-entrance', 'put-down', 'groom', 'lay-egg'];

const listening = new WeakSet<Sim>();

/** Hears the queen's E presses (failed, started or cancelled E-actions) while the opening is in `seal`. */
export function listenForSealPresses(sim: Sim): void {
  if (listening.has(sim)) return;
  listening.add(sim);
  const note = (antId: number, action: ActionId) => {
    if (openingOf(sim)?.phase !== 'seal' || !E_ACTIONS.includes(action)) return;
    const q = foundingQueen(sim);
    if (!q || q.id !== antId || bbGet(q, SG.state, IDLE) === PLUG) return;
    bbSet(q, SG.ask, sim.state.tick);
  };
  sim.events.on('action-failed', (e) => note(e.antId, e.action));
  sim.events.on('action-started', (e) => note(e.antId, e.action));
  sim.events.on('action-cancelled', (e) => { if (e.action === 'lay-egg') note(e.antId, e.action); });
}

/** Starts (or restarts) a sealing request; `auto` for the passive player and the cheat. */
export function requestSeal(sim: Sim, q: Ant, auto: boolean): void {
  bbSet(q, SG.state, IDLE);
  bbSet(q, SG.auto, auto ? 1 : 0);
  bbSet(q, SG.plugs, 0);
  bbSet(q, SG.replans, 0);
  for (let n = 0; n < SEAL_MAX_REPLANS; n++) for (const c of 'xyz') delete q.bb[`${SG.ex}${n}${c}`];
  if (q.action && q.action.id === 'seal-entrance') {
    // the player's own plug is under way: the guide carries on from it
    bbSet(q, SG.plugs, 1);
    bbSet(q, SG.total, bbGet(q, SG.total, 0) + 1);
    bbSet(q, SG.state, PLUG);
    bbSet(q, SG.since, sim.state.tick);
    return;
  }
  plan(sim, q);
}

function possessed(sim: Sim, q: Ant): boolean {
  return sim.state.player.possessedAntId === q.id;
}

function setIntent(sim: Sim, q: Ant, d: Vec3 | null): void {
  const i = sim.state.player.intent;
  i.dir.x = d ? d.x : 0; i.dir.y = d ? d.y : 0; i.dir.z = d ? d.z : 0;
  bbSet(q, SG.dx, i.dir.x); bbSet(q, SG.dy, i.dir.y); bbSet(q, SG.dz, i.dir.z);
}

/** The player moved the queen (input that the guide did not write): she is hers again. */
function playerTookOver(sim: Sim, q: Ant): boolean {
  if (!possessed(sim, q)) return false;
  const d = sim.state.player.intent.dir;
  if (Math.hypot(d.x, d.y, d.z) <= INPUT_DEADZONE) return false;
  return Math.hypot(d.x - bbGet(q, SG.dx, 0), d.y - bbGet(q, SG.dy, 0), d.z - bbGet(q, SG.dz, 0)) > INPUT_DEADZONE;
}

function stop(sim: Sim, q: Ant, state: number): void {
  if (possessed(sim, q)) setIntent(sim, q, null);
  else navStop(sim, q);
  bbSet(q, SG.state, state);
  bbSet(q, SG.since, sim.state.tick);
}

function excluded(q: Ant): Vec3[] {
  const out: Vec3[] = [];
  for (let n = 0; n < SEAL_MAX_REPLANS; n++) {
    const x = q.bb[`${SG.ex}${n}x`];
    if (x !== undefined) out.push({ x, y: q.bb[`${SG.ex}${n}y`] ?? 0, z: q.bb[`${SG.ex}${n}z`] ?? 0 });
  }
  return out;
}

function exclude(q: Ant, p: Vec3): void {
  const n = bbGet(q, SG.replans, 0) % SEAL_MAX_REPLANS;
  bbSet(q, `${SG.ex}${n}x`, p.x); bbSet(q, `${SG.ex}${n}y`, p.y); bbSet(q, `${SG.ex}${n}z`, p.z);
}

function hasPellet(sim: Sim, q: Ant): boolean {
  return q.carry.kind === 'item' && sim.stores.items.get(q.carry.id)?.kind === 'soil-pellet';
}

/** Begins one plug where she stands; false when the action refused (it then re-plans). */
function plugHere(sim: Sim, q: Ant): boolean {
  if (!hasPellet(sim, q)) return false;
  if (!begin(sim, q, 'seal-entrance', null)) return false;
  bbSet(q, SG.total, bbGet(q, SG.total, 0) + 1);
  bbSet(q, SG.plugs, bbGet(q, SG.plugs, 0) + 1);
  bbSet(q, SG.state, PLUG);
  bbSet(q, SG.since, sim.state.tick);
  return true;
}

function planNow(sim: Sim, q: Ant) {
  const nest = foundingNestOf(sim);
  return nest ? planSeal(sim, nest, q, excluded(q), SEAL_EXCLUDE_BU * sim.world.bu) : null;
}

function targetOf(q: Ant): Vec3 {
  return { x: bbGet(q, SG.tx, q.pos.x), y: bbGet(q, SG.ty, q.pos.y), z: bbGet(q, SG.tz, q.pos.z) };
}

/** In reach but her pose would plug beside the leak: she turns toward it (a short slow step) before plugging. */
function face(sim: Sim, q: Ant): void {
  bbSet(q, SG.state, FACE);
  bbSet(q, SG.since, sim.state.tick);
  const t = targetOf(q);
  if (!possessed(sim, q)) {
    const d = Math.hypot(t.x - q.pos.x, t.y - q.pos.y, t.z - q.pos.z);
    navTo(sim, q, t, Math.max(SEAL_STAND_TOL_BU * sim.world.bu, d - SEAL_FACE_STEP_BU * sim.world.bu));
  }
}

function faceTick(sim: Sim, q: Ant): void {
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  const p = planNow(sim, q);
  if (!p) { stop(sim, q, IDLE); return; }
  if (!hasPellet(sim, q)) { if (t > SEAL_FACE_TICKS) giveUp(sim, q, q.pos); return; }
  if ((p.here.ok || t >= SEAL_FACE_TICKS) && p.inReach) {
    if (possessed(sim, q)) setIntent(sim, q, null); else navStop(sim, q);
    if (plugHere(sim, q)) return;
    giveUp(sim, q, q.pos);
    return;
  }
  if (!p.inReach) { giveUp(sim, q, q.pos); return; }
  if (possessed(sim, q)) {
    const u = unit(q.pos, targetOf(q));
    setIntent(sim, q, { x: u.x * SEAL_FACE_MAG, y: u.y * SEAL_FACE_MAG, z: u.z * SEAL_FACE_MAG });
  }
}

/** Plans the next step: plug here, walk to a stand, or stop (sealed, nothing to plug, or stuck). */
function plan(sim: Sim, q: Ant): void {
  const nest = foundingNestOf(sim);
  if (!nest) { stop(sim, q, IDLE); return; }
  if (bbGet(q, SG.plugs, 0) >= SEAL_MAX_PLUGS) { stop(sim, q, STUCK); return; }
  const p = planSeal(sim, nest, q, excluded(q), SEAL_EXCLUDE_BU * sim.world.bu);
  if (!p) { stop(sim, q, IDLE); return; }
  if (p.here.ok && (p.here.cuts || !p.standCuts) && hasPellet(sim, q)) {
    if (plugHere(sim, q)) return;
  }
  bbSet(q, SG.tx, p.target.x); bbSet(q, SG.ty, p.target.y); bbSet(q, SG.tz, p.target.z);
  if (p.inReach && hasPellet(sim, q) && !p.standCuts) { face(sim, q); return; }
  if (!p.stand) { stop(sim, q, STUCK); return; }
  bbSet(q, SG.sx, p.stand.x); bbSet(q, SG.sy, p.stand.y); bbSet(q, SG.sz, p.stand.z);
  bbSet(q, SG.state, WALK);
  bbSet(q, SG.since, sim.state.tick);
  if (!possessed(sim, q)) navTo(sim, q, p.stand, SEAL_STAND_TOL_BU * sim.world.bu);
}

function foundingNestOf(sim: Sim): Nest | undefined {
  const col = sim.stores.colonies.get(sim.state.player.colonyId) ?? sim.state.colonies[0];
  if (!col) return undefined;
  for (const id of col.nestIds) { const n = sim.stores.nests.get(id); if (n && n.alive) return n; }
  return undefined;
}

/** Where she should walk for soil when none can be scraped at the stand: toward the cell. */
function soilWalk(sim: Sim, q: Ant, nest: Nest): void {
  const c = floodStart(nest);
  if (possessed(sim, q)) setIntent(sim, q, unit(q.pos, c));
  else navTo(sim, q, c, SEAL_STAND_TOL_BU * sim.world.bu);
}

function unit(from: Vec3, to: Vec3): Vec3 {
  const x = to.x - from.x, y = to.y - from.y, z = to.z - from.z, l = Math.hypot(x, y, z) || 1;
  return { x: x / l, y: y / l, z: z / l };
}

/** The stand cannot be reached or plugs nothing: exclude it and plan again (STUCK after SEAL_MAX_REPLANS). */
function giveUp(sim: Sim, q: Ant, s: Vec3): void {
  exclude(q, s);
  bbSet(q, SG.replans, bbGet(q, SG.replans, 0) + 1);
  if (bbGet(q, SG.replans, 0) > SEAL_MAX_REPLANS) { stop(sim, q, STUCK); return; }
  plan(sim, q);
}

function walkTick(sim: Sim, q: Ant, nest: Nest): void {
  const s = { x: bbGet(q, SG.sx, q.pos.x), y: bbGet(q, SG.sy, q.pos.y), z: bbGet(q, SG.sz, q.pos.z) };
  const t = sim.state.tick - bbGet(q, SG.since, sim.state.tick);
  const d = Math.hypot(s.x - q.pos.x, s.y - q.pos.y, s.z - q.pos.z);
  const arrived = d <= SEAL_STAND_TOL_BU * sim.world.bu || (!possessed(sim, q) && q.nav.status === 'arrived');
  if (arrived) {
    if (!hasPellet(sim, q)) {
      if (t > SEAL_WALK_MAX_TICKS) { giveUp(sim, q, s); return; }
      if (possessed(sim, q)) setIntent(sim, q, null);
      if (t > SEAL_SOIL_WAIT_TICKS) soilWalk(sim, q, nest);
      return;
    }
    const p = planNow(sim, q);
    if (!p) { stop(sim, q, IDLE); return; }
    if (p.here.ok && hasPellet(sim, q) && plugHere(sim, q)) return;
    if (p.inReach) { face(sim, q); return; }
    giveUp(sim, q, s);
    return;
  }
  if (t > SEAL_WALK_MAX_TICKS || (!possessed(sim, q) && q.nav.status === 'failed')) { giveUp(sim, q, s); return; }
  if (possessed(sim, q)) setIntent(sim, q, unit(q.pos, s));
}

/** One tick of the guide (phase `seal`, after the soil rule). */
export function sealGuideTick(sim: Sim, q: Ant, nest: Nest): void {
  listenForSealPresses(sim);
  const ask = bbGet(q, SG.ask, -1);
  if (ask >= 0 && ask !== bbGet(q, SG.seen, -1)) {
    bbSet(q, SG.seen, ask);
    requestSeal(sim, q, false);
    return;
  }
  const state = bbGet(q, SG.state, IDLE);
  if (state === IDLE || state === STUCK) {
    const idleTicks = sim.state.tick - Math.max(sim.state.player.lastInputTick, 0);
    const passive = !possessed(sim, q) || idleTicks >= OPEN_AUTO_SEAL_GD * TICKS_PER_DAY;
    const cooled = sim.state.tick - bbGet(q, SG.autoTick, -1e9) >= SEAL_WALK_MAX_TICKS;
    if (state === IDLE && passive && cooled && phaseAgeGd(sim, q) >= OPEN_AUTO_SEAL_GD) {
      bbSet(q, SG.autoTick, sim.state.tick);
      requestSeal(sim, q, true);
    }
    return;
  }
  if (playerTookOver(sim, q)) { bbSet(q, SG.state, IDLE); return; }
  if (state === PLUG) {
    if (q.action && q.action.id === 'seal-entrance') return;
    plan(sim, q);
    return;
  }
  if (q.action) return; // a bite or anything else under way ends first
  if (state === FACE) { faceTick(sim, q); return; }
  walkTick(sim, q, nest);
}

/** The guide's read-out for the view and the prompts. */
export function sealGuideView(sim: Sim, q: Ant | undefined): { state: 'idle' | 'walking' | 'plugging' | 'stuck'; stand: Vec3 | null; plugs: number } | null {
  if (!q) return null;
  const s = bbGet(q, SG.state, IDLE);
  const state = s === WALK || s === FACE ? 'walking' : s === PLUG ? 'plugging' : s === STUCK ? 'stuck' : 'idle';
  const stand = s === WALK ? { x: bbGet(q, SG.sx, 0), y: bbGet(q, SG.sy, 0), z: bbGet(q, SG.sz, 0) } : null;
  return { state, stand, plugs: bbGet(q, SG.total, 0) };
}
