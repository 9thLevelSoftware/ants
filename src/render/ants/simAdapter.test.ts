import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, POSES } from '@/sim/types';
import { SimReader, newAntSample, newBroodSample, newItemSample, type AntSimSource, type AntView } from './simAdapter';
import { AntStateTable, stepAntState } from './antState';
import { poseTarget } from './poses';

/** Gait constants of a 1 mm-per-unit test rig: stride 2 mm, duty 0.55. */
const RIG = { foot: [[1, 0, 1, 0], [1.2, 0, 0, 0], [1, 0, -1, 0]], gait: [2, 0.1, 0.55, 0] };

// compile-time: a real Sim is accepted as the renderer's source (structural subset)
export const asSource = (s: Sim): AntSimSource => s;

function ant(o: Partial<AntView> = {}): AntView {
  return {
    id: 1, alive: true, colony: 0, caste: 'worker', pos: { x: 10, y: 0.5, z: 0 }, prevPos: { x: 0, y: 0.5, z: 0 },
    up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, prevFwd: { x: 1, y: 0, z: 0 },
    speed: 24, footOffset: 0.5, medium: 'surface', lengthBu: 1, sizeClass: null, flags: 0, pose: 0,
    carry: { kind: 'none', id: -1 }, cropC: 0.5, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0, ...o,
  };
}
function source(a: AntView[], tick = 100): AntSimSource {
  return { state: { tick, ants: a, brood: [], items: [], colonies: [{ id: 0, species: 'atta-texana' }], player: { possessedAntId: -1 } } };
}

describe('SimReader', () => {
  it('interpolates position, removes the foot offset, maps colony -> species and BU', () => {
    const r = new SimReader(source([ant()]));
    const s = r.readAnt(r.ants[0]!, 0.25, newAntSample());
    expect(s.pos.x).toBeCloseTo(2.5); expect(s.pos.y).toBeCloseTo(0);
    expect(s.species).toBe('atta-texana'); expect(s.lengthMm).toBe(7);
    expect(s.crop).toBeCloseTo(0.5);
    expect(s.poseId).toBe(POSES[0]);
  });
  it('interpolated up and forward stay unit length across a wall transition', () => {
    const r = new SimReader(source([ant({ prevUp: { x: 0, y: 1, z: 0 }, up: { x: -1, y: 0, z: 0 }, prevFwd: { x: 1, y: 0, z: 0 }, fwd: { x: 0, y: 1, z: 0 } })]));
    const s = r.readAnt(r.ants[0]!, 0.5, newAntSample());
    expect(Math.hypot(s.up.x, s.up.y, s.up.z)).toBeCloseTo(1);
    expect(s.up.x).toBeCloseTo(-Math.SQRT1_2); expect(s.up.y).toBeCloseTo(Math.SQRT1_2);
  });
  it('callow only for flagged ants, darkening over 1500 ticks', () => {
    const r = new SimReader(source([ant({ flags: AntFlag.CALLOW, bornTick: 0 }), ant({ id: 2, bornTick: 50 })], 750));
    expect(r.readAnt(r.ants[0]!, 1, newAntSample()).callow).toBeCloseTo(0.5);
    expect(r.readAnt(r.ants[1]!, 1, newAntSample()).callow).toBe(0);
  });
  it('wings follow the WINGED flag and the founding queen\'s wings, not the caste', () => {
    const r = new SimReader(source([
      ant({ caste: 'gyne', flags: AntFlag.WINGED }), ant({ id: 2, caste: 'gyne' }),
      ant({ id: 3, caste: 'queen', queen: { founding: { wings: true } } }), ant({ id: 4, caste: 'queen', queen: { founding: null } }),
    ]));
    expect(r.ants.map((a) => r.readAnt(a, 1, newAntSample()).winged)).toEqual([true, false, true, false]);
  });
  it('reads brood and items into samples (carried, species, pile kinds)', () => {
    const src = source([]);
    src.state.brood = [{ id: 7, alive: true, colony: 0, stage: 'larva', destined: 'major', progress: 0.3, pos: { x: 1, y: 2, z: 3 }, carriedBy: 4, destinedLengthBu: 1.5 }];
    src.state.items = [{ id: 8, alive: true, kind: 'seed', pos: { x: 0, y: 0, z: 0 }, carrierIds: [1, 2], lengthMm: 2, count: 1, species: null, colony: 5, decay: 0, foodKind: null, variant: null, wasteKind: null }];
    const r = new SimReader(src);
    const b = r.readBrood(r.brood[0]!, newBroodSample());
    expect(b).toMatchObject({ id: 7, species: 'atta-texana', stage: 'larva', destined: 'major', carried: true, destinedLengthBu: 1.5, pos: { x: 1, y: 2, z: 3 } });
    const it = r.readItem(r.items[0]!, newItemSample());
    expect(it).toMatchObject({ id: 8, kind: 'seed', carried: false, piles: true, species: null, lengthMm: 2 });
  });
  it('possessed by player id or flag', () => {
    const src = source([ant()]); src.state.player.possessedAntId = 1;
    expect(new SimReader(src).readAnt(src.state.ants[0]!, 1, newAntSample()).possessed).toBe(true);
  });
});

describe('render state', () => {
  it('smooths an abrupt up change (wall) instead of snapping, and blends poses', () => {
    const t = new AntStateTable(); const st = t.get(1, 1); const s = newAntSample();
    s.lengthMm = 4; s.pos = { x: 0, y: 0, z: 0 }; s.up = { x: 0, y: 1, z: 0 }; s.fwd = { x: 1, y: 0, z: 0 };
    stepAntState(st, s, poseTarget('walk'), RIG, 1, 1 / 60);
    s.up = { x: -1, y: 0, z: 0 }; s.fwd = { x: 0, y: 1, z: 0 }; s.pos = { x: 0.1, y: 0.05, z: 0 };
    stepAntState(st, s, poseTarget('dig'), RIG, 1, 1 / 60);
    expect(st.up.y).toBeGreaterThan(0.5);                       // still mostly the old up after 1/60 s
    expect(st.pose.pitch).toBeGreaterThan(0); expect(st.pose.pitch).toBeLessThan(poseTarget('dig').pitch);
    for (let i = 0; i < 30; i++) stepAntState(st, s, poseTarget('dig'), RIG, 1, 1 / 60);
    expect(st.up.x).toBeLessThan(-0.99);                        // converged after 0.5 s
    expect(Math.abs(st.fwd.x * st.up.x + st.fwd.y * st.up.y + st.fwd.z * st.up.z)).toBeLessThan(1e-6);
    expect(st.pose.pitch).toBeCloseTo(poseTarget('dig').pitch, 2);
  });
  it('advances the gait phase by distance / stride', () => {
    const t = new AntStateTable(); const st = t.get(5, 1); const s = newAntSample();
    s.lengthMm = 4; s.pos = { x: 0, y: 0, z: 0 }; s.fwd = { x: 0, y: 0, z: 1 };
    stepAntState(st, s, poseTarget('walk'), RIG, 1, 1 / 60);
    const p0 = st.gait.phase;
    s.pos = { x: 0, y: 0, z: 1 };
    stepAntState(st, s, poseTarget('walk'), RIG, 1, 1 / 60);
    expect(st.gait.phase - p0).toBeCloseTo(0.5);
  });
  it('recycles states of ants no longer present', () => {
    const t = new AntStateTable(); t.get(1, 1); t.get(2, 1); t.get(1, 2); t.sweep(2);
    expect(t.size).toBe(1);
  });
});
