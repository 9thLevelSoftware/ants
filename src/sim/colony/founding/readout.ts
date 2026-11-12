// The site read-out while searching (GDD 06 §5.7): holding `sniff` (T) for 1.2 s, or standing still for 1.5 s with
// the head over diggable ground (not on Harsh), assesses the ground under the antennae; the read-out persists while
// the queen stays within 8 BU and refreshes every 0.5 s. The values go into player.opening (siteFactors, siteQ,
// siteWord) and event `opening.site-assessed`; once the dig starts they hold the dig site's values.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, OpeningState, Sim } from '@/sim/types';
import {
  SITE_AUTO_STILL_S, SITE_KEEP_RADIUS_BU, SITE_REFRESH_S, SITE_SNIFF_HOLD_S, SITE_STILL_SPEED_BU_S,
} from '@/sim/balance/founding';
import { TICKS_PER_SECOND } from '@/sim/time';
import { FB, bbGet, bbSet, queenOf } from './access';
import { assessSite, type SiteReading } from './siteAssess';

/** Point under the antennae: half a body length ahead of the body centre. */
export function headPoint(sim: Sim, q: Ant): Vec3 {
  const d = 0.5 * q.lengthBu * sim.world.bu;
  return { x: q.pos.x + q.fwd.x * d, y: q.pos.y, z: q.pos.z + q.fwd.z * d };
}

/** Writes a reading into the opening record and announces it. */
export function publishReading(sim: Sim, op: OpeningState, r: SiteReading): void {
  // the raw soil moisture and cell temperature name the moisture and warmth words (dry ... wet, cold ... hot)
  const q = queenOf(sim);
  if (q && q.alive) { bbSet(q, FB.siteTheta, r.raw.theta); bbSet(q, FB.siteTempC, r.raw.tempC); }
  op.siteFactors = r.factors.slice();
  op.siteQ = r.q;
  op.siteWord = r.word;
  sim.emit({ type: 'opening.site-assessed', point: r.point, factors: r.factors.slice(), q: r.q, word: r.word });
  if (r.factors[0] > 0) sim.emit({ type: 'hint-trigger', hintId: 'hint-dig' });
}

/** Is a read-out showing now (started and the queen still within reach of its point)? */
export function readoutActive(sim: Sim, q: Ant): boolean {
  if (bbGet(q, FB.siteTick, -1) < 0) return false;
  const dx = q.pos.x - bbGet(q, FB.siteX, 0), dz = q.pos.z - bbGet(q, FB.siteZ, 0);
  return Math.hypot(dx, dz) <= SITE_KEEP_RADIUS_BU * sim.world.bu;
}

function start(sim: Sim, op: OpeningState, q: Ant): void {
  const r = assessSite(sim, headPoint(sim, q));
  bbSet(q, FB.siteX, r.point.x); bbSet(q, FB.siteY, r.point.y); bbSet(q, FB.siteZ, r.point.z);
  bbSet(q, FB.siteTick, sim.state.tick);
  publishReading(sim, op, r);
}

/** One tick of the read-out logic in the `search` phase. */
export function readoutTick(sim: Sim, op: OpeningState, q: Ant): void {
  const bu = sim.world.bu;
  const sniffing = q.action !== null && q.action.id === 'sniff';
  bbSet(q, FB.sniffTicks, sniffing ? bbGet(q, FB.sniffTicks, 0) + 1 : 0);
  const still = q.speed < SITE_STILL_SPEED_BU_S * bu && q.medium === 'surface';
  bbSet(q, FB.stillTicks, still ? bbGet(q, FB.stillTicks, 0) + 1 : 0);
  const active = readoutActive(sim, q);
  if (!active && bbGet(q, FB.siteTick, -1) >= 0) bbSet(q, FB.siteTick, -1);
  const sniffed = bbGet(q, FB.sniffTicks, 0) === Math.round(SITE_SNIFF_HOLD_S * TICKS_PER_SECOND);
  const autoOk = sim.state.config.difficulty.preset !== 'harsh';
  const stood = autoOk && bbGet(q, FB.stillTicks, 0) === Math.round(SITE_AUTO_STILL_S * TICKS_PER_SECOND);
  if (sniffed || (stood && !active)) { start(sim, op, q); return; }
  if (active && (sim.state.tick - bbGet(q, FB.siteTick, 0)) % Math.round(SITE_REFRESH_S * TICKS_PER_SECOND) === 0) {
    publishReading(sim, op, assessSite(sim, headPoint(sim, q)));
  }
}

/** The dig site's reading (stored when the dig starts: the read-out then shows the chamber's Q). */
export function assessDigSite(sim: Sim, op: OpeningState, p: Vec3): void {
  publishReading(sim, op, assessSite(sim, p));
}
