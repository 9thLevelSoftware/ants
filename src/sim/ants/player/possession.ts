// Possession rules (GDD 01 §3, D4.7, ruling 11): who may be possessed, the possess / release commands, the
// in-progress action rules on both sides, soft release for colony view and time-lapses.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, CommandOf, PossessionEndReason, PossessRole, RunSpeed, Sim, Task } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { POSSESS_MAX_SPEED } from '@/sim/balance';
import { setTrailFlag } from '../actions/defs';
import { ports } from '../actions/ports';
import { begin, cancel, interruptible, stopAction } from '../actions/runner';
import { exitBehaviour } from '../behaviourRunner';
import { resetControlState } from './controlState';
import { publishReleased } from './diagnostics';
import { applyInference, inferRelease } from './release';

/**
 * Possession start forces 1x, or clamps to 4x when the player turned `dropTo1xOnPossess` off (GDD 01 §8,
 * GDD 06 §4). A pause stays a pause (the speed is kept). Releasing never restores the earlier speed.
 */
function speedOnPossess(sim: Sim, dropTo1x: boolean): void {
  const time = sim.state.env.time;
  const from = time.speed;
  const to: RunSpeed = dropTo1x ? 1 : from > POSSESS_MAX_SPEED ? POSSESS_MAX_SPEED : from;
  time.requested = to;
  if (from === to) return;
  time.speed = to;
  if (!time.paused) sim.emit({ type: 'time.speed-changed', from, to, reason: 'possession' });
}

const ROLE_TASKS: Record<Exclude<PossessRole, 'queen'>, readonly Task[]> = {
  forager: ['forage', 'scout'], digger: ['dig', 'haul'], nurse: ['nurse', 'queen-care'],
};

/**
 * Ant of the player colony for a role key (GDD 01 §3.2): the queen, or the nearest ant to `near` whose task is in
 * the role's set, that is not fighting and not carrying brood. Ties go to the lower id (deterministic; risk F11).
 */
export function antForRole(sim: Sim, role: PossessRole, near: Vec3 | undefined): Ant | undefined {
  const col = sim.state.colonies[0];
  if (!col || !col.alive) return undefined;
  if (role === 'queen') return sim.stores.ants.get(col.queenId);
  const tasks = ROLE_TASKS[role];
  const p = near ?? sim.world.queenStart.pos;
  let best: Ant | undefined;
  let bestD = Infinity;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || !tasks.includes(a.task) || a.combat !== null || a.carry.kind === 'brood') continue;
    const d = (a.pos.x - p.x) ** 2 + (a.pos.y - p.y) ** 2 + (a.pos.z - p.z) ** 2;
    if (d < bestD || (d === bestD && best !== undefined && a.id < best.id)) { best = a; bestD = d; }
  }
  return best;
}

/** In-progress actions on release (GDD 01 §3.5 last paragraph). */
function settleActionOnRelease(sim: Sim, ant: Ant, rule: number): void {
  const a = ant.action;
  if (!a) return;
  if (a.id === 'dig-bite' || a.id === 'unseal-entrance') { stopAction(sim, ant); return; } // finishes its bite
  if (a.id === 'drag') return; // continues toward the nest under AI
  if (a.id === 'bite-hold' && rule === 1) return;
  if (a.id === 'harvest-liquid' && rule === 14) return; // drinks on until full
  if (interruptible(ant)) cancel(sim, ant, null);
  else a.repeat = false; // lay-egg past windup, put-down: finish
}

/**
 * Releases the possessed ant (any reason): autonomy resumes the same tick with an inferred task (GDD 01 §3.5).
 * Returns the resumed task, or null when nothing was possessed.
 */
export function releasePossessed(sim: Sim, reason: PossessionEndReason): Task | null {
  const { player } = sim.state;
  const ant = sim.stores.ants.get(player.possessedAntId);
  player.previousAntId = player.possessedAntId;
  player.possessedAntId = -1;
  if (!ant) return null;
  if (reason === 'colony-view' || reason === 'timelapse') player.returnAntId = ant.id;
  ant.flags &= ~AntFlag.POSSESSED;
  setTrailFlag(sim, ant, false);
  resetControlState(ant);
  const inf = inferRelease(sim, ant);
  settleActionOnRelease(sim, ant, inf.rule);
  if (inf.putDownFirst && ant.carry.kind === 'item' && !ant.action) begin(sim, ant, 'put-down', null);
  applyInference(sim, ant, inf);
  ant.suspendedTask = null;
  sim.emit({ type: 'possession-ended', antId: ant.id, reason, resumedTask: inf.task });
  publishReleased(sim, ant, inf.task, inf.rule);
  return inf.task;
}

/** A missing ant id reads as `dead`; the id of brood, an item, a creature or a source as `unknown` (not an ant). */
function rejectReason(sim: Sim, id: number): 'dead' | 'unknown' {
  const s = sim.stores;
  return s.brood.has(id) || s.items.has(id) || s.creatures.has(id) || s.sources.has(id) ? 'unknown' : 'dead';
}

/** The `possess` command (GDD 01 §3.3). */
export function possess(sim: Sim, c: CommandOf<'possess'>): void {
  const { player } = sim.state;
  const requested = c.antId ?? -1;
  if (player.timelapse !== null) return sim.emit({ type: 'possess-rejected', antId: requested, reason: 'view' });
  const ant = c.antId !== undefined ? sim.stores.ants.get(c.antId) : c.role ? antForRole(sim, c.role, c.nearPos) : undefined;
  if (!ant) {
    const reason = c.antId !== undefined ? rejectReason(sim, c.antId) : 'unknown';
    return sim.emit({ type: 'possess-rejected', antId: requested, reason });
  }
  const col = sim.state.colonies[0];
  if (!col || ant.colony !== col.id) return sim.emit({ type: 'possess-rejected', antId: ant.id, reason: 'not-colony' });
  if (player.possessedAntId === ant.id) return;
  const switching = player.possessedAntId !== -1 && sim.stores.ants.has(player.possessedAntId);
  if (switching) releasePossessed(sim, 'switch');
  // Step 3: interruptible AI actions are cancelled cleanly (the load stays held); lay-egg / put-down finish.
  if (ant.action) {
    if (interruptible(ant)) cancel(sim, ant, null);
    else ant.action.repeat = false;
  }
  exitBehaviour(sim, ant);
  ports.navStop(sim, ant);
  player.possessedAntId = ant.id;
  if (player.returnAntId === ant.id) player.returnAntId = -1;
  ant.flags |= AntFlag.POSSESSED;
  ant.suspendedTask = ant.task;
  ant.bb['ctl.reinfer'] = 0;
  resetControlState(ant);
  player.lastInputTick = sim.state.tick;
  if (!switching) speedOnPossess(sim, c.dropTo1x !== false);
  sim.emit({ type: 'possession-started', antId: ant.id, caste: ant.caste, via: c.via ?? 'command' });
}

/** The `release` command. */
export function release(sim: Sim, c: CommandOf<'release'>): void {
  if (sim.state.player.possessedAntId !== -1) releasePossessed(sim, c.reason);
}
