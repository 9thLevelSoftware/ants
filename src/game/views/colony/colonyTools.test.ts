// Marker tool and dig planner against the real nest module (views acceptance 4; GDD 03 §14.2, GDD 08 §4.3).
import { describe, expect, it } from 'vitest';
import { collectRefusals } from '@/game/refusals';
import { makeTestSim } from '@/sim/testing';
import { heavyLoad, PERF_STRICT } from '@/sim/testing/perfLoad';
import type { Command, Sim } from '@/sim/types';
import { DigPlanner, playerNest } from './digPlanner';
import { MarkerTool, type ToolHost } from './markerTool';
import { PLAN_REASON_TEXT } from './reasons';

function host(sim: Sim): ToolHost & { toasts: string[] } {
  const toasts: string[] = [];
  return {
    sim, toasts,
    command(cmd: Command) {
      sim.enqueue(cmd);
      const rejected = collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); });
      return { applied: true, rejected };
    },
    toast(t: string) { toasts.push(t); },
  };
}

/** A point on the side wall of the nursery chamber (half way up, on the +x side) with its outward normal. */
function nurseryWall(sim: Sim) {
  const nest = playerNest(sim)!;
  const ch = nest.chambers.find((c) => c.type === 'nursery')!;
  const p = { x: ch.center.x + ch.radii.x * 0.98, y: ch.center.y, z: ch.center.z };
  const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  sim.field.project(p, 0, out, n);
  return { point: out, normal: n, kind: 'wall' as const };
}

describe('dig planner (views acceptance 4)', () => {
  it('a chamber ghost anchored on a nest wall validates and confirming creates the plan in the simulation', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const planner = new DigPlanner();
    planner.chamberType = 'nursery';
    planner.size = 's';
    const nest = playerNest(sim)!;
    const before = nest.digPlans.length;
    // try a few yaws: the wall must face into undisturbed soil for the plan to be valid
    let p = planner.hover(sim, nurseryWall(sim));
    for (let i = 0; i < 24 && p && p.validity === 'invalid'; i++) { planner.rotate(1); p = planner.hover(sim, nurseryWall(sim)); }
    expect(p).not.toBeNull();
    expect(p!.validity).not.toBe('invalid');
    expect(p!.geometry?.ellipsoid).toBeTruthy();
    let r = planner.confirm(h);
    if (r.outcome === 'confirm-warnings') r = planner.confirm(h);
    expect(r.outcome).toBe('created');
    expect(nest.digPlans.length).toBe(before + 1);
    const plan = nest.digPlans[nest.digPlans.length - 1];
    expect(plan.id).toBe(r.planId);
    expect(plan.kind).toBe('chamber');
    expect(plan.source).toBe('player');
  });

  it('an anchor away from the nest shows the reason and creates nothing', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const planner = new DigPlanner();
    const nest = playerNest(sim)!;
    const before = nest.digPlans.length;
    const far = { x: sim.world.size * 0.2, y: -10 * sim.world.bu, z: sim.world.size * 0.2 };
    const p = planner.hover(sim, { point: far, normal: { x: 0, y: 1, z: 0 }, kind: 'cap' });
    expect(p!.validity).toBe('invalid');
    expect(p!.codes).toContain('anchor-not-in-nest');
    expect(p!.reason).toBe(PLAN_REASON_TEXT['anchor-not-in-nest']);
    const r = planner.confirm(h);
    expect(r.outcome).toBe('refused');
    expect(h.toasts).toContain(PLAN_REASON_TEXT['anchor-not-in-nest']);
    expect(nest.digPlans.length).toBe(before);
  });

  it('rotation steps 15 degrees, sizes clamp, live validation stays within budget (load-tolerant)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const planner = new DigPlanner();
    planner.rotate(1);
    expect(planner.yawDeg).toBe(15);
    planner.rotate(-2);
    expect(planner.yawDeg).toBe(345);
    planner.resize(5);
    expect(planner.size).toBe('l');
    planner.resize(-9);
    expect(planner.size).toBe('s');
    const wall = nurseryWall(sim);
    let best = Infinity;
    for (let i = 0; i < 5; i++) { planner.rotate(1); best = Math.min(best, planner.hover(sim, wall)!.ms); }
    // GDD 03 §7.3: <= 2 ms per pointer move; generous unless FOUNDRESS_PERF_STRICT=1 (shared, loaded machine)
    if (!heavyLoad()) expect(best).toBeLessThan(PERF_STRICT ? 2 : 50);
  });
});

describe('marker tool (GDD 08 §4.3)', () => {
  it('places, moves, removes and undoes markers with radius; respects the cap', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const tool = new MarkerTool();
    const bu = sim.world.bu;
    const at = (x: number, z: number) => ({ x, y: sim.field.height(x, z), z });
    const c = sim.world.size / 2;
    const r = tool.place(h, 'forage', at(c, c), -1, 40);
    expect(r.ok).toBe(true);
    const m = sim.stores.markers.get(r.markerId)!;
    expect(m.kind).toBe('forage');
    expect(m.radius).toBeCloseTo(40 * bu);
    expect(MarkerTool.markerAt(sim, at(c + 10 * bu, c))).toBe(m.id);
    // move keeps kind and radius
    const mv = tool.move(h, m.id, at(c + 20 * bu, c + 5 * bu));
    expect(mv.ok).toBe(true);
    const moved = sim.stores.markers.get(mv.markerId)!;
    expect(moved.radius).toBeCloseTo(40 * bu);
    expect(moved.pos.x).toBeCloseTo(c + 20 * bu);
    expect(sim.stores.markers.get(m.id)?.alive ?? false).toBe(false);
    // remove + undo puts it back
    expect(tool.remove(h, moved.id)).toBe(true);
    expect(MarkerTool.count(sim, 'forage')).toBe(0);
    expect(tool.undo(h)).toBe(true);
    expect(MarkerTool.count(sim, 'forage')).toBe(1);
    // radius clamps to the kind's range; the cap refuses with the GDD's words
    expect(tool.setRadius('forage', 500)).toBe(80);
    for (let i = 0; i < 6; i++) tool.place(h, 'forage', at(c + i * 30 * bu, c - 40 * bu));
    const capped = tool.place(h, 'forage', at(c, c + 60 * bu));
    expect(capped.ok).toBe(false);
    expect(capped.reason).toMatch(/Limit reached/);
  });

  it('move-brood needs a chamber and lands on it', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const h = host(sim);
    const tool = new MarkerTool();
    const nest = playerNest(sim)!;
    const nursery = nest.chambers.find((c) => c.type === 'nursery')!;
    expect(tool.place(h, 'move-brood', nursery.center).ok).toBe(false);
    const ok = tool.place(h, 'move-brood', nursery.center, nursery.id);
    expect(ok.ok).toBe(true);
    expect(sim.stores.markers.get(ok.markerId)!.targetChamberId).toBe(nursery.id);
  });
});
