// The possession camera on the REAL kernel field and nest geometry (views task acceptance 3, GDD 01 E12-E13):
// scripted walks of the founding queen down the 1 BU test-nest shaft to the deepest chamber and back, a worker in a
// 2 BU tunnel, and a worker climbing a table leg onto the underside of its top. Every frame is checked against the
// field; motion is checked relative to the pivot.
import { describe, expect, it } from 'vitest';
import { CAM_MAX_REL_SPEED_L, type ThirdPersonOutput } from '@/render/camera';
import type { Sim } from '@/sim/types';
import { makeNestWalk, makeTableClimb, type WalkFrame } from './testing/nestWalk';
import { ViewDirector, type ViewSubject } from './viewDirector';

const DT = 1 / 30;
const CAM = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function director(sim: Sim, ceilingComfort = false): ViewDirector {
  const d = new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size,
    trace: (o, dir, max, r) => sim.field.sphereTrace(o, dir, max, r),
    groundHeight: (x, z) => sim.field.height(x, z),
    field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, CAM);
  d.third.setOptions({ ceilingComfort });
  return d;
}

function subjectOf(f: WalkFrame): ViewSubject {
  const a = f.ant;
  return { pos: { ...a.pos }, up: { ...a.up }, fwd: { ...a.fwd }, lengthBu: a.lengthBu, underground: f.underground, airborne: a.medium === 'air' };
}

interface FrameLog {
  state: string;
  f: number;
  distL: number;
  /** Camera motion relative to the pivot base this frame, L. */
  relL: number;
  guarded: boolean;
  forcedCutaway: boolean;
  occludedFor: number;
}

/** Runs a walk through a ViewDirector in possession view and logs every frame. */
function record(sim: Sim, walk: (cb: (f: WalkFrame) => void) => unknown, ceilingComfort = false, dt = DT): { log: FrameLog[]; clearance: number } {
  const d = director(sim, ceilingComfort);
  const log: FrameLog[] = [];
  let started = false;
  let prevCam = { x: 0, y: 0, z: 0 }, prevBase = { x: 0, y: 0, z: 0 };
  walk((f) => {
    const s = subjectOf(f);
    if (!started) { d.setView('possess', s, true); started = true; } else d.setSubject(s);
    d.update(dt, null);
    const o = d.third.out as ThirdPersonOutput;
    const L = f.ant.lengthBu * sim.world.bu;
    const rel = log.length === 0 ? 0 : Math.hypot(
      o.pos.x - prevCam.x - (o.base.x - prevBase.x), o.pos.y - prevCam.y - (o.base.y - prevBase.y), o.pos.z - prevCam.z - (o.base.z - prevBase.z)) / L;
    log.push({
      state: o.state, f: sim.field.sampleXYZ(o.pos.x, o.pos.y, o.pos.z), distL: Math.hypot(o.pos.x - f.ant.pos.x, o.pos.y - f.ant.pos.y, o.pos.z - f.ant.pos.z) / L,
      relL: rel, guarded: o.guarded, forcedCutaway: o.fade.occlusion > 0 && o.occludedFor === 0 && f.underground && o.state === 'crevice', occludedFor: o.occludedFor,
    });
    prevCam = { ...o.pos }; prevBase = { ...o.base };
  });
  return { log, clearance: d.third.clearanceMm };
}

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)] ?? 0; };

describe('possession camera in the real nest (views acceptance 3)', () => {
  it('queen: surface -> deepest chamber -> back: never inside solid, no jumps, a usable tunnel shot', () => {
    const w = makeNestWalk();
    let result: ReturnType<typeof w.run> | null = null;
    const { log, clearance } = record(w.sim, (cb) => { result = w.run(cb); });
    expect(result!.reachedDeepest).toBe(true);
    expect(result!.backOut).toBe(true);
    // GDD 6.1: f(camera) >= 0.5 R on every frame
    const minF = Math.min(...log.map((l) => l.f));
    expect(minF).toBeGreaterThanOrEqual(clearance);
    // no jumps: relative to the pivot the camera moves at most CAM_MAX_REL_SPEED_L L/s, except where the
    // clearance guard had to move it (rare, and still well under 2 L)
    const limit = CAM_MAX_REL_SPEED_L * DT + 1e-6;
    const free = log.filter((l) => !l.guarded);
    expect(Math.max(...free.map((l) => l.relL))).toBeLessThanOrEqual(limit);
    const guarded = log.filter((l) => l.guarded && l.relL > limit);
    expect(guarded.length / log.length).toBeLessThan(0.03);
    expect(Math.max(0, ...guarded.map((l) => l.relL))).toBeLessThan(1.5);
    // the views are actually used, and the tunnel shot frames the queen from behind (Stage 1A: 0.23 L)
    const tunnel = log.filter((l) => l.state === 'tunnel' || l.state === 'crevice');
    expect(tunnel.length).toBeGreaterThan(100);
    expect(log.some((l) => l.state === 'chamber')).toBe(true);
    expect(median(tunnel.map((l) => l.distL))).toBeGreaterThan(1.5);
    // underground "crevice" never forces the cutaway (rule 4 above ground only) and the ant is never hidden long
    expect(log.some((l) => l.forcedCutaway)).toBe(false);
    expect(Math.max(...log.map((l) => l.occludedFor))).toBeLessThanOrEqual(0.5);
  });

  it('E12: a worker walking a 2 BU tunnel at cruise (6 BU/s): 60 frames in `tunnel`, within 4 L, f >= R/2', () => {
    // 60 frames at 60 fps: the test nest's tunnels between chambers are about 1.5 s long at cruise speed
    const w = makeNestWalk({ caste: 'worker', speedBu: 6, dt: 1 / 60 });
    const { log, clearance } = record(w.sim, (cb) => { w.run(cb); }, false, 1 / 60);
    // the longest run of consecutive tunnel frames
    let best: FrameLog[] = [], cur: FrameLog[] = [];
    for (const l of log) {
      if (l.state === 'tunnel') { cur.push(l); if (cur.length > best.length) best = cur; } else cur = [];
    }
    expect(best.length).toBeGreaterThanOrEqual(60);
    for (const l of best.slice(0, 60)) {
      expect(l.distL).toBeLessThanOrEqual(4);
      expect(l.f).toBeGreaterThanOrEqual(clearance);
    }
  });

  for (const comfort of [false, true]) {
    it(`E13: ground -> table leg -> underside (ceiling) -> top: clear every frame, never hidden > 0.5 s (comfort ${comfort})`, () => {
      const c = makeTableClimb();
      let reached = false;
      const { log, clearance } = record(c.sim, (cb) => { reached = c.run(cb).reachedTop; }, comfort);
      expect(reached).toBe(true);
      expect(Math.min(...log.map((l) => l.f))).toBeGreaterThanOrEqual(clearance);
      expect(Math.max(...log.map((l) => l.occludedFor))).toBeLessThanOrEqual(0.5);
    });
  }
});

describe('possessing an ant that stands in a tunnel (no trail yet)', () => {
  it('the rebuilt trail runs along the tunnel whatever way the ant faces: the shot frames her from > 1 L', async () => {
    const { makeTestSim } = await import('@/sim/testing');
    const { walkerPlace } = await import('@/sim/locomotion/walker');
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = sim.state.nests[0], bu = sim.world.bu;
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!, royal = nest.chambers.find((c) => c.type === 'royal')!;
    // the middle of the nursery -> royal tunnel, facing across it (into the wall) rather than along it
    const p = { x: (nursery.center.x + royal.center.x) / 2, y: (nursery.center.y + royal.center.y) / 2 - 2 * bu, z: (nursery.center.z + royal.center.z) / 2 };
    const along = { x: royal.center.x - nursery.center.x, z: royal.center.z - nursery.center.z };
    walkerPlace(sim.field, queen, p, { dir: { x: 0, y: -1, z: 0 }, heading: { x: -along.z, y: 0, z: along.x } }, sim.kernel.walker);
    const d = director(sim);
    const s: ViewSubject = { pos: { ...queen.pos }, up: { ...queen.up }, fwd: { ...queen.fwd }, lengthBu: queen.lengthBu, underground: true, airborne: false };
    d.setView('possess', s, true);
    d.settle(2, 1 / 30);
    const o = d.third.out;
    const L = queen.lengthBu * bu;
    expect(sim.field.sampleXYZ(o.pos.x, o.pos.y, o.pos.z)).toBeGreaterThanOrEqual(d.third.clearanceMm);
    expect(Math.hypot(o.pos.x - queen.pos.x, o.pos.y - queen.pos.y, o.pos.z - queen.pos.z)).toBeGreaterThan(1 * L);
    expect(o.fade.target).toBeGreaterThan(0.9);
  });
});
