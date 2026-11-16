// Walking passes (GDD 04 §15.2 `footsteps`): soles land alternately ±lateral from the lane centreline with jitter,
// at the gait's step and speed; 2 % of steps linger (2-4 steps in place). A paw walk cycles four paws. Children
// (plans/children.ts) reuse walkFootfalls on their own random-walk polylines.

import { rngChance, rngFork, rngInt, rngRange, type RngState } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import {
  FOOT_CONTACT_S, FOOT_JITTER_MM, FOOT_LIFT_MM, FOOT_LINGER_P, FOOT_LINGER_STEPS, FOOT_PASS_S, GAIT, HUMAN_CUES,
} from '@/sim/balance/human';
import { TICKS_PER_SECOND } from '@/sim/time';
import { pointAlong, polylineLength, type Pt } from '../grid';
import { planY } from '../ground';
import { rectOfImpacts, type Actor, type ContactKind, type HumanPlan, type Impact } from '../plan';
import { siteById } from '../sites';
import { leadTicks } from './lead';

const at = { x: 0, z: 0, tx: 1, tz: 0 };

export interface WalkOptions {
  gait: keyof typeof GAIT;
  contact: ContactKind;
  /** Ticks of the first footfall. */
  t0: number;
  /** Floor height for interior lanes (NaN outdoors). */
  floorY: number;
  /** First actor index; feet use actor, actor + 1 (paws: four). */
  actor: number;
}

/** Footfalls along a polyline (all of it), appended to impacts / actors. Returns the tick after the last step. */
export function walkFootfalls(sim: Sim, rng: RngState, pts: readonly Pt[], o: WalkOptions, impacts: Impact[], actors: Actor[]): number {
  const g = GAIT[o.gait];
  const paw = o.gait === 'paw';
  const feet = paw ? 4 : 2;
  const kind = paw ? 'paw' : o.gait === 'child' ? 'child-shoe' : 'shoe';
  for (let f = 0; f < feet; f++) actors[o.actor + f] = { kind, scale: 1, side: f % 2 === 0 ? -1 : 1, keys: [] };
  const L = polylineLength(pts);
  const stepS = g.step / g.speed;
  let t = o.t0, k = 0;
  const place = (d: number, foot: number): void => {
    pointAlong(pts, d, at);
    const side = foot % 2 === 0 ? -1 : 1;
    const along = paw ? (foot < 2 ? 1 : -1) * g.step * 0.4 : 0;
    const lat = side * g.lateral + rngRange(rng, -FOOT_JITTER_MM, FOOT_JITTER_MM);
    const x = at.x + at.tx * along - at.tz * lat, z = at.z + at.tz * along + at.tx * lat;
    const yaw = Math.atan2(at.tz, at.tx);
    const y = planY(sim, x, z, o.floorY);
    impacts.push({ t, fp: { x, y, z, yaw, hx: g.soleL / 2, hz: g.soleW / 2, disc: false }, contact: o.contact, actor: o.actor + foot, value: 0 });
    const keys = actors[o.actor + foot].keys;
    const prev = keys[keys.length - 1];
    const swing = Math.round(stepS * TICKS_PER_SECOND);
    if (!prev) keys.push({ t: t - swing * 2, x, y, z, yaw, lift: FOOT_LIFT_MM * 4 });
    else keys.push({ t: Math.max(prev.t + 1, t - Math.round(swing / 2)), x: (prev.x + x) / 2, y: Math.max(prev.y, y), z: (prev.z + z) / 2, yaw, lift: FOOT_LIFT_MM });
    keys.push({ t, x, y, z, yaw, lift: 0 });
    keys.push({ t: t + Math.round(FOOT_CONTACT_S * TICKS_PER_SECOND), x, y, z, yaw, lift: 0 });
  };
  for (let d = g.step / 2; d <= L; d += g.step / (paw ? 2 : 1)) {
    place(d, k % feet);
    k++;
    t += Math.round((stepS / (paw ? 2 : 1)) * TICKS_PER_SECOND);
    if (rngChance(rng, FOOT_LINGER_P)) {
      const n = rngInt(rng, FOOT_LINGER_STEPS[0], FOOT_LINGER_STEPS[1]);
      for (let i = 0; i < n; i++) { place(d, k % feet); k++; t += Math.round(stepS * TICKS_PER_SECOND); }
    }
  }
  // lift every foot away at the end
  for (let f = 0; f < feet; f++) {
    const keys = actors[o.actor + f].keys, last = keys[keys.length - 1];
    if (last) keys.push({ ...last, t: last.t + Math.round(stepS * 2 * TICKS_PER_SECOND), lift: FOOT_LIFT_MM * 4 });
  }
  return t;
}

/** The part of a lane a pass walks (lane length / speed clamped to FOOT_PASS_S), maybe reversed. */
function passPolyline(rng: RngState, lane: readonly Pt[], speed: number): Pt[] {
  const pts = rngChance(rng, 0.5) ? [...lane].reverse() : [...lane];
  const L = polylineLength(pts), maxL = FOOT_PASS_S[1] * speed;
  if (L <= maxL) return pts;
  const off = rngRange(rng, 0, L - maxL);
  const out: Pt[] = [];
  const n = Math.max(2, Math.ceil(maxL / 250));
  for (let i = 0; i <= n; i++) { pointAlong(pts, off + (maxL * i) / n, at); out.push({ x: at.x, z: at.z }); }
  return out;
}

/** A straight lane through a point (cheat `at`), heading drawn from the rng. */
export function laneThrough(rng: RngState, p: Pt, lengthMm: number): Pt[] {
  const a = rngRange(rng, 0, Math.PI * 2), c = Math.cos(a), s = Math.sin(a), h = lengthMm / 2;
  return [{ x: p.x - c * h, z: p.z - s * h }, { x: p.x + c * h, z: p.z + s * h }];
}

export function buildFootsteps(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  const rng = rngFork(inst.seed, 'human.plan');
  const variant = inst.variant === 'child' || inst.variant === 'paw' ? inst.variant : 'adult';
  const g = GAIT[variant];
  let lane: Pt[] | null = null;
  if (inst.at) lane = laneThrough(rng, inst.at, g.speed * 6);
  else if (site && site.lanes.length > 0) lane = passPolyline(rng, site.lanes[rngInt(rng, 0, site.lanes.length - 1)], g.speed);
  if (!lane || lane.length < 2) return null;
  const cues = HUMAN_CUES.footsteps;
  const t0 = leadTicks(sim, cues);
  const impacts: Impact[] = [], actors: Actor[] = [];
  const contact: ContactKind = variant === 'paw' ? 'paw' : variant === 'child' ? 'child-shoe' : 'adult-shoe';
  const end = walkFootfalls(sim, rng, lane, { gait: variant, contact, t0, floorY: site?.y ?? NaN, actor: 0 }, impacts, actors);
  return {
    instId: inst.id, kind: 'footsteps', variant: inst.variant, firstT: t0, endT: end + TICKS_PER_SECOND * 2, impacts, actors,
    cues, area: rectOfImpacts(impacts, 2000), siteId: inst.regionId, extent: 0, resumeKey: null, resume: -1,
  };
}
