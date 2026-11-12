// Plan ghost geometry (views acceptance 1): outlines built from the nest module's plan geometry, the fill volumes,
// validity patterns and labels; marker rings with their radius.
import { describe, expect, it } from 'vitest';
import { collectRefusals } from '@/game/refusals';
import { pushCapsule, pushEllipse, pushHatch, RING_SEGMENTS, segmentCount } from '@/render/fx/markers/shapes';
import { GHOST_STYLE, MARKER_COLOR } from '@/render/fx/markers/palette';
import { makeTestSim } from '@/sim/testing';
import type { Command, Sim } from '@/sim/types';
import { DigPlanner, playerNest } from './digPlanner';
import { buildMarkerScene, ghostVolumes, planOutline } from './markerScene';
import { MarkerTool } from './markerTool';

function host(sim: Sim) {
  return {
    sim,
    command(cmd: Command) { sim.enqueue(cmd); return { applied: true, rejected: collectRefusals(sim, () => { sim.applyPendingCommands(); sim.events.flush(); }) }; },
    toast() {},
  };
}

function wallPick(sim: Sim) {
  const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
  const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  sim.field.project({ x: ch.center.x + ch.radii.x, y: ch.center.y, z: ch.center.z }, 0, out, n);
  return { point: out, normal: n, kind: 'wall' as const };
}

describe('shapes', () => {
  it('rings, capsules and hatches have the expected segment counts and stay on their radius', () => {
    const ring: number[] = [];
    pushEllipse(ring, { x: 1, y: 2, z: 3 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, 5, 5);
    expect(segmentCount(ring)).toBe(RING_SEGMENTS);
    for (let i = 0; i < ring.length; i += 3) expect(Math.hypot(ring[i] - 1, ring[i + 1] - 2, ring[i + 2] - 3)).toBeCloseTo(5);
    const cap: number[] = [];
    pushCapsule(cap, { a: { x: 0, y: 0, z: 0 }, b: { x: 10, y: 0, z: 0 }, r: 2 });
    expect(segmentCount(cap)).toBe(2 * RING_SEGMENTS + 4);
    const h: number[] = [];
    pushHatch(h, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 3, 5);
    expect(segmentCount(h)).toBe(10);
    for (let i = 0; i < h.length; i += 3) expect(Math.hypot(h[i], h[i + 1], h[i + 2])).toBeLessThanOrEqual(3 + 1e-9);
  });
});

describe('plan ghost geometry', () => {
  it('the ghost outline and fill follow the validated plan geometry; the label carries the reason', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const p = new DigPlanner();
    p.chamberType = 'nursery';
    const pv = p.hover(sim, wallPick(sim))!;
    expect(pv.geometry).toBeTruthy();
    const g = pv.geometry!;
    const outline = planOutline(g);
    expect(segmentCount(outline)).toBe(3 * RING_SEGMENTS + g.capsules.length * (2 * RING_SEGMENTS + 4));
    // every outline point lies inside the geometry's box (grown by a voxel)
    const v = sim.carve.voxel;
    for (let i = 0; i < outline.length; i += 3) {
      expect(outline[i]).toBeGreaterThanOrEqual(g.min.x - v); expect(outline[i]).toBeLessThanOrEqual(g.max.x + v);
      expect(outline[i + 1]).toBeGreaterThanOrEqual(g.min.y - v); expect(outline[i + 1]).toBeLessThanOrEqual(g.max.y + v);
    }
    const vols = ghostVolumes(g, '#fff');
    expect(vols[0].radii).toEqual({ x: g.ellipsoid!.hw, y: g.ellipsoid!.hh, z: g.ellipsoid!.hl });
    const scene = buildMarkerScene({ sim, colony: true, selectedMarkerId: -1, selectedPlanId: -1, preview: pv, tunnelStart: null, hover: null, selected: null });
    const ghostLines = scene.lines.find((l) => l.color === GHOST_STYLE[pv.validity].color);
    expect(ghostLines?.style).toBe(GHOST_STYLE[pv.validity].style);
    expect(scene.labels.length).toBe(1);
    expect(scene.volumes.length).toBe(vols.length);
  });

  it('a refused ghost is cross-hatched red with the reason text; markers draw rings of their radius', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const p = new DigPlanner();
    const pv = p.hover(sim, { point: { x: 10, y: -40, z: 10 }, normal: { x: 0, y: 1, z: 0 }, kind: 'cap' })!;
    expect(pv.validity).toBe('invalid');
    const tool = new MarkerTool();
    const c = sim.world.size / 2;
    tool.place(host(sim), 'forage', { x: c, y: sim.field.height(c, c), z: c }, -1, 30);
    const scene = buildMarkerScene({ sim, colony: true, selectedMarkerId: -1, selectedPlanId: -1, preview: pv, tunnelStart: null, hover: null, selected: null });
    const red = scene.lines.find((l) => l.color === GHOST_STYLE.invalid.color)!;
    expect(red.style).toBe('solid');
    expect(segmentCount(red.positions)).toBeGreaterThan(RING_SEGMENTS + 1); // disc + normal + hatch
    expect(scene.labels[0].text).toBe(pv.reason);
    const ring = scene.lines.find((l) => l.color === MARKER_COLOR.forage)!;
    const x0 = ring.positions[0], z0 = ring.positions[2];
    expect(Math.hypot(x0 - c, z0 - c)).toBeCloseTo(30 * sim.world.bu);
    // the description changes version when the ghost changes, and not otherwise
    const again = buildMarkerScene({ sim, colony: true, selectedMarkerId: -1, selectedPlanId: -1, preview: pv, tunnelStart: null, hover: null, selected: null });
    expect(again.version).toBe(scene.version);
  });
});
