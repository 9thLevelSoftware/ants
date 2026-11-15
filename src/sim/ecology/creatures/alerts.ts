// Alert triggers owned by this module (GDD 05 App. C, levels from GDD 08 §6.5):
//  - `predator-near` (warning): an ant predator stalking, in ambush or winding up within 15 BU of the possessed ant
//    or of >= 3 foragers; cooldown 0.1 gd per creature. Cleared once the condition has not held for
//    PREDATOR_NEAR_CLEAR_S, or when the creature is gone (alerts stay active until their raiser clears them).
//  - `nest-attacked` (critical): a centipede inside the player nest (raised in invasion.ts); clears 30 s after the
//    last invader left.
// Bookkeeping in creature bb: `alertTick` (cooldown end), `alertOn` (1 while raised), `alertSeen` (last tick the
// condition held).

import type { Creature, Sim } from '@/sim/types';
import {
  NEST_ATTACKED_CLEAR_S, PREDATOR_NEAR_BU, PREDATOR_NEAR_CLEAR_S, PREDATOR_NEAR_COOLDOWN_GD, PREDATOR_NEAR_FORAGERS,
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

/** Director cadence: raises and clears `predator-near` per creature. */
export function predatorNearAlerts(sim: Sim): void {
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return;
  const now = sim.state.tick;
  for (const c of sim.stores.creatures.list) {
    if (!c.alive) continue;
    const near = lurkingNear(sim, c, col.id);
    if (near) c.bb.alertSeen = now;
    if (c.bb.alertOn === 1) {
      if (!near && now - (c.bb.alertSeen ?? now) >= PREDATOR_NEAR_CLEAR_S * TICKS_PER_SECOND) {
        ports.clearAlert(sim, 'predator-near', c.id);
        c.bb.alertOn = 0;
      }
      continue;
    }
    if (!near || now < (c.bb.alertTick ?? -1)) continue;
    c.bb.alertTick = now + Math.round(PREDATOR_NEAR_COOLDOWN_GD * TICKS_PER_DAY);
    c.bb.alertOn = 1;
    ports.raiseAlert(sim, {
      kind: 'predator-near', level: 'warning', subjectId: c.id, title: 'Predator near foragers', cause: c.kind,
      focus: { kind: 'creature', id: c.id, pos: { ...c.pos } }, diagnosticId: 'diag-threats', tokens: { kind: c.kind },
    });
  }
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
