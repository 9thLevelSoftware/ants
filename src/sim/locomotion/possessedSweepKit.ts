// Test support (not used by the game): the possessed-movement sweep of viab-loco item 2. On a generated world,
// random poses on open ground, on the faces of objects (stems, stones, logs, walls) and on the walls of carved
// shafts; from each pose the possessed ant holds one of 8 world directions for `ticks` ticks. A run is "dead" when
// the ant moved less than DEAD_PATH_BU in total while at least one probe around the start pose was free: an ant
// that is not walled in on every side must move or slide along.

import type { Vec3 } from '@/core/math/vec3';
import { rngFork, rngRange, type RngState } from '@/core/rng';
import type { Ant, Sim } from '@/sim/types';
import { AntFlag, PrimFlag } from '@/sim/types';
import { placeOnSurface } from './index';
import { rotateTangent, tangentPart } from './mathx';

export type PoseKind = 'surface' | 'object' | 'shaft' | 'start' | 'mound';

export interface SweepPose {
  kind: PoseKind;
  pos: Vec3;
  /** Placement hint (toward the face). */
  dir: Vec3;
}

export interface DeadRun {
  kind: PoseKind;
  /** Pose after placement and input direction (world), BU / unit. */
  posBU: Vec3;
  up: Vec3;
  input: Vec3;
  pathBU: number;
  freeProbes: number;
}

export interface SweepResult {
  runs: number;
  /** Poses that could not be placed (no surface found) are skipped. */
  skipped: number;
  dead: DeadRun[];
  byKind: Record<PoseKind, number>;
}

/** Below this total path over a run (BU) the ant did not move. */
export const DEAD_PATH_BU = 0.25;
/** Probe distance around the start pose (BU) and the clearance a probe needs (x foot offset). */
const PROBE_BU = 0.5;
const PROBE_FREE_FOOT = 0.5;

const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });

/** Carves `n` vertical founding-like shafts (radius 1 BU, `depthBU` deep) at random open spots; returns their axes. */
export function carveShafts(sim: Sim, rng: RngState, n: number, depthBU = 8, near: Vec3 | null = null): { top: Vec3; bottom: Vec3; r: number }[] {
  const bu = sim.world.bu, size = sim.world.size, out: { top: Vec3; bottom: Vec3; r: number }[] = [];
  for (let i = 0; i < n * 4 && out.length < n; i++) {
    const x = near ? near.x + rngRange(rng, -6, 6) * bu : rngRange(rng, 0.1, 0.9) * size;
    const z = near ? near.z + rngRange(rng, -6, 6) * bu : rngRange(rng, 0.1, 0.9) * size;
    if (sim.navGrid.blocked(x, z)) continue;
    const h = sim.field.height(x, z);
    const top = v(x, h + 0.5 * bu, z), bottom = v(x, h - depthBU * bu, z), r = bu;
    sim.kernel.carveCapsule(top, bottom, r, { force: true });
    out.push({ top, bottom, r });
  }
  return out;
}

/**
 * A spoil pile (a height overlay as the nest's mounds publish them) heaped against a face that runs along z at
 * x = faceX on its -x side: `height` mm at the face, falling `slope` mm per mm away from it, and dropping to 40 %
 * of `height` at the next grid point inside the face (cells under the object were never filled), over `len` mm
 * along the face. Grid cell 0.5 BU. Just outside the face the terrain pseudo-distance jumps across the crest
 * (viab-loco: the playground-park #2 raider stuck on a fence board for game hours). Returns centre and radius.
 */
export function pileAgainst(sim: Sim, id: number, faceX: number, zc: number, len: number, height: number, slope: number): { x: number; z: number; r: number } {
  const cell = 0.5 * sim.world.bu, out = Math.ceil(height / slope / cell) + 1, nx = out + 3, nz = Math.ceil(len / cell) + 1;
  const x0 = faceX - out * cell, z0 = zc - len / 2;
  const h = new Float32Array(nx * nz);
  for (let iz = 1; iz < nz - 1; iz++) for (let ix = 0; ix < nx; ix++) {
    h[iz * nx + ix] = ix <= out ? Math.max(0, height - (out - ix) * cell * slope) : ix === out + 1 ? 0.4 * height : 0.4 * height;
  }
  sim.kernel.setHeightOverlay({ id, x0, z0, cell, nx, nz, h, material: 'loam' });
  return { x: faceX - 2 * sim.world.bu, z: zc, r: Math.min(len / 2, 3 * sim.world.bu) };
}

/** Random poses: `counts` per kind. Shaft poses use the given shafts; object poses the world's solid primitives. */
export function samplePoses(sim: Sim, rng: RngState, counts: Partial<Record<PoseKind, number>>,
  shafts: readonly { top: Vec3; bottom: Vec3; r: number }[], start: Vec3 | null = null,
  piles: readonly { x: number; z: number; r: number }[] = []): SweepPose[] {
  const bu = sim.world.bu, size = sim.world.size, out: SweepPose[] = [];
  for (let i = 0; i < (counts.surface ?? 0); i++) {
    const x = rngRange(rng, 0.05, 0.95) * size, z = rngRange(rng, 0.05, 0.95) * size;
    out.push({ kind: 'surface', pos: v(x, sim.field.height(x, z) + 4 * bu, z), dir: v(0, -1, 0) });
  }
  const prims = sim.world.prims.filter((p) => (p.flags & PrimFlag.VISUAL_ONLY) === 0);
  for (let i = 0; i < (counts.object ?? 0) && prims.length > 0; i++) {
    const p = prims[Math.floor(rngRange(rng, 0, prims.length - 1e-9))];
    const a = rngRange(rng, 0, 2 * Math.PI), e = rngRange(rng, -0.6, 0.9);
    const ext = Math.max(p.size.x, p.size.y, p.size.z) + 2 * bu;
    const d = v(Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e));
    out.push({ kind: 'object', pos: v(p.pos.x + d.x * ext, p.pos.y + d.y * ext, p.pos.z + d.z * ext), dir: v(-d.x, -d.y, -d.z) });
  }
  for (let i = 0; i < (counts.shaft ?? 0) && shafts.length > 0; i++) {
    const s = shafts[i % shafts.length];
    const a = rngRange(rng, 0, 2 * Math.PI), t = rngRange(rng, 0.15, 0.85);
    const c = v(s.top.x + (s.bottom.x - s.top.x) * t, s.top.y + (s.bottom.y - s.top.y) * t, s.top.z + (s.bottom.z - s.top.z) * t);
    out.push({ kind: 'shaft', pos: c, dir: v(Math.cos(a), 0, Math.sin(a)) });
  }
  for (let i = 0; i < (counts.mound ?? 0) && piles.length > 0; i++) {
    const c = piles[i % piles.length];
    const a = rngRange(rng, 0, 2 * Math.PI), rr = rngRange(rng, 0, 1) * c.r;
    const x = c.x + Math.cos(a) * rr, z = c.z + Math.sin(a) * rr;
    out.push({ kind: 'mound', pos: v(x, sim.field.height(x, z) + rngRange(rng, 0.5, 6) * bu, z), dir: v(0, -1, 0) });
  }
  for (let i = 0; i < (counts.start ?? 0) && start; i++) {
    const a = rngRange(rng, 0, 2 * Math.PI), rr = rngRange(rng, 0, 6) * bu;
    const x = start.x + Math.cos(a) * rr, z = start.z + Math.sin(a) * rr;
    out.push({ kind: 'start', pos: v(x, sim.field.height(x, z) + 3 * bu, z), dir: v(0, -1, 0) });
  }
  return out;
}

const _t: Vec3 = v(0, 0, 0), _q: Vec3 = v(0, 0, 0);

/** Free probes around the ant on its tangent plane (8 directions, PROBE_BU away). */
function freeProbes(sim: Sim, ant: Ant): number {
  const bu = sim.world.bu, need = PROBE_FREE_FOOT * ant.footOffset;
  let n = 0;
  for (let k = 0; k < 8; k++) {
    rotateTangent(_t, ant.fwd, ant.up, (k * Math.PI) / 4);
    _q.x = ant.pos.x + _t.x * PROBE_BU * bu; _q.y = ant.pos.y + _t.y * PROBE_BU * bu; _q.z = ant.pos.z + _t.z * PROBE_BU * bu;
    if (sim.field.sample(_q) >= need) n++;
  }
  return n;
}

/** Input direction k of 8 on the ant's tangent plane (unit, world space). */
function tangentInput(ant: Ant, k: number): Vec3 {
  const ref = tangentPart(_t, v(0, 1, 0), ant.up) > 0.1 ? _t : tangentPart(_t, v(0, 0, 1), ant.up) > 1e-3 ? _t : v(1, 0, 0);
  const l = Math.hypot(ref.x, ref.y, ref.z);
  const base = v(ref.x / l, ref.y / l, ref.z / l);
  const out = v(0, 0, 0);
  rotateTangent(out, base, ant.up, (k * Math.PI) / 4);
  const ol = Math.hypot(out.x, out.y, out.z);
  out.x /= ol; out.y /= ol; out.z /= ol;
  return out;
}

/** Makes `ant` the possessed ant (flags and player state). */
export function possessAnt(sim: Sim, ant: Ant): void {
  ant.flags |= AntFlag.POSSESSED;
  sim.state.player.possessedAntId = ant.id;
  ant.action = null;
  ant.tb = 25;
}

/** Runs every pose x 8 input directions for `ticks` ticks each (sim.tick: the sim should run locomotion only). */
export function runSweep(sim: Sim, ant: Ant, poses: readonly SweepPose[], ticks: number): SweepResult {
  const bu = sim.world.bu;
  const res: SweepResult = { runs: 0, skipped: 0, dead: [], byKind: { surface: 0, object: 0, shaft: 0, start: 0, mound: 0 } };
  for (const pose of poses) {
    for (let k = 0; k < 8; k++) {
      if (!placeOnSurface(sim, ant, pose.pos, pose.dir)) { res.skipped++; break; }
      // the 8 directions of a camera behind the ant: on its tangent plane, from "up the slope" (or north on level
      // ground) round in 45 degree steps, so on a wall they include straight down and straight up
      const input = tangentInput(ant, k);
      ant.fwd.x = input.x; ant.fwd.y = input.y; ant.fwd.z = input.z;
      const probes = freeProbes(sim, ant);
      const start = { pos: { ...ant.pos }, up: { ...ant.up } };
      ant.nav.loco = undefined; // fresh latch state per run
      sim.setPlayerIntent({ dir: input, hurry: false, grip: false, held: [], flight: null });
      let path = 0, px = ant.pos.x, py = ant.pos.y, pz = ant.pos.z;
      for (let t = 0; t < ticks; t++) {
        sim.tick();
        path += Math.hypot(ant.pos.x - px, ant.pos.y - py, ant.pos.z - pz);
        px = ant.pos.x; py = ant.pos.y; pz = ant.pos.z;
      }
      res.runs++;
      res.byKind[pose.kind]++;
      if (path < DEAD_PATH_BU * bu && probes > 0) {
        res.dead.push({ kind: pose.kind, posBU: v(start.pos.x / bu, start.pos.y / bu, start.pos.z / bu), up: start.up, input, pathBU: path / bu, freeProbes: probes });
      }
    }
  }
  return res;
}

/** A seeded stream for the sweep. */
export function sweepRng(seed: number): RngState {
  return rngFork(seed, 'loco-possessed-sweep');
}
