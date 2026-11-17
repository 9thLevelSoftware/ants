// Alert triggers owned by this module (GDD 05 App. C, levels from GDD 08 §6.5):
//  - `predator-near` (warning): an ant predator stalking, in ambush or winding up within 15 BU of the possessed ant
//    or of >= 3 foragers, or a strike of it that landed on a player-colony ant; cooldown 0.1 gd per creature. Cleared once the condition has not held for
//    PREDATOR_NEAR_CLEAR_S (a card raised by a strike: PREDATOR_STRUCK_CLEAR_S after it unless the predator lurks
//    again), or when the creature is gone (alerts stay active until their raiser clears them).
//  - `nest-attacked` (critical): a centipede inside the player nest (raised in invasion.ts); clears 30 s after the
//    last invader left.
// Bookkeeping in creature bb: `alertTick` (cooldown end), `alertOn` (1 while raised), `alertSeen` (last tick the
// condition held), `alertClearAt` (tick a strike-raised card clears; -1 once lurking holds it).

import type { Creature, Sim } from '@/sim/types';
import {
  NEST_ATTACKED_CLEAR_S, PREDATOR_NEAR_BU, PREDATOR_NEAR_CLEAR_S, PREDATOR_NEAR_COOLDOWN_GD, PREDATOR_NEAR_FORAGERS,
  PREDATOR_STRUCK_CLEAR_S,
} from '@/sim/balance/creatures';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { dist } from './common';
import { ports } from './ports';

const LURKING = new Set(['stalk', 'ambush', 'windup', 'orient', 'freeze', 'approach']);
const _ids: number[] = [];

function lurkingNear(sim: Sim, c: Creature, colonyId: number): boolean {
  if (!LURKING.has(c.state)) return false;
  const r = PREDATOR_NEAR_BU * sim.world.bu;
  const possessed = sim.stores.ants.get(sim.state.player.possessedAntId);
  if (possessed && dist(possessed.pos, c.pos) <= r) return true;
  let n = 0;
  sim.index.queryAnts(c.pos, r, _ids);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (a && a.colony === colonyId && a.task === 'forage' && dist(a.pos, c.pos) <= r) n++;
  }
  return n >= PREDATOR_NEAR_FORAGERS;
}

/** Raises `predator-near` for the creature unless its per-creature cooldown (0.1 gd) still runs; true if raised now. */
function raisePredatorNear(sim: Sim, c: Creature): boolean {
  const now = sim.state.tick;
  if (c.bb.alertOn === 1 || now < (c.bb.alertTick ?? -1)) return false;
  c.bb.alertTick = now + Math.round(PREDATOR_NEAR_COOLDOWN_GD * TICKS_PER_DAY);
  c.bb.alertOn = 1;
  c.bb.alertClearAt = -1;
  ports.raiseAlert(sim, {
    kind: 'predator-near', level: 'warning', subjectId: c.id, title: 'Predator near foragers', cause: c.kind,
    focus: { kind: 'creature', id: c.id, pos: { ...c.pos } }, diagnosticId: 'diag-threats', tokens: { kind: c.kind },
  });
  return true;
}

function clearPredatorNear(sim: Sim, c: Creature): void {
  ports.clearAlert(sim, 'predator-near', c.id);
  c.bb.alertOn = 0;
  c.bb.alertClearAt = -1;
}

/** Director cadence: raises and clears `predator-near` per creature. */
export function predatorNearAlerts(sim: Sim): void {
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return;
  const now = sim.state.tick;
  for (const c of sim.stores.creatures.list) {
    if (!c.alive) continue;
    const near = lurkingNear(sim, c, col.id);
    if (near) { c.bb.alertSeen = now; c.bb.alertClearAt = -1; }
    if (c.bb.alertOn === 1) {
      if (!near && now - (c.bb.alertSeen ?? now) >= PREDATOR_NEAR_CLEAR_S * TICKS_PER_SECOND) clearPredatorNear(sim, c);
      continue;
    }
    if (near) raisePredatorNear(sim, c);
  }
}

/**
 * A strike that landed on a player-colony ant (GDD 05 App. C: `predator-strike` feeds `predator-near`): the card is
 * raised at once, under the same per-creature cooldown, and clears PREDATOR_STRUCK_CLEAR_S after the strike unless
 * the predator is seen lurking again (then the lurking rule's PREDATOR_NEAR_CLEAR_S holds it). In small colonies the
 * "3 foragers within 15 BU" rule alone almost never holds, so without this the player was never told a predator was
 * taking workers (threats-live). A card already raised by lurking keeps its own clearing.
 */
export function predatorStruck(sim: Sim, c: Creature, antColony: number): void {
  const col = sim.state.colonies.find((x) => x.alive && x.isPlayer);
  if (!col || col.id !== antColony) return;
  if (c.bb.alertOn === 1) { c.bb.alertSeen = sim.state.tick; return; }
  if (raisePredatorNear(sim, c)) c.bb.alertClearAt = sim.state.tick + Math.round(PREDATOR_STRUCK_CLEAR_S * TICKS_PER_SECOND);
}

/** Every tick (creature system): a strike-raised card whose time is up and that no lurking took over clears. */
export function struckAlertTick(sim: Sim, c: Creature): void {
  const at = c.bb.alertClearAt;
  if (at === undefined || at < 0 || c.bb.alertOn !== 1 || sim.state.tick < at) return;
  clearPredatorNear(sim, c);
}

/** A creature that is gone takes its predator-near alert with it. */
export function clearCreatureAlerts(sim: Sim, creatureId: number): void {
  ports.clearAlert(sim, 'predator-near', creatureId);
}

/** `nest-attacked` for an invading centipede (subject: the nest id, so several invaders share one card). */
export function raiseNestAttacked(sim: Sim, c: Creature, nestId: number): void {
  ports.raiseAlert(sim, {
    kind: 'nest-attacked', level: 'critical', subjectId: nestId, title: 'Nest under attack', cause: 'a centipede is in the nest',
    focus: { kind: 'creature', id: c.id, pos: { ...c.pos } }, diagnosticId: 'diag-threats',
  });
  sim.state.ecology.director.nestAttackedNest = nestId;
  sim.state.ecology.director.nestAttackedUntil = -1;
}

/**
 * Director cadence: once no centipede is invading a nest any more, its `nest-attacked` card clears 30 s later.
 * `nestAttackedNest` / `nestAttackedUntil` (director, plain data) hold the pending clear.
 */
export function nestAttackedAlerts(sim: Sim): void {
  const dir = sim.state.ecology.director;
  const nestId = dir.nestAttackedNest ?? -1;
  if (nestId < 0) return;
  let invading = false;
  for (const c of sim.stores.creatures.list) if (c.alive && c.kind === 'centipede' && c.bb.invNest === nestId && c.state === 'invade') invading = true;
  if (invading) { dir.nestAttackedUntil = -1; return; }
  const now = sim.state.tick;
  if ((dir.nestAttackedUntil ?? -1) < 0) { dir.nestAttackedUntil = now + NEST_ATTACKED_CLEAR_S * TICKS_PER_SECOND; return; }
  if (now >= (dir.nestAttackedUntil ?? now)) {
    ports.clearAlert(sim, 'nest-attacked', nestId);
    dir.nestAttackedNest = -1;
    dir.nestAttackedUntil = -1;
  }
}

/**
 * possessed-danger causes this module owns: held by a predator (GDD 05 App. C "seized"), paralysed by ant-spider venom
 * (the `paralysed` condition; App. C routes `ant-paralysed` to this card; "stuck" is the spill-trap state, §1.8).
 */
const OWN_DANGER = { seized: 'Seized by a predator', paralysed: 'Paralysed' } as const;
type OwnDanger = keyof typeof OWN_DANGER;

function dangerCause(sim: Sim, antId: number): OwnDanger | null {
  if (antId !== sim.state.player.possessedAntId) return null;
  const a = sim.stores.ants.get(antId);
  if (!a || !a.alive || !a.combat) return null;
  if (a.combat.seizedBy >= 0) return 'seized';
  if (a.combat.paralysedUntilTick > sim.state.tick) return 'paralysed';
  return null;
}

/**
 * Every tick: `possessed-danger` (critical, ruling R15) while the possessed ant is seized (a strike, a rove-beetle
 * grab, an antlion's drag) or paralysed by an ant-spider; cleared the tick the cause ends, the ant dies or the
 * player leaves it. Read from the alert list itself, so nothing extra is persisted. Alerts are keyed by kind and
 * subject, so a card another module raised for the same ant (combat "pinned", flood "under-water") is left as it
 * is: overwriting it would let this module clear it later while that module still holds it.
 */
export function possessedDangerAlerts(sim: Sim): void {
  const alerts = sim.state.progression.alerts;
  for (let i = alerts.length - 1; i >= 0; i--) {
    const al = alerts[i];
    if (al.kind !== 'possessed-danger' || !(al.cause in OWN_DANGER)) continue;
    if (dangerCause(sim, al.subjectId) !== al.cause) ports.clearAlert(sim, 'possessed-danger', al.subjectId);
  }
  const id = sim.state.player.possessedAntId;
  const cause = dangerCause(sim, id);
  if (!cause || alerts.some((al) => al.kind === 'possessed-danger' && al.subjectId === id)) return;
  const a = sim.stores.ants.get(id)!;
  const by = cause === 'seized' ? sim.stores.creatures.get(a.combat!.seizedBy) : undefined;
  ports.raiseAlert(sim, {
    kind: 'possessed-danger', level: 'critical', subjectId: id, title: OWN_DANGER[cause], cause,
    focus: { kind: 'ant', id, pos: { ...a.pos } }, diagnosticId: 'diag-threats', tokens: { cause, ...(by ? { kind: by.kind } : {}) },
  });
}
