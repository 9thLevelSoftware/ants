// The `dodge` primitive (GDD 05 §4.8, new in T2): 3 L in 0.25 s in the input direction (backward when none);
// cooldown 1.5 s; not while seized, pinned, paralysed or carrying more than 0.5 carryCap; bites against the ant hit
// at x0.5 for those 0.25 s. A held ant moves under the lock rule (§4.3): the dodge is refused while its holders
// immobilise it (speed factor 0) and shortened by the factor otherwise (the holders may then lose their grip). The action library's `dodge` shell calls dodgeRefusal / startDodge. The displacement is a movement override.

import type { Vec3 } from '@/core/math/vec3';
import type { ActionFailReason, Ant, Sim } from '@/sim/types';
import { DODGE_COOLDOWN_S, DODGE_DIST_L, DODGE_MAX_LOAD, DODGE_S } from '@/sim/balance/combat';
import { INPUT_DEADZONE } from '@/sim/balance/actions';
import type { ActionDef } from '@/sim/ants/actions/types';
import { placeOnSurface } from '@/sim/locomotion';
import { heldSpeedFactor } from './grapple';
import { antLenMm, CB, ensureCombat, isParalysed, isPossessed, isSeized, ticksOf } from './state';

/** Why the ant cannot dodge now, or null. */
export function dodgeRefusal(sim: Sim, ant: Ant): ActionFailReason | null {
  const cs = ant.combat;
  if (cs && (cs.pinned || isSeized(ant) || isParalysed(sim, ant))) return 'blocked';
  if (cs && cs.heldBy.length > 0 && heldSpeedFactor(sim, { kind: 'ant', ant }) <= 0) return 'blocked';
  if (cs && cs.dodgeCdTick > sim.state.tick) return 'cooldown';
  if (ant.medium === 'air' || ant.medium === 'water') return 'conditions';
  if (ant.carry.kind === 'item') {
    const it = sim.stores.items.get(ant.carry.id);
    if (it && it.bulk > DODGE_MAX_LOAD * ant.carryCap) return 'too-heavy';
  }
  if (ant.carry.kind === 'brood' && ant.carryCap <= 0) return 'too-heavy';
  return null;
}

/** Unit tangent direction of the dodge: the AI's request, else the player's input, else backward. */
function dodgeDir(sim: Sim, ant: Ant, out: Vec3): Vec3 {
  let x: number, y: number, z: number;
  if (ant.bb[CB.dodgeX] !== undefined) {
    x = ant.bb[CB.dodgeX]; y = ant.bb[CB.dodgeY] ?? 0; z = ant.bb[CB.dodgeZ] ?? 0;
  } else if (isPossessed(ant) && sim.state.player.possessedAntId === ant.id) {
    const d = sim.state.player.intent.dir;
    x = d.x; y = d.y; z = d.z;
  } else { x = 0; y = 0; z = 0; }
  const k = x * ant.up.x + y * ant.up.y + z * ant.up.z;
  x -= k * ant.up.x; y -= k * ant.up.y; z -= k * ant.up.z;
  const l = Math.hypot(x, y, z);
  if (l < INPUT_DEADZONE) { out.x = -ant.fwd.x; out.y = -ant.fwd.y; out.z = -ant.fwd.z; return out; }
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}

const dir = { x: 0, y: 0, z: 0 };

/** Starts the dodge (the primitive's effect); false when refused. */
export function startDodge(sim: Sim, ant: Ant): boolean {
  if (dodgeRefusal(sim, ant)) return false;
  dodgeDir(sim, ant, dir);
  delete ant.bb[CB.dodgeX]; delete ant.bb[CB.dodgeY]; delete ant.bb[CB.dodgeZ];
  const cs = ensureCombat(ant);
  const now = sim.state.tick;
  cs.dodgeUntilTick = now + Math.max(1, ticksOf(DODGE_S));
  cs.dodgeCdTick = now + ticksOf(DODGE_COOLDOWN_S);
  const held = cs.heldBy.length > 0 ? heldSpeedFactor(sim, { kind: 'ant', ant }) : 1;
  ant.bb[CB.dodgeLeft] = DODGE_DIST_L * antLenMm(sim, ant) * held;
  ant.bb['cb.dgVx'] = dir.x; ant.bb['cb.dgVy'] = dir.y; ant.bb['cb.dgVz'] = dir.z;
  if (ant.nav.status === 'moving') { ant.nav.status = 'idle'; ant.nav.desiredSpeed = 0; }
  return true;
}

/** AI: dodge along a world direction (the primitive goes through the shared lifecycle like the player's). */
export function setDodgeDirection(ant: Ant, d: Vec3): void {
  ant.bb[CB.dodgeX] = d.x; ant.bb[CB.dodgeY] = d.y; ant.bb[CB.dodgeZ] = d.z;
}

const to = { x: 0, y: 0, z: 0 };

/** Movement override step of a dodge in progress; true while it moved the ant this tick. */
export function dodgeStep(sim: Sim, ant: Ant, dt: number): boolean {
  const left = ant.bb[CB.dodgeLeft];
  if (left === undefined || left <= 0) return false;
  const speed = (DODGE_DIST_L * antLenMm(sim, ant)) / DODGE_S;
  const step = Math.min(left, speed * dt);
  const vx = ant.bb['cb.dgVx'] ?? 0, vy = ant.bb['cb.dgVy'] ?? 0, vz = ant.bb['cb.dgVz'] ?? 0;
  to.x = ant.pos.x + vx * step - ant.up.x * ant.footOffset;
  to.y = ant.pos.y + vy * step - ant.up.y * ant.footOffset;
  to.z = ant.pos.z + vz * step - ant.up.z * ant.footOffset;
  const moved = placeOnSurface(sim, ant, to, { x: vx, y: vy, z: vz });
  const rest = moved ? left - step : 0;
  if (rest <= 1e-6) { delete ant.bb[CB.dodgeLeft]; delete ant.bb['cb.dgVx']; delete ant.bb['cb.dgVy']; delete ant.bb['cb.dgVz']; } else ant.bb[CB.dodgeLeft] = rest;
  ant.speed = moved ? step / Math.max(dt, 1e-6) : 0;
  return moved;
}

/** The `dodge` primitive's definition (instant: the displacement then runs in locomotion). */
export const dodgeDef: ActionDef = {
  id: 'dodge', kind: 'instant', targets: ['none'], cancellable: false, preempts: true, pose: 'hurry', cue: null,
  check: (sim, ant) => dodgeRefusal(sim, ant),
  durationS: () => 0,
  effect: (sim, ant) => (startDodge(sim, ant) ? 1 : 'blocked'),
};

/**
 * Formerly patched the action library's table (dodge, sting, a bite copy, a spray check). The library now has native
 * shells that ask combat through its ports (int-1B-sim), so nothing is installed; kept as a no-op for callers.
 */
export function installActionAdapters(): void {}
