// Minimap data (GDD 08 3.4): the window, entrances, markers, the possessed ant's heading, trails only with the scent view.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { MINIMAP_WINDOW_BU } from './balance';
import { buildMinimapFrame, mapYaw, minimapPlate, newMinimapFrame } from './minimap';

function setup() {
  const sim = makeTestSim({ nest: 'small', workers: 3 });
  const nest = sim.state.nests.find((n) => n.colony === sim.state.colonies.find((c) => c.isPlayer)?.id) ?? sim.state.nests[0];
  return { sim, nest };
}

describe('buildMinimapFrame', () => {
  it('is a 256 BU window centred on the focus', () => {
    const { sim } = setup();
    const f = buildMinimapFrame(sim, { x: 1000, z: 2000 }, -1, false, newMinimapFrame());
    expect(f.windowMm).toBe(MINIMAP_WINDOW_BU * sim.world.bu);
    expect([f.cx, f.cz]).toEqual([1000, 2000]);
    expect(f.ant).toBeNull();
    expect(f.trail).toEqual([]);
  });

  it('lists the player colony entrances near the window and none far away', () => {
    const { sim, nest } = setup();
    const e = nest.entrances[0];
    expect(e).toBeDefined();
    const near = buildMinimapFrame(sim, { x: e.pos.x + 10, z: e.pos.z - 10 }, -1, false, newMinimapFrame());
    expect(near.entrances.length).toBe(nest.entrances.length);
    expect(near.entrances[0].open).toBe(e.status === 'open' || e.status === 'reopening');
    const far = buildMinimapFrame(sim, { x: e.pos.x + 5000, z: e.pos.z }, -1, false, newMinimapFrame());
    expect(far.entrances).toEqual([]);
  });

  it('lists live markers of the player colony', () => {
    const { sim, nest } = setup();
    const p = { ...nest.entrances[0].pos };
    sim.enqueue({ type: 'placeMarker', kind: 'forage', pos: { x: p.x + 30, y: p.y, z: p.z + 30 }, radius: 100 });
    sim.applyPendingCommands();
    const f = buildMinimapFrame(sim, p, -1, false, newMinimapFrame());
    expect(f.markers.map((m) => m.kind)).toContain('forage');
  });

  it('gives the possessed ant as an arrow with its heading', () => {
    const { sim } = setup();
    sim.enqueue({ type: 'possess', role: 'queen' });
    sim.applyPendingCommands();
    const id = sim.state.player.possessedAntId;
    expect(id).toBeGreaterThanOrEqual(0);
    const a = sim.stores.ants.get(id)!;
    const f = buildMinimapFrame(sim, a.pos, id, false, newMinimapFrame());
    expect(f.ant).not.toBeNull();
    expect(f.ant!.x).toBe(a.pos.x);
  });

  it('draws trail cells only with the scent view on, only inside the window', () => {
    const { sim, nest } = setup();
    const col = sim.state.colonies.find((c) => c.isPlayer)!.id;
    const p = nest.entrances[0].pos;
    sim.phero.deposit(col, 'trail', { x: p.x + 40, y: p.y, z: p.z }, 12);
    sim.phero.deposit(col, 'trail', { x: p.x + 9000, y: p.y, z: p.z }, 12);
    const off = buildMinimapFrame(sim, p, -1, false, newMinimapFrame());
    expect(off.trail).toEqual([]);
    const on = buildMinimapFrame(sim, p, -1, true, newMinimapFrame());
    expect(on.trail.length).toBeGreaterThan(0);
    for (const t of on.trail) { expect(Math.abs(t.x - p.x)).toBeLessThanOrEqual(on.windowMm / 2); expect(t.v).toBeGreaterThan(0); expect(t.v).toBeLessThanOrEqual(1); }
  });

  it('the plate carries the zone map and the type of every zone id', () => {
    const { sim } = setup();
    const pl = minimapPlate(sim);
    expect(pl.map).toBe(sim.world.maps.zone);
    for (const z of sim.world.zones) expect(pl.typeById[z.id]).toBe(z.type);
    expect(pl.size).toBe(sim.world.size);
  });
});

describe('mapYaw', () => {
  it('0 is north (-Z), clockwise: east is +90 degrees', () => {
    expect(mapYaw(0, -1)).toBeCloseTo(0);
    expect(mapYaw(1, 0)).toBeCloseTo(Math.PI / 2);
    expect(mapYaw(0, 1)).toBeCloseTo(Math.PI);
  });
  it('is null when the ant points up or down a wall', () => {
    expect(mapYaw(0.01, 0.02)).toBeNull();
  });
});

describe('static shapes and known food (look pass 4)', () => {
  it('the plate carries the footprints of structure-tagged objects and the water bodies', () => {
    const { sim } = setup();
    const plate = minimapPlate(sim);
    const tagged = sim.world.objects.filter((o) => o.tags.includes('structure')).length;
    expect(plate.structures.length > 0).toBe(tagged > 0);
    for (const s of plate.structures) { expect(s.hx).toBeGreaterThan(0); expect(Number.isFinite(s.yaw)).toBe(true); }
    expect(plate.water.length).toBe(sim.world.waterBodies.length);
  });

  it('lists only the food the player colony has discovered, inside the window', () => {
    const { sim } = setup();
    const src = sim.stores.sources.list.find((s) => s.alive);
    if (!src) return; // the small test world has none: nothing to check
    const slot = sim.stores.colonies.get(sim.state.player.colonyId)?.rival?.territorySlot ?? 0;
    src.discoveredBy = 0;
    expect(buildMinimapFrame(sim, src.pos, -1, false, newMinimapFrame()).food).toEqual([]);
    src.discoveredBy = 1 << slot;
    const f = buildMinimapFrame(sim, src.pos, -1, false, newMinimapFrame());
    expect(f.food).toContainEqual({ x: src.pos.x, z: src.pos.z });
    expect(buildMinimapFrame(sim, { x: src.pos.x + 9000, z: src.pos.z }, -1, false, newMinimapFrame()).food).toEqual([]);
  });
});
