// AntRenderer without a GPU: update() only fills instance buffers, so selection, caps, carried items and loose
// brood can be checked in Node.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import { AntFlag } from '@/sim/types';
import type { AntSimSource, AntView, BroodView, ItemView } from './simAdapter';

function ant(id: number, x: number, z: number, o: Partial<AntView> = {}): AntView {
  const p = { x, y: 0, z };
  return {
    id, alive: true, colony: 0, caste: 'worker', pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
    fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 }, speed: 0, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null,
    flags: 0, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0, ...o,
  };
}

function setup(ants: AntView[], brood: BroodView[] = [], items: ItemView[] = [], possessed = -1) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(0, 60, -120); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new AntRenderer();
  r.init({ scene, camera, quality: getPreset('test') });
  const sim: AntSimSource = { state: { tick: 0, ants, brood, items, colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: possessed } } };
  r.setSim(sim);
  return { r, camera, sim };
}
const frame = (camera: PerspectiveCamera) => ({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });

describe('AntRenderer (CPU side)', () => {
  it('draws visible ants, culls the rest, honours the hard cap and always keeps the possessed ant', () => {
    const list: AntView[] = [];
    for (let i = 0; i < 3000; i++) list.push(ant(i + 1, ((i % 60) - 30) * 3, Math.floor(i / 60) * 3 - 60));
    const far = ant(99999, 0, 600); list.push(far); // far behind the crowd, tiny on screen
    const { r, camera } = setup(list, [], [], 99999);
    r.setLod({ maxDrawn: 500 });
    r.update(frame(camera));
    const s = r.stats;
    expect(s.ants).toBe(3001);
    expect(s.visible.reduce((a, b) => a + b, 0)).toBe(500);
    expect(s.dropped).toBeGreaterThan(0);
    expect(r.debugFeet(99999)).not.toBeNull(); // possessed ant staged and drawn
    expect(s.visible[0]).toBeGreaterThanOrEqual(1);
  });

  it('attaches a carried cocoon to its carrier and draws loose brood where it lies', () => {
    const carrier = ant(1, 0, 0, { carry: { kind: 'brood', id: 50 } });
    const brood: BroodView[] = [
      { id: 50, alive: true, colony: 0, stage: 'pupa', destined: 'worker', progress: 0.5, pos: { x: 0, y: 0, z: 0 }, carriedBy: 1, destinedLengthBu: 1 },
      { id: 51, alive: true, colony: 0, stage: 'egg', destined: 'worker', progress: 0, pos: { x: 2, y: 0, z: 0 }, carriedBy: -1, destinedLengthBu: 1 },
    ];
    const items: ItemView[] = [{ id: 60, alive: true, kind: 'soil-pellet', pos: { x: -2, y: 0, z: 0 }, carrierIds: [], lengthMm: 0, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null }];
    const { r, camera } = setup([carrier], brood, items);
    camera.position.set(0, 4, -10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    r.update(frame(camera));
    expect(r.stats.carried).toBe(1);
    expect(r.stats.looseItems).toBe(2);
  });

  it('fills 2000 ants quickly (CPU side; the browser demo reports the real numbers)', () => {
    const list: AntView[] = [];
    for (let i = 0; i < 2000; i++) list.push(ant(i + 1, ((i % 50) - 25) * 4, Math.floor(i / 50) * 4 - 80, { speed: 20 }));
    const { r, camera } = setup(list);
    let best = Infinity;
    for (let k = 0; k < 10; k++) { r.update(frame(camera)); if (k > 0) best = Math.min(best, r.stats.cpuMs); }
    expect(r.stats.ants).toBe(2000);
    // best frame, generous bound: shared CI machines vary; the real budget is measured in the demo (cpuBench)
    expect(best).toBeLessThan(50);
  });

  it('wings follow the sim: founding queen with wings, dealate gyne without, male with the flag cleared without', () => {
    const founding = ant(1, -6, 0, { caste: 'queen', lengthBu: 2.1, flags: AntFlag.FOUNDING, queen: { founding: { wings: true } } });
    const dealate = ant(2, 0, 0, { caste: 'gyne', lengthBu: 2.1 });
    const male = ant(3, 6, 0, { caste: 'male' });
    const gyne = ant(4, 12, 0, { caste: 'gyne', lengthBu: 2.1, flags: AntFlag.WINGED });
    const { r, camera } = setup([founding, dealate, male, gyne]);
    camera.position.set(3, 20, -40); camera.lookAt(3, 0, 0); camera.updateMatrixWorld();
    r.update(frame(camera));
    expect(r.stats.wings).toBe(2); // founding queen + flagged gyne
    founding.queen = { founding: { wings: false } }; // dealation (GDD 06 §5.2)
    r.update(frame(camera));
    expect(r.stats.wings).toBe(1);
  });

  it('a quality switch keeps variants, carried items and wings drawing (materials rebuilt in place)', () => {
    const carrier = ant(1, 0, 0, { carry: { kind: 'item', id: 60 } });
    const gyne = ant(2, 3, 0, { caste: 'gyne', lengthBu: 2.1, flags: AntFlag.WINGED });
    const items: ItemView[] = [{ id: 60, alive: true, kind: 'seed', pos: { x: 0, y: 0, z: 0 }, carrierIds: [1], lengthMm: 0, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null }];
    const { r, camera } = setup([carrier, gyne], [], items);
    camera.position.set(0, 6, -16); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    r.update(frame(camera));
    const before = { ...r.stats, visible: [...r.stats.visible] };
    for (const q of ['high', 'low', 'test', 'ultra'] as const) {
      r.setQuality(getPreset(q));
      r.update(frame(camera));
      expect(r.stats.carried).toBe(before.carried);
      expect(r.stats.wings).toBe(before.wings);
      expect(r.stats.variants).toBe(before.variants);
    }
  });

  it('allocates no new stats object per frame', () => {
    const { r, camera } = setup([ant(1, 0, 0)]);
    r.update(frame(camera)); const s = r.stats;
    r.update(frame(camera));
    expect(r.stats).toBe(s);
  });
});
