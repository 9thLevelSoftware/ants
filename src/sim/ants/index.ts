// Ant module API: perception, behaviours, player control, action primitives, possession, lifecycle.
// STUB written by F1b/F1c with final signatures. Owners: actions (actions/**, player/**, lifecycle.ts), beh-forage
// (perception, scout/forage/tend/flee), beh-nest (nurse/queenCare/store/dig/haul/idle/guard/queen), combat
// (fight/patrol behaviours). Behaviour modules add their state machines to `behaviours` (ruling 13).

import type { Vec3 } from '@/core/math/vec3';
import type {
  ActionCheck, ActionFailReason, ActionId, ActionPrompt, Ant, AntInspect, Behaviour, CommandHandlerMap, CommandOf,
  PossessionEndReason, PossessRole, RunSpeed, Sim, System, TargetRef, Task,
} from '@/sim/types';
import { AntFlag, BROOD_DEATH_CAUSES, DEATH_CAUSES, isOneOf, REASON_CODES } from '@/sim/types';
import { POSSESS_MAX_SPEED } from '@/sim/balance';
import { killAnt, killBrood, killCreature } from '@/sim/entities';

/** Contact, antennal and smell perception, staggered. Stub: beh-forage. */
export const perceptionSystem: System = { name: 'perception', phase: 'perception', run: () => {} };

/** Runs the behaviour state machine (sim.behaviours) of each AI ant whose thinkTick is due. Stub: beh-forage / beh-nest. */
export const behaviourSystem: System = { name: 'behaviours', phase: 'behaviours', run: () => {} };

/** Applies player intent and held actions to the possessed ant. Stub: actions. */
export const playerControlSystem: System = { name: 'player-control', phase: 'player-control', run: () => {} };

/** Advances action primitives (windup/active/recovery) and applies their effects. Stub: actions. */
export const actionSystem: System = { name: 'actions', phase: 'actions', run: () => {} };

/** Ageing, deaths (old age, starvation), corpses, eclosion spawns. Stub: actions (lifecycle.ts). */
export const lifecycleSystem: System = { name: 'lifecycle', phase: 'lifecycle', run: () => {} };

export const systems: readonly System[] = [
  perceptionSystem, behaviourSystem, playerControlSystem, actionSystem, lifecycleSystem,
];

/** Task behaviours (beh-forage, beh-nest, combat add theirs here). */
export const behaviours: readonly Behaviour[] = [];

// ---- action primitives (owner: actions) ----

/** Can this ant start the action on the target now? Stub: never, reason 'conditions' (actions). */
export function canDo(_sim: Sim, _ant: Ant, _action: ActionId, _target: TargetRef | null): ActionCheck {
  return { ok: false, reason: 'conditions' };
}

/** Starts an action primitive; false if canDo fails. Stub: false (actions). */
export function begin(_sim: Sim, _ant: Ant, _action: ActionId, _target: TargetRef | null): boolean {
  return false;
}

/** Cancels the ant's action in progress (emits action-cancelled). Stub: no-op (actions). */
export function cancel(_sim: Sim, _ant: Ant, _reason: ActionFailReason | null): void {}

/** The context prompt for the possessed ant (best action on what it faces), null none. Stub: null (actions). */
export function currentPrompt(_sim: Sim, _ant: Ant): ActionPrompt | null {
  return null;
}

/** Actions currently available to the ant (prompts, AI). Stub: none (actions). */
export function availableActions(_sim: Sim, _ant: Ant): ActionId[] {
  return [];
}

/** Read-only summary for the inspect card and the debug API; null for unknown ids. Owner: actions. */
export function inspect(sim: Sim, antId: number): AntInspect | null {
  const a = sim.stores.ants.get(antId);
  if (!a) return null;
  const decisions = a.mem.decisions
    .filter((d) => d.tick >= 0)
    .sort((x, y) => y.tick - x.tick)
    .map((d) => ({ tick: d.tick, reason: REASON_CODES[d.code] ?? 'unknown', detail: d.detail }));
  return {
    antId: a.id, colonyId: a.colony, caste: a.caste, task: a.task, state: a.state,
    health: a.maxHp > 0 ? a.hp / a.maxHp : 0, crop: { c: a.cropC, p: a.cropP }, energy: a.energy,
    ageGd: a.physioAgeGd, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, decisions,
  };
}

/** Task an ant resumes when released from possession (GDD 01 §3.5). Stub: its suspended task or idle (actions). */
export function inferReleaseTask(_sim: Sim, ant: Ant): Task {
  return ant.suspendedTask ?? 'idle';
}

// ---- possession (owner: actions; GDD 01 §3, D4.7, ruling 11) ----

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

function releaseCurrent(sim: Sim, reason: PossessionEndReason): void {
  const { player } = sim.state;
  const ant = sim.stores.ants.get(player.possessedAntId);
  player.previousAntId = player.possessedAntId;
  player.possessedAntId = -1;
  if (!ant) return;
  ant.flags &= ~AntFlag.POSSESSED;
  const resumed = inferReleaseTask(sim, ant);
  ant.task = resumed;
  ant.taskTick = sim.state.tick;
  ant.suspendedTask = null;
  sim.emit({ type: 'possession-ended', antId: ant.id, reason, resumedTask: resumed });
}

const ROLE_TASK: Record<Exclude<PossessRole, 'queen'>, Task> = { forager: 'forage', digger: 'dig', nurse: 'nurse' };

/**
 * Ant of the player colony for a role key: the queen, or the nearest ant to `near` whose task matches, that is not
 * fighting and not carrying brood; ties go to the lower id (deterministic; GDD 01 §3.2, risk F11).
 */
function antForRole(sim: Sim, role: PossessRole, near: Vec3 | undefined): Ant | undefined {
  const col = sim.state.colonies[0];
  if (!col || !col.alive) return undefined;
  if (role === 'queen') return sim.stores.ants.get(col.queenId);
  const task = ROLE_TASK[role];
  const p = near ?? sim.world.queenStart.pos;
  let best: Ant | undefined;
  let bestD = Infinity;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.task !== task || a.combat !== null || a.carry.kind === 'brood') continue;
    const d = (a.pos.x - p.x) ** 2 + (a.pos.y - p.y) ** 2 + (a.pos.z - p.z) ** 2;
    if (d < bestD || (d === bestD && best !== undefined && a.id < best.id)) { best = a; bestD = d; }
  }
  return best;
}

function possess(sim: Sim, c: CommandOf<'possess'>): void {
  const { player } = sim.state;
  const ant = c.antId !== undefined ? sim.stores.ants.get(c.antId) : c.role ? antForRole(sim, c.role, c.nearPos) : undefined;
  const requested = c.antId ?? -1;
  if (!ant) return sim.emit({ type: 'possess-rejected', antId: requested, reason: c.role ? 'unknown' : 'dead' });
  const col = sim.state.colonies[0];
  if (!col || ant.colony !== col.id) return sim.emit({ type: 'possess-rejected', antId: ant.id, reason: 'not-colony' });
  if (player.possessedAntId === ant.id) return;
  const switching = player.possessedAntId !== -1;
  if (switching) releaseCurrent(sim, 'switch');
  player.possessedAntId = ant.id;
  ant.flags |= AntFlag.POSSESSED;
  ant.suspendedTask = ant.task;
  if (!switching) speedOnPossess(sim, c.dropTo1x !== false);
  sim.emit({ type: 'possession-started', antId: ant.id, caste: ant.caste, via: c.via ?? 'command' });
}

// ---- commands owned by this module ----

export const commandHandlers: Partial<CommandHandlerMap> = {
  possess,
  release: (sim, c) => {
    if (sim.state.player.possessedAntId !== -1) releaseCurrent(sim, c.reason);
  },
  setIntent: (sim, c) => sim.setPlayerIntent(c.intent),
  /** Begins / stops the possessed ant's action primitive (owner: actions). */
  action: (sim, c) => {
    const ant = sim.stores.ants.get(sim.state.player.possessedAntId);
    if (!ant) return;
    if (c.phase === 'stop') return cancel(sim, ant, null);
    const target = c.target ?? null;
    const check = canDo(sim, ant, c.actionId, target);
    if (!check.ok || !begin(sim, ant, c.actionId, target)) {
      sim.emit({ type: 'action-failed', antId: ant.id, action: c.actionId, reason: check.reason ?? 'conditions' });
    }
  },
  setTrail: (sim, c) => {
    const ant = sim.stores.ants.get(sim.state.player.possessedAntId);
    if (!ant) return;
    ant.flags = c.on ? ant.flags | AntFlag.TRAIL_ON : ant.flags & ~AntFlag.TRAIL_ON;
    sim.emit({ type: 'trail-toggled', antId: ant.id, on: c.on });
  },
  /** Kills any ant, creature or brood by id (debug). */
  'cheat.kill': (sim, c) => {
    // The cause arrives as untyped JSON: keep it when canonical, else fall back to the catch-all cause.
    const cause = String(c.cause);
    if (sim.stores.ants.has(c.id)) killAnt(sim, c.id, isOneOf(DEATH_CAUSES, cause) ? cause : 'unknown');
    else if (sim.stores.creatures.has(c.id)) killCreature(sim, c.id, cause);
    else if (sim.stores.brood.has(c.id)) killBrood(sim, c.id, isOneOf(BROOD_DEATH_CAUSES, cause) ? cause : 'base');
  },
};
