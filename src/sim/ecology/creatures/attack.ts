// The predator attack framework of GDD 05 §2.4: telegraphed wind-up, strike against a fixed aim point, seizing,
// venom, the struggle meter, release and strike immunity. Damage goes through the combat module (ports).
//
// Aim (decision, recorded in the report): the aim point is the target's position when the wind-up starts - the
// point the `predator-telegraph` event carries and the comfort ring marks - and the strike lands at strikeAtTick.
// A target that dodged or walked more than STRIKE_HIT_RADIUS away by then is missed (§2.4, E12).

import type { Ant, CombatState, Creature, Sim } from '@/sim/types';
import { rngFloat, rngRange } from '@/core/rng';
import {
  DETECT_L, DETECT_STEALTH, STRIKE_DAMAGE, STRIKE_HIT_RADIUS_MM, STRIKE_IMMUNITY_S, STRUGGLE_AI_INPUTS_PER_S,
  STRUGGLE_MAX_INPUTS_PER_S, STRUGGLE_NESTMATE_PER_S, STRUGGLE_PER_INPUT, STRUGGLE_REASSERT_PER_S, STRUGGLE_TURN_DEG,
  TELEGRAPH_S, VENOM_PER_S,
} from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import { antLen, dist, face, isPossessed, rng, ticks } from './common';
import { conditions } from './conditions';
import { noteDangerEvent } from './danger';
import { ports } from './ports';

const TICK_S = 1 / TICKS_PER_SECOND;
/** ant.bb key (namespaced) holding the tick until which the ant cannot be struck again (§2.4: 1 s after freedom). */
export const BB_IMMUNE = 'cr.immune';

export function ensureCombat(ant: Ant): CombatState {
  if (!ant.combat) {
    ant.combat = {
      lock: null, heldBy: [], pinned: false, seizedBy: -1, escape: 0, paralysedUntilTick: 0, stuckSinceTick: 0,
      disorientedUntilTick: 0, dodgeUntilTick: 0, fightDamage: 0, recentHitters: [], biteCdTick: 0, specialCdTick: 0,
      dodgeCdTick: 0,
    };
  }
  return ant.combat;
}

export function isSeized(ant: Ant): boolean {
  return !!ant.combat && ant.combat.seizedBy >= 0;
}

export function isImmune(sim: Sim, ant: Ant): boolean {
  return (ant.bb[BB_IMMUNE] ?? 0) > sim.state.tick;
}

/** Wind-up lead for this creature, ticks (x telegraphMult, never below 1 tick). */
export function windupTicks(sim: Sim, c: Creature, leadS = TELEGRAPH_S[c.kind] ?? 0.5): number {
  return Math.max(1, Math.ceil(leadS * conditions(sim).levers.telegraphMult * TICKS_PER_SECOND - 1e-9));
}

/**
 * Starts the wind-up against `ant`: fixes the aim point, emits `predator-telegraph` and sets bb.strikeAt.
 * `extraS` lengthens the warning (the wolf spider's freeze cue comes first).
 */
export function beginWindup(sim: Sim, c: Creature, ant: Ant, extraS = 0): void {
  const now = sim.state.tick;
  const lead = windupTicks(sim, c) + (extraS > 0 ? windupTicks(sim, c, extraS) : 0);
  c.bb.tgt = ant.id;
  c.bb.aimX = ant.pos.x; c.bb.aimY = ant.pos.y; c.bb.aimZ = ant.pos.z;
  c.bb.strikeAt = now + lead;
  c.target = { kind: 'ant', id: ant.id, pos: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z } };
  face(c, ant.pos);
  ports.navStop(sim, c);
  sim.emit({
    type: 'predator-telegraph', creatureId: c.id, targetId: ant.id, strikeAtTick: now + lead,
    aimPoint: { x: ant.pos.x, y: ant.pos.y, z: ant.pos.z }, kind: c.kind,
  });
}

/** Detection range of a predator for an ant of length L, mm (§2.4 AI column). */
export function detectRangeMm(sim: Sim, c: Creature, ant: Ant): number {
  const t = DETECT_STEALTH[c.kind];
  const f = t ? (t[c.state] ?? t.default ?? 1) : 1;
  return DETECT_L * antLen(sim, ant) * f;
}

export type StrikeOutcome = 'miss' | 'killed' | 'seized' | 'hit';

/**
 * Lands the strike prepared by beginWindup. Hit when the target's centre lies within STRIKE_HIT_RADIUS of the aim
 * point, it is not immune and (AI ants that detected the predator) it did not dodge (AI_DODGE_P). A hit deals the
 * strike damage x predatorDamageMult; a survivor is seized when `seize` is true.
 */
export function landStrike(sim: Sim, c: Creature, seize: boolean, dmgOverride?: number): StrikeOutcome {
  const ant = sim.stores.ants.get(c.bb.tgt ?? -1);
  c.bb.strikeAt = -1;
  if (!ant) return 'miss';
  const aim = { x: c.bb.aimX, y: c.bb.aimY, z: c.bb.aimZ };
  const radius = STRIKE_HIT_RADIUS_MM[c.kind] ?? 3;
  let hit = dist(ant.pos, aim) <= radius && !isImmune(sim, ant) && !isSeized(ant);
  const lv = conditions(sim).levers;
  if (hit && !isPossessed(sim, ant) && dist(ant.pos, c.pos) <= detectRangeMm(sim, c, ant)) {
    if (rngFloat(rng(sim)) < lv.aiDodgeP) hit = false;
  }
  // the predator lands where it aimed (a short lunge); a hit holds the ant at its mouth
  lungeTo(sim, c, aim);
  const raw = (dmgOverride ?? STRIKE_DAMAGE[c.kind] ?? 0) * lv.predatorDamageMult;
  const dealt = hit ? ports.applyDamage(sim, 'ant', ant.id, raw, 'predation') : 0;
  sim.emit({ type: 'predator-strike', creatureId: c.id, targetId: ant.id, hit, damage: dealt });
  if (hit) ports.raiseAlarm(sim, ant.colony, ant.pos, 1);
  const alive = sim.stores.ants.has(ant.id) && ant.hp > 0;
  noteDangerEvent(sim, ant, aim, alive ? 'survived' : 'killed');
  if (!hit) return 'miss';
  if (!alive) return 'killed';
  if (seize) { seizeAnt(sim, c, ant); return 'seized'; }
  return 'hit';
}

/** Moves the predator onto the aim point (its strike ends there), keeping it on the level set. */
function lungeTo(sim: Sim, c: Creature, aim: { x: number; y: number; z: number }): void {
  const back = c.radius;
  const dx = aim.x - c.pos.x, dz = aim.z - c.pos.z, l = Math.hypot(dx, dz);
  if (l <= back) return;
  const k = (l - back) / l;
  const to = { x: c.pos.x + dx * k - c.up.x * c.footOffset, y: c.pos.y + (aim.y - c.pos.y) * k - c.up.y * c.footOffset, z: c.pos.z + dz * k - c.up.z * c.footOffset };
  const fwd = { x: dx / l, y: 0, z: dz / l };
  if (ports.placeOnSurface(sim, c, to)) face(c, { x: c.pos.x + fwd.x, y: c.pos.y, z: c.pos.z + fwd.z });
}

export function seizeAnt(sim: Sim, c: Creature, ant: Ant): void {
  const cs = ensureCombat(ant);
  cs.seizedBy = c.id;
  cs.escape = 0;
  c.seizedAntId = ant.id;
  c.bb.inWin = sim.state.tick; c.bb.inCnt = 0;
  c.bb.pdx = 0; c.bb.pdz = 0; c.bb.pheld = 0;
  ports.navStop(sim, ant);
  sim.emit({ type: 'ant-seized', antId: ant.id, by: c.id });
}

/** Lets the seized ant go. `freed`: by the struggle (1 s immunity, dropped 1 L away). */
export function releaseAnt(sim: Sim, c: Creature, freed: boolean): void {
  const ant = sim.stores.ants.get(c.seizedAntId);
  c.seizedAntId = -1;
  if (!ant) return;
  if (ant.combat && ant.combat.seizedBy === c.id) { ant.combat.seizedBy = -1; ant.combat.escape = 0; }
  ant.bb[BB_IMMUNE] = sim.state.tick + ticks(STRIKE_IMMUNITY_S);
  sim.emit({ type: 'ant-freed', antId: ant.id, by: c.id });
  if (freed) {
    const a = rngRange(rng(sim), 0, 2 * Math.PI), d = antLen(sim, ant) + c.radius;
    const ground = { x: ant.pos.x - ant.up.x * ant.footOffset, y: ant.pos.y - ant.up.y * ant.footOffset, z: ant.pos.z - ant.up.z * ant.footOffset };
    ports.placeOnSurface(sim, ant, { x: ground.x + Math.cos(a) * d, y: ground.y, z: ground.z + Math.sin(a) * d });
  }
}

/** Struggle inputs of the possessed ant reported by the player-control layer (any bite, special or sharp turn). */
export function addStruggleInput(sim: Sim, antId: number): void {
  const ant = sim.stores.ants.get(antId);
  const c = ant && ant.combat && ant.combat.seizedBy >= 0 ? sim.stores.creatures.get(ant.combat.seizedBy) : undefined;
  if (!ant || !c) return;
  countInput(sim, c, ant);
}

/** Each counted input adds 0.08 at once; at most 4 count per 1 s window (bb.inWin, bb.inCnt). */
function countInput(sim: Sim, c: Creature, ant: Ant): void {
  const now = sim.state.tick;
  if (now - (c.bb.inWin ?? now) >= TICKS_PER_SECOND) { c.bb.inCnt = 0; c.bb.inWin = now; }
  if ((c.bb.inCnt ?? 0) >= STRUGGLE_MAX_INPUTS_PER_S) return;
  c.bb.inCnt = (c.bb.inCnt ?? 0) + 1;
  ensureCombat(ant).escape += STRUGGLE_PER_INPUT;
}

const COS_TURN = Math.cos((STRUGGLE_TURN_DEG * Math.PI) / 180);
const STRUGGLE_ACTIONS = new Set(['bite', 'bite-hold', 'spray-acid', 'release-alarm', 'sting']);

/** Struggle inputs read from the recorded player intent: a newly held bite/special, a sharp direction change. */
function possessedInputs(sim: Sim, c: Creature, ant: Ant): void {
  const it = sim.state.player.intent;
  let held = 0;
  for (const a of it.held) if (STRUGGLE_ACTIONS.has(a)) held = 1;
  if (held && !c.bb.pheld) countInput(sim, c, ant);
  c.bb.pheld = held;
  const l = Math.hypot(it.dir.x, it.dir.z);
  if (l > 0.3) {
    const dx = it.dir.x / l, dz = it.dir.z / l, px = c.bb.pdx ?? 0, pz = c.bb.pdz ?? 0;
    if ((px !== 0 || pz !== 0) && dx * px + dz * pz < COS_TURN) countInput(sim, c, ant);
    c.bb.pdx = dx; c.bb.pdz = dz;
  }
}

export type HoldResult = 'held' | 'freed' | 'dead';

/**
 * One tick of a seized ant: venom (per second x predatorDamageMult), struggle (AI 2 inputs/s, the possessed ant's
 * own inputs), the predator's reassertion and nestmates biting the predator. `venomPerS` overrides the table.
 */
export function holdTick(sim: Sim, c: Creature, venomPerS = VENOM_PER_S[c.kind] ?? 0, cause: 'predation' | 'antlion' = 'predation',
  helpers = 0): HoldResult {
  const ant = sim.stores.ants.get(c.seizedAntId);
  if (!ant || ant.hp <= 0) { c.seizedAntId = -1; return 'dead'; }
  const cs = ensureCombat(ant);
  if (isPossessed(sim, ant)) possessedInputs(sim, c, ant);
  else cs.escape += STRUGGLE_AI_INPUTS_PER_S * STRUGGLE_PER_INPUT * TICK_S;
  cs.escape += (helpers * STRUGGLE_NESTMATE_PER_S - STRUGGLE_REASSERT_PER_S) * TICK_S;
  if (cs.escape < 0) cs.escape = 0;
  if (cs.escape >= 1 - 1e-9) { releaseAnt(sim, c, true); return 'freed'; }
  if (venomPerS > 0) ports.applyDamage(sim, 'ant', ant.id, venomPerS * conditions(sim).levers.predatorDamageMult * TICK_S, cause);
  if (!sim.stores.ants.has(ant.id) || ant.hp <= 0) { c.seizedAntId = -1; return 'dead'; }
  return 'held';
}

/** Nestmates of the seized ant biting (holding) the predator: they add to the struggle (§2.4). */
export function nestmatesBiting(sim: Sim, c: Creature, colony: number): number {
  let n = 0;
  const ids: number[] = [];
  sim.index.queryAnts(c.pos, c.radius + 4 * sim.world.bu, ids);
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (!a || a.colony !== colony || a.id === c.seizedAntId) continue;
    const l = a.combat?.lock;
    if ((l && l.targetKind === 'creature' && l.targetId === c.id) || recentlyBit(sim, c, a.id)) n++;
  }
  return n;
}

/** Recent biters recorded by noteCreatureHit: bb keys `bit.<antId>` = tick. */
export function recentlyBit(sim: Sim, c: Creature, antId: number, withinS = 1.5): boolean {
  const t = c.bb[`bit.${antId}`];
  return t !== undefined && sim.state.tick - t <= withinS * TICKS_PER_SECOND;
}
