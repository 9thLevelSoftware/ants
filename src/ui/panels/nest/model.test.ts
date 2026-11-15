// Nest overview model: rows, occupancy steps, comfort and risk words, and the schematic layout (task ui-panels, GDD 08 4.6).
import { describe, expect, it } from 'vitest';
import type { UiChamber, UiNest } from '../../api';
import { chamberRows, comfortOf, layoutSchematic, loadText, mainAxis, occupancyRatio, occupancyStep, risksOf } from './model';

const load = (adults = 0, brood = 0, food = 0) => ({ adults, brood, food, other: 0 });
function chamber(id: number, type: string, x: number, z: number, depth: number, o: Partial<UiChamber> = {}): UiChamber {
  return {
    id, type, designatedBy: 'auto', p: { x, z, depth }, radius: 3, volume: 40, capacity: load(10, 30, 0), occupancy: load(2, 15, 0), temp: 24, humidity: 0.8,
    flooded: 0, floodRisk: 0, allowed: ['nursery', 'general'], ...o,
  };
}
function nest(o: Partial<UiNest> = {}): UiNest {
  return {
    nestId: 1, species: 'lasius-niger', broodBand: { lo: 22, hi: 27, rhLo: 0.7, rhHi: 0.9 }, volumeOpen: 200,
    chambers: [chamber(1, 'founding', 0, 0, 8), chamber(2, 'nursery', 14, 3, 14), chamber(3, 'food', -10, -2, 10, { capacity: load(5, 0, 20), occupancy: load(0, 0, 25) })],
    entrances: [{ id: 9, status: 'open', kind: 'founding', p: { x: 0, z: 0, depth: 0 }, moundBu: 2, trafficIn: 3, trafficOut: 4 }],
    tunnels: [{ planId: 5, kind: 'shaft', status: 'complete', pts: [{ x: 0, z: 0, depth: 0 }, { x: 0, z: 0, depth: 8 }] }],
    openPlans: 1, ...o,
  };
}

describe('occupancy', () => {
  it('four shading steps: empty, light, half, full', () => {
    expect([0, 0.1, 0.5, 0.9, 1, 3].map(occupancyStep)).toEqual([0, 1, 2, 3, 3, 3]);
    expect(occupancyStep(Number.NaN)).toBe(0);
  });
  it('a brood chamber is as full as its brood, a store as its food, others by adults', () => {
    expect(occupancyRatio(chamber(1, 'nursery', 0, 0, 5))).toBeCloseTo(0.5);
    expect(occupancyRatio(chamber(1, 'food', 0, 0, 5, { capacity: load(5, 0, 20), occupancy: load(0, 0, 25) }))).toBeCloseTo(1.25);
    expect(occupancyRatio(chamber(1, 'rest', 0, 0, 5, { capacity: load(10, 0, 0), occupancy: load(4, 0, 0) }))).toBeCloseTo(0.4);
    expect(occupancyRatio(chamber(1, 'general', 0, 0, 5, { capacity: load(0, 0, 0) }))).toBe(0);
  });
  it('the load text names each part that has capacity', () => {
    expect(loadText({ capacity: load(10, 30, 0), occupancy: load(2.4, 15, 0) })).toBe('2 / 10 ants, 15 / 30 brood');
    expect(loadText({ capacity: load(0, 0, 0), occupancy: load(0, 0, 0) })).toBe('no capacity');
  });
});

describe('climate and risk', () => {
  const band = nest().broodBand;
  it('only brood chambers have a comfort mark', () => {
    expect(comfortOf({ type: 'nursery', temp: 24 }, band)).toBe('within');
    expect(comfortOf({ type: 'nursery', temp: 15 }, band)).toBe('outside');
    expect(comfortOf({ type: 'midden', temp: 15 }, band)).toBe('none');
    expect(comfortOf({ type: 'nursery', temp: 24 }, null)).toBe('none');
  });
  it('risk words come with a shape', () => {
    expect(risksOf(chamber(1, 'rest', 0, 0, 5, { flooded: 0.4 }), band)).toEqual([{ word: 'Flooded', shape: 'bad' }]);
    expect(risksOf(chamber(1, 'rest', 0, 0, 5, { floodRisk: 0.5 }), band)).toEqual([{ word: 'Flood risk', shape: 'warn' }]);
    expect(risksOf(chamber(1, 'nursery', 0, 0, 5, { humidity: 0.4 }), band).map((r) => r.word)).toEqual(['Dry']);
    expect(risksOf(chamber(1, 'food', 0, 0, 5, { capacity: load(0, 0, 10), occupancy: load(0, 0, 15) }), band).map((r) => r.word)).toEqual(['Crowded']);
    expect(risksOf(chamber(1, 'nursery', 0, 0, 5), band)).toEqual([]);
  });
  it('rows are sorted by id and carry the allowed designations', () => {
    const rows = chamberRows(nest());
    expect(rows.map((r) => r.id)).toEqual([1, 2, 3]);
    expect(rows[1].options).toEqual(['nursery', 'general']);
    expect(rows[1].word).toBe('Nursery 2');
    expect(rows[1].humidityPct).toBe(80);
  });
});

describe('schematic', () => {
  it('finds the direction a nest extends in', () => {
    const a = mainAxis([{ x: 0, z: 0 }, { x: 10, z: 10 }, { x: 20, z: 20 }]);
    expect(Math.abs(a.x)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(Math.abs(a.z)).toBeCloseTo(Math.SQRT1_2, 3);
    expect(mainAxis([])).toEqual({ x: 1, z: 0 });
    expect(mainAxis([{ x: 3, z: 3 }, { x: 3, z: 3 }])).toEqual({ x: 1, z: 0 });
  });
  it('puts every chamber, entrance and link inside the canvas, deeper chambers lower', () => {
    const L = layoutSchematic(nest());
    expect(L.chambers).toHaveLength(3);
    for (const c of L.chambers) {
      expect(c.x - c.rx).toBeGreaterThanOrEqual(0);
      expect(c.x + c.rx).toBeLessThanOrEqual(L.w);
      expect(c.y + c.ry).toBeLessThanOrEqual(L.h);
      expect(c.y - c.ry).toBeGreaterThan(L.ground);
    }
    const byId = (id: number) => L.chambers.find((c) => c.id === id)!;
    expect(byId(2).y).toBeGreaterThan(byId(1).y);
    for (const k of L.links) for (const p of k.pts) { expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true); expect(p.x).toBeGreaterThanOrEqual(0); expect(p.x).toBeLessThanOrEqual(L.w); }
    expect(L.entrances[0].mound).toBeGreaterThan(0);
  });
  it('links every chamber to the entrance: a tunnel where one exists, inferred lines for the rest', () => {
    const L = layoutSchematic(nest());
    expect(L.links.filter((k) => k.kind === 'tunnel')).toHaveLength(1);
    expect(L.links.filter((k) => k.kind === 'inferred').length).toBe(2); // chambers 2 and 3 have no tunnel
    // chamber 1 sits at the end of the shaft: no inferred line starts there
  });
  it('a nest with no chambers or one chamber still lays out (no NaN)', () => {
    for (const n of [nest({ chambers: [], tunnels: [] }), nest({ chambers: [chamber(1, 'founding', 0, 0, 8)], tunnels: [] }), nest({ entrances: [], tunnels: [] })]) {
      const L = layoutSchematic(n);
      for (const c of L.chambers) { expect(Number.isFinite(c.x)).toBe(true); expect(Number.isFinite(c.y)).toBe(true); }
      expect(Number.isFinite(L.scale)).toBe(true);
    }
  });
  it('is stable: the same nest draws the same way round', () => {
    const a = layoutSchematic(nest()), b = layoutSchematic(nest());
    expect(a).toEqual(b);
    const flipped = nest();
    flipped.chambers = flipped.chambers.map((c) => ({ ...c, p: { ...c.p, x: -c.p.x } }));
    const f = layoutSchematic(flipped);
    // entrances are at the left in both
    const ent = (L: typeof a) => L.entrances[0].x;
    const mean = (L: typeof a) => L.chambers.reduce((s, c) => s + c.x, 0) / L.chambers.length;
    expect(mean(a) >= ent(a)).toBe(true);
    expect(mean(f) >= ent(f)).toBe(true);
  });
});
