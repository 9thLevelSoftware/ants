// Who joins a fight (GDD 05 §3.6, §4.5, GDD 02 §10.12-10.13), checked for each autonomous worker every
// COMBAT_SCAN_EVERY ticks: (1) it was hit while not fighting: fight back, or flee when the retreat rule says so;
// (2) a hostile ant in antennal contact: the attack roll (re-rolled per pair after 20 s); (3) its alarmLevel
// reached θ_fight: recruited toward the attacker (if known) or the alarm point, within the colony's recruit cap.

import type { Ant, Colony, Sim } from '@/sim/types';
import { COMBAT_SCAN_EVERY, ENCOUNTER_REROLL_S, RECOGNITION_L } from '@/sim/balance/combat';
import { alarmSource } from './alarm';
import { attackChance, canFight, fightThreshold, recruitCap, retreatReason } from './engage';
import { startFight, startRetreat } from './fight';
import { roll } from './grapple';
import { antLenMm, CB, dist, ticksOf } from './state';

const ids: number[] = [];
const src = { x: 0, y: 0, z: 0 };

/** Per-tick colony facts the scan needs (fighters, invasion, cap), built lazily. */
export interface ScanContext {
  tick: number;
  fighters: Map<number, number>;
  invaded: Map<number, boolean>;
}

const contexts = new WeakMap<Sim, ScanContext>();

export function scanContext(sim: Sim): ScanContext {
  let c = contexts.get(sim);
  if (!c || c.tick !== sim.state.tick) {
    c = { tick: sim.state.tick, fighters: new Map(), invaded: new Map() };
    for (const a of sim.stores.ants.list) if (a.alive && a.task === 'fight') c.fighters.set(a.colony, (c.fighters.get(a.colony) ?? 0) + 1);
    contexts.set(sim, c);
  }
  return c;
}

/** A hostile ant or an invading creature is inside one of the colony's nests. */
export function nestInvaded(sim: Sim, col: Colony, ctx: ScanContext): boolean {
  const known = ctx.invaded.get(col.id);
  if (known !== undefined) return known;
  let inv = false;
  for (const c of sim.stores.creatures.list) if (c.alive && c.nestId >= 0 && col.nestIds.includes(c.nestId)) { inv = true; break; }
  if (!inv) {
    for (const a of sim.stores.ants.list) {
      if (a.alive && a.colony !== col.id && a.nestId >= 0 && col.nestIds.includes(a.nestId)) { inv = true; break; }
    }
  }
  ctx.invaded.set(col.id, inv);
  return inv;
}

/** Reaction to a hit taken while not fighting (within the last scan interval). */
function reactToHit(sim: Sim, ant: Ant): boolean {
  const t = ant.bb[CB.hitTick];
  if (t === undefined || sim.state.tick - t > COMBAT_SCAN_EVERY) return false;
  const kind = ant.bb[CB.hitByKind] === 2 ? 'creature' : 'ant';
  const id = ant.bb[CB.hitBy] ?? -1;
  delete ant.bb[CB.hitTick];
  // GDD 02 §10.12: an ant carrying brood (or one the retreat rule sends away) flees; the others fight back
  if (ant.carry.kind === 'brood' || retreatReason(sim, ant)) { startRetreat(sim, ant); return true; }
  return startFight(sim, ant, { kind, id }, null, 'threat');
}

/** Encounter with a hostile ant in antennal contact: the attack roll. */
function encounter(sim: Sim, ant: Ant): boolean {
  const r = RECOGNITION_L * antLenMm(sim, ant) + ant.radius;
  sim.index.queryAnts(ant.pos, r * 2, ids);
  const now = sim.state.tick;
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (!o || !o.alive || o.colony === ant.colony || dist(o.pos, ant.pos) > r + o.radius) continue;
    const key = CB.reroll + o.id;
    const last = ant.bb[key];
    if (last !== undefined && now - last < ticksOf(ENCOUNTER_REROLL_S)) continue;
    ant.bb[key] = now;
    if (roll(sim, attackChance(sim, ant, o))) return startFight(sim, ant, { kind: 'ant', id: o.id }, o.pos, 'threat');
  }
  return false;
}

/** Forgets encounter re-roll marks older than the re-roll window (keeps bb small). */
export function pruneRerolls(sim: Sim, ant: Ant): void {
  const old = sim.state.tick - ticksOf(ENCOUNTER_REROLL_S);
  for (const k of Object.keys(ant.bb)) if (k.startsWith(CB.reroll) && ant.bb[k] < old) delete ant.bb[k];
}

function recruitByAlarm(sim: Sim, ant: Ant, ctx: ScanContext): boolean {
  if (ant.alarmLevel <= 0) return false;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col) return false;
  const invaded = nestInvaded(sim, col, ctx);
  if (ant.alarmLevel < fightThreshold(sim, ant, invaded)) return false;
  const n = ctx.fighters.get(col.id) ?? 0;
  if (n >= recruitCap(col, invaded)) return false;
  const by = ant.bb[CB.alarmBy] ?? -1;
  const attacker = by >= 0 ? sim.stores.ants.get(by) ?? sim.stores.creatures.get(by) : undefined;
  const target = attacker && attacker.alive ? { kind: ('caste' in attacker ? 'ant' : 'creature') as 'ant' | 'creature', id: by } : null;
  const p = alarmSource(ant, src);
  if (!startFight(sim, ant, target, p, 'alarm')) return false;
  ctx.fighters.set(col.id, n + 1);
  return true;
}

/** One scan of one ant (call every COMBAT_SCAN_EVERY ticks, staggered). */
export function scanAnt(sim: Sim, ant: Ant): void {
  if (!canFight(ant) || ant.task === 'fight' || ant.task === 'flee') return;
  if (ant.combat && (ant.combat.seizedBy >= 0 || ant.combat.lock)) return;
  if (reactToHit(sim, ant)) return;
  if (encounter(sim, ant)) return;
  recruitByAlarm(sim, ant, scanContext(sim));
}
