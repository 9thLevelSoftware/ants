// Cars (GDD 04 §15.2): an arrival drives from the map edge along the aisle centreline and turns into an empty bay
// (1.5 m/s straight, 0.5 m/s turning); a departure reverses out of its bay and leaves the same way. The tyre tracks
// crush once per pass (contact `tyre`); the body's step impact carries the cues (sound, tremor, body shadow).

import { rngFork, rngRange } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import { CAR_BODY, CAR_DURATION_S, CAR_SPEED_MM_S, CAR_TURN_MM_S, CAR_TYRE, HUMAN_CUES, SWEEP_STEP_S } from '@/sim/balance/human';
import type { Pt } from '../grid';
import { planY } from '../ground';
import { rectOfImpacts, type Actor, type HumanPlan, type Impact } from '../plan';
import { siteById, type CarBay } from '../sites';
import { leadTicks, secondsToT } from './lead';

interface PathPt { x: number; z: number; speed: number }

/** Entry -> aisle point -> (quarter turn) -> bay centre, as dense points with their speed. */
function arrivalPath(entry: Pt, bay: CarBay): PathPt[] {
  const out: PathPt[] = [];
  const seg = (a: Pt, b: Pt, speed: number) => {
    const l = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(l / 100));
    for (let i = out.length > 0 ? 1 : 0; i <= n; i++) out.push({ x: a.x + ((b.x - a.x) * i) / n, z: a.z + ((b.z - a.z) * i) / n, speed });
  };
  // the turn starts a turning radius before the aisle point and ends a radius inside the bay
  const ax = bay.ax, az = bay.az;
  const inX = ax - entry.x, inZ = az - entry.z, inL = Math.hypot(inX, inZ) || 1;
  const R = Math.min(2500, inL * 0.5);
  const before = { x: ax - (inX / inL) * R, z: az - (inZ / inL) * R };
  const after = { x: ax + bay.dx * R, z: az + bay.dz * R };
  seg(entry, before, CAR_SPEED_MM_S);
  // quadratic Bezier through the aisle point
  const n = 16;
  for (let i = 1; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push({ x: u * u * before.x + 2 * u * t * ax + t * t * after.x, z: u * u * before.z + 2 * u * t * az + t * t * after.z, speed: CAR_TURN_MM_S });
  }
  seg(after, { x: bay.x, z: bay.z }, CAR_TURN_MM_S);
  return out;
}

export function buildCar(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  const bay = site?.bays[inst.param ?? -1];
  if (!site || !bay || !site.entry) return null;
  const rng = rngFork(inst.seed, 'human.plan');
  const cues = HUMAN_CUES.car;
  const t0 = leadTicks(sim, cues);
  let path = arrivalPath(site.entry, bay);
  const depart = inst.variant === 'depart';
  if (depart) path = [...path].reverse();
  // resample by time; the trip is stretched to at least CAR_DURATION_S[0] (a slow creep in) and cut at the longest
  const pos: { x: number; z: number; yaw: number; s: number }[] = [];
  let s = 0;
  for (let i = 0; i < path.length; i++) {
    const p = path[i], q = path[Math.min(path.length - 1, i + 1)], o = path[Math.max(0, i - 1)];
    // heading: the car points along the arrival direction (reversing out keeps that heading)
    const hx = depart ? o.x - q.x : q.x - o.x, hz = depart ? o.z - q.z : q.z - o.z;
    pos.push({ x: p.x, z: p.z, yaw: Math.atan2(hz, hx), s });
    if (i > 0) s += Math.hypot(p.x - path[i - 1].x, p.z - path[i - 1].z) / p.speed;
  }
  const total = Math.max(CAR_DURATION_S[0], Math.min(CAR_DURATION_S[1], s));
  const k = total / Math.max(1e-6, s) * rngRange(rng, 0.95, 1.05);
  const impacts: Impact[] = [];
  const car: Actor = { kind: 'car', scale: 1, side: 0, keys: [] };
  const step = SWEEP_STEP_S;
  const steps: { t: number; x: number; z: number; yaw: number }[] = [];
  let j = 0;
  for (let ts = 0; ts <= s; ts += step) {
    while (j < pos.length - 1 && pos[j + 1].s <= ts) j++;
    const a = pos[j], b = pos[Math.min(pos.length - 1, j + 1)];
    const f = b.s > a.s ? (ts - a.s) / (b.s - a.s) : 0;
    const x = a.x + (b.x - a.x) * f, z = a.z + (b.z - a.z) * f, yaw = a.yaw;
    const t = t0 + secondsToT(ts * k);
    const y = planY(sim, x, z);
    impacts.push({ t, fp: { x, y, z, yaw, hx: CAR_BODY.hl, hz: CAR_BODY.hw, disc: false }, contact: 'none', actor: 0, value: 0 });
    car.keys.push({ t, x, y, z, yaw, lift: 0 });
    steps.push({ t, x, z, yaw });
  }
  impacts.push(...tyreImpacts(sim, steps, depart));
  impacts.sort((a, b) => a.t - b.t);
  if (car.keys.length === 0) return null;
  const last = impacts[impacts.length - 1].t;
  return {
    instId: inst.id, kind: 'car', variant: inst.variant, firstT: t0, endT: last + 1, impacts, actors: [car], cues,
    area: rectOfImpacts(impacts, 3000), siteId: site.id, extent: 0, resumeKey: null, resume: -1,
  };
}

/** Ground centre of one tyre at a body pose: u = +1 front / -1 rear axle, v = +1 / -1 side. */
function tyreAt(p: { x: number; z: number; yaw: number }, u: number, v: number): Pt {
  const lx = (u * CAR_TYRE.base) / 2, lz = (v * CAR_TYRE.track) / 2, c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
  return { x: p.x + lx * c - lz * sn, z: p.z + lx * sn + lz * c };
}

/**
 * The ground each tyre sweeps, once: per step the strip its patch's leading edge covers since the last step (the
 * first step its whole patch), so overlapping steps never test an ant twice. CRUSH_P `tyre` is per car pass
 * (GDD 04 §15.4 "tyre tracks CRUSH_P"): the trailing axle runs in the leading axle's tracks and crushes only where
 * it leaves them by more than half a tyre width (off-tracking in the turn into the bay).
 */
function tyreImpacts(sim: Sim, steps: readonly { t: number; x: number; z: number; yaw: number }[], depart: boolean): Impact[] {
  const out: Impact[] = [];
  const lead = depart ? -1 : 1, half = CAR_TYRE.patch / 2;
  for (const v of [1, -1]) {
    const leadTrack = steps.map((p) => tyreAt(p, lead, v));
    for (const u of [lead, -lead]) {
      const track = u === lead ? leadTrack : steps.map((p) => tyreAt(p, u, v));
      for (let i = 0; i < track.length; i++) {
        const p = track[i];
        if (u !== lead && distToTrack(p, leadTrack, i) <= CAR_TYRE.w / 2) continue;
        let fp: Impact['fp'];
        if (i === 0) fp = { x: p.x, y: planY(sim, p.x, p.z), z: p.z, yaw: steps[0].yaw, hx: half, hz: CAR_TYRE.w / 2, disc: false };
        else {
          const q = track[i - 1], dx = p.x - q.x, dz = p.z - q.z, l = Math.hypot(dx, dz);
          if (l < 1) continue;
          const cx = (p.x + q.x) / 2 + (dx / l) * half, cz = (p.z + q.z) / 2 + (dz / l) * half;
          fp = { x: cx, y: planY(sim, cx, cz), z: cz, yaw: Math.atan2(dz, dx), hx: l / 2, hz: CAR_TYRE.w / 2, disc: false };
        }
        out.push({ t: steps[i].t, fp, contact: 'tyre', actor: 0, value: 1 });
      }
    }
  }
  return out;
}

/** Distance from p to the polyline of the first n + 1 track points, mm. */
function distToTrack(p: Pt, track: readonly Pt[], n: number): number {
  let best = Infinity;
  for (let i = 1; i <= Math.min(n, track.length - 1); i++) {
    const a = track[i - 1], b = track[i], ex = b.x - a.x, ez = b.z - a.z, l2 = ex * ex + ez * ez;
    const f = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / l2)) : 0;
    best = Math.min(best, Math.hypot(p.x - a.x - ex * f, p.z - a.z - ez * f));
  }
  return best;
}

/** Tyre impacts carry value 1 and no cues; the body step impact (value 0) carries them. */
export function isQuietImpact(plan: HumanPlan, i: Impact): boolean {
  return plan.kind === 'car' && i.contact === 'tyre';
}
