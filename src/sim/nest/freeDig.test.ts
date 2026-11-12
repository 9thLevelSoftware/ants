// Free digging without a plan (nest-fixes defects 1, 2, 5; acceptance 2 and 5): a founding queen walks away from
// her start point and digs a shaft and a room with the real `dig-bite` primitive and locomotion only. The breach
// must create the nest's entrance, the room must register (the founding cell rule while founding), lay-egg must
// be allowed there and nest-nav must lead from the room to the surface; save / load and determinism hold.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { canDo } from '@/sim/ants';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { foundingReadiness } from './chambers/foundingCell';
import { colonyNests, freeDig, type Dug } from './freeDigKit';
import { runTicks } from './nestTestKit';

const EXIT = { kind: 'exit' as const, id: -1 };

/** Steps down the exit field from p (nest-nav descent); returns the last point. */
function descendToExit(sim: Sim, nest: Nest, from: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  const bu = sim.world.bu, p = { ...from }, dir = { x: 0, y: 0, z: 0 };
  for (let n = 0; n < 400 && sim.nestNav.descend(nest.id, EXIT, p, dir); n++) {
    p.x += dir.x * 0.5 * bu; p.y += dir.y * 0.5 * bu; p.z += dir.z * 0.5 * bu;
  }
  return p;
}

describe('free dig by a founding queen away from her start point', () => {
  let d: Dug;
  beforeAll(() => { d = freeDig(3); }, 120_000);

  it('defect 1: the breach creates the entrance of exactly one nest of her colony, at the hole', () => {
    const { sim, queen, dig } = d;
    expect(dig.shaftTick).toBeGreaterThan(0);
    const nests = colonyNests(sim, queen.colony);
    expect(nests.length).toBe(1);
    const nest = nests[0];
    expect(nest.entrances.length).toBe(1);
    const e = nest.entrances[0];
    expect(e.kind).toBe('dug');
    expect(e.status).toBe('open');
    expect(sim.field.isHoleAt(e.pos.x, e.pos.z)).toBe(true);
    // at the dig site, not at the start point the nest record was created at
    expect(Math.hypot(e.pos.x - dig.start.x, e.pos.z - dig.start.z)).toBeLessThan(6 * sim.world.bu);
    expect(Math.hypot(nest.origin.x - dig.start.x, nest.origin.z - dig.start.z)).toBeLessThan(3 * sim.world.bu);
  });

  it('defect 2: the room registers as the founding cell; lay-egg is allowed inside; nest-nav reaches the surface', () => {
    const { sim, queen, dig } = d;
    const nest = colonyNests(sim, queen.colony)[0];
    expect(nest.chambers.length).toBe(1);
    const cell = nest.chambers[0];
    expect(cell.type).toBe('founding');
    expect(cell.volume).toBeGreaterThanOrEqual(10);
    const r = foundingReadiness(sim, nest)!;
    expect(r.ready).toBe(true);
    expect(nest.founding!.readiness).toBeCloseTo(r.readiness, 9);
    // the opening's `lay` phase is the founding module's; the nest's part is the place
    sim.state.player.opening!.phase = 'lay';
    expect(queen.medium).toBe('cavity');
    expect(Math.hypot(queen.pos.x - dig.bottom!.x, queen.pos.z - dig.bottom!.z)).toBeLessThan(4 * sim.world.bu);
    expect(canDo(sim, queen, 'lay-egg', null)).toEqual({ ok: true, reason: null });
    // D_exit is finite in the room and its descent ends at the opening
    expect(sim.nestNav.hasTarget(nestFieldId(nest.id, EXIT))).toBe(true);
    expect(sim.nestNav.distance(nest.id, EXIT, cell.center)).toBeGreaterThan(0);
    const end = descendToExit(sim, nest, cell.center);
    const e = nest.entrances[0];
    expect(Math.hypot(end.x - e.pos.x, end.y - e.pos.y, end.z - e.pos.z)).toBeLessThan(e.radius + 2 * sim.world.bu);
  });

  it('acceptance 5: save / load keeps entrances, chambers and mounds, and the continued runs agree', () => {
    const { sim } = d;
    const bytes = snapshot(sim);
    const loaded = createSim(restore(bytes).state, sim.world, { behaviours: passiveBehaviours() });
    expect(JSON.stringify(loaded.state.nests)).toBe(JSON.stringify(sim.state.nests));
    expect(loaded.state.worldDelta.mounds.length).toBe(sim.state.worldDelta.mounds.length);
    for (let n = 0; n < sim.state.worldDelta.mounds.length; n++) {
      const a = sim.state.worldDelta.mounds[n], b = loaded.state.worldDelta.mounds[n];
      expect(b.id).toBe(a.id);
      expect(Array.from(b.h)).toEqual(Array.from(a.h));
    }
    runTicks(sim, 600);
    runTicks(loaded, 600);
    expect(stateHash(loaded.state)).toBe(stateHash(sim.state));
  });
});

describe('free dig: other owners', () => {
  it('defect 1: a founding queen whose colony has no nest record yet gets one at her first bite', () => {
    const { sim, queen } = freeDig(5, { noNest: true, awayBu: 0 });
    const nests = colonyNests(sim, queen.colony);
    expect(nests.length).toBe(1);
    expect(nests[0].founding).not.toBeNull();
    expect(nests[0].entrances.length).toBe(1);
    expect(nests[0].chambers.length).toBe(1);
  }, 120_000);

  it('determinism: the same seed gives the same state hash', () => {
    const a = freeDig(7, { awayBu: 10 }), b = freeDig(7, { awayBu: 10 });
    expect(stateHash(a.sim.state)).toBe(stateHash(b.sim.state));
  }, 240_000);
});
