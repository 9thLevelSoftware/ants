// Independent review of the views task (adversarial checks). Tests that pass stay as regressions; a failing test
// demonstrates a defect and stays in place for the fixer (see the review report).
import { describe, expect, it } from 'vitest';
import { collectRefusals } from '@/game/refusals';
import { InputState } from '@/input/inputState';
import { CAM_OBSERVER_RADIUS_BU } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { colonyKeys, selectTool, type ColonyHost, type ColonyTools } from './colony/colonyControl';
import { DigPlanner, playerNest } from './colony/digPlanner';
import { MarkerTool } from './colony/markerTool';
import { makeNestWalk, type WalkFrame } from './testing/nestWalk';
import { ViewDirector, type ViewSubject } from './viewDirector';
import { ViewsState } from './viewsState';

const CAM = { autoFollow: 'gentle' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function director(sim: Sim, cam = CAM): ViewDirector {
  return new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size,
    trace: (o, dir, max, r) => sim.field.sphereTrace(o, dir, max, r),
    groundHeight: (x, z) => sim.field.height(x, z),
    field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, cam);
}

function subjectOf(f: WalkFrame): ViewSubject {
  const a = f.ant;
  return { pos: { ...a.pos }, up: { ...a.up }, fwd: { ...a.fwd }, lengthBu: a.lengthBu, underground: f.underground, airborne: a.medium === 'air' };
}

function host(sim: Sim): ColonyHost & { toasts: string[] } {
  const toasts: string[] = [];
  return {
    sim, toasts,
    command(cmd: Command) {
      sim.enqueue(cmd);
      const rejected = collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); });
      return { applied: true, rejected };
    },
    toast(t: string) { toasts.push(t); },
    possess() { /* not used */ },
  };
}

/** Minimum f(camera) over a queen's walk down the test nest and back, with the given view and frame step. */
function walkMinF(view: 'possess' | 'observer', dt: number, cam = CAM): { minF: number; frames: number; sim: Sim; d: ViewDirector } {
  const w = makeNestWalk({ dt });
  const d = director(w.sim, cam);
  let started = false, minF = Infinity, frames = 0;
  w.run((f) => {
    const s = subjectOf(f);
    if (!started) { d.setView(view, s, true); started = true; } else d.setSubject(s);
    const out = d.update(dt, null);
    minF = Math.min(minF, w.sim.field.sampleXYZ(out.pose.pos.x, out.pose.pos.y, out.pose.pos.z));
    frames++;
  });
  return { minF, frames, sim: w.sim, d };
}

describe('views review: camera clearance beyond the 30 fps walk', () => {
  it('GDD 6.1 / 6.6: the observer FOLLOWING the queen down the shaft keeps f >= 0.5 x observer radius every frame', () => {
    const r = walkMinF('observer', 1 / 30);
    const bu = r.sim.world.bu;
    expect(r.frames).toBeGreaterThan(100);
    expect(r.minF).toBeGreaterThanOrEqual(0.5 * CAM_OBSERVER_RADIUS_BU * bu);
  });

  it('possession at a software-GL frame rate (dt 0.2 s): f >= 0.5 R every frame', () => {
    const r = walkMinF('possess', 0.2);
    expect(r.minF).toBeGreaterThanOrEqual(r.d.third.clearanceMm);
  });

  it('possession at 144 fps with reduced motion and world-up lock: f >= 0.5 R every frame', () => {
    const r = walkMinF('possess', 1 / 144, { ...CAM, reducedMotion: true, worldUpLock: true });
    expect(r.minF).toBeGreaterThanOrEqual(r.d.third.clearanceMm);
  });

  it('degenerate subject (forward parallel to up, NaN-free output)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const d = director(sim);
    const p = { x: sim.world.size / 2, y: sim.field.height(sim.world.size / 2, sim.world.size / 2) + 0.3 * sim.world.bu, z: sim.world.size / 2 };
    d.setView('possess', { pos: p, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 1, z: 0 }, lengthBu: 1, underground: false, airborne: false }, true);
    const f = d.settle(1, 1 / 30);
    for (const v of [f.pose.pos, f.pose.look, f.pose.up]) for (const c of [v.x, v.y, v.z]) expect(Number.isFinite(c)).toBe(true);
    expect(sim.field.sampleXYZ(f.pose.pos.x, f.pose.pos.y, f.pose.pos.z)).toBeGreaterThanOrEqual(d.third.clearanceMm);
  });
});

describe('views review: hand-over possession -> observer (GDD 01 §2: "X: release; camera stays, becomes follow-orbit")', () => {
  it('after the release the follow orbit looks at the ant from where the possession camera was', () => {
    const sim = makeTestSim({ systems: [] });
    const d = director(sim, { ...CAM, autoFollow: 'off' as never });
    const q = sim.state.ants[0];
    const subject: ViewSubject = { pos: { ...q.pos }, up: { ...q.up }, fwd: { ...q.fwd }, lengthBu: q.lengthBu, underground: false, airborne: false };
    d.setView('possess', subject, true);
    d.settle(1, 1 / 30);
    d.nudge(120, 0); // the player had orbited round to the ant's side
    d.settle(1, 1 / 30);
    const dirOf = () => {
      const v = { x: d.pose.pos.x - q.pos.x, z: d.pose.pos.z - q.pos.z };
      const l = Math.hypot(v.x, v.z) || 1;
      return { x: v.x / l, z: v.z / l };
    };
    const before = dirOf();
    d.setView('observer', subject);
    for (let i = 0; i < 120; i++) d.update(1 / 60, null);
    const after = dirOf();
    const angleDeg = Math.acos(Math.max(-1, Math.min(1, before.x * after.x + before.z * after.z))) * 180 / Math.PI;
    expect(angleDeg).toBeLessThan(30);
  });
});

describe('views review: colony tools', () => {
  it('Shift+wheel with a marker tool changes the radius only; the slice plane must not move too', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const d = director(sim);
    const h = host(sim);
    const st = new ViewsState();
    const tools: ColonyTools = { markers: new MarkerTool(), planner: new DigPlanner() };
    const nest = playerNest(sim)!;
    d.setView('colony', { pos: { ...nest.chambers[0].center }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, lengthBu: 1, underground: true, airborne: false }, true);
    d.colony.setDeepest(-30 * sim.world.bu);
    d.colony.cutaway.mode = 'slice';
    d.colony.cutaway.planeY = -10 * sim.world.bu;
    selectTool(st, tools, 'forage');
    const input = new InputState();
    input.contexts.setBase('C');
    let now = 1000;
    input.update(now);
    const r0 = tools.markers.radiusBu.forage, plane0 = d.colony.cutaway.planeY;
    input.keyDown('ShiftLeft', { shift: true });
    input.wheel(100, 0, true);
    now += 16; input.update(now);
    // one frame as the Game runs it: views layer keys, then the rig
    d.colonyCapture = false; // plannerActive(st) is false for a marker tool
    colonyKeys(input, st, tools, h);
    d.update(1 / 60, input);
    expect(tools.markers.radiusBu.forage).not.toBe(r0);
    expect(d.colony.cutaway.planeY).toBe(plane0);
  });

  it('a refused marker move keeps the marker and a valid selection', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const tool = new MarkerTool();
    const nest = playerNest(sim)!;
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!;
    const food = nest.chambers.find((c) => c.type === 'food')!;
    const placed = tool.place(h, 'move-brood', nursery.center, nursery.id);
    expect(placed.ok).toBe(true);
    // brood may not be moved into the food store: the sim refuses, the tool puts the marker back
    const mv = tool.move(h, placed.markerId, food.center, food.id);
    expect(mv.ok).toBe(false);
    expect(MarkerTool.count(sim, 'move-brood')).toBe(1);
    // the marker is still selected (Delete must still act on it)
    expect(sim.stores.markers.get(tool.selectedId)?.alive ?? false).toBe(true);
  });

  it('Ctrl+Z after a move undoes something (the move is a removal plus a placement)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const tool = new MarkerTool();
    const c = sim.world.size / 2, bu = sim.world.bu;
    const at = (x: number, z: number) => ({ x, y: sim.field.height(x, z), z });
    const a = tool.place(h, 'forage', at(c, c), -1, 30);
    const mv = tool.move(h, a.markerId, at(c + 40 * bu, c));
    expect(mv.ok).toBe(true);
    const before = sim.state.markers.filter((m) => m.alive).map((m) => `${m.id}@${Math.round(m.pos.x)}`).join();
    expect(tool.undo(h)).toBe(true);
    const after = sim.state.markers.filter((m) => m.alive).map((m) => `${m.id}@${Math.round(m.pos.x)}`).join();
    expect(after).not.toBe(before);
  });
});

describe('views review: observer free fly near a surface', () => {
  it('a free camera closer than its radius to the ground (but clear by GDD 6.1) can still fly away from it', async () => {
    const { ObserverRig, makeSphereTracer } = await import('@/render/camera');
    const bu = 4;
    const field = (_x: number, y: number) => y; // flat ground at y = 0
    const trace = makeSphereTracer(field);
    const rig = new ObserverRig({ bu, worldSize: 1000 });
    const r = rig.radiusMm;
    rig.setPose({ x: 500, y: 0.8 * r, z: 500 }, { x: 500, y: 0.8 * r, z: 400 }); // f = 0.8 R >= 0.5 R
    for (let i = 0; i < 30; i++) {
      rig.update(1 / 30, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 1, fast: false }, { trace, groundHeight: () => 0 });
    }
    expect(rig.out.pos.y).toBeGreaterThan(2 * r);
  });
});

describe('views review: stop following in the nest, then fly (F, then WASD)', () => {
  it('the observer can fly on from where the follow camera was underground', () => {
    const w = makeNestWalk({ dt: 1 / 30 });
    const d = director(w.sim);
    let started = false;
    const stuck: number[] = [];
    let tried = 0;
    w.run((f) => {
      const s = subjectOf(f);
      if (!started) { d.setView('observer', s, true); started = true; } else d.setSubject(s);
      d.update(1 / 30, null);
      if (!f.underground || f.i % 40 !== 0) return;
      // copy of the director state is not possible: probe with a fresh observer rig at the follow pose
      const p = d.pose;
      const probe = director(w.sim);
      probe.freeFlyAt({ ...p.pos }, { ...p.look });
      const start = { ...p.pos };
      let moved = 0;
      for (const move of [{ x: 0, y: 1 }, { x: 0, y: -1 }, { x: 1, y: 0 }, { x: -1, y: 0 }]) {
        probe.freeFlyAt({ ...start }, { ...p.look });
        for (let i = 0; i < 15; i++) probe.observer.update(1 / 30, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move, vertical: 0, fast: false }, { trace: probe.world.trace, groundHeight: probe.world.groundHeight });
        const q = probe.observer.out.pos;
        moved = Math.max(moved, Math.hypot(q.x - start.x, q.y - start.y, q.z - start.z));
      }
      tried++;
      if (moved < 1e-6) stuck.push(f.i);
    });
    expect(tried).toBeGreaterThan(3);
    expect(stuck).toEqual([]);
  });
});

describe('views review: observer click-hold possession through the real input layer (GDD 01 §3.2, acceptance 5)', () => {
  it('holding the left button 400 ms over an ant possesses it; a short click only selects', async () => {
    const { observerInput } = await import('./observerControl');
    const input = new InputState();
    input.contexts.setBase('O');
    let now = 1000;
    input.update(now);
    const st = new ViewsState();
    const possessed: number[] = [];
    const hostO = { possess: (id: number) => possessed.push(id), follow: () => {}, following: () => null, colonyId: () => 0, antColony: () => 0 };
    const hits = [{ kind: 'ant' as const, id: 7, pos: { x: 0, y: 0, z: 0 }, t: 10 }];
    // short click: selects, no possession
    input.mouseDown(0, 100, 100, now);
    now += 16; input.update(now); observerInput(input, hits, st, hostO, now / 1000, { x: 100, y: 100 });
    input.mouseUp(0, 100, 100, now + 50);
    now += 66; input.update(now); observerInput(input, hits, st, hostO, now / 1000, { x: 100, y: 100 });
    expect(st.selected?.id).toBe(7);
    expect(possessed).toEqual([]);
    // hold: possesses after POSSESS_HOLD_MS
    now += 1500;
    input.mouseDown(0, 100, 100, now);
    for (let t = 0; t < 30; t++) { now += 20; input.update(now); observerInput(input, hits, st, hostO, now / 1000, { x: 100, y: 100 }); }
    expect(possessed).toEqual([7]);
  });
});
