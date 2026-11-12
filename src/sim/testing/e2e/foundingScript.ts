// Scripted founding dig (Stage 1A gate, scenario a): the stand-in for the Stage 1B founding flow. The queen digs
// with the real `dig-bite` action primitive (nest module bites, expelled soil onto the mound, entrance and chamber
// detection) and moves only through locomotion (navTo). Phase 1: a ramp shaft down to SHAFT_BU; phase 2: a
// room around the shaft bottom, biting outward while stepping round a growing circle, until the nest module
// registers a chamber. Nothing here is production code.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Sim } from '@/sim/types';
import { begin } from '@/sim/ants';
import { navTo } from '@/sim/locomotion';

export interface FoundingDigResult {
  ticks: number;
  bites: number;
  /** Tick the first chamber registered, -1 if none. */
  chamberTick: number;
  shaftTick: number;
}

/** Depth of the shaft before the room starts, BU. */
const SHAFT_BU = 5;
/** Room: angle step per position (golden-angle-like spread), growth of the circle per step and its limit, BU. */
const ROOM_ANGLE_STEP = 2.4;
const ROOM_R0_BU = 0.6, ROOM_DR_BU = 0.04, ROOM_RMAX_BU = 2.5;
const BITES_PER_SPOT = 3;

/**
 * Runs the founding dig for at most maxTicks (ticking the sim) until a chamber registers. `dir` is the shaft's
 * horizontal heading. The nest's founding record must be in `digging` (the founding module's state machine).
 */
export function runFoundingDig(sim: Sim, queen: Ant, nest: Nest, dir: { x: number; z: number }, maxTicks: number): FoundingDigResult {
  const bu = sim.world.bu;
  let failed = false, advancing = false, phase = 0, k = 0, onSpot = 0, bites = 0;
  let centre: Vec3 = { ...queen.pos };
  let chamberTick = -1, shaftTick = -1;
  const offFail = sim.events.on('action-failed', (e) => { if (e.antId === queen.id) failed = true; });
  const offCh = sim.events.on('chamber-registered', (e) => { if (chamberTick < 0 && e.nestId === nest.id) chamberTick = sim.state.tick; });
  let t = 0;
  for (; t < maxTicks && chamberTick < 0; t++) {
    if (advancing) {
      if (queen.nav.status !== 'moving') advancing = false;
    } else if (!queen.action) {
      const depth = sim.field.height(queen.pos.x, queen.pos.z) - queen.pos.y;
      if (phase === 0 && depth >= SHAFT_BU * bu) { phase = 1; centre = { ...queen.pos }; shaftTick = sim.state.tick; }
      if (phase === 0) {
        if (failed) {
          // the face ahead is open now: step down the ramp into the dug space
          failed = false;
          navTo(sim, queen, { x: queen.pos.x + dir.x * bu, y: queen.pos.y - bu, z: queen.pos.z + dir.z * bu }, 0.6 * bu);
          advancing = true;
        } else {
          const tgt = { x: queen.pos.x + dir.x * 2 * bu, y: queen.pos.y - 2 * bu, z: queen.pos.z + dir.z * 2 * bu };
          if (begin(sim, queen, 'dig-bite', { kind: 'point', id: -1, pos: tgt })) bites++;
        }
      } else if (failed || onSpot >= BITES_PER_SPOT) {
        failed = false; onSpot = 0; k++;
        const a = k * ROOM_ANGLE_STEP, r = Math.min(ROOM_RMAX_BU, ROOM_R0_BU + ROOM_DR_BU * k) * bu;
        navTo(sim, queen, { x: centre.x + Math.cos(a) * r, y: centre.y, z: centre.z + Math.sin(a) * r }, 0.5 * bu);
        advancing = true;
      } else {
        const a = k * ROOM_ANGLE_STEP;
        const tgt = { x: queen.pos.x + Math.cos(a) * 2 * bu, y: queen.pos.y - 0.2 * bu, z: queen.pos.z + Math.sin(a) * 2 * bu };
        if (begin(sim, queen, 'dig-bite', { kind: 'point', id: -1, pos: tgt })) { bites++; onSpot++; }
      }
    }
    sim.tick();
  }
  offFail();
  offCh();
  return { ticks: t, bites, chamberTick, shaftTick };
}
