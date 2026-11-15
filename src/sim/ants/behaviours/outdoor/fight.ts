// The `fight` task (GDD 02 §10.13; behaviour and exit owned by GDD 05 §4; owner: combat). States:
//   fight.seek     no target in sight: run to the alarm source, look around; nothing for FIGHT_SEARCH_S -> resume
//   fight.close    walk (run) into contact with the target
//   fight.engage   in contact: spray once on first contact (formicines with charges to spare), take a hold while the
//                  target has fewer than FIGHT_HOLDERS_WANTED holders of our colony, otherwise bite on the cycle;
//                  holding ants wait (hold bites are the lock's, combat/system.ts)
// Every think: retreat rule first (-> flee), seized / paralysed ants do nothing (the creature module moves them).
// The rules themselves are the combat module's; this file only chooses primitives (shared with the player).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Behaviour, Sim, TargetRef } from '@/sim/types';
import {
  ALERT_AWARE_L, AWARE_L, FIGHT_HOLDERS_WANTED, FIGHT_LOSE_TARGET_S, FIGHT_SEARCH_S, FIGHT_SOURCE_ARRIVE_L,
  FIGHT_SPRAY_MIN_ACID, FIGHT_THINK_TICKS,
} from '@/sim/balance/combat';
import { begin, canDo, cancel, interruptible } from '@/sim/ants/actions';
import { navStop, navTo, navToTarget } from '@/sim/locomotion';
import {
  combatStats, endFight, fightSource, fightTarget, holdersOf, mayBite, retreatReason, setFightTarget, sprayDisabled,
  startRetreat,
} from '@/sim/combat';
import { secondsToTicks } from '@/sim/time';
import { logDecision } from './common';
import { hostileCreature } from './fightTargets';
import '@/sim/combat/wiring'; // binds combat's late dependencies (src/sim/combat/late.ts)

const TK_SEEN = 'cb.tSeen', SPRAYED = 'cb.sprayed', NAV_ID = 'cb.navId', NEXT_BITE = 'cb.biteNext';
const ids: number[] = [];
const hs: number[] = [];
const src = { x: 0, y: 0, z: 0 };

function setState(sim: Sim, ant: Ant, s: string): void {
  if (ant.state !== s) { ant.state = s; ant.stateTick = sim.state.tick; }
}

function lenMm(sim: Sim, ant: Ant): number {
  return ant.lengthBu * sim.world.bu;
}

type Tgt = { kind: 'ant' | 'creature'; id: number; pos: Vec3; radius: number };

function resolve(sim: Sim, ant: Ant, t: { kind: 'ant' | 'creature'; id: number }): Tgt | null {
  if (t.kind === 'ant') {
    const o = sim.stores.ants.get(t.id);
    return o && o.alive && o.colony !== ant.colony ? { kind: 'ant', id: o.id, pos: o.pos, radius: o.radius } : null;
  }
  const c = sim.stores.creatures.get(t.id);
  return c && c.alive ? { kind: 'creature', id: c.id, pos: c.pos, radius: c.radius } : null;
}

function d3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Nearest hostile within the awareness range: a foreign ant, else a hostile creature (ties by id). */
function nearestHostile(sim: Sim, ant: Ant): Tgt | null {
  const r = (ant.alarmLevel > 0 ? ALERT_AWARE_L : AWARE_L) * lenMm(sim, ant);
  let best: Tgt | null = null, bestD = Infinity;
  sim.index.queryAnts(ant.pos, r, ids);
  for (const id of ids) {
    const o = sim.stores.ants.get(id);
    if (!o || !o.alive || o.colony === ant.colony) continue;
    const d = d3(o.pos, ant.pos);
    if (d <= r && (d < bestD || (d === bestD && best && o.id < best.id))) { best = { kind: 'ant', id: o.id, pos: o.pos, radius: o.radius }; bestD = d; }
  }
  if (best) return best;
  sim.index.queryCreatures(ant.pos, r, ids);
  for (const id of ids) {
    const c = sim.stores.creatures.get(id);
    if (!c || !c.alive || !hostileCreature(sim, ant, c)) continue;
    const d = d3(c.pos, ant.pos);
    if (d <= r && d < bestD) { best = { kind: 'creature', id: c.id, pos: c.pos, radius: c.radius }; bestD = d; }
  }
  return best;
}

/** Turns the ant in its tangent plane to face p (heading only; locomotion owns position). */
function face(ant: Ant, p: Vec3): void {
  let dx = p.x - ant.pos.x, dy = p.y - ant.pos.y, dz = p.z - ant.pos.z;
  const k = dx * ant.up.x + dy * ant.up.y + dz * ant.up.z;
  dx -= k * ant.up.x; dy -= k * ant.up.y; dz -= k * ant.up.z;
  const l = Math.hypot(dx, dy, dz);
  if (l > 1e-6) { ant.fwd.x = dx / l; ant.fwd.y = dy / l; ant.fwd.z = dz / l; }
}

function ref(t: Tgt): TargetRef {
  return { kind: t.kind, id: t.id, pos: { x: t.pos.x, y: t.pos.y, z: t.pos.z } };
}

function approach(sim: Sim, ant: Ant, t: Tgt): void {
  setState(sim, ant, 'fight.close');
  const issued = ant.bb[NAV_ID] === t.id && ant.nav.status === 'moving';
  if (issued) return;
  ant.bb[NAV_ID] = t.id;
  const arrive = ant.radius + t.radius + 0.3 * lenMm(sim, ant);
  if (!navToTarget(sim, ant, ref(t), arrive, { speed: 'run' })) ant.bb[NAV_ID] = -1;
}

/** Same-colony holders of the target. */
function ownHolders(sim: Sim, ant: Ant, t: Tgt): number {
  const body = t.kind === 'ant' ? { kind: 'ant' as const, ant: sim.stores.ants.get(t.id)! } : { kind: 'creature' as const, c: sim.stores.creatures.get(t.id)! };
  let n = 0;
  for (const id of holdersOf(sim, body, hs)) if (sim.stores.ants.get(id)?.colony === ant.colony) n++;
  return n;
}

function tryAct(sim: Sim, ant: Ant, id: 'bite' | 'bite-hold' | 'spray-acid' | 'sting', t: TargetRef | null): boolean {
  if (!canDo(sim, ant, id, t).ok) return false;
  if (ant.nav.status === 'moving') navStop(sim, ant);
  return begin(sim, ant, id, t);
}

function engage(sim: Sim, ant: Ant, t: Tgt): void {
  setState(sim, ant, 'fight.engage');
  if (ant.action) return; // a strike, spray or hold is running
  const r = ref(t);
  const st = combatStats(sim, ant);
  // spray once on first contact while charges allow (always against a predator)
  if (st.special === 'spray' && (ant.bb[SPRAYED] ?? 0) === 0 && !sprayDisabled(ant)) {
    const enough = ant.acid >= FIGHT_SPRAY_MIN_ACID || (t.kind === 'creature' && ant.acid >= 1);
    if (enough && tryAct(sim, ant, 'spray-acid', null)) { ant.bb[SPRAYED] = 1; return; }
  }
  if (!mayBite(sim, ant, t.kind, t.id)) return;
  // myrmicines sting in contact when not holding (the sting would release the hold)
  if (st.special === 'sting' && !ant.combat?.lock && tryAct(sim, ant, 'sting', r)) return;
  if (ownHolders(sim, ant, t) < FIGHT_HOLDERS_WANTED && tryAct(sim, ant, 'bite-hold', r)) return;
  if (sim.state.tick < (ant.bb[NEXT_BITE] ?? 0)) return;
  if (tryAct(sim, ant, 'bite', r)) ant.bb[NEXT_BITE] = sim.state.tick + secondsToTicks(st.biteCycleS);
}

function seek(sim: Sim, ant: Ant): void {
  setState(sim, ant, 'fight.seek');
  const since = sim.state.tick - (ant.bb[TK_SEEN] ?? sim.state.tick);
  if (since > secondsToTicks(FIGHT_SEARCH_S)) { logDecision(sim, ant, 'timeout', -1); endFight(sim, ant, 'timeout'); return; }
  const p = fightSource(ant, src);
  if (!p) return;
  if (d3(p, ant.pos) <= FIGHT_SOURCE_ARRIVE_L * lenMm(sim, ant)) { if (ant.nav.status === 'moving') navStop(sim, ant); return; }
  if (ant.bb[NAV_ID] === -2 && ant.nav.status === 'moving') return;
  ant.bb[NAV_ID] = -2;
  navTo(sim, ant, { x: p.x, y: p.y, z: p.z }, FIGHT_SOURCE_ARRIVE_L * lenMm(sim, ant), { speed: 'run' });
}

function update(sim: Sim, ant: Ant): void {
  ant.thinkTick = sim.state.tick + FIGHT_THINK_TICKS;
  const cs = ant.combat;
  if (cs && (cs.seizedBy >= 0 || cs.paralysedUntilTick > sim.state.tick)) return;
  if (retreatReason(sim, ant)) { logDecision(sim, ant, 'threat', -1); startRetreat(sim, ant); return; }
  if (cs?.lock) {
    setFightTarget(ant, cs.lock.targetKind, cs.lock.targetId);
    ant.bb[TK_SEEN] = sim.state.tick;
    setState(sim, ant, 'fight.engage');
    return;
  }
  let t: Tgt | null = null;
  const known = fightTarget(ant);
  if (known) {
    t = resolve(sim, ant, known);
    const lost = sim.state.tick - (ant.bb[TK_SEEN] ?? sim.state.tick) > secondsToTicks(FIGHT_LOSE_TARGET_S);
    if (t && lost) t = null;
  }
  // a pinned ant can only bite a holder in its front
  if (cs?.pinned && cs.heldBy.length > 0) {
    const h = sim.stores.ants.get(cs.heldBy[0]);
    if (h) t = { kind: 'ant', id: h.id, pos: h.pos, radius: h.radius };
  }
  if (!t) t = nearestHostile(sim, ant);
  if (!t) { setFightTarget(ant, 'none', -1); seek(sim, ant); return; }
  setFightTarget(ant, t.kind, t.id);
  const contact = ant.radius + t.radius + 0.6 * lenMm(sim, ant);
  const dist = d3(t.pos, ant.pos);
  if (dist <= contact * 2) ant.bb[TK_SEEN] = sim.state.tick;
  if (dist <= contact) {
    face(ant, t.pos);
    if (canDo(sim, ant, 'bite', ref(t)).reason === 'out-of-reach' && !ant.action) { approach(sim, ant, t); return; }
    engage(sim, ant, t);
    return;
  }
  if (ant.action && interruptible(ant) && ant.action.id !== 'spray-acid') cancel(sim, ant, null);
  approach(sim, ant, t);
}

export const fightBehaviour: Behaviour = {
  task: 'fight',
  enter(sim, ant) {
    ant.bb[TK_SEEN] = sim.state.tick;
    ant.bb[SPRAYED] = 0;
    ant.bb[NAV_ID] = -1;
    setState(sim, ant, 'fight.seek');
    ant.thinkTick = sim.state.tick;
  },
  update,
  exit(sim, ant) {
    if (ant.action && interruptible(ant)) cancel(sim, ant, null);
    if (ant.nav.status === 'moving') navStop(sim, ant);
    delete ant.bb[SPRAYED]; delete ant.bb[NAV_ID]; delete ant.bb[NEXT_BITE];
  },
};
