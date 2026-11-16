// Instant events (GDD 04 §15.2): food dropped (crumbs under the table near the seats, a few on the worktop, pet food
// in the bowl, litter at a bin or a car bay, sweets at the playground), spills (log-uniform disc on a worktop, the
// floor, the patio or the play area) and the placement of a bait station. Each falling thing is an actor.

import { rngChance, rngFork, rngInt, rngPick, rngRange, type RngState } from '@/core/rng';
import type { HumanEventInst, Sim } from '@/sim/types';
import {
  CAN_SPOT_MM, DROP_COUNTER_CRUMBS, DROP_CRUMB_SIZE_MM, DROP_CRUMBS_PER_SOURCE, DROP_FALL_MM, DROP_IMPACT_R_MM, DROP_ITEM_SIZE_MM,
  DROP_SCATTER_MM, DROP_SEAT_R_MM, DROP_SPOT_JITTER_MM, DROP_SPREAD_S, DROP_TABLE_CRUMBS, DROP_WORKTOP_EDGE_MM, HUMAN_CUES,
  SPILL_D_MM, SPILL_WORKTOP_SHARE,
} from '@/sim/balance/human';
import { isFreeAt, type Pt } from '../grid';
import { planY } from '../ground';
import { rectOfImpacts, type Actor, type ContactKind, type HumanPlan, type Impact } from '../plan';
import { humanSites, siteById, type HumanSite } from '../sites';
import { leadTicks, secondsToT } from './lead';

function finish(inst: HumanEventInst, kind: HumanPlan['kind'], t0: number, impacts: Impact[], actors: Actor[], extent = 0): HumanPlan {
  const last = impacts.length > 0 ? impacts[impacts.length - 1].t : t0;
  return {
    instId: inst.id, kind, variant: inst.variant, firstT: t0, endT: last + secondsToT(1.5), impacts, actors, cues: HUMAN_CUES[kind],
    area: rectOfImpacts(impacts, 1500), siteId: inst.regionId, extent, resumeKey: null, resume: -1,
  };
}

/** One falling thing: an impact and an actor dropping onto it. */
function fall(impacts: Impact[], actors: Actor[], t: number, x: number, y: number, z: number, r: number, contact: ContactKind,
  value: number, kind: Actor['kind'], scale: number, yaw = 0): void {
  const idx = actors.length;
  const ft = secondsToT(Math.sqrt((2 * DROP_FALL_MM) / 9810) + 0.1);
  actors.push({ kind, scale, side: 0, keys: [{ t: t - ft, x, y, z, yaw, lift: DROP_FALL_MM }, { t, x, y, z, yaw, lift: 0 }, { t: t + secondsToT(1), x, y, z, yaw, lift: 0 }] });
  impacts.push({ t, fp: { x, y, z, yaw, hx: r, hz: r, disc: true }, contact, actor: idx, value });
}

function randomIn(rng: RngState, site: HumanSite, tries = 20): Pt | null {
  for (let i = 0; i < tries; i++) {
    const x = rngRange(rng, site.rect.x0, site.rect.x1), z = rngRange(rng, site.rect.z0, site.rect.z1);
    if (!site.grid || isFreeAt(site.grid, x, z)) return { x, z };
  }
  return null;
}

/** Crumbs scattered near a centre, grouped DROP_CRUMBS_PER_SOURCE to a source (value = crumbs on the group's last). */
function crumbs(sim: Sim, rng: RngState, impacts: Impact[], actors: Actor[], t0: number, n: number, centre: () => Pt, floorY: number,
  onTop = NaN): void {
  for (let i = 0; i < n; i++) {
    const c = centre();
    const y = Number.isFinite(onTop) ? onTop : planY(sim, c.x, c.z, floorY);
    const groupEnd = (i + 1) % DROP_CRUMBS_PER_SOURCE === 0 || i === n - 1;
    const inGroup = groupEnd ? (i % DROP_CRUMBS_PER_SOURCE) + 1 : 0;
    fall(impacts, actors, t0 + secondsToT(rngRange(rng, 0, DROP_SPREAD_S)) + i, c.x, y, c.z, DROP_IMPACT_R_MM.crumb, 'drop', inGroup, 'crumb',
      rngRange(rng, DROP_CRUMB_SIZE_MM[0], DROP_CRUMB_SIZE_MM[1]));
  }
}

export function buildFoodDrop(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  const rng = rngFork(inst.seed, 'human.plan');
  const t0 = leadTicks(sim, HUMAN_CUES['food-drop']);
  const impacts: Impact[] = [], actors: Actor[] = [];
  const disc = (c: Pt, r: number) => (): Pt => { const a = rngRange(rng, 0, Math.PI * 2), d = Math.sqrt(rngFloat01(rng)) * r; return { x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d }; };
  if (inst.at) {
    crumbs(sim, rng, impacts, actors, t0, rngInt(rng, DROP_TABLE_CRUMBS[0], DROP_TABLE_CRUMBS[1]), disc(inst.at, DROP_SCATTER_MM), NaN);
    return finish(inst, 'food-drop', t0, impacts, actors);
  }
  if (!site) return null;
  if (inst.variant === 'pet-feed') {
    const b = site.spots[0];
    if (!b) return null;
    fall(impacts, actors, t0, b.x, planY(sim, b.x, b.z, site.y), b.z, DROP_IMPACT_R_MM.petFeed, 'drop', 1, 'crumb', DROP_ITEM_SIZE_MM.petFeed);
    return finish(inst, 'food-drop', t0, impacts, actors);
  }
  if (site.kind === 'table' || (site.kind === 'patio' && site.spots.length > 0)) {
    const seats = site.spots.length > 0 ? site.spots : [{ x: (site.rect.x0 + site.rect.x1) / 2, z: (site.rect.z0 + site.rect.z1) / 2 }];
    crumbs(sim, rng, impacts, actors, t0, rngInt(rng, DROP_TABLE_CRUMBS[0], DROP_TABLE_CRUMBS[1]), () => disc(rngPick(rng, seats), DROP_SEAT_R_MM)(), site.y);
    const counter = humanSites(sim.world).list.find((s) => s.kind === 'counter');
    if (site.kind === 'table' && counter && counter.rects.length > 0) {
      const r = rngPick(rng, counter.rects);
      crumbs(sim, rng, impacts, actors, t0 + 3, rngInt(rng, DROP_COUNTER_CRUMBS[0], DROP_COUNTER_CRUMBS[1]),
        () => ({ x: rngRange(rng, r.x0 + DROP_WORKTOP_EDGE_MM, r.x1 - DROP_WORKTOP_EDGE_MM), z: rngRange(rng, r.z0 + DROP_WORKTOP_EDGE_MM, r.z1 - DROP_WORKTOP_EDGE_MM) }), site.y, r.y);
    }
    return finish(inst, 'food-drop', t0, impacts, actors);
  }
  // litter at a bin or a bay, sweets at a play spot
  let c: Pt | null = null;
  if (site.spots.length > 0) { const s = rngPick(rng, site.spots); c = { x: s.x + rngRange(rng, -DROP_SPOT_JITTER_MM, DROP_SPOT_JITTER_MM), z: s.z + rngRange(rng, -DROP_SPOT_JITTER_MM, DROP_SPOT_JITTER_MM) }; }
  else if (site.bays.length > 0) { const b = rngPick(rng, site.bays); c = { x: b.ax, z: b.az }; }
  else c = randomIn(rng, site);
  if (!c) return null;
  fall(impacts, actors, t0, c.x, planY(sim, c.x, c.z, site.y), c.z, DROP_IMPACT_R_MM.litter, 'drop', 1, 'crumb',
    inst.variant === 'sweets' ? DROP_ITEM_SIZE_MM.sweets : DROP_ITEM_SIZE_MM.litter);
  return finish(inst, 'food-drop', t0, impacts, actors);
}

function rngFloat01(rng: RngState): number {
  return rngRange(rng, 0, 1);
}

export function buildSpill(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const site = siteById(sim.world, inst.regionId);
  const rng = rngFork(inst.seed, 'human.plan');
  const t0 = leadTicks(sim, HUMAN_CUES.spill);
  const d = Math.exp(rngRange(rng, Math.log(SPILL_D_MM[0]), Math.log(SPILL_D_MM[1])));
  let c: Pt | null = inst.at ?? null, y = NaN;
  if (!c && site) {
    if (site.kind === 'counter' && site.rects.length > 0 && rngChance(rng, SPILL_WORKTOP_SHARE)) {
      const r = rngPick(rng, site.rects);
      c = { x: rngRange(rng, r.x0 + d / 2, Math.max(r.x0 + d / 2, r.x1 - d / 2)), z: rngRange(rng, r.z0 + d / 2, Math.max(r.z0 + d / 2, r.z1 - d / 2)) };
      y = r.y;
    } else if (site.kind === 'counter') {
      const floor = humanSites(sim.world).list.find((s) => s.kind === 'interior-floor');
      if (floor) c = randomIn(rng, floor);
    } else c = randomIn(rng, site);
  }
  if (!c) return null;
  if (!Number.isFinite(y)) y = planY(sim, c.x, c.z, site?.y ?? NaN);
  const impacts: Impact[] = [], actors: Actor[] = [];
  fall(impacts, actors, t0, c.x, y, c.z, d / 2, 'spill', d, 'pour', d);
  return finish(inst, 'spill', t0, impacts, actors, d);
}

export function buildBait(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const c = inst.at;
  if (!c) return null;
  const t0 = leadTicks(sim, HUMAN_CUES['bait-station']);
  const impacts: Impact[] = [], actors: Actor[] = [];
  const y = Number.isFinite(c.y) && c.y !== 0 ? c.y : planY(sim, c.x, c.z);
  fall(impacts, actors, t0, c.x, y, c.z, DROP_IMPACT_R_MM.bait, 'bait', 1, 'station', 1);
  return finish(inst, 'bait-station', t0, impacts, actors);
}

/** A watering-can spot radius (for plans/water.ts). */
export function canSpotRadius(rng: RngState): number {
  return rngRange(rng, CAN_SPOT_MM[0], CAN_SPOT_MM[1]) / 2;
}
