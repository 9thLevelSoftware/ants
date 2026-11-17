// Shared effect helpers: who is inside a footprint, the contact plane and crevice rule, kill / stun / displace with
// the right cause and the grace and possession rules (GDD 04 §15.1, §15.4, §15.7), and the run's casualty tally.

import { rngChance, rngFloat, rngRange, type RngState } from '@/core/rng';
import type { Ant, HumanEventRun, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { AntFlag } from '@/sim/types';
import { applyDamage } from '@/sim/combat';
import { releaseCarried } from '@/sim/ants/actions';
import { placeOnSurface } from '@/sim/locomotion';
import { CRUSH_CREVICE_PROBE_BU, CRUSH_SAFE_DEPTH_BU, HUMAN_GRACE_GD, HUMAN_GRACE_RADIUS_BU } from '@/sim/balance/human';
import { difficultyValue, OPENING_GRACE_REF_GD } from '@/sim/balance/difficulty';
import { TICKS_PER_DAY, TICKS_PER_SECOND } from '@/sim/time';
import { surfaceY } from '../ground';
import { footprintRadius, inFootprint, type Footprint } from '../plan';
import { possessedSpared } from '../rules';

/** ant.bb key shared with creatures and combat (ecology/creatures/common.ts BB_STUNNED). */
export const BB_STUNNED = 'cr.stunUntil';
/** ant.bb key: tick until which a tumbling ant keeps still (read by behaviours like the stun). */
export const BB_HUMAN_HIT = 'he.hitTick';

export function humanRng(sim: Sim): RngState {
  return sim.stream('rng.events.human');
}

const ids: number[] = [];
const q: Vec3 = { x: 0, y: 0, z: 0 };

/** Highest surface under the footprint (centre and four inner points), mm: the plane a sole or a tyre rests on. */
export function contactPlane(sim: Sim, fp: Footprint, floorY = NaN): number {
  let y = -Infinity;
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  for (const [u, v] of [[0, 0], [0.5, 0.5], [0.5, -0.5], [-0.5, 0.5], [-0.5, -0.5]]) {
    const lx = u * fp.hx, lz = v * (fp.disc ? fp.hx : fp.hz);
    y = Math.max(y, surfaceY(sim, fp.x + lx * c - lz * s, fp.z + lx * s + lz * c, floorY));
  }
  return y;
}

/** Ground point under an ant (position minus the foot offset along its up). */
export function antGround(ant: Ant, out: Vec3): Vec3 {
  out.x = ant.pos.x - ant.up.x * ant.footOffset;
  out.y = ant.pos.y - ant.up.y * ant.footOffset;
  out.z = ant.pos.z - ant.up.z * ant.footOffset;
  return out;
}

/** Live ants whose XZ position lies inside the footprint (and within `dy` above / below the plane). */
export function antsIn(sim: Sim, fp: Footprint, plane: number, dyUp: number): Ant[] {
  q.x = fp.x; q.y = plane; q.z = fp.z;
  sim.index.queryAnts(q, footprintRadius(fp) + dyUp + sim.world.bu * 4, ids);
  const out: Ant[] = [];
  for (const id of ids) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive || !inFootprint(fp, a.pos.x, a.pos.z)) continue;
    if (a.pos.y > plane + dyUp) continue;
    out.push(a);
  }
  return out;
}

const RING_DIRS = Array.from({ length: 8 }, (_, i) => [Math.cos((i * Math.PI) / 4), Math.sin((i * Math.PI) / 4)] as const);

/**
 * Where the sole (tyre, wheel) comes to rest above a ground point: the highest surface on small rings around it,
 * never above the footprint's top plane. On a slope or bumpy ground this is the ground itself (within a fraction of
 * a millimetre); in a joint or a crack it is the rim the sole bridges.
 */
export function restHeightAt(sim: Sim, x: number, z: number, plane: number, floorY = NaN): number {
  let y = -Infinity;
  for (const rBu of CRUSH_CREVICE_PROBE_BU) {
    const r = rBu * sim.world.bu;
    for (const [dx, dz] of RING_DIRS) {
      y = Math.max(y, surfaceY(sim, x + dx * r, z + dz * r, floorY));
      if (y >= plane) return plane;
    }
  }
  return y;
}

/**
 * In a nest, a carved cavity, or in a crevice / joint / crack at least CRUSH_SAFE_DEPTH_BU below where the contact
 * rests over it (GDD 04 §15.4). Being below the footprint's highest point alone is not shelter: on a slope the
 * downhill end of a sole is lower than its uphill end and still crushes.
 */
export function shelteredBelow(sim: Sim, ant: Ant, plane: number, floorY = NaN): boolean {
  if (ant.nestId >= 0 || ant.medium === 'cavity') return true;
  const safe = CRUSH_SAFE_DEPTH_BU * sim.world.bu;
  const gp = antGround(ant, q);
  if (gp.y >= plane - safe) return false;
  const gx = gp.x, gy = gp.y, gz = gp.z;
  return gy < restHeightAt(sim, gx, gz, plane, floorY) - safe;
}

/** HUMAN_GRACE_GD: no lethal effect near the founding queen at the start of a new game. */
export function inGrace(sim: Sim, p: Vec3): boolean {
  if (sim.state.tick > HUMAN_GRACE_GD * (difficultyValue(sim, 'openingGraceGd') / OPENING_GRACE_REF_GD) * TICKS_PER_DAY) return false; // gentle 2x, harsh 0.5x
  const col = sim.state.colonies[0];
  const queen = col ? sim.stores.ants.get(col.queenId) : undefined;
  if (!queen) return false;
  return Math.hypot(queen.pos.x - p.x, queen.pos.z - p.z) <= HUMAN_GRACE_RADIUS_BU * sim.world.bu;
}

export function isPossessedAnt(ant: Ant): boolean {
  return (ant.flags & AntFlag.POSSESSED) !== 0;
}

/** The possessed ant holds on (grip action or held grip input): immune to being thrown or tumbled. */
export function isGripping(sim: Sim, ant: Ant): boolean {
  if (!isPossessedAnt(ant)) return false;
  const intent = sim.state.player.intent as { grip?: boolean };
  return ant.action?.id === 'grip' || intent.grip === true;
}

function tally(run: HumanEventRun, key: 'killed' | 'displaced' | 'itemsRemoved', n = 1): void {
  run[key] = (run[key] ?? 0) + n;
}
export const countRemoved = (run: HumanEventRun, n: number): void => tally(run, 'itemsRemoved', n);

/** Stuns an ant (no action, it holds still) and makes it drop what it carries. */
export function stunAnt(sim: Sim, ant: Ant, seconds: number): void {
  const until = sim.state.tick + Math.round(seconds * TICKS_PER_SECOND);
  ant.bb[BB_STUNNED] = Math.max(ant.bb[BB_STUNNED] ?? 0, until);
  ant.bb[BB_HUMAN_HIT] = sim.state.tick;
  if (ant.carry.kind !== 'none') releaseCarried(sim, ant, antGround(ant, { x: 0, y: 0, z: 0 }));
}

/** Moves an ant by (dx, dz) onto the nearest surface (thrown, swept, tumbled); false if no surface there. */
export function displaceAnt(sim: Sim, run: HumanEventRun, ant: Ant, dx: number, dz: number): boolean {
  if (isGripping(sim, ant)) return false;
  const x = Math.min(sim.world.size - 1, Math.max(1, ant.pos.x + dx)), z = Math.min(sim.world.size - 1, Math.max(1, ant.pos.z + dz));
  const y = surfaceY(sim, x, z) + sim.world.bu;
  const ok = placeOnSurface(sim, ant, { x, y, z });
  if (ok) tally(run, 'displaced');
  return ok;
}

/** A random horizontal displacement of length in [lo, hi] mm. */
export function randomShove(rng: RngState, lo: number, hi: number): { dx: number; dz: number } {
  const a = rngFloat(rng) * Math.PI * 2, d = rngRange(rng, lo, hi);
  return { dx: Math.cos(a) * d, dz: Math.sin(a) * d };
}

/**
 * A lethal hit with probability p (difficulty applied by the caller): death by `cause` through the combat module,
 * or survival (stunned `stunS`, carried load dropped). Grace and the gentle possession rule turn death into a stun
 * and a shove. Returns true when the ant died.
 */
export function lethalHit(sim: Sim, run: HumanEventRun, ant: Ant, p: number, stunS: number, cause: 'crushed' | 'drowning' = 'crushed'): boolean {
  const rng = humanRng(sim);
  const dies = rngChance(rng, p);
  if (dies && !inGrace(sim, ant.pos) && !(isPossessedAnt(ant) && possessedSpared(sim))) {
    applyDamage(sim, 'ant', ant.id, ant.maxHp * 100 + 100, cause);
    if (!ant.alive || ant.hp <= 0) { tally(run, 'killed'); return true; }
  }
  stunAnt(sim, ant, stunS);
  if (dies) { const s = randomShove(rng, 2 * sim.world.bu, 6 * sim.world.bu); displaceAnt(sim, run, ant, s.dx, s.dz); }
  return false;
}
