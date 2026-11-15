// Test support (imported by *.test.ts only): a scripted free dig by one ant through the real `dig-bite` action
// primitive and locomotion only (no plan, no cheats): a steep ramp shaft from the surface down to `shaftBu`, then a
// room around the shaft bottom, biting outward while stepping round a growing circle. Stand-in for the founding
// flow's queen behaviour (founding task) and a possessed digger.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Sim } from '@/sim/types';
import { MOUND_BATCH_TICKS, PELLET_SETTLE_S } from '@/sim/balance/nest';
import { begin } from '@/sim/ants';
import { removeNest } from '@/sim/entities';
import { navTo } from '@/sim/locomotion';
import { makeTestSim } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { TICKS_PER_SECOND } from '@/sim/time';

export interface FreeDigOptions {
  /** Horizontal heading of the shaft (unit x / z). */
  dir: { x: number; z: number };
  /** Shaft depth below the surface at the start, BU. Default 8. */
  shaftBu?: number;
  /** Room radius reached around the shaft bottom, BU. Default 2.6. */
  roomBu?: number;
  /** Ramp slope of the shaft, degrees below the horizontal. Default 60. */
  slopeDeg?: number;
  /** Bites in the room phase. Default 60. */
  roomBites?: number;
  maxTicks?: number;
}

export interface FreeDigResult {
  ticks: number;
  bites: number;
  /** Tick the shaft reached its depth, -1 never. */
  shaftTick: number;
  /** Shaft bottom (room centre), mm. */
  bottom: Vec3 | null;
  /** The dig start on the surface, mm. */
  start: Vec3;
}

const ROOM_ANGLE_STEP = 2.4;
const ROOM_R0_BU = 0.6;
const BITES_PER_SPOT = 3;

/** Runs the free dig (ticking the sim) until the room bites are done or maxTicks pass. */
export function runFreeDig(sim: Sim, ant: Ant, o: FreeDigOptions): FreeDigResult {
  const bu = sim.world.bu;
  const shaft = (o.shaftBu ?? 8) * bu, roomR = (o.roomBu ?? 2.6) * bu, slope = ((o.slopeDeg ?? 60) * Math.PI) / 180;
  const roomBites = o.roomBites ?? 60, maxTicks = o.maxTicks ?? 30000;
  const start = { ...ant.pos };
  const ground = sim.field.height(start.x, start.z);
  let failed = false, moving = false, phase = 0, k = 0, onSpot = 0, bites = 0, roomDone = 0;
  let bottom: Vec3 | null = null, shaftTick = -1;
  const off = sim.events.on('action-failed', (e) => { if (e.antId === ant.id) failed = true; });
  const offDone = sim.events.on('action-completed', (e) => { if (e.antId === ant.id && phase === 1) roomDone++; });
  let t = 0;
  for (; t < maxTicks && !(phase === 1 && roomDone >= roomBites); t++) {
    if (moving) {
      if (ant.nav.status !== 'moving') moving = false;
    } else if (!ant.action) {
      if (phase === 0 && ground - ant.pos.y >= shaft) { phase = 1; bottom = { ...ant.pos }; shaftTick = sim.state.tick; }
      if (phase === 0) {
        if (failed) {
          // the face ahead is open: step down the ramp into the cut
          failed = false;
          navTo(sim, ant, { x: ant.pos.x + o.dir.x * 0.6 * bu, y: ant.pos.y - Math.tan(slope) * 0.6 * bu, z: ant.pos.z + o.dir.z * 0.6 * bu }, 0.4 * bu);
          moving = true;
        } else {
          const d = 1.5 * bu;
          const tgt = { x: ant.pos.x + o.dir.x * d, y: ant.pos.y - Math.tan(slope) * d, z: ant.pos.z + o.dir.z * d };
          if (begin(sim, ant, 'dig-bite', { kind: 'point', id: -1, pos: tgt })) bites++; else failed = true;
        }
      } else if (failed || onSpot >= BITES_PER_SPOT) {
        failed = false; onSpot = 0; k++;
        const a = k * ROOM_ANGLE_STEP, r = Math.min(roomR, (ROOM_R0_BU + 0.05 * k) * bu);
        navTo(sim, ant, { x: bottom!.x + Math.cos(a) * r, y: bottom!.y, z: bottom!.z + Math.sin(a) * r }, 0.5 * bu);
        moving = true;
      } else {
        const a = k * ROOM_ANGLE_STEP;
        const tgt = { x: ant.pos.x + Math.cos(a) * 2 * bu, y: ant.pos.y - 0.2 * bu, z: ant.pos.z + Math.sin(a) * 2 * bu };
        if (begin(sim, ant, 'dig-bite', { kind: 'point', id: -1, pos: tgt })) { bites++; onSpot++; } else failed = true;
      }
    }
    sim.tick();
  }
  // let the last bite finish
  for (let n = 0; n < 100 && ant.action; n++, t++) sim.tick();
  off();
  offDone();
  return { ticks: t, bites, shaftTick, bottom, start };
}

export interface Dug { sim: Sim; queen: Ant; dig: FreeDigResult }

/**
 * A new game on the flat loam test world (behaviours passive, every system on); the founding queen walks `awayBu`
 * east of her start point, then digs freely (no plan, no cheat). `noNest`: her colony's nest record is removed first.
 */
export function freeDig(seed: number, opts: { awayBu?: number; noNest?: boolean } = {}): Dug {
  const sim = makeTestSim({ seed, behaviours: passiveBehaviours() });
  const bu = sim.world.bu;
  const col = sim.state.colonies[0];
  const queen = sim.stores.ants.get(col.queenId)!;
  if (opts.noNest) for (const id of [...col.nestIds]) removeNest(sim, id, 'test');
  navTo(sim, queen, { x: queen.pos.x + (opts.awayBu ?? 20) * bu, y: queen.pos.y, z: queen.pos.z }, 1.5 * bu);
  for (let t = 0; t < 3000 && queen.nav.status === 'moving'; t++) sim.tick();
  const dig = runFreeDig(sim, queen, { dir: { x: 1, z: 0 } });
  for (let t = 0; t < 60; t++) sim.tick(); // one chamber detection turn after the last bite
  return { sim, queen, dig };
}

export const colonyNests = (sim: Sim, colony: number): Nest[] => sim.state.nests.filter((n) => n.alive && n.colony === colony);

/**
 * Ticks until no lying surface pellet is left (each settles into a pile at its first mound batch after
 * PELLET_SETTLE_S), so a mound volume measured afterwards no longer includes the free dig's own spoil. A dig
 * without the founding expulsion leaves its last pellets on the surface. Returns the ticks run.
 */
export function settleSurfacePellets(sim: Sim): number {
  const lying = (): boolean => sim.state.items.some((it) => it.alive && (it.kind === 'soil-pellet' || it.kind === 'frass')
    && !it.inNest && it.carrierIds.length === 0);
  const max = PELLET_SETTLE_S * TICKS_PER_SECOND + 2 * MOUND_BATCH_TICKS;
  let t = 0;
  for (; t < max && lying(); t++) sim.tick();
  return t;
}
