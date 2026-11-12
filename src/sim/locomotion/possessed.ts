// Movement of the possessed ant from PlayerIntent (GDD 01 §4): the world-space desired direction is projected onto
// the tangent plane; an edge latch freezes it in the ant's own frame while the surface turns under the ant; turning
// at TURN_RATE with an on-the-spot pivot beyond PIVOT_ANGLE; cruise / hurry / grip speeds; let-go is the action
// primitive (it sets medium 'air'), the fall is integrated here; STUCK_RESCUE relocation.
//
// The fixed tick is authoritative (locomotionSystem calls possessedTick with dt = 0.1 s). integratePossessed is the
// per-frame PREDICTOR: it advances a private copy of the ant's pose with the same step function and the same
// intent, never touching sim state, and reconciles to each new tick pose (error blended out, large errors snap).
// Renderers and the camera read the predicted pose with possessedPose(sim).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PlayerIntent, Sim, Walker } from '@/sim/types';
import { INPUT_DEADZONE } from '@/sim/balance/actions';
import { createWalkerKin, walkerPlace, walkerStep, type WalkerKin, type WalkStatus } from './walker';
import { rotateMinimal, tangentOf } from './walkerMath';
import { copy3, dist3, normalizeInPlace, rotateTangent, set3, signedAngle, tangentPart } from './mathx';
import { PLAYER_MOVE_OK_ACTIONS } from './params';
import { rt, type LocoRuntime } from './runtime';
import { newScratch, scratchOf, type NavScratch } from './scratch';
import { playerSpeed } from './speed';

const _d: Vec3 = { x: 0, y: 0, z: 0 }, _t: Vec3 = { x: 0, y: 0, z: 0 }, _up0: Vec3 = { x: 0, y: 0, z: 0 };

function isGripping(ant: Ant, intent: PlayerIntent): boolean {
  return intent.grip || ant.action?.id === 'grip';
}

function mayWalk(ant: Ant): boolean {
  return !ant.action || PLAYER_MOVE_OK_ACTIONS.includes(ant.action.id);
}

/** Edge latch bookkeeping before the step; returns the desired tangent direction into out (false = none). */
function desiredDir(kin: Walker | WalkerKin, s: NavScratch, intent: PlayerIntent, mag: number, dt: number, r: LocoRuntime,
  out: Vec3): boolean {
  const P = r.P;
  if (mag > 1e-9) set3(_d, intent.dir.x / mag, intent.dir.y / mag, intent.dir.z / mag); else set3(_d, 0, 0, 0);
  // break conditions
  s.lowMagS = mag < P.latchLowMag ? s.lowMagS + dt : 0;
  if (s.latch) {
    s.latchS += dt;
    const jump = mag > 1e-9 && (s.lastDir.x * _d.x + s.lastDir.y * _d.y + s.lastDir.z * _d.z) < P.latchBreakCos;
    if (s.lowMagS >= P.latchLowMagS || jump || s.latchS >= P.latchMaxS) s.latch = 0;
  }
  if (mag > 1e-9) copy3(s.lastDir, _d);
  // trigger: the up vector turned more than LATCH_TRIGGER within LATCH_TRIGGER_S
  if (s.upRefAge < 0 || s.upRefAge >= P.latchTriggerS) { copy3(s.upRef, kin.up); s.upRefAge = 0; }
  s.upRefAge += dt;
  const cosTurn = s.upRef.x * kin.up.x + s.upRef.y * kin.up.y + s.upRef.z * kin.up.z;
  if (!s.latch && mag >= P.latchLowMag && cosTurn < Math.cos(P.latchTrigger)) {
    s.latch = 1; s.latchS = 0;
    const l = tangentPart(s.latchDir, _d, kin.up);
    if (l < P.minSteer) copy3(s.latchDir, kin.fwd); else normalizeInPlace(s.latchDir);
    copy3(s.upRef, kin.up); s.upRefAge = 0;
  }
  if (mag < INPUT_DEADZONE) return false;
  if (s.latch) { copy3(out, s.latchDir); return true; }
  const l = tangentPart(out, _d, kin.up);
  if (l < P.minSteer) { copy3(out, kin.fwd); return true; } // pushing into a wall: keep the heading, climb
  out.x /= l; out.y /= l; out.z /= l;
  return true;
}

/**
 * One possessed-ant step on `kin` (the ant itself on ticks, a private copy when predicting) with latch state `s`.
 * Reads the ant only for speed inputs and its running action.
 */
export function stepPossessed(sim: Sim, ant: Ant, kin: Walker | WalkerKin, s: NavScratch, intent: PlayerIntent, dt: number,
  r: LocoRuntime): WalkStatus {
  const P = r.P, field = sim.field;
  if (kin.medium === 'air') return walkerStep(field, kin, null, 0, dt, sim.kernel.walker);
  const mag = Math.min(1, Math.hypot(intent.dir.x, intent.dir.y, intent.dir.z));
  const want = desiredDir(kin, s, intent, mag, dt, r, _t) && mayWalk(ant);
  let speed = 0;
  if (want) {
    const a = signedAngle(kin.fwd, _t, kin.up);
    if (!s.pivot && Math.abs(a) > P.pivotEnter) s.pivot = 1;
    if (s.pivot && Math.abs(a) < P.pivotExit) s.pivot = 0;
    const turn = Math.max(-P.playerTurn * dt, Math.min(P.playerTurn * dt, a));
    if (turn !== 0) { rotateTangent(kin.fwd, kin.fwd, kin.up, turn); tangentOf(kin.fwd, kin.fwd, kin.up); }
    if (!s.pivot) speed = playerSpeed(sim, ant, intent.hurry, isGripping(ant, intent), P) * mag;
  } else s.pivot = 0;
  copy3(_up0, kin.up);
  const st = walkerStep(field, kin, null, speed, dt, sim.kernel.walker);
  if (s.latch) { rotateMinimal(s.latchDir, s.latchDir, _up0, kin.up); tangentOf(s.latchDir, s.latchDir, kin.up); }
  return st;
}

/** Authoritative tick movement of the possessed ant (locomotionSystem). */
export function possessedTick(sim: Sim, ant: Ant, dt: number): WalkStatus {
  const r = rt(sim), s = scratchOf(ant), intent = sim.state.player.intent;
  if (s.req !== 'none') { s.req = 'none'; ant.nav.mode = 'none'; ant.nav.status = 'idle'; ant.nav.desiredSpeed = 0; }
  const before = { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z };
  const st = stepPossessed(sim, ant, ant, s, intent, dt, r);
  ant.nav.desiredSpeed = ant.speed;
  rescue(sim, ant, s, intent, dt, r, before);
  return st;
}

/** STUCK_RESCUE (GDD 01 §4.2): input held, < 0.1 BU moved for 3 s and inside solid -> nearest free surface. */
function rescue(sim: Sim, ant: Ant, s: NavScratch, intent: PlayerIntent, dt: number, r: LocoRuntime, before: Vec3): void {
  const held = Math.hypot(intent.dir.x, intent.dir.y, intent.dir.z) >= INPUT_DEADZONE;
  if (!held || dist3(ant.pos, s.rescueFrom) >= r.P.rescueDisp) { copy3(s.rescueFrom, ant.pos); s.rescueS = 0; return; }
  s.rescueS += dt;
  const clear = sim.kernel.walker.minClearanceFoot * ant.footOffset;
  if (s.rescueS < r.P.rescueS || sim.field.sampleXYZ(ant.pos.x, ant.pos.y, ant.pos.z) >= clear) return;
  const from = { ...before };
  if (walkerPlace(sim.field, ant, { x: ant.pos.x, y: ant.pos.y + 2 * r.P.bu, z: ant.pos.z }, {}, sim.kernel.walker)) {
    r.stats.rescues++;
    sim.emit({ type: 'ant-unstuck', antId: ant.id, from, to: { ...ant.pos } });
  }
  s.rescueS = 0;
  copy3(s.rescueFrom, ant.pos);
}

// ---- per-frame prediction ----

interface Prediction {
  antId: number;
  tick: number;
  kin: WalkerKin;
  s: NavScratch;
  /** Reconciliation offset added to the predicted pose (decays to zero). */
  offset: Vec3;
  pose: { pos: Vec3; up: Vec3; fwd: Vec3 };
}

const predictions = new WeakMap<Sim, Prediction>();

function copyKin(dst: WalkerKin, a: Walker): void {
  copy3(dst.pos, a.pos); copy3(dst.up, a.up); copy3(dst.fwd, a.fwd); copy3(dst.vel, a.vel);
  copy3(dst.prevPos, a.pos); copy3(dst.prevUp, a.up); copy3(dst.prevFwd, a.fwd);
  dst.medium = a.medium; dst.speed = a.speed; dst.gait = a.gait; dst.footOffset = a.footOffset;
}

function copyLatch(dst: NavScratch, src: NavScratch): void {
  dst.latch = src.latch; dst.latchS = src.latchS; dst.lowMagS = src.lowMagS; dst.pivot = src.pivot;
  copy3(dst.latchDir, src.latchDir); copy3(dst.upRef, src.upRef); dst.upRefAge = src.upRefAge; copy3(dst.lastDir, src.lastDir);
}

/** Per-frame movement prediction of the possessed ant (see the header). Does not change sim state. */
export function integratePossessedFrame(sim: Sim, ant: Ant, dtSeconds: number): void {
  if (!(dtSeconds > 0) || !Number.isFinite(dtSeconds)) return;
  const r = rt(sim);
  let p = predictions.get(sim);
  if (!p || p.antId !== ant.id) {
    p = { antId: ant.id, tick: -1, kin: createWalkerKin(ant.footOffset), s: newScratch(), offset: { x: 0, y: 0, z: 0 },
      pose: { pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 } } };
    predictions.set(sim, p);
  }
  if (p.tick !== sim.state.tick) {
    // new authoritative pose: carry the visible error as an offset (snap when large)
    const had = p.tick >= 0;
    const ex = had ? p.pose.pos.x - ant.pos.x : 0, ey = had ? p.pose.pos.y - ant.pos.y : 0, ez = had ? p.pose.pos.z - ant.pos.z : 0;
    if (Math.hypot(ex, ey, ez) > r.P.predictSnap) set3(p.offset, 0, 0, 0); else set3(p.offset, ex, ey, ez);
    copyKin(p.kin, ant);
    copyLatch(p.s, scratchOf(ant));
    p.tick = sim.state.tick;
  }
  stepPossessed(sim, ant, p.kin, p.s, sim.state.player.intent, dtSeconds, r);
  const k = Math.max(0, 1 - dtSeconds / r.P.predictBlendS);
  p.offset.x *= k; p.offset.y *= k; p.offset.z *= k;
  set3(p.pose.pos, p.kin.pos.x + p.offset.x, p.kin.pos.y + p.offset.y, p.kin.pos.z + p.offset.z);
  copy3(p.pose.up, p.kin.up);
  copy3(p.pose.fwd, p.kin.fwd);
}

/** Predicted pose of the possessed ant for rendering (null before the first frame or for another ant). */
export function possessedPose(sim: Sim): { pos: Vec3; up: Vec3; fwd: Vec3 } | null {
  const p = predictions.get(sim);
  return p && p.antId === sim.state.player.possessedAntId && p.tick >= 0 ? p.pose : null;
}
