// Regressions for the views review fixes: tool commands in real time (queued for the next tick), Shift+wheel input
// claims, E on overlapping ants, plan / chamber / entrance edits, hand-over flights and tremor keeping the camera
// clear on every frame, the camera-state event, the marker scene's version and the label cache.
import { describe, expect, it } from 'vitest';
import { collectRefusals } from '@/game/refusals';
import { InputState } from '@/input/inputState';
import { LruCache, wrapLabel, LABEL_WRAP_CHARS } from '@/render/fx/markers/MarkerRenderer';
import { CAM_TREMOR_AMP_L, makeSphereTracer } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { colonyClick, colonyKeys, colonyPoll, selectTool, type ColonyHost, type ColonyTools } from './colony/colonyControl';
import { DigPlanner, playerNest } from './colony/digPlanner';
import { ColonyEdits } from './colony/edits';
import { buildMarkerScene } from './colony/markerScene';
import { MarkerTool } from './colony/markerTool';
import { possessTarget } from './observerControl';
import { clearFieldAt } from './clearField.testkit';
import { makeNestWalk } from './testing/nestWalk';
import { handoverPlan, ViewDirector, type CameraStateChange, type ViewSubject } from './viewDirector';
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

type Host = ColonyHost & { toasts: string[] };

/** Paused / manual clock: the Game applies a command at once. */
function nowHost(sim: Sim): Host {
  const toasts: string[] = [];
  return {
    sim, toasts,
    command(cmd: Command) {
      sim.enqueue(cmd);
      const rejected = collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); });
      return { applied: true, rejected };
    },
    toast(t: string) { toasts.push(t); },
    possess() {},
  };
}

/** Real time: the Game queues the command for the next tick (applied false, no refusals yet). */
function realtimeHost(sim: Sim): Host {
  const toasts: string[] = [];
  return {
    sim, toasts,
    command(cmd: Command) { sim.enqueue(cmd); return { applied: false, rejected: [] }; },
    toast(t: string) { toasts.push(t); },
    possess() {},
  };
}

/** One sim tick that applies the queued commands (the test sims run no systems) and delivers their events. */
function tick(sim: Sim): void {
  sim.applyPendingCommands();
  sim.tick();
}

function nurseryWall(sim: Sim) {
  const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
  const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  sim.field.project({ x: ch.center.x + ch.radii.x * 0.98, y: ch.center.y, z: ch.center.z }, 0, out, n);
  return { point: out, normal: n, kind: 'wall' as const };
}

/** A planner holding a valid (or warning) chamber ghost on the nursery wall. */
function validGhost(sim: Sim): DigPlanner {
  const planner = new DigPlanner();
  planner.chamberType = 'nursery';
  planner.size = 's';
  let p = planner.hover(sim, nurseryWall(sim));
  for (let i = 0; i < 24 && p && p.validity === 'invalid'; i++) { planner.rotate(1); p = planner.hover(sim, nurseryWall(sim)); }
  expect(p?.validity).not.toBe('invalid');
  return planner;
}

describe('marker tool in real time (commands applied at the next tick)', () => {
  it('a placement resolves after the tick: the new marker is selected and can be undone', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = realtimeHost(sim), tool = new MarkerTool();
    const c = sim.world.size / 2;
    const r = tool.place(h, 'forage', { x: c, y: sim.field.height(c, c), z: c }, -1, 20);
    expect(r).toMatchObject({ ok: true, markerId: -1, pending: true });
    tick(sim);
    tool.poll(sim);
    expect(MarkerTool.count(sim, 'forage')).toBe(1);
    expect(sim.stores.markers.get(tool.selectedId)?.kind).toBe('forage');
    expect(tool.undo(h)).toBe(true);
    tick(sim);
    tool.poll(sim);
    expect(MarkerTool.count(sim, 'forage')).toBe(0);
    expect(tool.selectedId).toBe(-1);
  });

  it('a refused move in real time puts the marker back, keeps it selected and toasts the reason', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const tool = new MarkerTool();
    const nest = playerNest(sim)!;
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!, food = nest.chambers.find((c) => c.type === 'food')!;
    const placed = tool.place(nowHost(sim), 'move-brood', nursery.center, nursery.id);
    expect(placed.ok).toBe(true);
    const h = realtimeHost(sim);
    const mv = tool.move(h, placed.markerId, food.center, food.id);
    expect(mv.pending).toBe(true);
    for (let i = 0; i < 3; i++) { tick(sim); tool.poll(sim); } // the refusal, then the put-back
    expect(MarkerTool.count(sim, 'move-brood')).toBe(1);
    expect(sim.stores.markers.get(tool.selectedId)?.alive).toBe(true);
    expect(h.toasts.length).toBe(1);
  });

  it('undoing a move restores the marker where it was, and an older placement entry still undoes it', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = nowHost(sim), tool = new MarkerTool();
    const c = sim.world.size / 2, bu = sim.world.bu;
    const at = (x: number) => ({ x, y: sim.field.height(x, c), z: c });
    const a = tool.place(h, 'forage', at(c), -1, 30);
    tool.move(h, a.markerId, at(c + 40 * bu));
    expect(tool.undo(h)).toBe(true); // the move
    const back = sim.state.markers.filter((m) => m.alive && m.kind === 'forage');
    expect(back.length).toBe(1);
    expect(back[0].pos.x).toBeCloseTo(c, 3);
    expect(tool.selectedId).toBe(back[0].id);
    expect(tool.undo(h)).toBe(true); // the placement, under the marker's new id
    expect(MarkerTool.count(sim, 'forage')).toBe(0);
    expect(tool.undo(h)).toBe(false);
  });
});

describe('dig planner in real time', () => {
  it('a queued plan keeps the tool until the sim created it, then selects it and closes the tool', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = realtimeHost(sim), st = new ViewsState();
    const tools: ColonyTools = { markers: new MarkerTool(), planner: validGhost(sim) };
    st.tool = 'dig';
    colonyClick(sim, null, st, tools, h, 0);
    if (st.message && /confirm/.test(st.message)) colonyClick(sim, null, st, tools, h, 1);
    expect(st.message).toMatch(/Placing/);
    expect(st.tool).toBe('dig');
    tick(sim);
    colonyPoll(sim, st, tools, h);
    const plan = playerNest(sim)!.digPlans.at(-1)!;
    expect(plan.source).toBe('player');
    expect(st.selectedPlanId).toBe(plan.id);
    expect(st.tool).toBeNull();
  });

  it('a queued plan the sim refuses keeps the tool open with the reason (and toasts it)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = realtimeHost(sim), st = new ViewsState();
    const planner = validGhost(sim);
    const tools: ColonyTools = { markers: new MarkerTool(), planner };
    // a plan on the same spot reaches the sim first: ours then overlaps it
    sim.enqueue({ type: 'planDig', ...planner.preview!.spec, confirmWarnings: true });
    st.tool = 'dig';
    colonyClick(sim, null, st, tools, h, 0);
    if (st.message && /confirm/.test(st.message)) colonyClick(sim, null, st, tools, h, 1);
    tick(sim);
    colonyPoll(sim, st, tools, h);
    expect(st.tool).toBe('dig');
    expect(st.message).toBeTruthy();
    expect(h.toasts).toContain(st.message);
    expect(playerNest(sim)!.digPlans.filter((p) => p.source === 'player').length).toBe(1);
  });
});

describe('Shift+wheel claims', () => {
  function colonySetup() {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const d = director(sim), h = nowHost(sim), st = new ViewsState();
    const tools: ColonyTools = { markers: new MarkerTool(), planner: new DigPlanner() };
    const nest = playerNest(sim)!;
    d.setView('colony', { pos: { ...nest.chambers[0].center }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, lengthBu: 1, underground: true, airborne: false }, true);
    d.colony.setDeepest(-30 * sim.world.bu);
    d.colony.cutaway.mode = 'slice';
    d.colony.cutaway.planeY = -10 * sim.world.bu;
    const input = new InputState();
    input.contexts.setBase('C');
    let now = 1000;
    input.update(now);
    const wheel = () => {
      input.keyDown('ShiftLeft', { shift: true });
      input.wheel(100, 0, true);
      now += 16; input.update(now);
      colonyKeys(input, st, tools, h);
      d.update(1 / 60, input);
      input.keyUp('ShiftLeft');
      now += 16; input.update(now);
      d.update(1 / 60, input);
    };
    return { d, st, tools, wheel };
  }

  it('without a tool Shift+wheel moves the slice, and a claim from an earlier frame does not leak', () => {
    const { d, st, tools, wheel } = colonySetup();
    selectTool(st, tools, 'forage');
    wheel(); // claimed by the radius
    const plane = d.colony.cutaway.planeY;
    selectTool(st, tools, null);
    wheel();
    expect(d.colony.cutaway.planeY).not.toBe(plane);
  });
});

describe('E on overlapping ants (GDD 01 §3.2)', () => {
  const host = { possess() {}, follow() {}, following: () => null, colonyId: () => 0, antColony: () => 0 };
  const hit = (id: number, t: number) => ({ kind: 'ant' as const, id, pos: { x: 0, y: 0, z: 0 }, t });

  it('prefers the selection when it is under the cursor, else the hovered ant', () => {
    const st = new ViewsState();
    const hits = [hit(7, 1), hit(8, 1.2)];
    st.hover = hits[0];
    st.selected = hits[1]; // chosen by click cycling
    expect(possessTarget(hits, st, host)?.id).toBe(8);
    st.selected = hit(9, 5); // selected elsewhere: the ant under the cursor wins
    expect(possessTarget(hits, st, host)?.id).toBe(7);
    expect(possessTarget([], { ...st, hover: null } as ViewsState, host)?.id).toBe(9);
  });
});

describe('colony edits (GDD 03 §14.2)', () => {
  it('pauses and resumes a plan, changes its priority, gives a chamber a new use and seals an entrance', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = nowHost(sim), edits = new ColonyEdits();
    const planner = validGhost(sim);
    let r = planner.confirm(h);
    if (r.outcome === 'confirm-warnings') r = planner.confirm(h);
    expect(r.outcome).toBe('created');
    const nest = playerNest(sim)!;
    const plan = () => nest.digPlans.find((p) => p.id === r.planId)!;
    expect(edits.plan(h, r.planId, 'toggle-pause')).toBe(true);
    expect(plan().status).toBe('paused');
    edits.plan(h, r.planId, 'toggle-pause');
    expect(plan().status).not.toBe('paused');
    edits.plan(h, r.planId, 'priority-high');
    expect(plan().priority).toBe('high');
    const general = nest.chambers.find((c) => c.type === 'general') ?? nest.chambers.find((c) => c.type === 'nursery')!;
    const target = ColonyEdits.chamberTypes(sim).find((t) => t !== general.type && t === 'rest') ?? 'general';
    expect(edits.designateChamber(h, general.id, target)).toBe(true);
    expect(h.toasts).toEqual([]);
    expect(general.type).toBe(target);
    const plans = nest.digPlans.length;
    expect(edits.toggleEntrance(h, nest.entrances[0].id)).toBe('seal');
    expect(nest.digPlans.length).toBe(plans + 1);
    expect(nest.digPlans.at(-1)!.kind).toBe('seal');
    edits.plan(h, r.planId, 'cancel');
    expect(plan().status).toBe('cancelled');
    expect(edits.plan(h, r.planId, 'pause')).toBe(false);
  });
});

describe('hand-overs keep the GDD 6.1 clearance on every frame', () => {
  it('a flight through a gap narrower than the camera clearance dip-fades', () => {
    const f = (x: number, _y: number, z: number) => Math.max(Math.abs(z) - 1, 0.2 - Math.abs(x));
    const trace = makeSphereTracer(f);
    const pose = (z: number) => ({ pos: { x: 0, y: 0, z }, look: { x: 0, y: 0, z: z + 1 }, up: { x: 0, y: 1, z: 0 }, fov: 60, near: 0.1, far: 1000 });
    expect(handoverPlan('possess', 'observer', pose(-5), pose(5), 4, false, trace, 0).kind).toBe('fly');
    expect(handoverPlan('possess', 'observer', pose(-5), pose(5), 4, false, trace, 0.6).kind).toBe('dip');
  });

  it('releasing and re-possessing the queen again and again on her walk down the shaft and back', () => {
    const w = makeNestWalk({ dt: 1 / 30 });
    const d = director(w.sim);
    const subj = (a: typeof w.queen, underground: boolean): ViewSubject => ({ pos: { ...a.pos }, up: { ...a.up }, fwd: { ...a.fwd }, lengthBu: a.lengthBu, underground, airborne: false });
    let minF = Infinity, frames = 0, switches = 0;
    w.run((fr) => {
      const s = subj(fr.ant, fr.underground);
      if (fr.i === 0) d.setView('possess', s, true);
      else if (fr.i % 45 === 0) { d.setView(d.view === 'possess' ? 'observer' : 'possess', s); switches++; } else d.setSubject(s);
      const out = d.update(1 / 30, null);
      minF = Math.min(minF, clearFieldAt(d, w.sim, out.pose.pos));
      frames++;
    });
    expect(switches).toBeGreaterThan(5);
    expect(frames).toBeGreaterThan(100);
    expect(minF).toBeGreaterThanOrEqual(d.minClearanceMm);
  });
});

describe('footstep tremor and the camera-state event (GDD 01 §6.1, App. C)', () => {
  function run(reducedMotion: boolean, tremor: boolean) {
    const sim = makeTestSim({ systems: [] });
    const d = director(sim, { ...CAM, reducedMotion });
    const q = sim.state.ants[0];
    const events: CameraStateChange[] = [];
    d.onCameraState((e) => events.push(e));
    d.setView('possess', { pos: { ...q.pos }, up: { ...q.up }, fwd: { ...q.fwd }, lengthBu: q.lengthBu, underground: false, airborne: false }, true);
    d.settle(1, 1 / 60);
    if (tremor) d.tremor();
    const ys: number[] = [];
    for (let i = 0; i < 30; i++) ys.push(d.update(1 / 60, null).pose.pos.y);
    return { ys, events, L: q.lengthBu * sim.world.bu };
  }

  it('shakes at most 0.05 L for 0.4 s, not at all in reduced motion', () => {
    const calm = run(false, false), shaken = run(false, true);
    const dev = shaken.ys.map((y, i) => Math.abs(y - calm.ys[i]));
    expect(Math.max(...dev)).toBeGreaterThan(0);
    expect(Math.max(...dev)).toBeLessThanOrEqual(CAM_TREMOR_AMP_L * shaken.L + 1e-9);
    expect(dev.slice(26).every((x) => x === 0)).toBe(true); // over after 0.4 s
    const reduced = run(true, true), reducedCalm = run(true, false);
    expect(reduced.ys).toEqual(reducedCalm.ys);
  });

  it('reports the possession camera state when it changes', () => {
    const { events } = run(false, false);
    expect(events[0]).toMatchObject({ view: 'possess', state: 'open', previous: null });
  });
});

describe('marker scene version and label cache', () => {
  it('nothing is rebuilt while only the tick moves on; x-ray dots have their own version', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const inp = { sim, colony: true, selectedMarkerId: -1, selectedPlanId: -1, preview: null, tunnelStart: null, hover: null, selected: null };
    const a = buildMarkerScene({ ...inp, cutaway: 'slice' });
    const ax = buildMarkerScene({ ...inp, cutaway: 'xray' });
    sim.tick();
    const b = buildMarkerScene({ ...inp, cutaway: 'slice' });
    const bx = buildMarkerScene({ ...inp, cutaway: 'xray' });
    expect(b.version).toBe(a.version);
    expect(bx.version).toBe(ax.version);
    expect(bx.pointsVersion).not.toBe(ax.pointsVersion);
  });

  it('labels wrap into short lines and the texture cache frees the least recently used beyond its size', () => {
    const lines = wrapLabel('Too close to the surface, another entrance or another room above or below - click again to confirm');
    expect(lines.length).toBeGreaterThan(2);
    for (const l of lines) expect(l.length).toBeLessThanOrEqual(LABEL_WRAP_CHARS);
    const freed: string[] = [];
    const c = new LruCache<string>(3, (v) => freed.push(v));
    for (const k of ['a', 'b', 'c', 'd', 'e']) c.set(k, k);
    c.get('a'); // used recently
    c.trim(new Set(['b']));
    expect(c.size).toBe(3);
    expect(freed).toEqual(['c', 'd']);
  });
});

describe('release hand-over after a teleport (no frame rendered in between)', () => {
  it('does not start the follow orbit from a stale camera far away: the camera ends near the ant, above ground', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const d = director(sim);
    const bu = sim.world.bu, c = sim.world.size / 2;
    const q = sim.state.ants[0];
    const at = (x: number, z: number): ViewSubject => ({ pos: { x, y: sim.field.height(x, z), z }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, lengthBu: q.lengthBu, underground: false, airborne: false });
    d.setView('possess', at(c, c), true);
    d.settle(1, 1 / 30);
    const far = at(c + 80 * bu, c + 40 * bu); // teleported, then released before any frame
    d.setSubject(far);
    d.setView('observer', far);
    let f = d.update(0, null);
    for (let i = 0; i < 90; i++) f = d.update(1 / 30, null);
    const L = q.lengthBu * bu;
    const dist = Math.hypot(f.pose.pos.x - far.pos.x, f.pose.pos.y - far.pos.y, f.pose.pos.z - far.pos.z);
    expect(dist).toBeLessThan(13 * L);
    expect(f.pose.pos.y - sim.field.height(f.pose.pos.x, f.pose.pos.z)).toBeGreaterThan(L);
  });
});
