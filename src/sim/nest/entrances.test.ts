// Entrances (GDD 03 §4; App. E checks 10 and 25; acceptance 4): breach registration by a shaft plan and by bites,
// sealing cuts nest-nav off from the outside, unsealing restores it, the founding seal.
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { detectNestChambers } from './chambers/upkeep';
import { carveTemplateNest, createPlan, digBite, instantCarvePlan, sealEntrance, unsealEntrance } from './index';
import { collect, feetOf, nestSim, placeWorker, playerNest, runTicks } from './nestTestKit';
import { walkerStep } from '@/sim/locomotion/walker';
import { VoxelFlag } from '@/sim/types';
import { makeTestWorld } from '@/sim/testing';
import { carveCapsule } from './carveOps';
import { nestRuntime } from './runtime';

const BU = 4;
const EXIT = { kind: 'exit' as const, id: -1 };

/** A room at 12 BU depth with a blind shaft rising to 5 BU depth, no entrance; the nest is established. */
function buriedNest(): { sim: Sim; room: Vec3; shaftTop: Vec3 } {
  const sim = nestSim();
  const c = sim.world.size / 2;
  const room = { x: c, y: -12 * BU, z: c };
  sim.kernel.carveEllipsoid(room, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
  const shaftTop = { x: c, y: -5 * BU, z: c };
  sim.kernel.carveCapsule({ x: c, y: room.y, z: c }, shaftTop, BU, { force: true });
  const nest = playerNest(sim, room);
  detectNestChambers(sim, nest);
  return { sim, room, shaftTop };
}

describe('entrances', () => {
  it('check 25 / acceptance 4: a shaft plan dug up to the surface registers a dug entrance; D_exit reaches the room', () => {
    const { sim, room, shaftTop } = buriedNest();
    const nest = sim.state.nests[0];
    expect(nest.entrances.length).toBe(0);
    expect(nest.chambers.length).toBe(1);
    const id = createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: { x: shaftTop.x, y: shaftTop.y + 0.9 * BU, z: shaftTop.z }, normal: { x: 0, y: -1, z: 0 } },
      length: 7, priority: 'normal', confirmWarnings: true,
    }, 'player');
    expect(id).toBeGreaterThan(0);
    const events = collect<{ type: string; kind?: string }>(sim, ['entrance-opened', 'breach'], () => instantCarvePlan(sim, id));
    expect(events.find((e) => e.type === 'entrance-opened')?.kind).toBe('dug');
    expect(nest.entrances.length).toBe(1);
    runTicks(sim, 20);
    for (const c of nest.chambers) expect(sim.nestNav.distance(nest.id, EXIT, c.center)).toBeGreaterThan(0);
    expect(sim.nestNav.distance(nest.id, EXIT, room)).toBeGreaterThan(0);
  });

  it('acceptance 4: sealing makes the outside unreachable for nest-nav; unsealing restores it', () => {
    const { sim, room, shaftTop } = buriedNest();
    const nest = sim.state.nests[0];
    const id = createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: { x: shaftTop.x, y: shaftTop.y + 0.9 * BU, z: shaftTop.z }, normal: { x: 0, y: -1, z: 0 } },
      length: 7, priority: 'normal', confirmWarnings: true,
    }, 'player');
    instantCarvePlan(sim, id);
    const e = nest.entrances[0];
    const outside = 'test:outside';
    sim.nestNav.setTarget(outside, { points: [{ ...e.pos }], radius: e.radius });
    expect(Number.isFinite(sim.nestNav.distanceAt(outside, room))).toBe(true);
    let sealed = false;
    for (let n = 0; n < 6 && !sealed; n++) sealed = sealEntrance(sim, e.id, -1);
    expect(sealed).toBe(true);
    expect(e.status).toBe('sealed');
    expect(e.plugVoxelCount).toBeGreaterThan(0);
    expect(sim.nestNav.distance(nest.id, EXIT, room)).toBe(-1);
    expect(sim.nestNav.distanceAt(outside, room)).toBe(Infinity);
    expect(sim.nestNav.distance(nest.id, { kind: 'seal', id: -1 }, room)).toBeGreaterThan(0);
    let open = false, bites = 0;
    for (; bites < 40 && !open; bites++) open = unsealEntrance(sim, e.id, -1);
    expect(open).toBe(true);
    expect(e.status).toBe('open');
    expect(Number.isFinite(sim.nestNav.distanceAt(outside, room))).toBe(true);
    expect(sim.nestNav.distance(nest.id, EXIT, room)).toBeGreaterThan(0);
  });

  it('a worker biting up through a thin roof breaches the surface and registers an entrance', () => {
    const sim = nestSim();
    const c = sim.world.size / 2, y = -2.2 * BU;
    sim.kernel.carveCapsule({ x: c - 6 * BU, y, z: c }, { x: c, y, z: c }, BU, { force: true });
    sim.kernel.carveEllipsoid({ x: c - 10 * BU, y: y - 0.5 * BU, z: c }, { x: 3.5 * BU, y: 1.5 * BU, z: 3.5 * BU }, { force: true });
    const nest = playerNest(sim, { x: c - 10 * BU, y: y - 0.5 * BU, z: c });
    const ant = placeWorker(sim, { x: c - 1.2 * BU, y, z: c }, { x: 1, y: 0, z: 0 }, nest.id);
    let opened = false;
    for (let n = 0; n < 12 && !opened; n++) {
      const ev = collect<{ type: string }>(sim, ['entrance-opened'], () => digBite(sim, ant, feetOf(ant), { x: 1, y: 0, z: 0 }, -55));
      opened = ev.length > 0;
      walkerStep(sim.field, ant, { x: 1, y: 0.5, z: 0 }, 3 * BU, 0.1, sim.kernel.walker);
    }
    expect(opened).toBe(true);
    expect(nest.entrances[0].kind).toBe('dug');
    expect(nest.entrances[0].radius).toBeGreaterThanOrEqual(0.75 * BU);
  });

  it('check 10: a queen in `ready` seals a 2.5 BU throat with up to 3 plugs; D_exit loses its seeds', () => {
    const sim = nestSim();
    const nest = playerNest(sim);
    nest.origin = { x: sim.world.size / 2 + 20 * BU, y: 0, z: sim.world.size / 2 };
    carveTemplateNest(sim, nest.id, { chambers: [], royal: false });
    expect(nest.entrances.length).toBe(1);
    expect(nest.chambers[0].type).toBe('founding');
    const e = nest.entrances[0];
    nest.founding = { state: 'ready', readiness: 1, cavitySeed: { ...nest.origin }, abandoned: [], readyTick: 0, sealedTick: -1 };
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    queen.pos = { x: e.pos.x, y: e.pos.y - 3 * BU, z: e.pos.z };
    queen.fwd = { x: 0, y: 1, z: 0 };
    let n = 0;
    const events = collect<{ type: string; status?: string }>(sim, ['entrance-state-changed', 'founding-sealed'], () => {
      for (; n < 3 && e.status !== 'sealed'; n++) sealEntrance(sim, e.id, queen.id);
    });
    expect(e.status).toBe('sealed');
    expect(n).toBeLessThanOrEqual(3);
    expect(events.some((x) => x.type === 'entrance-state-changed' && x.status === 'sealed')).toBe(true);
    expect(events.some((x) => x.type === 'founding-sealed')).toBe(true);
    expect(nest.founding?.state).toBe('sealed');
    expect(sim.nestNav.hasTarget(nestFieldId(nest.id, EXIT))).toBe(false);
  });
});

describe('natural cavities (GDD 03 §3, check 25 second clause)', () => {
  it('a tunnel dug into an unowned under-slab cavity joins it: natural-cavity-joined and a natural entrance', () => {
    const world = makeTestWorld();
    const c = world.size / 2, y = -3 * BU;
    const cav = { x: c + 12 * BU, y, z: c };
    world.preCarve.push({ shape: 'ellipsoid', a: cav, b: { x: 4 * BU, y: 1 * BU, z: 3 * BU }, r: 0, natural: true, cavityId: 1 });
    world.cavities.push({
      id: 1, kind: 'under-slab', min: { x: cav.x - 4 * BU, y: y - BU, z: cav.z - 3 * BU }, max: { x: cav.x + 4 * BU, y: y + BU, z: cav.z + 3 * BU },
      openings: [{ pos: { x: cav.x + 4 * BU, y: 0, z: cav.z }, normal: { x: 0, y: 1, z: 0 }, radius: BU }],
    });
    const sim = nestSim({ world });
    runTicks(sim, 1); // tick 0 flags the pre-carve NATURAL
    expect(nestRuntime(sim).flags.count(VoxelFlag.NATURAL)).toBeGreaterThan(0);
    const room = { x: c, y, z: c };
    sim.kernel.carveEllipsoid(room, { x: 3 * BU, y: 1.25 * BU, z: 3 * BU }, { force: true });
    const nest = playerNest(sim, room);
    const events = collect<{ type: string; kind?: string; cavityId?: number }>(sim, ['natural-cavity-joined', 'entrance-opened'], () => {
      carveCapsule(sim, { x: c + 2 * BU, y, z: c }, { x: cav.x - 3 * BU, y, z: c }, BU);
    });
    expect(events.some((e) => e.type === 'natural-cavity-joined' && e.cavityId === 1)).toBe(true);
    expect(nest.entrances.some((e) => e.kind === 'natural')).toBe(true);
    expect(sim.state.worldDelta.naturalOwners['1']).toBe(nest.id);
  });
});
