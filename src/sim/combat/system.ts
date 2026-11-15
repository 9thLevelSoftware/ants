// The combat system (phase `combat`, every tick, after locomotion; GDD 05 §0 "combat every tick"). Per ant:
// alarm decay, acid in progress, spray detection (`combat-spray`), lock upkeep (hold bites on the bite cycle, lock
// breaks, stalemates, partner gone), the fight record and injuries, and every COMBAT_SCAN_EVERY ticks the
// recruitment scan; queens defending themselves in place and the fighting ants' alarm deposit. Per creature: acid
// and holders. On cadences: rally recruitment, alerts and diagnostics.

import type { Ant, Sim } from '@/sim/types';
import {
  ALARM_SPRAYED, COMBAT_DIAG_EVERY, COMBAT_SCAN_EVERY, FIGHT_END_QUIET_S, LOCK_BREAK_DIST_MULT,
  LOCK_BREAK_EVERY_S, LOCK_BREAK_HOLDER_WEIGHT, RALLY_EVERY_TICKS, RECOVERY_EVERY_TICKS, SHAKEN_STUN_S, STALEMATE_RELEASE_P,
  STALEMATE_S,
} from '@/sim/balance/combat';
import { rngInt, rngShuffle } from '@/core/rng';
import { dep } from './late';
import { acidTick, clearSprayHits, sprayDisabled, takeSprayHits } from './acid';
import { alarmBurst, decayAlarm } from './alarm';
import { combatAlerts } from './alerts';
import { publishCombatDiagnostic } from './diagnostics';
import { installActionAdapters } from './dodge';
import { canFight, mayAttack } from './engage';
import { startFight } from './fight';
import { closeFightRecord, inFightRecord } from './fightRecord';
import { holdersOf, holdersPull, lockedBody, pullOf, releaseGrapple, roll, updatePin } from './grapple';
import { resolveBite } from './hits';
import { recoveryTopUp, rollInjuries } from './injuries';
import { ensureMovementHooks, lockGap } from './movement';
import { rallyRecruit } from './rally';
import { endSelfDefence, fightAlarmDeposit, selfDefence } from './selfDefence';
import { pruneRerolls, scanAnt } from './recruit';
import { combatStats } from './stats';
import { CB, combatFlags, rng, ticksOf } from './state';

const hs: number[] = [];
const installedSims = new WeakSet<Sim>();

/** Hooks this module installs once per Sim (derived, never persisted). */
export function ensureInstalled(sim: Sim): void {
  installActionAdapters();
  if (installedSims.has(sim)) return;
  installedSims.add(sim);
  ensureMovementHooks(sim);
  dep().registerGuardEngage(sim, (s, guard, who) => guardEngage(s, guard, who));
}

/** The combat branch of `guard` (GDD 02 §10.9): after raising the alarm the guard fights the intruder. */
function guardEngage(sim: Sim, guard: Ant, who: { kind: 'ant' | 'creature'; id: number }): void {
  const target = who.kind === 'ant' ? sim.stores.ants.get(who.id) : sim.stores.creatures.get(who.id);
  if (!target || !target.alive) return;
  if (who.kind === 'ant' && !mayAttack(sim, guard, target as Ant)) return;
  startFight(sim, guard, who, target.pos, 'threat');
}

/** Stuns an ant shaken off a lock: no bites or holds for SHAKEN_STUN_S (shared stun key with the creature module). */
function stun(sim: Sim, ant: Ant, seconds: number): void {
  const until = sim.state.tick + ticksOf(seconds);
  ant.bb[CB.stunUntil] = Math.max(ant.bb[CB.stunUntil] ?? 0, until);
  if (ant.combat) ant.combat.biteCdTick = Math.max(ant.combat.biteCdTick, until);
}

/** Holders whose hold bite is due this tick (resolved after the ant loop in a shuffled order: no first-mover edge). */
const due: Ant[] = [];

/** Lock upkeep of a holder: partner gone or drifted away, hold bite due, stalemate release. */
function holderTick(sim: Sim, a: Ant): void {
  const b = lockedBody(sim, a);
  if (!b || lockGap(sim, a, b) > LOCK_BREAK_DIST_MULT) { releaseGrapple(sim, a.id); return; }
  const now = sim.state.tick;
  if (now >= (a.bb[CB.holdNext] ?? now)) {
    a.bb[CB.holdNext] = now + Math.max(1, ticksOf(combatStats(sim, a).biteCycleS));
    due.push(a);
  }
  // stalemate: no damage either way for 30 s -> release with p 0.5 per s
  if ((now + a.id) % ticksOf(1) !== 0) return;
  const tLast = b.kind === 'ant' ? (b.ant.bb[CB.lastDmg] ?? now) : now;
  const quiet = Math.min(now - (a.bb[CB.lastDmg] ?? now), now - tLast);
  if (quiet >= ticksOf(STALEMATE_S) && !combatFlags(sim).noRng && roll(sim, STALEMATE_RELEASE_P)) releaseGrapple(sim, a.id);
}

/** A held ant: prune stale holders; once per second shake one holder off with p pull_t / (pull_t + 2 Σ pull_h). */
function heldTick(sim: Sim, a: Ant): void {
  const cs = a.combat!;
  const body = { kind: 'ant' as const, ant: a };
  const valid = holdersOf(sim, body, hs);
  if (valid.length !== cs.heldBy.length) { cs.heldBy = valid.slice(); updatePin(sim, body, -1); }
  if (cs.heldBy.length === 0) return;
  const now = sim.state.tick;
  if (now < (a.bb[CB.shakeNext] ?? now)) return;
  a.bb[CB.shakeNext] = now + ticksOf(LOCK_BREAK_EVERY_S);
  // an ant whose own mandibles hold a lock does not struggle free (mutual locks stay locked, E9)
  if (cs.lock || combatFlags(sim).noRng) return;
  const pt = pullOf(sim, body);
  const p = pt / (pt + LOCK_BREAK_HOLDER_WEIGHT * holdersPull(sim, body));
  if (!roll(sim, p)) return;
  const victim = sim.stores.ants.get(cs.heldBy[rngInt(rng(sim), 0, cs.heldBy.length - 1)]);
  if (!victim) return;
  releaseGrapple(sim, victim.id);
  stun(sim, victim, SHAKEN_STUN_S);
}

/** Closes a fight record after a quiet spell; rolls injuries for the survivor. */
function fightRecordTick(sim: Sim, a: Ant): void {
  if (!inFightRecord(a)) return;
  const cs = a.combat;
  if (cs && (cs.lock || cs.heldBy.length > 0 || cs.seizedBy >= 0)) { a.bb[CB.lastAct] = sim.state.tick; return; }
  if (sim.state.tick - (a.bb[CB.lastAct] ?? 0) < ticksOf(FIGHT_END_QUIET_S)) return;
  rollInjuries(sim, a);
  closeFightRecord(a);
  endSelfDefence(a);
}

/** A spray happened this tick (its charge was spent): `combat-spray` and the sprayer's own alarm. */
function sprayCheck(sim: Sim, a: Ant): void {
  const seen = a.bb[CB.acidSeen];
  if (seen !== undefined && a.acid < seen - 1e-9 && !sprayDisabled(a)) {
    const hitIds = takeSprayHits(sim, a.id);
    sim.emit({
      type: 'combat-spray', antId: a.id, pos: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
      dir: { x: a.fwd.x, y: a.fwd.y, z: a.fwd.z }, hitIds,
    });
    alarmBurst(sim, a.colony, a.pos, { radiusL: ALARM_SPRAYED.radiusL, add: ALARM_SPRAYED.add, deposit: 0 }, 'own-spray');
  }
  if (a.acid !== seen) a.bb[CB.acidSeen] = a.acid;
}

/** Drops the CombatState of an ant with nothing going on (D2.12: null outside fights). */
function maybeClearCombat(sim: Sim, a: Ant): void {
  const cs = a.combat;
  if (!cs || inFightRecord(a)) return;
  const now = sim.state.tick;
  if (cs.lock || cs.heldBy.length > 0 || cs.pinned || cs.seizedBy >= 0 || cs.escape > 0) return;
  if (cs.paralysedUntilTick > now || cs.disorientedUntilTick > now || cs.dodgeUntilTick > now || cs.dodgeCdTick > now) return;
  if (cs.biteCdTick > now || cs.specialCdTick > now || cs.stuckSinceTick > 0) return;
  if (cs.recentHitters.some((h) => h.tick > now - ticksOf(FIGHT_END_QUIET_S))) return;
  a.combat = null;
}

function antTick(sim: Sim, a: Ant): void {
  const now = sim.state.tick;
  decayAlarm(a);
  if (a.bb[CB.acidLeft] !== undefined) acidTick(sim, 'ant', a);
  if (!a.alive) return;
  if (a.acid > 0 || a.bb[CB.acidSeen] !== undefined) sprayCheck(sim, a);
  if (a.combat) {
    if (a.combat.lock) holderTick(sim, a);
    if (!a.alive) return;
    if (a.combat && a.combat.heldBy.length > 0) heldTick(sim, a);
  }
  fightRecordTick(sim, a);
  selfDefence(sim, a);
  fightAlarmDeposit(sim, a);
  if ((now + a.id) % COMBAT_SCAN_EVERY === 0 && canFight(a) && !combatFlags(sim).noScan) scanAnt(sim, a);
  if ((now + a.id) % RECOVERY_EVERY_TICKS === 0) {
    recoveryTopUp(sim, a);
    pruneRerolls(sim, a);
    maybeClearCombat(sim, a);
  }
}

/** The hold bites due this tick, in a random order (two holders biting each other in one tick: either may win). */
function holdBites(sim: Sim): void {
  if (due.length > 1) rngShuffle(rng(sim), due);
  for (const a of due) {
    const l = a.alive ? a.combat?.lock : null;
    if (l) resolveBite(sim, a, l.targetKind, l.targetId, true);
  }
  due.length = 0;
}

export function runCombat(sim: Sim): void {
  ensureInstalled(sim);
  const ants = sim.stores.ants.list;
  due.length = 0;
  for (let i = 0; i < ants.length; i++) if (ants[i].alive) antTick(sim, ants[i]);
  holdBites(sim);
  const cs = sim.stores.creatures.list;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (!c.alive) continue;
    if (c.bb[CB.acidLeft] !== undefined) acidTick(sim, 'creature', c);
    if (c.alive && (c.bb['cb.nh'] ?? 0) > 0) updatePin(sim, { kind: 'creature', c }, -1);
  }
  const now = sim.state.tick;
  if (now % RALLY_EVERY_TICKS === 0) rallyRecruit(sim);
  if (now % COMBAT_DIAG_EVERY === 0) {
    combatAlerts(sim);
    publishCombatDiagnostic(sim);
  }
  clearSprayHits(sim);
}
