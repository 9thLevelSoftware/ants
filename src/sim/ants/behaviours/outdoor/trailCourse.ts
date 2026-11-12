// Does the trail an outbound ant follows lead to its own destination? (GDD 02 §6.7: a recruit "follows that
// source's trail".) A colony's trails carry no source label and all meet at the entrance, so the ant judges by its
// course: each TRAIL_COURSE_SEG_BU stretch walked on the trail is compared with the bearing to the trip's
// destination (lead position or source). TRAIL_OFF_COURSE_SEGS off-course stretches in a row mean the trail goes to
// another source.

import type { Ant, Sim } from '@/sim/types';
import {
  TRAIL_COURSE_MAX_DEG, TRAIL_COURSE_NEAR_BU, TRAIL_COURSE_SEG_BU, TRAIL_OFF_COURSE_SEGS,
} from '@/sim/balance/foraging';
import { K } from './keys';

/** 'on': a stretch on course just ended; 'drift': one ended off course; 'off': the trail leads elsewhere. */
export type Course = 'pending' | 'on' | 'drift' | 'off';

const COS_MAX = Math.cos((TRAIL_COURSE_MAX_DEG * Math.PI) / 180);

/** Starts judging the course from the ant's position (called when it picks up a trail). */
export function startCourse(ant: Ant): void {
  ant.bb[K.courseX] = ant.pos.x;
  ant.bb[K.courseZ] = ant.pos.z;
  ant.bb[K.offCourse] = 0;
}

/** One check against the destination (x, z mm); cheap enough for every think. */
export function checkCourse(sim: Sim, ant: Ant, dest: { x: number; z: number }): Course {
  const bu = sim.world.bu;
  const x0 = ant.bb[K.courseX] ?? ant.pos.x, z0 = ant.bb[K.courseZ] ?? ant.pos.z;
  const dx = ant.pos.x - x0, dz = ant.pos.z - z0;
  const walked = Math.hypot(dx, dz);
  if (walked < TRAIL_COURSE_SEG_BU * bu) return 'pending';
  ant.bb[K.courseX] = ant.pos.x;
  ant.bb[K.courseZ] = ant.pos.z;
  const bx = dest.x - x0, bz = dest.z - z0, toDest = Math.hypot(bx, bz);
  if (toDest <= TRAIL_COURSE_NEAR_BU * bu || (dx * bx + dz * bz) / (walked * toDest) >= COS_MAX) {
    ant.bb[K.offCourse] = 0;
    return 'on';
  }
  const n = (ant.bb[K.offCourse] ?? 0) + 1;
  ant.bb[K.offCourse] = n;
  return n >= TRAIL_OFF_COURSE_SEGS ? 'off' : 'drift';
}
