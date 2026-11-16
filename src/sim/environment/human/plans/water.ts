// Watering (GDD 04 §15.2): a sprinkler jet sweeping a circle of radius 2-4 m around its head for 30 s, a hose
// sweeping 1-3 m along a bed for 12 s, or a can pouring on a spot for 6 s. The first impact covers the whole
// wetted area (pheromone wash, local rain rate); the others are the moving front (drop hits).

import { rngFork, rngPick, rngRange } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import {
  HOSE_SWEEP_M, HUMAN_CUES, SPRINKLER_R_M, WATER_CAN_S, WATER_FRONT_EVERY_S, WATER_HOSE_S, WATER_HOSE_SPOT_MM, WATER_SPRINKLER_FRONT,
  WATER_SPRINKLER_S, WATER_WALK_IN_S,
} from '@/sim/balance/human';
import { isFreeAt, type Pt } from '../grid';
import { planY } from '../ground';
import { type Actor, type HumanPlan, type Impact } from '../plan';
import { siteById } from '../sites';
import { canSpotRadius } from './drop';
import { leadTicks, secondsToT } from './lead';

export { WATER_WALK_IN_S };

export function buildWatering(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  const rng = rngFork(inst.seed, 'human.plan');
  const variant = inst.variant === 'hose' || inst.variant === 'can' ? inst.variant : 'sprinkler';
  const cues = HUMAN_CUES.watering;
  const t0 = leadTicks(sim, cues) + (variant === 'sprinkler' ? 0 : secondsToT(WATER_WALK_IN_S));
  const impacts: Impact[] = [];
  const jet: Actor = { kind: variant === 'can' ? 'pour' : 'jet', scale: 1, side: 0, keys: [] };
  let head: Pt | null = inst.at ?? null;
  if (!head && site) {
    if (variant === 'sprinkler' || variant === 'can') { const s = site.spots.length > 0 ? rngPick(rng, site.spots) : null; if (s) head = { x: s.x, z: s.z }; }
    if (!head && site.grid) {
      for (let i = 0; i < 30 && !head; i++) {
        const x = rngRange(rng, site.rect.x0, site.rect.x1), z = rngRange(rng, site.rect.z0, site.rect.z1);
        if (isFreeAt(site.grid, x, z)) head = { x, z };
      }
    }
  }
  if (!head) return null;
  const y0 = planY(sim, head.x, head.z);
  let dur: number, extent: number;
  const front: { x: number; z: number; r: number; yaw: number }[] = [];
  if (variant === 'sprinkler') {
    extent = rngRange(rng, SPRINKLER_R_M[0], SPRINKLER_R_M[1]) * 1000;
    dur = WATER_SPRINKLER_S;
    const a0 = rngRange(rng, 0, Math.PI * 2);
    for (let s = 0; s <= dur; s += WATER_FRONT_EVERY_S) {
      const a = a0 + (s / dur) * Math.PI * 2;
      front.push({ x: head.x + Math.cos(a) * extent * WATER_SPRINKLER_FRONT.at, z: head.z + Math.sin(a) * extent * WATER_SPRINKLER_FRONT.at, r: extent * WATER_SPRINKLER_FRONT.r, yaw: a });
    }
    impacts.push({ t: t0, fp: { x: head.x, y: y0, z: head.z, yaw: 0, hx: extent, hz: extent, disc: true }, contact: 'water', actor: 0, value: 1 });
  } else if (variant === 'hose') {
    const len = rngRange(rng, HOSE_SWEEP_M[0], HOSE_SWEEP_M[1]) * 1000;
    const a = rngRange(rng, 0, Math.PI * 2), c = Math.cos(a), s0 = Math.sin(a);
    dur = WATER_HOSE_S;
    extent = len;
    for (let s = 0; s <= dur; s += WATER_FRONT_EVERY_S) {
      const u = s / dur - 0.5;
      front.push({ x: head.x + c * len * u, z: head.z + s0 * len * u, r: WATER_HOSE_SPOT_MM, yaw: a });
    }
    impacts.push({ t: t0, fp: { x: head.x, y: y0, z: head.z, yaw: a, hx: len / 2 + WATER_HOSE_SPOT_MM, hz: WATER_HOSE_SPOT_MM, disc: false }, contact: 'water', actor: 0, value: 1 });
  } else {
    const r = canSpotRadius(rng);
    dur = WATER_CAN_S;
    extent = r;
    for (let s = 0; s <= dur; s += WATER_FRONT_EVERY_S) front.push({ x: head.x, z: head.z, r, yaw: 0 });
    impacts.push({ t: t0, fp: { x: head.x, y: y0, z: head.z, yaw: 0, hx: r, hz: r, disc: true }, contact: 'water', actor: 0, value: 1 });
  }
  front.forEach((f, i) => {
    const t = t0 + secondsToT(i * WATER_FRONT_EVERY_S) + 1;
    const y = planY(sim, f.x, f.z);
    impacts.push({ t, fp: { x: f.x, y, z: f.z, yaw: f.yaw, hx: f.r, hz: f.r, disc: true }, contact: 'water', actor: 0, value: 0 });
    jet.keys.push({ t, x: f.x, y, z: f.z, yaw: f.yaw, lift: variant === 'can' ? 350 : 0 });
  });
  const last = impacts[impacts.length - 1].t;
  return {
    instId: inst.id, kind: 'watering', variant, firstT: t0, endT: last + secondsToT(1), impacts, actors: [jet], cues,
    area: { x0: head.x - extent - 500, z0: head.z - extent - 500, x1: head.x + extent + 500, z1: head.z + extent + 500 },
    siteId: inst.regionId, extent, resumeKey: null, resume: -1,
  };
}

/** Source point of the water (sprinkler head / hose nozzle start) for the renderer: the plan's first impact. */
export function waterOrigin(plan: HumanPlan): Pt {
  const f = plan.impacts[0]?.fp;
  return f ? { x: f.x, z: f.z } : { x: 0, z: 0 };
}
