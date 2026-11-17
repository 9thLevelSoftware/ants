// The bird event (GDD 05 §2.6): a timed hazard at a mound or busy trail of the player colony. Approach 3.0 s
// (x telegraphMult: moving shadow and wingbeat), landed 20-40 s pecking every 1.5 s (0.5 s head-cock, aim = the ant's
// position then; kill if it is still within 3 mm, p 0.7; at most 12 kills x setting), then leaving. Only exposed
// ants (no overhead cover within 3 BU) are targeted. A major threat (threat director). Not an agent: its state is
// state.ecology.birdEvent, drawn by render-creatures from pos and phase.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, BirdEvent, CreatureVariant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { rngInt } from '@/core/rng';
import { zoneAt } from '@/sim/world';
import { retireSource } from '@/sim/ecology/sources';
import {
  BIRD_ALATE_P_PER_S, BIRD_ALATE_RADIUS_BU, BIRD_APPROACH_S, BIRD_DAY_MARGIN_H, BIRD_DURATION_S, BIRD_GAP_GD,
  BIRD_HEAD_COCK_S, BIRD_KILL_P, BIRD_KILL_RADIUS_MM, BIRD_LEAVE_S, BIRD_MAX_KILLS, BIRD_MIN_EXPOSED, BIRD_MIN_WORKERS,
  BIRD_PECK_EVERY_S, BIRD_TARGET_RADIUS_BU, EXPOSED_COVER_BU, LETHAL_DAMAGE, REF_BU_MM, STRIKE_ALARM,
  THREAT_BIRD, BIRD_CRUMBS_MAX, WOODPECKER_SHARE, WOODPECKER_CARVE_BU, WOODPECKER_CARVE_EVERY_S, WOODPECKER_CARVES_MAX,
} from '@/sim/balance/creatures';
import { difficultyValue } from '@/sim/balance/difficulty';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { between, chance, cue, dist, onSurface, rng, ticks } from './common';
import type { Conditions } from './conditions';
import { conditions } from './conditions';
import { endMajorThreat, requestMajorThreat } from './threat';
import { noteDangerEvent } from './danger';
import { ports } from './ports';

/** Candidate points examined for a bird target. */
const BIRD_CANDIDATES = 32;
const _ids: number[] = [];
const _p = { x: 0, y: 0, z: 0 };

/** GDD 06 "exposed": on the open surface with no solid within 3 BU straight above. */
export function isExposedAnt(sim: Sim, ant: Ant): boolean {
  if (!onSurface(ant)) return false;
  const step = sim.world.bu;
  for (let k = 1; k <= EXPOSED_COVER_BU; k++) {
    _p.x = ant.pos.x; _p.y = ant.pos.y + k * step; _p.z = ant.pos.z;
    if (sim.field.sample(_p) < 0) return false;
  }
  return true;
}

/** Exposed ants within r of p (optionally of one colony), ascending ids. */
export function exposedAntsNear(sim: Sim, p: Vec3, r: number, colonyId: number, out: Ant[]): Ant[] {
  out.length = 0;
  sim.index.queryAnts(p, r, _ids);
  _ids.sort((a, b) => a - b);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (a && (colonyId < 0 || a.colony === colonyId) && dist(a.pos, p) <= r && isExposedAnt(sim, a)) out.push(a);
  }
  return out;
}

const _ex: Ant[] = [];

/** The best target point (a mound entrance or an exposed ant) with >= 15 exposed colony ants within 25 BU, or null. */
export function birdTarget(sim: Sim, colonyId: number): Vec3 | null {
  const r = BIRD_TARGET_RADIUS_BU * REF_BU_MM;
  const candidates: Vec3[] = [];
  for (const n of sim.stores.nests.list) if (n.alive && n.colony === colonyId) for (const e of n.entrances) candidates.push(e.pos);
  const out: Vec3[] = [];
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === colonyId && onSurface(a)) out.push(a.pos);
  // trail segments: a sample of the exposed ants' positions (at most BIRD_CANDIDATES)
  const stride = Math.max(1, Math.ceil(out.length / BIRD_CANDIDATES));
  for (let i = 0; i < out.length; i += stride) candidates.push(out[i]);
  let best: Vec3 | null = null, bestN = BIRD_MIN_EXPOSED - 1;
  for (const p of candidates) {
    const n = exposedAntsNear(sim, p, r, colonyId, _ex).length;
    if (n > bestN) { bestN = n; best = p; }
  }
  return best ? { ...best } : null;
}

function variantAt(sim: Sim, p: Vec3, atMound: boolean): CreatureVariant {
  const z = zoneAt(sim.world, p.x, p.z);
  if ((z === 'forest' || z === 'lawn') && atMound && chance(sim, WOODPECKER_SHARE)) return 'woodpecker';
  return z === 'pavement' || z === 'asphalt' || z === 'sand' || z === 'rubber' ? 'sparrow' : 'thrush';
}

/** Starts a bird event at pos against a colony (no checks); returns the event. */
export function startBird(sim: Sim, colonyId: number, pos: Vec3, variant: CreatureVariant): BirdEvent {
  const now = sim.state.tick;
  const lead = Math.round(BIRD_APPROACH_S * conditions(sim).levers.telegraphMult * TICKS_PER_SECOND);
  const ev: BirdEvent = {
    variant, pos: { ...pos }, phase: 'approach', startTick: now, kills: 0, carves: 0, colonyId, landTick: now + lead,
    endTick: -1, nextPeckTick: -1, peckTargetId: -1, peckAim: null, nextCarveTick: -1,
  };
  sim.state.ecology.birdEvent = ev;
  sim.state.ecology.lastBirdTick[String(colonyId)] = now;
  sim.emit({ type: 'bird-approach', variant, pos: { ...pos } });
  cue(sim, 'ambient.bird', pos, 0.8);
  return ev;
}

/**
 * Hourly roll for the player colony; returns true when an event started. §2.6 gives BIRD_RATE per game day, and
 * birds only come in the daylight window SR + 1 h .. SS - 1 h, so each hourly roll in that window has
 * p = rate / (window hours): about `rate` events per day before the gap and threat-director gating.
 */
export function birdHourly(sim: Sim, cond: Conditions): boolean {
  if (sim.state.ecology.birdEvent || cond.raining || cond.winter) return false;
  const from = cond.sunrise + BIRD_DAY_MARGIN_H, to = cond.sunset - BIRD_DAY_MARGIN_H;
  if (cond.hour < from || cond.hour > to) return false;
  const windowH = Math.max(1, to - from);
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return false;
  let workers = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'worker') workers++;
  if (workers < BIRD_MIN_WORKERS) return false;
  const last = sim.state.ecology.lastBirdTick[String(col.id)] ?? -Infinity;
  if (sim.state.tick - last < BIRD_GAP_GD * TICKS_PER_DAY) return false;
  if (!chance(sim, Math.min(1, difficultyValue(sim, 'predatorDensityMult') / windowH))) return false; // = BIRD_RATE of the setting (same numbers as the density)
  const pos = birdTarget(sim, col.id);
  if (!pos) return false;
  // a blocked bird event is cancelled (§6)
  if (!requestMajorThreat(sim, THREAT_BIRD)) return false;
  const atMound = sim.state.nests.some((n) => n.alive && n.colony === col.id && n.entrances.some((e) => dist(e.pos, pos) < 1));
  startBird(sim, col.id, pos, variantAt(sim, pos, atMound));
  return true;
}

/** Debug trigger (`cheat.triggerBird`): `force` bypasses the director and the rate checks. */
export function triggerBird(sim: Sim, variant: CreatureVariant | null, pos: Vec3 | null, force: boolean): boolean {
  if (sim.state.ecology.birdEvent) return false;
  const col = sim.state.colonies.find((c) => c.alive && c.isPlayer);
  if (!col) return false;
  const at = pos ?? birdTarget(sim, col.id);
  if (!at) return false;
  if (!requestMajorThreat(sim, THREAT_BIRD)) {
    if (!force) return false;
    const td = sim.state.rivals.threatDirector;
    td.activeKind = THREAT_BIRD; td.activeSinceTick = sim.state.tick;
  }
  startBird(sim, col.id, at, variant ?? variantAt(sim, at, false));
  return true;
}

/** Kills that end a bird event: BIRD_MAX_KILLS x the Predators setting (GDD 05 §2.6; Few counts as 0.4). */
export function birdMaxKills(sim: Sim): number {
  return Math.max(1, Math.round(BIRD_MAX_KILLS * Math.max(conditions(sim).predatorMult, 0.4)));
}

/** One tick of the active bird event. */
export function birdTick(sim: Sim): void {
  const ev = sim.state.ecology.birdEvent;
  if (!ev) return;
  const now = sim.state.tick;
  const colonyId = ev.colonyId ?? -1;
  if (ev.phase === 'approach') {
    if (now < (ev.landTick ?? now)) return;
    ev.phase = 'landed';
    ev.endTick = now + ticks(between(sim, BIRD_DURATION_S));
    ev.nextPeckTick = now + ticks(BIRD_PECK_EVERY_S);
    ev.nextCarveTick = now + ticks(WOODPECKER_CARVE_EVERY_S);
    sim.emit({ type: 'bird-landed', variant: ev.variant, pos: { ...ev.pos } });
    cue(sim, 'bird-strike', ev.pos, 1);
    if (ev.variant === 'sparrow') eatCrumbs(sim, ev.pos);
    if (colonyId >= 0) ports.raiseAlarm(sim, colonyId, ev.pos, STRIKE_ALARM);
    return;
  }
  if (ev.phase === 'leaving') {
    if (now >= (ev.endTick ?? now)) endBird(sim, ev);
    return;
  }
  // landed
  if (now >= (ev.endTick ?? now) || ev.kills >= birdMaxKills(sim)) { ev.phase = 'leaving'; ev.endTick = now + ticks(BIRD_LEAVE_S); return; }
  const peck = ev.nextPeckTick ?? now;
  if (now === peck - ticks(BIRD_HEAD_COCK_S)) chooseTarget(sim, ev);
  if (now >= peck) { doPeck(sim, ev); ev.nextPeckTick = now + ticks(BIRD_PECK_EVERY_S); }
  if (ev.variant === 'woodpecker' && now >= (ev.nextCarveTick ?? now) && ev.carves < WOODPECKER_CARVES_MAX) woodpeckerCarve(sim, ev);
  alatesAtRisk(sim, ev);
}

/** Sparrow / pigeon: removes up to BIRD_CRUMBS_MAX crumb units within the target radius, nearest first. */
export function eatCrumbs(sim: Sim, pos: Vec3): number {
  const r = BIRD_TARGET_RADIUS_BU * REF_BU_MM;
  const crumbs = sim.stores.sources.list
    .filter((s) => s.alive && s.kind === 'crumb' && dist(s.pos, pos) <= r)
    .sort((a, b) => dist(a.pos, pos) - dist(b.pos, pos) || a.id - b.id);
  let left = BIRD_CRUMBS_MAX;
  for (const s of crumbs) {
    if (left <= 0) break;
    const take = Math.min(left, Math.floor(s.units));
    if (take <= 0) continue;
    left -= take;
    // whole crumb units; keep pool equal to units where it is used (as sources/def.ts setAmount does)
    s.units -= take;
    if (s.pool >= 0) s.pool = s.units;
    if (s.units < 1) retireSource(sim, s, 'bird');
  }
  return BIRD_CRUMBS_MAX - left;
}

/**
 * Woodpecker: every 5 s a 3 BU carve into the mound / entrance throat nearest the bird (up to 6). The carve itself
 * is the nest module's (nest.disturb is the T2 hook, a no-op until the nest module fills it: see the report).
 */
function woodpeckerCarve(sim: Sim, ev: BirdEvent): void {
  ev.carves++;
  ev.nextCarveTick = sim.state.tick + ticks(WOODPECKER_CARVE_EVERY_S);
  let at: Vec3 = ev.pos, best = Infinity;
  for (const n of sim.stores.nests.list) {
    if (!n.alive || n.colony !== (ev.colonyId ?? -1)) continue;
    for (const e of n.entrances) { const d = dist(e.pos, ev.pos); if (d < best) { best = d; at = e.pos; } }
  }
  ports.disturbNest(sim, { ...at }, WOODPECKER_CARVE_BU * sim.world.bu, 'woodpecker');
  cue(sim, 'bird-strike', at, 0.6);
}

function chooseTarget(sim: Sim, ev: BirdEvent): void {
  const list = exposedAntsNear(sim, ev.pos, BIRD_TARGET_RADIUS_BU * REF_BU_MM, -1, _ex);
  if (list.length === 0) { ev.peckTargetId = -1; ev.peckAim = null; return; }
  const a = list[rngInt(rng(sim), 0, list.length - 1)];
  ev.peckTargetId = a.id;
  ev.peckAim = { x: a.pos.x, y: a.pos.y, z: a.pos.z };
}

function doPeck(sim: Sim, ev: BirdEvent): void {
  const id = ev.peckTargetId ?? -1;
  const aim = ev.peckAim;
  ev.peckTargetId = -1; ev.peckAim = null;
  if (id < 0 || !aim) return;
  sim.emit({ type: 'bird-peck', variant: ev.variant, pos: { ...aim }, targetId: id });
  cue(sim, 'bird-strike', aim, 0.8);
  const a = sim.stores.ants.get(id);
  if (!a || dist(a.pos, aim) > BIRD_KILL_RADIUS_MM || !chance(sim, BIRD_KILL_P)) return;
  ports.applyDamage(sim, 'ant', a.id, LETHAL_DAMAGE, 'bird');
  if (!sim.stores.ants.has(a.id) || a.hp <= 0) { ev.kills++; noteDangerEvent(sim, a, aim, 'killed'); }
}

function alatesAtRisk(sim: Sim, ev: BirdEvent): void {
  if ((sim.state.tick % TICKS_PER_SECOND) !== 0) return;
  const r = BIRD_ALATE_RADIUS_BU * REF_BU_MM;
  sim.index.queryAnts(ev.pos, r, _ids);
  for (const id of _ids.sort((x, y) => x - y)) {
    const a = sim.stores.ants.get(id);
    if (a && (a.flags & AntFlag.WINGED) !== 0 && a.medium === 'air' && dist(a.pos, ev.pos) <= r && chance(sim, BIRD_ALATE_P_PER_S)) {
      ports.applyDamage(sim, 'ant', a.id, LETHAL_DAMAGE, 'bird');
    }
  }
}

function endBird(sim: Sim, ev: BirdEvent): void {
  sim.emit({ type: 'bird-left', variant: ev.variant, pos: { ...ev.pos }, kills: ev.kills });
  sim.state.ecology.birdEvent = null;
  endMajorThreat(sim, THREAT_BIRD);
}
