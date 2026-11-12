// The established queen (GDD 02 §10.14): `queen.reside` stays in the royal chamber (or the chamber a move-queen
// marker sent her to) and lays with the `lay-egg` primitive whenever the colony's egg budget and her gut allow;
// `queen.relocate` walks her to a new chamber on a move-queen marker, or away from a flooded / alarmed one.
// A founding queen (claustral phase) belongs to the founding module and is left alone here.

import type { Ant, Behaviour, Chamber, Nest, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { canDo } from '@/sim/ants/actions';
import { ALARM_STRONG } from '@/sim/balance/pheromone';
import {
  EVACUATE_FLOOD, QUEEN_HOME_SLACK_BU, QUEEN_REFUGE_TYPES, QUEEN_SEAT_OFFSET, ROOM_WAIT_FRAC,
} from '@/sim/balance/nestwork';
import { TYPE_CLIMATE_PREF } from '@/sim/balance/architect';
import { recover, think } from './common';
import { B, bbv, setState } from './fsm';
import { chamberIn, floorPoint, homeNest, royalChamber } from './places';
import { act, entity, travel } from './travel';

const ENTRY = 'queen.reside';
/** bb: 1 = she lives where an emergency (flood, alarm) sent her, and goes back to the royal chamber when it is safe. */
const EMERGENCY = 'bn.qe';
const seat = { x: 0, y: 0, z: 0 };

export function isFoundingQueen(ant: Ant): boolean {
  return ant.queen?.founding != null || (ant.flags & AntFlag.FOUNDING) !== 0;
}

/** The chamber the queen lives in: the move-queen target she was sent to, else the royal chamber. */
export function queenHome(nest: Nest, q: Ant): Chamber | undefined {
  const h = bbv(q, B.home);
  return (h >= 0 ? chamberIn(nest, h) : undefined) ?? royalChamber(nest);
}

function unsafe(sim: Sim, q: Ant, c: Chamber): boolean {
  return c.flooded >= EVACUATE_FLOOD || sim.phero.sample(q.colony, 'alarm', c.center) >= ALARM_STRONG;
}

/** Piecewise-linear preference curve [x, value] (values beyond the end points hold). */
function prefAt(points: readonly (readonly [number, number])[], x: number): number {
  if (x <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i];
    if (x <= x1) { const [x0, y0] = points[i - 1]; return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0); }
  }
  return points[points.length - 1][1];
}

/** How well a chamber suits the queen: the royal chamber's climate preference (GDD 03 §9.3), 0..1. */
function refugeScore(c: Chamber): number {
  const pref = TYPE_CLIMATE_PREF.royal;
  return pref ? prefAt(pref.temp, c.temp) * prefAt(pref.rh, c.humidity) : 1;
}

/**
 * The best safe chamber for a queen leaving an unsafe home (GDD 02 §10.14 "relocate to best safe chamber"): a
 * chamber of a type that may hold the queen and her eggs (never a food store or a midden), not flooded or
 * alarmed, with the best royal climate preference; ties to the lower id.
 */
function refuge(sim: Sim, q: Ant, nest: Nest, home: Chamber): Chamber | undefined {
  let best: Chamber | undefined, bestS = -1;
  for (const c of nest.chambers) {
    if (c.id === home.id || !QUEEN_REFUGE_TYPES.includes(c.type) || unsafe(sim, q, c)) continue;
    const s = refugeScore(c);
    if (s > bestS || (s === bestS && best && c.id < best.id)) { best = c; bestS = s; }
  }
  return best;
}

/**
 * A new home if one is asked for: the colony's live move-queen marker; a safe chamber when home is unsafe; back to
 * the royal chamber once it is safe again after an emergency move.
 */
function relocationTarget(sim: Sim, q: Ant, nest: Nest, home: Chamber): { id: number; marker: boolean; emergency: boolean } | null {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'move-queen' || m.colony !== q.colony || m.targetChamberId === home.id) continue;
    if (m.placedTick < bbv(q, 'bn.mq', -1)) continue; // a marker she already answered (or failed to reach)
    if (chamberIn(nest, m.targetChamberId)) return { id: m.targetChamberId, marker: true, emergency: false };
  }
  if (unsafe(sim, q, home)) {
    const best = refuge(sim, q, nest, home);
    return best ? { id: best.id, marker: false, emergency: true } : null;
  }
  const royal = royalChamber(nest);
  if (bbv(q, EMERGENCY, 0) === 1 && royal && royal.id !== home.id && !unsafe(sim, q, royal)) {
    return { id: royal.id, marker: false, emergency: false };
  }
  return null;
}

function reside(sim: Sim, q: Ant): void {
  const nest = homeNest(sim, q);
  const home = nest ? queenHome(nest, q) : undefined;
  if (!nest || !home) return;
  const move = relocationTarget(sim, q, nest, home);
  if (move) {
    q.bb['bn.dest'] = move.id;
    q.bb[EMERGENCY] = move.emergency ? 1 : 0;
    q.bb['bn.mq'] = sim.state.tick + 1;
    setState(sim, q, 'queen.relocate', move.marker ? 'marker:move-queen' : 'alarm');
    return;
  }
  floorPoint(home, QUEEN_SEAT_OFFSET, Math.PI, seat);
  const away = q.chamberId !== home.id || Math.hypot(q.pos.x - seat.x, q.pos.z - seat.z) > QUEEN_HOME_SLACK_BU * sim.world.bu;
  if (away) {
    if (travel(sim, q, entity('point', -1, seat), sim.world.bu) === 'failed') recover(sim, q, ENTRY, 'stuck');
    return;
  }
  if (canDo(sim, q, 'lay-egg', null).ok && act(sim, q, 'lay-egg', null)) setState(sim, q, ENTRY);
}

function relocate(sim: Sim, q: Ant): void {
  const nest = homeNest(sim, q);
  const dest = nest ? chamberIn(nest, bbv(q, 'bn.dest')) : undefined;
  if (!nest || !dest) { setState(sim, q, ENTRY); return; }
  const st = q.chamberId === dest.id ? 'arrived' : travel(sim, q, entity('chamber', dest.id, dest.center), ROOM_WAIT_FRAC * Math.min(dest.radii.x, dest.radii.z));
  if (st === 'moving') return;
  if (st === 'arrived') q.bb[B.home] = dest.id;
  // target unreachable: she stays where she is (GDD 02 §10.14 failure)
  setState(sim, q, ENTRY, st === 'arrived' ? 'marker:move-queen' : 'stuck');
}

function step(sim: Sim, q: Ant): void {
  if (q.state === 'queen.relocate') relocate(sim, q);
  else if (q.state !== ENTRY) setState(sim, q, ENTRY);
  else reside(sim, q);
}

/** Runs the queen; the `idle` behaviour dispatches to it for queens. */
export function queenUpdate(sim: Sim, q: Ant): void {
  if (isFoundingQueen(q) || !q.queen) return;
  // the queen never rests (GDD 02 §10.14): her laying budget would be lost while she stands
  if (q.state === 'rest') setState(sim, q, ENTRY);
  think(sim, q, ENTRY, step);
}

export function queenEnter(sim: Sim, q: Ant): void {
  if (!isFoundingQueen(q)) setState(sim, q, ENTRY);
}

export const queenBehaviour: Pick<Behaviour, 'enter' | 'update'> = { enter: queenEnter, update: queenUpdate };
