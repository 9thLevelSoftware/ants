// A human event's plan: everything it will do, computed once from its instance (seed, site, start decisions) and
// the world, so the simulation, the cues and the renderer agree. Times are ticks after the instance's start tick
// (the warning begins at 0; the first impact comes after the longest lead). Runtime cache, never saved: a loaded
// game rebuilds the same plan from the saved instance.

import type { HumanEventInst, HumanEventKind, HumanVariant, Sim } from '@/sim/types';
import type { HumanCueSpec } from '@/sim/balance/human';
import type { Rect } from './grid';

/** What touches the ground at an impact (GDD 04 §15.4 contact column plus the non-crushing contacts). */
export type ContactKind =
  | 'adult-shoe' | 'child-shoe' | 'paw' | 'tyre' | 'mower-deck' | 'broom' | 'wipe' | 'vacuum' | 'vacuum-crevice'
  | 'drop' | 'spill' | 'water' | 'scoop' | 'bait' | 'none';

/** Oriented rectangle (half extents along / across `yaw`) or disc (radius hx) on the ground, mm. */
export interface Footprint {
  x: number; y: number; z: number;
  /** Heading of the long axis, radians from +X toward +Z. */
  yaw: number;
  hx: number; hz: number;
  disc: boolean;
}

export interface Impact {
  /** Ticks after the start. */
  t: number;
  fp: Footprint;
  contact: ContactKind;
  /** Index of the actor that makes it. */
  actor: number;
  /** Contact-specific value (drop: crumb count; scoop: throw distance; water: variant index). */
  value: number;
}

/** Things the renderer draws (only what an ant could perceive: soles, tyres, decks, bristles, falling food). */
export type ActorKind = 'shoe' | 'child-shoe' | 'paw' | 'mower' | 'broom' | 'cloth' | 'nozzle' | 'crumb' | 'pour' | 'jet' | 'car' | 'station' | 'scoop';

export interface ActorKey {
  t: number;
  x: number; y: number; z: number;
  yaw: number;
  /** Height of the actor's underside above the contact point, mm. */
  lift: number;
}

export interface Actor {
  kind: ActorKind;
  /** Size multiplier or radius (crumb size, jet reach), kind-specific. */
  scale: number;
  /** Mirror flag (left / right shoe). */
  side: number;
  keys: ActorKey[];
}

export interface HumanPlan {
  instId: number;
  kind: HumanEventKind;
  variant: HumanVariant | null;
  /** Ticks of the first impact and of the end. */
  firstT: number;
  endT: number;
  impacts: Impact[];
  actors: Actor[];
  cues: readonly HumanCueSpec[];
  /** Everything the event can touch, mm (alerts, forecast, renderer culling). */
  area: Rect;
  /** Sites touched (for the alert's `{area}`). */
  siteId: number;
  /** Variant-specific constant (sprinkler radius, spill diameter), 0 none. */
  extent: number;
  /** Resumable progress written at the end (mowing stripe), key in HumanExtraState.progress; null none. */
  resumeKey: string | null;
  resume: number;
}

/** True when (x, z) lies inside the footprint. */
export function inFootprint(fp: Footprint, x: number, z: number, margin = 0): boolean {
  const dx = x - fp.x, dz = z - fp.z;
  if (fp.disc) return dx * dx + dz * dz <= (fp.hx + margin) * (fp.hx + margin);
  const c = Math.cos(fp.yaw), s = Math.sin(fp.yaw);
  const u = dx * c + dz * s, v = -dx * s + dz * c;
  return Math.abs(u) <= fp.hx + margin && Math.abs(v) <= fp.hz + margin;
}

/** Half-diagonal of a footprint (radius of its bounding circle), mm. */
export function footprintRadius(fp: Footprint): number {
  return fp.disc ? fp.hx : Math.hypot(fp.hx, fp.hz);
}

export function rectOfImpacts(impacts: readonly Impact[], pad: number): Rect {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (const i of impacts) {
    const r = footprintRadius(i.fp);
    x0 = Math.min(x0, i.fp.x - r); x1 = Math.max(x1, i.fp.x + r);
    z0 = Math.min(z0, i.fp.z - r); z1 = Math.max(z1, i.fp.z + r);
  }
  if (!Number.isFinite(x0)) return { x0: 0, z0: 0, x1: 0, z1: 0 };
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** A plan builder: the instance, its site and the sim (read only). */
export type PlanBuilder = (sim: Sim, inst: HumanEventInst) => HumanPlan | null;
