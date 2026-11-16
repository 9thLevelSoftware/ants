// Colony slice readability (int-1B-app addendum): chambers are named in the slice as in the x-ray, and the plane
// outlines every chamber it cuts, so the cut face reads as rooms.
import { describe, expect, it } from 'vitest';
import { segmentCount, RING_SEGMENTS } from '@/render/fx/markers/shapes';
import { CHAMBER_OUTLINE_COLOR } from '@/render/fx/markers/palette';
import { makeTestSim } from '@/sim/testing';
import { CHAMBER_WORDS } from './chamberOverlay';
import { buildMarkerScene } from './markerScene';
import { playerNest } from './digPlanner';

const base = (sim: ReturnType<typeof makeTestSim>) =>
  ({ sim, colony: true, selectedMarkerId: -1, selectedPlanId: -1, preview: null, tunnelStart: null, hover: null, selected: null });

describe('colony view chamber overlay', () => {
  it('a slice through a chamber outlines it on the plane and names it', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim)!;
    const ch = nest.chambers.find((c) => c.type === 'nursery') ?? nest.chambers[0];
    const d = buildMarkerScene({ ...base(sim), cutaway: 'slice', slicePlaneY: ch.center.y });
    const outline = d.lines.find((l) => l.color === CHAMBER_OUTLINE_COLOR);
    expect(outline).toBeDefined();
    expect(segmentCount(outline!.positions) % RING_SEGMENTS).toBe(0);
    // the ring through the chamber's centre has its full horizontal radii and lies on the plane
    const ys = new Set<number>();
    let maxDx = 0;
    for (let i = 0; i < outline!.positions.length; i += 3) {
      ys.add(Math.round(outline!.positions[i + 1] - ch.center.y));
      if (Math.abs(outline!.positions[i + 2] - ch.center.z) < 1e-6) maxDx = Math.max(maxDx, Math.abs(outline!.positions[i] - ch.center.x));
    }
    expect([...ys].every((y) => Math.abs(y) <= 1)).toBe(true);
    expect(maxDx).toBeCloseTo(ch.radii.x, 0);
    expect(d.labels.map((l) => l.text)).toContain(CHAMBER_WORDS[ch.type]);
  });

  it('a chamber wholly below the slice is named as below (the cap hides it)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim)!;
    const top = Math.max(...nest.chambers.map((c) => c.center.y + c.radii.y));
    const d = buildMarkerScene({ ...base(sim), cutaway: 'slice', slicePlaneY: top + 0.5 * sim.world.bu });
    expect(d.labels.length).toBe(nest.chambers.length);
    expect(d.labels.every((l) => l.text.endsWith('(below)'))).toBe(true);
  });

  it('chambers wholly above the slice are neither outlined nor named; the version follows the plane', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim)!;
    const deepest = Math.min(...nest.chambers.map((c) => c.center.y - c.radii.y));
    const below = buildMarkerScene({ ...base(sim), cutaway: 'slice', slicePlaneY: deepest - sim.world.bu });
    expect(below.labels).toHaveLength(0);
    expect(below.lines.some((l) => l.color === CHAMBER_OUTLINE_COLOR)).toBe(false);
    const at = buildMarkerScene({ ...base(sim), cutaway: 'slice', slicePlaneY: nest.chambers[0].center.y });
    expect(at.version).not.toBe(below.version);
  });

  it('x-ray names every chamber in words (not raw type ids) and draws no slice outline', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const nest = playerNest(sim)!;
    const d = buildMarkerScene({ ...base(sim), cutaway: 'xray' });
    expect(d.labels.map((l) => l.text).sort()).toEqual(nest.chambers.map((c) => CHAMBER_WORDS[c.type]).sort());
    expect(d.lines.some((l) => l.color === CHAMBER_OUTLINE_COLOR)).toBe(false);
  });

  it('no chamber overlay outside the colony view or with the cutaway off', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    expect(buildMarkerScene({ ...base(sim), cutaway: 'off' }).labels).toHaveLength(0);
    expect(buildMarkerScene({ ...base(sim), colony: false, cutaway: 'slice', slicePlaneY: -10 }).labels).toHaveLength(0);
  });
});
