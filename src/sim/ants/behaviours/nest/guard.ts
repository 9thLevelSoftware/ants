// `guard` (GDD 02 §10.9, Tier 2): hold a post at an entrance rim, antennate passers, and on a non-nestmate or
// predator contact raise the alarm with the `release-alarm` primitive. Fighting is the combat module's: it plugs
// in through registerGuardEngage (called with the guard and the intruder); without it the guard returns to post.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { GUARD_CONTACT_BU, GUARD_CREATURE_BU, GUARD_RIM_BU, GUARD_SHIFT_S } from '@/sim/balance/nestwork';
import { secondsToTicks } from '@/sim/time';
import { endCycle, primitiveDone, recover, releaseAll, think } from './common';
import { bbv, setState, waitThink } from './fsm';
import { homeNest } from './places';
import { act, entity, travel } from './travel';

const ENTRY = 'guard.post';
const ids: number[] = [];

/** Combat hook: called when a guard raised the alarm on an intruder (kind 'ant' or 'creature'). */
export type GuardEngage = (sim: Sim, guard: Ant, intruder: { kind: 'ant' | 'creature'; id: number }) => void;
const engageHooks = new WeakMap<Sim, GuardEngage>();

/** Lets the combat module take over from a guard that raised the alarm (fight engagement, GDD 02 §10.13). */
export function registerGuardEngage(sim: Sim, fn: GuardEngage | null): void {
  if (fn) engageHooks.set(sim, fn); else engageHooks.delete(sim);
}

/** A non-nestmate ant in contact or a creature within the watch radius, or null. */
function intruder(sim: Sim, ant: Ant): { kind: 'ant' | 'creature'; id: number } | null {
  const bu = sim.world.bu;
  ids.length = 0;
  sim.index.queryAnts(ant.pos, GUARD_CONTACT_BU * bu, ids);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (o && o.alive && o.colony !== ant.colony) return { kind: 'ant', id };
  }
  ids.length = 0;
  sim.index.queryCreatures(ant.pos, GUARD_CREATURE_BU * bu, ids);
  for (const id of ids) {
    const c = sim.stores.creatures.get(id);
    if (c && c.alive && c.kind !== 'aphid') return { kind: 'creature', id };
  }
  return null;
}

function post(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const open = nest ? nest.entrances.filter((e) => e.status === 'open') : [];
  if (!nest || open.length === 0) { endCycle(sim, ant, ENTRY); return; }
  const e = open[ant.id % open.length];
  const st = travel(sim, ant, entity('entrance', e.id, e.pos), GUARD_RIM_BU * sim.world.bu);
  if (st === 'failed') { recover(sim, ant, ENTRY, 'stuck', true); return; }
  if (st === 'arrived') {
    const who = intruder(sim, ant);
    if (who) {
      ant.bb['bn.ik'] = who.kind === 'ant' ? 1 : 2;
      ant.bb['bn.ii'] = who.id;
      setState(sim, ant, 'guard.alarm-raise', 'threat');
      return;
    }
    waitThink(sim, ant);
  }
  if (sim.state.tick - ant.stateTick > secondsToTicks(GUARD_SHIFT_S)) endCycle(sim, ant, ENTRY);
}

function alarmRaise(sim: Sim, ant: Ant): void {
  if (bbv(ant, 'bn.bg', 0) === 0) {
    if (act(sim, ant, 'release-alarm', null)) return;
    // refused (the gland is on cooldown): wait it out here while the intruder is still about, else back to post
    if (intruder(sim, ant)) waitThink(sim, ant);
    else setState(sim, ant, ENTRY, 'alarm');
    return;
  }
  if (!primitiveDone(ant)) return;
  const fn = engageHooks.get(sim);
  if (fn) fn(sim, ant, { kind: bbv(ant, 'bn.ik', 1) === 1 ? 'ant' : 'creature', id: bbv(ant, 'bn.ii') });
  if (ant.state === 'guard.alarm-raise') setState(sim, ant, ENTRY, 'alarm');
}

function step(sim: Sim, ant: Ant): void {
  if (ant.state === 'guard.alarm-raise') alarmRaise(sim, ant);
  else if (ant.state !== ENTRY) setState(sim, ant, ENTRY);
  else post(sim, ant);
}

export const guardBehaviour: Behaviour = {
  task: 'guard',
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
};
