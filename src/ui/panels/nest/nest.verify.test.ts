// Adversarial checks of Nest overview (task ui-panels review, GDD 08 4.6): the real test nest through the slice, layouts
// of awkward nests, designation options against the sim's own rule, and a midden's load.
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { designateChamber } from '@/sim/nest';
import { nestOf } from '@/game/uiBridge/panels';
import type { UiChamber, UiNest } from '../../api';
import { chamberRows, designationOptions, layoutSchematic, occupancyStep } from './model';

const load = (o: Partial<UiChamber['occupancy']> = {}) => ({ adults: 0, brood: 0, food: 0, other: 0, ...o });
function chamber(id: number, type: string, x: number, depth: number, o: Partial<UiChamber> = {}): UiChamber {
  return {
    id, type, designatedBy: 'auto', p: { x, z: 0, depth }, radius: 5, volume: 400, capacity: load({ adults: 60, brood: 60, food: 60 }), occupancy: load(),
    temp: 22, humidity: 0.7, flooded: 0, floodRisk: 0, allowed: ['general'], ...o,
  } as UiChamber;
}
function nest(o: Partial<UiNest> = {}): UiNest {
  return { nestId: 1, species: 'lasius-niger', broodBand: { lo: 22, hi: 27, rhLo: 0.6, rhHi: 0.9 }, volumeOpen: 1000, chambers: [], entrances: [], tunnels: [], openPlans: 0, ...o } as UiNest;
}
const inside = (L: ReturnType<typeof layoutSchematic>) => (x: number, y: number) => x >= 0 && x <= L.w && y >= 0 && y <= L.h;

describe('real test nest', () => {
  it('every option offered for a chamber is accepted by the sim, and nothing the sim accepts is hidden', () => {
    const sim = makeTestSim({ nest: 'small', workers: 4 });
    const n = nestOf(sim)!;
    for (const c of n.chambers) {
      for (const t of ['royal', 'nursery', 'food', 'midden', 'rest', 'general', 'granary', 'fungus']) {
        const probe = makeTestSim({ nest: 'small', workers: 4 });
        const ok = designateChamber(probe, c.id, t as never, 'player');
        if (t === c.type) continue;
        expect(c.allowed.includes(t), `chamber ${c.id} ${c.type} -> ${t}: sim says ${ok}`).toBe(ok);
      }
    }
  });
});

describe('layout of awkward nests', () => {
  it('a deep, narrow nest (one vertical shaft of chambers) stays inside the canvas', () => {
    const n = nest({
      chambers: [0, 30, 60, 90, 120].map((d, i) => chamber(10 + i, 'general', 0, d + 4)),
      entrances: [{ id: 1, status: 'open', kind: 'main', p: { x: 0, z: 0, depth: 0 }, moundBu: 2, trafficIn: 1, trafficOut: 1 }] as UiNest['entrances'],
    });
    const L = layoutSchematic(n);
    const ok = inside(L);
    for (const c of L.chambers) expect(ok(c.x, c.y + c.ry), `chamber ${c.id} bottom`).toBe(true);
  });

  it('a wide nest (chambers 300 BU apart) stays inside the canvas and keeps chambers distinguishable', () => {
    const n = nest({ chambers: [chamber(1, 'nursery', -150, 6), chamber(2, 'food', 150, 6)] });
    const L = layoutSchematic(n);
    for (const c of L.chambers) expect(c.x - c.rx >= 0 && c.x + c.rx <= L.w).toBe(true);
  });

  it('two chambers at the same place do not produce NaN', () => {
    const L = layoutSchematic(nest({ chambers: [chamber(1, 'food', 0, 5), chamber(2, 'rest', 0, 5)] }));
    for (const c of L.chambers) expect(Number.isFinite(c.x) && Number.isFinite(c.y)).toBe(true);
    expect(Number.isFinite(L.axis.x) && Number.isFinite(L.axis.z)).toBe(true);
  });

  it('a nest without entrances still lays out', () => {
    const L = layoutSchematic(nest({ chambers: [chamber(1, 'food', 0, 5), chamber(2, 'rest', 20, 9)] }));
    expect(L.chambers).toHaveLength(2);
  });
});

describe('loads', () => {
  it('occupancy over capacity is the fullest shading step, never beyond', () => {
    expect(occupancyStep(3.5)).toBe(3);
    expect(occupancyStep(Number.NaN)).toBe(0);
    expect(occupancyStep(-1)).toBe(0);
  });

  // A midden's capacity is `other` only (CHAMBER_CAPACITY.midden in src/sim/balance/nest.ts), so the table shows
  // "no capacity" and the diagram "Empty" even for a midden that is full of waste.
  it('a full midden does not read as empty', () => {
    const n = nest({ chambers: [chamber(1, 'midden', 0, 6, { capacity: load({ other: 30 }), occupancy: load({ other: 30 }) })] });
    const row = chamberRows(n)[0];
    expect(row.step).toBeGreaterThan(0);
  });
});

describe('designation options', () => {
  it('keep the sim order after a choice and keep the current type visible', () => {
    const allowed = ['nursery', 'food', 'rest', 'general'];
    expect(designationOptions('food', allowed).map((o) => o.value)).toEqual(allowed);
    expect(designationOptions('rest', allowed).map((o) => o.value)).toEqual(allowed);
    const sealed = designationOptions('founding', allowed);
    expect(sealed.at(-1)).toMatchObject({ value: 'founding', disabled: true });
  });
});
