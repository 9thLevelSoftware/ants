// app-seams-2 review: minimap data edge cases (GDD 08 3.4 row "Minimap": the player's entrances as rings, markers as
// icons, the possessed ant as an arrow, trails only with the scent view, a 256 x 256 BU window round the camera target).
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { MINIMAP_MAX_TRAIL_CELLS } from './balance';
import { buildMinimapFrame, newMinimapFrame } from './minimap';

function setup() {
  const sim = makeTestSim({ nest: 'small', workers: 3 });
  const col = sim.state.colonies.find((c) => c.isPlayer)!.id;
  const nest = sim.state.nests.find((n) => n.colony === col)!;
  return { sim, col, nest, p: nest.entrances[0].pos };
}

describe('buildMinimapFrame (review)', () => {
  it('leaves out dead markers and markers of other colonies', () => {
    const { sim, p } = setup();
    sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { x: p.x + 20, y: p.y, z: p.z }, radius: 80 });
    sim.applyPendingCommands();
    const mine = sim.state.markers.filter((m) => m.alive);
    expect(mine.length).toBeGreaterThan(0);
    const foreign = { ...mine[0], id: 9999, colony: mine[0].colony + 7 };
    const dead = { ...mine[0], id: 9998, alive: false };
    sim.state.markers.push(foreign, dead);
    const f = buildMinimapFrame(sim, p, -1, false, newMinimapFrame());
    expect(f.markers.length).toBe(mine.length);
  });

  it('a possessed id that is dead or unknown gives no arrow', () => {
    const { sim, p } = setup();
    expect(buildMinimapFrame(sim, p, 123456, false, newMinimapFrame()).ant).toBeNull();
    const a = sim.state.ants.find((x) => x.alive)!;
    a.alive = false;
    expect(buildMinimapFrame(sim, p, a.id, false, newMinimapFrame()).ant).toBeNull();
  });

  it('caps the trail cells and keeps strengths in 0..1', () => {
    const { sim, col, p } = setup();
    const bu = sim.world.bu;
    for (let i = 0; i < 60; i++) for (let k = 0; k < 60; k++) sim.phero.deposit(col, 'trail', { x: p.x - 120 * bu + i * 4 * bu, y: p.y, z: p.z - 120 * bu + k * 4 * bu }, 1000);
    const f = buildMinimapFrame(sim, p, -1, true, newMinimapFrame());
    expect(f.trail.length).toBeGreaterThan(0);
    expect(f.trail.length).toBeLessThanOrEqual(MINIMAP_MAX_TRAIL_CELLS);
    for (const t of f.trail) { expect(t.v).toBeGreaterThan(0); expect(t.v).toBeLessThanOrEqual(1); }
  });

  it('reuses the arrays it was given (no growth from call to call) and clears stale data', () => {
    const { sim, p } = setup();
    const out = newMinimapFrame();
    buildMinimapFrame(sim, p, -1, false, out);
    const n = out.entrances.length;
    const ents = out.entrances;
    buildMinimapFrame(sim, p, -1, false, out);
    expect(out.entrances).toBe(ents);
    expect(out.entrances.length).toBe(n);
    buildMinimapFrame(sim, { x: p.x + 1e6, z: p.z }, -1, false, out);
    expect(out.entrances.length).toBe(0);
  });

  it('a focus outside the world still gives a well-formed frame', () => {
    const { sim } = setup();
    const f = buildMinimapFrame(sim, { x: -5000, z: sim.world.size + 5000 }, -1, true, newMinimapFrame());
    expect(Number.isFinite(f.windowMm)).toBe(true);
    expect(f.entrances).toEqual([]);
    expect(f.trail).toEqual([]);
  });
});
