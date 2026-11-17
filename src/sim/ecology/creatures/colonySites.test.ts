// Colony-range siting details (threats-live review): vertical surfaces honour the primitive's rotation, sites sit by
// the colony's food sources where its ants pause, and a territory whose resident cannot be placed is not retried on
// every director run.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Entrance, Primitive, Sim, WorldData } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { quatFromAxisAngle, quatIdentityNew } from '@/core/math/quat';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { createNest } from '@/sim/entities';
import { restore, snapshot } from '@/sim/save';
import { generateWorld } from '@/worldgen';
import { PREDATION_RAMP_WORKERS } from '@/sim/balance/difficulty';
import { makeTestSim } from '@/sim/testing';
import { locomotionSystem } from '@/sim/locomotion';
import { TICKS_PER_DAY } from '@/sim/time';
import { COLONY_PAUSE_KINDS } from '@/sim/balance/creatures';
import {
  COLONY_PAUSE_SOURCES, COLONY_SOURCE_NEAR_BU, JUMPING_SPIDER_SURFACE_MIN_MM, TERRITORY_NO_SURFACE_RETRY_GD,
} from '@/sim/balance/creatures';
import { atPausePoints, colonySources, jumpingSpiderSites, uprightPrim } from './colonySites';
import { COLONY_RANGE_KINDS, colonyAnchor, ensureColonyRangeTerritories } from './colonyRange';
import { creatureDirectorSystem, creatureSystem } from './index';
import { ports } from './ports';
import { captureEvents, placeWorker, setClock, step } from './testkit';

function prim(shape: Primitive['shape'], size: { x: number; y: number; z: number }, rot = quatIdentityNew(), flags = 0): Primitive {
  return { id: 1, shape, pos: { x: 0, y: 0, z: 0 }, rot, size, round: 0, material: 'wood-sound', flags, objectId: 1 };
}
const lying = () => quatFromAxisAngle(quatIdentityNew(), { x: 0, y: 0, z: 1 }, Math.PI / 2);

describe('uprightPrim: vertical surfaces in world space', () => {
  it('an upright post counts with its half height; the same post lying on the ground does not', () => {
    expect(uprightPrim(prim('cylinder', { x: 10, y: 60, z: 0 }))?.top).toBeCloseTo(60);
    expect(uprightPrim(prim('cylinder', { x: 10, y: 60, z: 0 }, lying()))).toBeNull();
    expect(uprightPrim(prim('capsule', { x: 10, y: 60, z: 0 }, lying()))).toBeNull();
  });

  it('a board lying flat reports its thickness, not its length, as height', () => {
    // a 200 x 10 x 80 mm board stood on its long edge, then laid flat (rotated 90 degrees about x)
    const flat = quatFromAxisAngle(quatIdentityNew(), { x: 1, y: 0, z: 0 }, Math.PI / 2);
    const board = uprightPrim(prim('box', { x: 100, y: 40, z: 5 }, flat));
    expect(board).not.toBeNull(); // a box always has vertical faces
    expect(board!.top).toBeCloseTo(5);
    expect(board!.top).toBeLessThan(JUMPING_SPIDER_SURFACE_MIN_MM);
  });

  it('visual-only primitives and flat boulders are not surfaces', () => {
    expect(uprightPrim(prim('box', { x: 10, y: 60, z: 10 }, quatIdentityNew(), PrimFlag.VISUAL_ONLY))).toBeNull();
    expect(uprightPrim(prim('ellipsoid', { x: 60, y: 30, z: 60 }))).toBeNull();
    expect(uprightPrim(prim('ellipsoid', { x: 20, y: 50, z: 20 }))?.top).toBeCloseTo(50);
  });
});

// ------------------------------------------------------------------ generated world

let world: WorldData;
let base: Uint8Array;

beforeAll(() => {
  const d = defaultGameConfig('lasius-niger', 1);
  const cfg = { ...d, cheats: true, world: { ...d.world, archetype: 'woodland-edge' as const } };
  world = generateWorld(cfg.world);
  const sim = createSim(createNewGame(cfg, world).state, world);
  const col = sim.state.colonies.find((c) => c.isPlayer)!;
  const p = sim.world.queenStart.pos;
  const nest = createNest(sim, { colony: col.id, origin: p });
  nest.entrances.push({ id: sim.state.nextId++, pos: { ...p } } as Entrance);
  if (sim.state.player.opening) sim.state.player.opening.done = true;
  // threats-calibrate: 40 workers, the Naturalist upper bound of the colony-size ramp (R25), so the siting is un-ramped
  for (let i = 0; i < PREDATION_RAMP_WORKERS.naturalist[1]; i++) placeWorker(sim, p.x + (i % 5) - 2, p.z + Math.floor(i / 5) % 5 - 2, col.id);
  base = snapshot(sim);
}, 120_000);

describe('colony-range sites on a generated world (woodland-edge #1)', () => {
  it('jumping-spider sites: food on a stem, else open ground at the foot of a vertical surface', () => {
    const sim = createSim(restore(base).state, world);
    const { atFood, surfaces } = jumpingSpiderSites(sim, colonyAnchor(sim)!);
    expect(surfaces.length).toBeGreaterThan(0);
    for (const s of surfaces) expect(sim.field.sample({ x: s.x, y: s.y + sim.world.bu, z: s.z })).toBeGreaterThan(0);
    for (const s of atFood) expect(s.y - sim.field.height(s.x, s.z)).toBeGreaterThanOrEqual(JUMPING_SPIDER_SURFACE_MIN_MM);
  });

  // Ruling R26: no kind is sited at the pause points until the loss rate is calibrated (COLONY_PAUSE_KINDS is empty).
  it.skipIf(COLONY_PAUSE_KINDS.length === 0)('the pause-point kinds wait by one of the colony\'s nearest food sources, where its ants pause', () => {
    const sim = createSim(restore(base).state, world);
    const anchor = colonyAnchor(sim)!;
    const before = sim.state.ecology.director.territories.length;
    expect(ensureColonyRangeTerritories(sim)).toBeGreaterThan(0);
    const pauses = colonySources(sim, anchor).slice(0, COLONY_PAUSE_SOURCES);
    expect(pauses.length).toBeGreaterThan(0);
    const added = sim.state.ecology.director.territories.slice(before);
    expect(added.some((t) => atPausePoints(t.kind))).toBe(true);
    for (const t of added) {
      expect(COLONY_RANGE_KINDS).toContain(t.kind);
      if (!atPausePoints(t.kind)) continue;
      const d = Math.min(...pauses.map((p) => Math.hypot(p.x - t.center.x, p.z - t.center.z))) / sim.world.bu;
      expect(d, t.kind).toBeLessThanOrEqual(COLONY_SOURCE_NEAR_BU + 1e-6);
    }
  });
});

// ------------------------------------------------------------------ failed placements

describe('a territory whose resident cannot be placed', () => {
  const saved = ports.placeOnSurface;
  afterEach(() => { ports.placeOnSurface = saved; });

  it('is tried once and then left vacant for TERRITORY_NO_SURFACE_RETRY_GD, not on every director run', () => {
    const sim = makeTestSim({ seed: 3, sizeBu: 420, nest: 'small', workers: 0, systems: [creatureDirectorSystem, creatureSystem, locomotionSystem] });
    if (sim.state.player.opening) { sim.state.player.opening.done = true; sim.state.player.opening.phase = 'done'; }
    setClock(sim, 'summer', 3, 14);
    const e = sim.state.nests[0].entrances[0].pos, bu = sim.world.bu;
    const x = Math.min(e.x + 120 * bu, sim.world.size - 40), z = e.z;
    sim.state.ecology.director.territories.length = 0;
    sim.state.ecology.director.territories.push({ kind: 'woodlouse', center: { x, y: sim.field.height(x, z), z }, radius: 200, occupantId: -1, vacantUntilTick: -1 });
    ports.placeOnSurface = () => false; // as for a worldgen centre inside a solid
    const gone = captureEvents(sim, ['creature-despawned']);
    step(sim, 1000); // 20 director runs
    const noSurface = gone.filter((g) => { const ev = g.ev as { cause: string; kind: string }; return ev.cause === 'no-surface' && ev.kind === 'woodlouse'; });
    expect(noSurface.length).toBe(1);
    const t = sim.state.ecology.director.territories[0];
    expect(t.vacantUntilTick - sim.state.tick).toBeGreaterThan(TERRITORY_NO_SURFACE_RETRY_GD * TICKS_PER_DAY - 1100);
  }, 60_000);
});
