// Grapple locks, contact slots and pins (GDD 05 §4.3). A lock is held by the holder ant (`combat.lock`); an ant
// target lists its holders in `combat.heldBy`; creature targets are found by scanning nearby ants' locks (the
// creature module counts holders the same way). Pins are recomputed whenever a lock is made or broken.

import type { Ant, Creature, Sim } from '@/sim/types';
import {
  HIT_CHANCE_FREE, HIT_CHANCE_HELPLESS, HIT_SIZE_CLAMP, HOLD_FIRST_BITE_S, HOLDER_SEARCH_BU, HOLDER_SEARCH_SIZE_MULT, PIN_FRONT_HALF_DEG, PIN_MIN_HOLDERS, PIN_PULL_RATIO,
  SLOTS_MAX, SLOTS_MIN, SLOTS_PER_LEN, TUNNEL_CLOSED_PROBES, TUNNEL_FREE_RADIUS_L, TUNNEL_SLOTS,
} from '@/sim/balance/combat';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { rngFloat } from '@/core/rng';
import { creaturePull } from '@/sim/ecology/creatures/queries';
import { preyEvades } from '@/sim/ecology/creatures';
import { combatStats } from './stats';
import { noteFightActivity } from './fightRecord';
import {
  antLenMm, type Body, bodyLenMm, bodyOf, bodyPos, CB, combatFlags, ensureCombat, isParalysed, isSeized, isStunned,
  rng, ticksOf,
} from './state';

const ids: number[] = [];
const probe = { x: 0, y: 0, z: 0 };
const origin = { x: 0, y: 0, z: 0 };

/** Pull of a body (ants: 3 m^(2/3) or the caste value; creatures: their catalogue pull). */
export function pullOf(sim: Sim, b: Body): number {
  return b.kind === 'ant' ? combatStats(sim, b.ant).pull : creaturePull(b.c);
}

/** Ids of the ants holding a creature (ascending). */
export function creatureHolders(sim: Sim, c: Creature, out: number[]): number[] {
  out.length = 0;
  const r = c.radius + HOLDER_SEARCH_SIZE_MULT * (CREATURE_STATS[c.kind]?.sizeMm ?? c.radius * 2) + HOLDER_SEARCH_BU * sim.world.bu;
  sim.index.queryAnts(c.pos, r, ids);
  for (let i = 0; i < ids.length; i++) {
    const a = sim.stores.ants.get(ids[i]);
    const l = a?.alive ? a.combat?.lock : null;
    if (l && l.targetKind === 'creature' && l.targetId === c.id) out.push(a!.id);
  }
  out.sort((x, y) => x - y);
  return out;
}

/** Living holders of a body, ascending ids. */
export function holdersOf(sim: Sim, b: Body, out: number[]): number[] {
  if (b.kind === 'creature') return creatureHolders(sim, b.c, out);
  out.length = 0;
  const held = b.ant.combat?.heldBy ?? [];
  for (const id of held) {
    const h = sim.stores.ants.get(id);
    if (h && h.alive && h.combat?.lock?.targetKind === 'ant' && h.combat.lock.targetId === b.ant.id) out.push(id);
  }
  out.sort((x, y) => x - y);
  return out;
}

const holderScratch: number[] = [];

/** Speed left to a held body: max(0, 1 - Σ pull_h / pull_t) (1 when free; §4.3 movement under locks). */
export function heldSpeedFactor(sim: Sim, b: Body): number {
  if (holdersOf(sim, b, holderScratch).length === 0) return 1;
  const p = pullOf(sim, b);
  return p > 0 ? Math.max(0, 1 - holdersPull(sim, b) / p) : 0;
}

/** Σ pull of the holders of a body. */
export function holdersPull(sim: Sim, b: Body): number {
  let s = 0;
  for (const id of holdersOf(sim, b, holderScratch)) {
    const h = sim.stores.ants.get(id);
    if (h) s += combatStats(sim, h).pull;
  }
  return s;
}

/** Pinned: at least two holders whose pull is at least 1.5 x the target's. */
export function computePinned(sim: Sim, b: Body): boolean {
  const n = holdersOf(sim, b, holderScratch).length;
  return n >= PIN_MIN_HOLDERS && holdersPull(sim, b) >= PIN_PULL_RATIO * pullOf(sim, b) - 1e-9;
}

export function isPinned(sim: Sim, b: Body): boolean {
  return b.kind === 'ant' ? !!b.ant.combat?.pinned : (b.c.bb['cb.pin'] ?? 0) === 1;
}

/** Recomputes the pin of a body; emits `combat-pin` (holder = the lock that completed it) when it becomes pinned. */
export function updatePin(sim: Sim, b: Body, byHolder: number): void {
  const now = computePinned(sim, b);
  const before = isPinned(sim, b);
  if (b.kind === 'ant') {
    if (!now && !b.ant.combat) return;
    ensureCombat(b.ant).pinned = now;
  } else {
    if (now) b.c.bb['cb.pin'] = 1;
    else delete b.c.bb['cb.pin'];
    const n = creatureHolders(sim, b.c, holderScratch).length;
    if (n > 0) b.c.bb['cb.nh'] = n; else delete b.c.bb['cb.nh'];
  }
  if (now && !before) {
    const id = b.kind === 'ant' ? b.ant.id : b.c.id;
    sim.emit({ type: 'combat-pin', holderId: byHolder, targetId: id });
  }
}

/** A target that cannot defend itself: pinned, seized by a predator or paralysed (hit chance 1.0). */
export function isHelpless(sim: Sim, b: Body): boolean {
  if (isPinned(sim, b)) return true;
  return b.kind === 'ant' && (isSeized(b.ant) || isParalysed(sim, b.ant));
}

/**
 * Tunnel test for the slot cap: the target stands in carved space and the free radius around its body is below
 * TUNNEL_FREE_RADIUS_L in at least two of five probe directions (forward, back, both sides, up), so a tunnel
 * counts whichever way the body faces in it; a chamber (8-16 BU wide, 2.5 BU high) leaves them free.
 */
export function inTunnel(sim: Sim, b: Body, lenMm: number): boolean {
  if (b.kind === 'ant' ? b.ant.medium !== 'cavity' : b.c.medium !== 'cavity') return false;
  const w = b.kind === 'ant' ? b.ant : b.c;
  const r = TUNNEL_FREE_RADIUS_L * lenMm;
  const f = w.fwd, u = w.up;
  const sx = f.y * u.z - f.z * u.y, sy = f.z * u.x - f.x * u.z, sz = f.x * u.y - f.y * u.x;
  const dirs = [[f.x, f.y, f.z], [-f.x, -f.y, -f.z], [sx, sy, sz], [-sx, -sy, -sz], [u.x, u.y, u.z]];
  // probe from half a body length above the feet (mid-height of a 2 BU tunnel), not along the curved floor
  const ox = w.pos.x + u.x * 0.5 * lenMm, oy = w.pos.y + u.y * 0.5 * lenMm, oz = w.pos.z + u.z * 0.5 * lenMm;
  origin.x = ox; origin.y = oy; origin.z = oz;
  let closed = 0;
  for (const [dx, dy, dz] of dirs) {
    probe.x = ox + dx * r; probe.y = oy + dy * r; probe.z = oz + dz * r;
    if (!sim.field.segmentFree(origin, probe, 0)) closed++;
  }
  return closed >= TUNNEL_CLOSED_PROBES;
}

/** Contact slots of the target for this attacker. */
export function slotsFor(sim: Sim, holder: Ant, b: Body): number {
  const aLen = antLenMm(sim, holder), tLen = bodyLenMm(sim, b);
  const n = Math.min(SLOTS_MAX, Math.max(SLOTS_MIN, Math.round((SLOTS_PER_LEN * tLen) / aLen)));
  return inTunnel(sim, b, aLen) ? Math.min(n, TUNNEL_SLOTS) : n;
}

/** Hit chance of an attempt against a free (not held by this attacker) target, before disorientation / dodge. */
export function freeHitChance(sim: Sim, attacker: Ant, b: Body): number {
  if (isHelpless(sim, b)) return HIT_CHANCE_HELPLESS;
  const ratio = Math.sqrt(bodyLenMm(sim, b) / antLenMm(sim, attacker));
  return HIT_CHANCE_FREE * Math.min(HIT_SIZE_CLAMP[1], Math.max(HIT_SIZE_CLAMP[0], ratio));
}

/** Rolls a probability on the combat stream (noRng: always succeeds). */
export function roll(sim: Sim, p: number): boolean {
  if (combatFlags(sim).noRng) return p > 0;
  return p >= 1 || rngFloat(rng(sim)) < p;
}

/**
 * The holder grabs the target (a hitting `bite-hold`, §4.3): needs a free contact slot and a hit (free-target hit
 * chance; 1.0 against a pinned / seized / paralysed target). False when the holder is stunned, the target is gone
 * or evades, no slot is free or the grab missed. Reach is the action library's check.
 */
export function beginGrapple(sim: Sim, holderId: number, targetKind: 'ant' | 'creature', targetId: number): boolean {
  const holder = sim.stores.ants.get(holderId);
  const b = bodyOf(sim, targetKind, targetId);
  if (!holder || !holder.alive || !b || isStunned(sim, holder)) return false;
  if (b.kind === 'ant' && b.ant.colony === holder.colony) return false;
  const cs = ensureCombat(holder);
  if (cs.lock) return cs.lock.targetKind === targetKind && cs.lock.targetId === targetId;
  if (cs.pinned && !frontHolder(sim, holder, targetKind, targetId)) return false;
  const held = holdersOf(sim, b, holderScratch);
  if (held.length >= slotsFor(sim, holder, b)) return false;
  if (b.kind === 'creature' && preyEvades(sim, targetId, holderId)) return false;
  if (!roll(sim, freeHitChance(sim, holder, b))) return false;
  let slot = 0;
  const used = new Set<number>();
  for (const id of held) {
    const l = sim.stores.ants.get(id)?.combat?.lock;
    if (l) used.add(l.slot);
  }
  while (used.has(slot)) slot++;
  cs.lock = { targetKind, targetId, slot };
  const now = sim.state.tick;
  holder.bb[CB.holdNext] = now + ticksOf(HOLD_FIRST_BITE_S);
  holder.bb[CB.lockTick] = now;
  holder.bb[CB.lastDmg] = now;
  if (b.kind === 'ant') {
    const tcs = ensureCombat(b.ant);
    if (!tcs.heldBy.includes(holderId)) tcs.heldBy.push(holderId);
    if (b.ant.bb[CB.shakeNext] === undefined || b.ant.bb[CB.shakeNext] < now) b.ant.bb[CB.shakeNext] = now + ticksOf(1);
    noteFightActivity(sim, b.ant);
  }
  noteFightActivity(sim, holder);
  sim.emit({ type: 'combat-lock', holderId, targetId });
  updatePin(sim, b, holderId);
  return true;
}

/** Releases the holder's lock, if any (`combat-unlock`), and recomputes the target's pin. */
export function releaseGrapple(sim: Sim, holderId: number): void {
  const holder = sim.stores.ants.get(holderId) ?? sim.state.ants.find((a) => a.id === holderId);
  const lock = holder?.combat?.lock;
  if (!holder || !lock) return;
  holder.combat!.lock = null;
  delete holder.bb[CB.holdNext];
  if (lock.targetKind === 'ant') {
    const t = sim.stores.ants.get(lock.targetId);
    if (t?.combat) t.combat.heldBy = t.combat.heldBy.filter((id) => id !== holderId);
  }
  sim.emit({ type: 'combat-unlock', holderId, targetId: lock.targetId });
  const b = bodyOf(sim, lock.targetKind, lock.targetId);
  if (b) updatePin(sim, b, holderId);
}

/** Ends every lock on a body (it died, despawned or is out of reach of the rules). */
export function releaseAllOn(sim: Sim, kind: 'ant' | 'creature', id: number, around: Body | null): void {
  const list: number[] = [];
  if (kind === 'ant') {
    const t = sim.stores.ants.get(id) ?? sim.state.ants.find((a) => a.id === id);
    for (const h of t?.combat?.heldBy ?? []) list.push(h);
    if (t?.combat) t.combat.heldBy = [];
  } else if (around && around.kind === 'creature') creatureHolders(sim, around.c, list);
  for (const h of list) {
    const a = sim.stores.ants.get(h);
    if (a?.combat?.lock && a.combat.lock.targetKind === kind && a.combat.lock.targetId === id) releaseGrapple(sim, h);
  }
  if (kind === 'ant') {
    const t = sim.stores.ants.get(id);
    if (t?.combat) t.combat.pinned = false;
  }
}

/**
 * A pinned ant may only bite (or grab) a holder standing in its front 60° (§4.3). True when the target is such a
 * holder.
 */
export function frontHolder(sim: Sim, ant: Ant, kind: string, id: number): boolean {
  if (kind !== 'ant' || !ant.combat?.heldBy.includes(id)) return false;
  const h = sim.stores.ants.get(id);
  if (!h) return false;
  const p = bodyPos({ kind: 'ant', ant: h });
  const dx = p.x - ant.pos.x, dy = p.y - ant.pos.y, dz = p.z - ant.pos.z;
  const l = Math.hypot(dx, dy, dz);
  if (l < 1e-6) return true;
  const c = (dx * ant.fwd.x + dy * ant.fwd.y + dz * ant.fwd.z) / l;
  return c >= Math.cos((PIN_FRONT_HALF_DEG * Math.PI) / 180);
}

/** The body a holder holds, or null. */
export function lockedBody(sim: Sim, holder: Ant): Body | null {
  const l = holder.combat?.lock;
  return l ? bodyOf(sim, l.targetKind, l.targetId) : null;
}
