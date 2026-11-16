// The demo's scenes: which event, on which site, at which moment of its plan, and where the ant-height camera
// stands. Times are ticks relative to the focus impact (negative = before it lands).

import type { HumanEventKind, HumanVariant } from '@/sim/types';
import type { HumanSiteKind } from '@/sim/balance/human';

export interface SceneDef {
  id: string;
  arch: 'kitchen-door' | 'playground-park';
  kind: HumanEventKind;
  variant: HumanVariant | null;
  site: HumanSiteKind | null;
  /** Focus impact: fraction through the plan's impacts (of this contact when given). */
  focus: number;
  contact?: string;
  /** Ticks from the focus impact to the frame. */
  dt: number;
  /** Camera relative to the focus: distance (mm), height above the ground (mm), bearing from the actor's heading
   *  (radians; 0 = ahead of it, looking back), and the look-at height above the focus (mm). */
  cam: { dist: number; h: number; bearing: number; lookUp: number };
  /** Frame the focus impact itself (the sprinkler head) instead of the midpoint between it and its actor. */
  atImpact?: boolean;
  /** Workers placed around the focus (scale), and how far they spread (mm). */
  ants: number;
  spread: number;
  note: string;
}

export const SCENES: SceneDef[] = [
  { id: 'footsteps', arch: 'kitchen-door', kind: 'footsteps', variant: 'adult', site: 'patio-lane', focus: 0.5, dt: -1, cam: { dist: 320, h: 6, bearing: 0.45, lookUp: 110 }, ants: 9, spread: 160, note: 'an adult sole coming down on the patio' },
  { id: 'footsteps-landed', arch: 'kitchen-door', kind: 'footsteps', variant: 'adult', site: 'patio-lane', focus: 0.5, dt: 1, cam: { dist: 300, h: 8, bearing: 0.9, lookUp: 70 }, ants: 9, spread: 200, note: 'the sole on the slabs, its shadow around it' },
  { id: 'mowing', arch: 'kitchen-door', kind: 'mowing', variant: 'motor', site: 'lawn-mown', focus: 0.3, dt: -4, cam: { dist: 300, h: 4, bearing: 0, lookUp: 50 }, ants: 6, spread: 200, note: 'the mower deck advancing over the lawn' },
  { id: 'sweeping', arch: 'kitchen-door', kind: 'sweeping', variant: 'broom', site: 'patio', focus: 0.2, dt: -4, cam: { dist: 300, h: 8, bearing: 1.5, lookUp: 50 }, ants: 8, spread: 200, note: 'broom bristles sweeping the patio' },
  { id: 'vacuum', arch: 'kitchen-door', kind: 'vacuum', variant: null, site: 'interior-floor', focus: 0.35, dt: -6, cam: { dist: 260, h: 7, bearing: 0.3, lookUp: 40 }, ants: 6, spread: 150, note: 'the vacuum nozzle crossing the kitchen floor' },
  { id: 'food-drop', arch: 'kitchen-door', kind: 'food-drop', variant: 'crumb-fall', site: 'table', focus: 0.2, dt: -1, cam: { dist: 110, h: 4, bearing: 1.2, lookUp: 14 }, ants: 4, spread: 80, note: 'crumbs falling under the kitchen table' },
  { id: 'spill', arch: 'kitchen-door', kind: 'spill', variant: 'sugary', site: 'counter', focus: 0, dt: 6, cam: { dist: 130, h: 3, bearing: 1.0, lookUp: 28 }, ants: 4, spread: 100, note: 'a sugary pour spreading' },
  { id: 'watering', arch: 'kitchen-door', kind: 'watering', variant: 'sprinkler', site: 'sprinkler', focus: 0, dt: 120, atImpact: true, cam: { dist: 650, h: 8, bearing: 2.6, lookUp: 260 }, ants: 4, spread: 200, note: 'a sprinkler head throwing its jet over the lawn' },
  { id: 'car', arch: 'kitchen-door', kind: 'car', variant: 'arrive', site: 'driveway', focus: 0.45, contact: 'tyre', dt: -8, cam: { dist: 650, h: 8, bearing: 0.7, lookUp: 230 }, ants: 6, spread: 250, note: 'a tyre rolling up the driveway, the car body overhead' },
  { id: 'children', arch: 'playground-park', kind: 'children', variant: 'play-session', site: 'playground', focus: 0.4, contact: 'child-shoe', dt: -1, cam: { dist: 260, h: 6, bearing: 0.6, lookUp: 70 }, ants: 6, spread: 150, note: 'a child running across the sand' },
  { id: 'bait', arch: 'kitchen-door', kind: 'bait-station', variant: 'station', site: null, focus: 0, dt: 8, cam: { dist: 140, h: 6, bearing: 0.8, lookUp: 15 }, ants: 4, spread: 60, note: 'a bait station on the kitchen floor' },
  { id: 'wipe', arch: 'kitchen-door', kind: 'sweeping', variant: 'wipe', site: 'counter', focus: 0.4, dt: -3, cam: { dist: 120, h: 4, bearing: 0.3, lookUp: 22 }, ants: 4, spread: 120, note: 'a cloth wiping the worktop' },
];
