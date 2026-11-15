// How locks, dodges, disorientation and lost legs move bodies (GDD 05 §4.3, §4.4, §4.7, §4.8), through the
// locomotion hooks (installed once per Sim, derived, never persisted):
//  - speed factor: holder x0.3; held target x max(0, 1 - Σ pull_h / pull_t); disoriented x0.5; legs 0.85^n >= 0.7;
//  - movement override: a dodge in progress; a holder stays in contact with its target unless it is the single
//    stronger party walking away (it drags the target at 0.3 x cruise); an immobilised target stands, or is
//    dragged along by such a holder.
// Seized and paralysed ants are the creature module's override (registered earlier, it runs first).

import type { Ant, Creature, Sim, Walker } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  DISORIENTED_SPEED_MULT, DRAG_CRUISE_FRAC, HOLDER_SPEED_MULT, LEG_SPEED_FLOOR, LEG_SPEED_MULT, LOCK_CONTACT_GAP_L,
} from '@/sim/balance/combat';
import { INPUT_DEADZONE } from '@/sim/balance/actions';
import { placeOnSurface, registerMovementOverride, registerSpeedFactor } from '@/sim/locomotion';
import { dodgeStep } from './dodge';
import { heldSpeedFactor, holdersOf, pullOf } from './grapple';
import { casteSpeeds } from '@/sim/locomotion';
import { combatStats } from './stats';
import { antLenMm, type Body, bodyOf, bodyPos, bodyRadius, CB, dist, isDisoriented, isParalysed, isPossessed, isSeized } from './state';

const installed = new WeakSet<Sim>();
const hs: number[] = [];
const to = { x: 0, y: 0, z: 0 };

function isAnt(w: Walker): w is Ant {
  return typeof (w as Ant).caste === 'string';
}

export function ensureMovementHooks(sim: Sim): void {
  if (installed.has(sim)) return;
  installed.add(sim);
  registerSpeedFactor(sim, (s, w) => speedFactor(s, w));
  registerMovementOverride(sim, (s, w, dt) => override(s, w, dt));
}

/** Contact distance between a holder and the body it holds, mm. */
export function contactMm(sim: Sim, holder: Ant, b: Body): number {
  return holder.radius + bodyRadius(b) + LOCK_CONTACT_GAP_L * antLenMm(sim, holder);
}

export { heldSpeedFactor };

function legFactor(ant: Ant): number {
  const n = ant.bb[CB.legs] ?? 0;
  return n > 0 ? Math.max(LEG_SPEED_FLOOR, Math.pow(LEG_SPEED_MULT, n)) : 1;
}

function speedFactor(sim: Sim, w: Walker): number {
  if (!isAnt(w)) {
    const c = w as Creature;
    return (c.bb['cb.nh'] ?? 0) > 0 ? heldSpeedFactor(sim, { kind: 'creature', c }) : 1;
  }
  let m = legFactor(w);
  if (isDisoriented(sim, w)) m *= DISORIENTED_SPEED_MULT;
  const cs = w.combat;
  if (cs?.lock) m *= holderDrags(sim, w) ? DRAG_CRUISE_FRAC : HOLDER_SPEED_MULT;
  if (cs && cs.heldBy.length > 0) m *= heldSpeedFactor(sim, { kind: 'ant', ant: w });
  return m;
}

/** The ant wants to move this tick (player input or an AI walk). */
function wantsToMove(sim: Sim, ant: Ant): boolean {
  if (isPossessed(ant) && sim.state.player.possessedAntId === ant.id) {
    const d = sim.state.player.intent.dir;
    return Math.hypot(d.x, d.y, d.z) > INPUT_DEADZONE;
  }
  return ant.nav.status === 'moving';
}

/** A holder that is the single stronger party (its pull exceeds the target's) and walks drags its target. */
export function holderDrags(sim: Sim, holder: Ant): boolean {
  const b = holder.combat?.lock ? bodyOf(sim, holder.combat.lock.targetKind, holder.combat.lock.targetId) : null;
  if (!b) return false;
  return combatStats(sim, holder).pull > pullOf(sim, b) && wantsToMove(sim, holder);
}

/**
 * Moves the walker toward distance d from anchor along the current line (no move when within d), by at most
 * `maxStep` mm: a holder cannot follow faster than it may walk, so a target that gets away (a dodge out of a
 * weak grip) opens the gap until the lock breaks (lockGap).
 */
function keepWithin(sim: Sim, w: Walker, anchorX: number, anchorY: number, anchorZ: number, d: number, dt: number, maxStep = Infinity): void {
  const dx = w.pos.x - anchorX, dy = w.pos.y - anchorY, dz = w.pos.z - anchorZ;
  const l = Math.hypot(dx, dy, dz);
  if (l <= d || l < 1e-6) { w.speed = 0; return; }
  const k = Math.max(d, l - maxStep) / l;
  to.x = anchorX + dx * k - w.up.x * w.footOffset;
  to.y = anchorY + dy * k - w.up.y * w.footOffset;
  to.z = anchorZ + dz * k - w.up.z * w.footOffset;
  const moved = l - k * l;
  if (placeOnSurface(sim, w, to)) w.speed = moved / Math.max(dt, 1e-6);
}

/** Fastest a holder may follow its target, mm/s: its sprint x the holder multiplier (GDD 01 bite-hold x0.3). */
function holderMaxSpeed(sim: Sim, holder: Ant): number {
  const col = sim.stores.colonies.get(holder.colony);
  const species = col ? col.species : sim.species.id;
  const founding = (holder.flags & AntFlag.FOUNDING) !== 0;
  return casteSpeeds(species, holder.caste, sim.world.bu, founding).sprint * HOLDER_SPEED_MULT;
}

function override(sim: Sim, w: Walker, dt: number): boolean {
  if (!isAnt(w)) return overrideCreature(sim, w as Creature, dt);
  const ant = w;
  if (dodgeStep(sim, ant, dt)) return true;
  if (isSeized(ant) || isParalysed(sim, ant)) return false;
  const cs = ant.combat;
  if (!cs) return false;
  if (cs.lock) {
    if (holderDrags(sim, ant)) return false;
    const b = bodyOf(sim, cs.lock.targetKind, cs.lock.targetId);
    if (!b) return false;
    const p = bodyPos(b);
    keepWithin(sim, ant, p.x, p.y, p.z, contactMm(sim, ant, b), dt, holderMaxSpeed(sim, ant) * dt);
    return true;
  }
  if (cs.heldBy.length > 0) return heldStep(sim, ant, { kind: 'ant', ant }, dt);
  return false;
}

function overrideCreature(sim: Sim, c: Creature, dt: number): boolean {
  if ((c.bb['cb.nh'] ?? 0) <= 0) return false;
  return heldStep(sim, c, { kind: 'creature', c }, dt);
}

/** A held body: dragged by a stronger walking holder, standing when immobilised, else walking slowed. */
function heldStep(sim: Sim, w: Walker, b: Body, dt: number): boolean {
  holdersOf(sim, b, hs);
  if (hs.length === 0) return false;
  for (const id of hs) {
    const h = sim.stores.ants.get(id);
    if (h && holderDrags(sim, h)) {
      keepWithin(sim, w, h.pos.x, h.pos.y, h.pos.z, contactMm(sim, h, b), dt);
      return true;
    }
  }
  if (heldSpeedFactor(sim, b) <= 0) { w.speed = 0; return true; }
  return false;
}

/** Bodies of a lock drifted apart (fall, teleport): distance over contact, for the lock maintenance. */
export function lockGap(sim: Sim, holder: Ant, b: Body): number {
  return dist(holder.pos, bodyPos(b)) / Math.max(1e-6, contactMm(sim, holder, b));
}
