// Sites the architect may not use (GDD 03 §7.8): the blacklist (player-cancelled architect plans, written by the
// nest module's cancelPlan at the plan's anchor, and sites that failed repeatedly, recorded at the room's centre)
// and the failure strikes that lead to it. Candidates are tested by where they would dig (room centre or tunnel
// end), so a blacklisted room does not freeze every anchor of a small nest around it.

import type { Vec3 } from '@/core/math/vec3';
import type { ArchitectState, Sim } from '@/sim/types';
import { ARCH_BLACKLIST_S } from '@/sim/balance/nest';
import { ARCH_FAIL_STRIKES, ARCH_SITE_RADIUS_BU, ARCH_STRIKE_MEMORY_S } from '@/sim/balance/architect';
import { TICKS_PER_SECOND } from '@/sim/time';

const near = (a: Vec3, b: Vec3, r: number): boolean => (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + (a.z - b.z) ** 2 <= r * r;

/** Is p within the site radius of a blacklist entry that has not expired? */
export function isBlacklisted(sim: Sim, arch: ArchitectState, p: Vec3): boolean {
  const r = ARCH_SITE_RADIUS_BU * sim.world.bu, now = sim.state.tick;
  for (const b of arch.blacklist) if (b.untilTick > now && near(b.pos, p, r)) return true;
  return false;
}

/** Drops expired blacklist entries and forgotten strikes. */
export function pruneSites(sim: Sim, arch: ArchitectState): void {
  const now = sim.state.tick;
  if (arch.blacklist.some((b) => b.untilTick <= now)) arch.blacklist = arch.blacklist.filter((b) => b.untilTick > now);
  if (arch.failures?.some((f) => f.untilTick <= now)) arch.failures = arch.failures.filter((f) => f.untilTick > now);
}

/**
 * Counts one failure of the site at p. The ARCH_FAIL_STRIKES-th failure within the site radius blacklists it for
 * ARCH_BLACKLIST_S and clears its strikes. Returns true when the site was blacklisted now.
 */
export function recordSiteFailure(sim: Sim, arch: ArchitectState, p: Vec3): boolean {
  const T = TICKS_PER_SECOND, now = sim.state.tick, r = ARCH_SITE_RADIUS_BU * sim.world.bu;
  const failures = arch.failures ?? (arch.failures = []);
  let f = failures.find((x) => near(x.pos, p, r));
  if (!f) { f = { pos: { ...p }, count: 0, untilTick: 0 }; failures.push(f); }
  f.count++;
  f.untilTick = now + ARCH_STRIKE_MEMORY_S * T;
  if (f.count < ARCH_FAIL_STRIKES) return false;
  arch.blacklist.push({ pos: { ...f.pos }, untilTick: now + ARCH_BLACKLIST_S * T });
  arch.failures = failures.filter((x) => x !== f);
  return true;
}
