// Centipede nest invasion (GDD 05 §2.5): once per night a prowling centipede whose path passes within 20 BU of an
// entrance of a colony with brood enters with p 0.2 (x Predators setting). Inside it follows the nest toward the
// brood and eats 1 brood per 40 s; it leaves at dawn or when driven off. Against the player colony it is a major
// threat (threat director); colonies without brood entities (abstract rivals) are not invaded.

import type { Creature, Nest, Sim } from '@/sim/types';
import { killBrood } from '@/sim/entities';
import { calendarTick, TICKS_PER_DAY } from '@/sim/time';
import {
  CENTIPEDE_BROOD_EAT_S, CENTIPEDE_INVADE_ENTRANCE_BU, CENTIPEDE_INVADE_P, CREATURE_STATS, REF_BU_MM, THREAT_CENTIPEDE,
} from '@/sim/balance/creatures';
import { chance, dist, setState, ticks, walkTo } from './common';
import type { Conditions } from './conditions';
import { endMajorThreat, requestMajorThreat } from './threat';
import { ports } from './ports';

const CE = CREATURE_STATS.centipede;
/** Brood within this distance is eaten, mm. */
const EAT_REACH_MM = 6;

function nestHasBrood(sim: Sim, nest: Nest): boolean {
  for (const b of sim.stores.brood.list) if (b.alive && b.nestId === nest.id) return true;
  return false;
}

function isPlayerNest(sim: Sim, nest: Nest): boolean {
  return !!sim.stores.colonies.get(nest.colony)?.isPlayer;
}

/** Rolls the nightly invasion; true when the centipede is now on its way in. */
export function maybeInvade(sim: Sim, c: Creature, cond: Conditions): boolean {
  if (!cond.dark || c.nestId >= 0 || cond.predatorMult <= 0) return false;
  const night = Math.floor((calendarTick(sim.state) + TICKS_PER_DAY / 2) / TICKS_PER_DAY);
  if (c.bb.invadeNight === night) return false;
  const r = CENTIPEDE_INVADE_ENTRANCE_BU * REF_BU_MM;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    const e = nest.entrances.find((x) => dist(x.pos, c.pos) <= r);
    if (!e || !nestHasBrood(sim, nest)) continue;
    c.bb.invadeNight = night;
    if (!chance(sim, CENTIPEDE_INVADE_P * cond.predatorMult)) return false;
    if (isPlayerNest(sim, nest) && !requestMajorThreat(sim, THREAT_CENTIPEDE)) return false;
    c.bb.invNest = nest.id;
    c.bb.invading = isPlayerNest(sim, nest) ? 1 : 0;
    c.bb.nextEat = sim.state.tick + ticks(CENTIPEDE_BROOD_EAT_S);
    setState(sim, c, 'invade');
    walkTo(sim, c, e.pos, CE.walkMmS * 0.5, 2);
    if (c.bb.invading) {
      ports.raiseAlert(sim, {
        kind: 'nest-attacked', level: 'warning', subjectId: c.id, title: 'A centipede is entering the nest',
        cause: 'centipede', focus: { kind: 'creature', id: c.id, pos: { ...c.pos } }, diagnosticId: 'diag-threats',
      });
    }
    return true;
  }
  return false;
}

/** One tick inside (or entering / leaving) the invaded nest. */
export function invasionTick(sim: Sim, c: Creature, cond: Conditions): void {
  const nest = sim.stores.nests.get(c.bb.invNest ?? -1);
  if (!nest || (!cond.dark && c.bb.forced !== 1) || c.bb.leaving === 1) { leave(sim, c, nest); return; }
  // nearest brood of that nest
  let best = -1, bestD = Infinity;
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.nestId !== nest.id) continue;
    const d = dist(b.pos, c.pos);
    if (d < bestD) { bestD = d; best = b.id; }
  }
  if (best < 0) { leave(sim, c, nest); return; }
  const b = sim.stores.brood.get(best)!;
  if (bestD <= EAT_REACH_MM + c.radius) {
    if (sim.state.tick >= (c.bb.nextEat ?? 0)) {
      killBrood(sim, best, 'predation');
      c.eaten++;
      c.bb.nextEat = sim.state.tick + ticks(CENTIPEDE_BROOD_EAT_S);
    }
    return;
  }
  if ((sim.state.tick + c.id) % 10 === 0) walkTo(sim, c, b.pos, CE.walkMmS * 0.3, EAT_REACH_MM);
}

function leave(sim: Sim, c: Creature, nest: Nest | undefined): void {
  c.bb.leaving = 1;
  if (c.nestId < 0 || !nest || nest.entrances.length === 0) { finishInvasion(sim, c); setState(sim, c, 'prowl'); return; }
  if (c.nav.status !== 'moving') {
    c.bb.leaveTries = (c.bb.leaveTries ?? 0) + 1;
    walkTo(sim, c, outsidePoint(nest.entrances[0], 20 + 10 * (c.bb.leaveTries % 4)), CE.walkMmS * 0.5, 4);
  }
}

/** A surface point `d` mm out from an entrance (horizontally: the entrance direction is often straight up). */
function outsidePoint(e: Nest['entrances'][number], d: number): { x: number; y: number; z: number } {
  let dx = e.dir.x, dz = e.dir.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.2) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  return { x: e.pos.x + dx * d, y: e.pos.y, z: e.pos.z + dz * d };
}

/** Ends the invasion bookkeeping (threat director) of a centipede that left, fled, died or despawned. */
export function finishInvasion(sim: Sim, c: Creature): void {
  if (c.bb.invading === 1) endMajorThreat(sim, THREAT_CENTIPEDE);
  c.bb.invading = 0;
  c.bb.leaving = 0;
  c.bb.leaveTries = 0;
  c.bb.invNest = -1;
}

/**
 * Debug trigger (`cheat.triggerNestInvasion`): the nearest centipede (one is spawned at the entrance when none is
 * out) enters the colony's nest now. `force` bypasses the threat director and the night rule.
 */
export function triggerInvasion(sim: Sim, colonyId: number, force: boolean, spawn: (p: { x: number; y: number; z: number }) => Creature | null): boolean {
  const nest = sim.stores.nests.list.find((n) => n.alive && n.colony === colonyId && n.entrances.length > 0);
  if (!nest || !nestHasBrood(sim, nest)) return false;
  const e = nest.entrances[0];
  let c: Creature | null = sim.stores.creatures.list.filter((x) => x.alive && x.kind === 'centipede' && x.state !== 'invade')
    .sort((a, b) => dist(a.pos, e.pos) - dist(b.pos, e.pos) || a.id - b.id)[0] ?? null;
  if (!c) c = spawn(outsidePoint(e, 15));
  if (!c) return false;
  const player = isPlayerNest(sim, nest);
  if (player && !requestMajorThreat(sim, THREAT_CENTIPEDE)) {
    if (!force) return false;
    const td = sim.state.rivals.threatDirector;
    td.activeKind = THREAT_CENTIPEDE; td.activeSinceTick = sim.state.tick;
  }
  c.bb.invNest = nest.id;
  c.bb.invading = player ? 1 : 0;
  c.bb.leaving = 0;
  c.bb.forced = force ? 1 : 0;
  c.bb.nextEat = sim.state.tick + ticks(CENTIPEDE_BROOD_EAT_S);
  setState(sim, c, 'invade');
  walkTo(sim, c, e.pos, CE.walkMmS * 0.5, 2);
  return true;
}
