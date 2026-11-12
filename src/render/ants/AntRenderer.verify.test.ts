// Reviewer tests (render-ants): try to break AntRenderer's CPU side (quality switches, caste changes, caps, carried
// items, edge inputs). Failing tests here document real bugs for the fixer.
import { describe, expect, it } from 'vitest';
import { InstancedMesh, PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import type { AntSimSource, AntView, BroodView, ItemView } from './simAdapter';

function ant(id: number, x: number, z: number, o: Partial<AntView> = {}): AntView {
  const p = { x, y: 0, z };
  return {
    id, alive: true, colony: 0, caste: 'worker', pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
    fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 }, speed: 0, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null,
    flags: 0, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0, ...o,
  };
}

function setup(ants: AntView[], brood: BroodView[] = [], items: ItemView[] = [], possessed = -1, species = 'lasius-niger') {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(0, 6, -14); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new AntRenderer();
  r.init({ scene, camera, quality: getPreset('test') });
  const sim: AntSimSource = { state: { tick: 0, ants, brood, items, colonies: [{ id: 0, species: species as 'lasius-niger' }], player: { possessedAntId: possessed } } };
  r.setSim(sim);
  return { r, camera, sim, scene };
}
const frame = (camera: PerspectiveCamera, dt = 1 / 60) => ({ dt, time: 0, alpha: 1, camera, viewportHeightPx: 720 });

function finite(a: ArrayLike<number>, n: number): boolean {
  for (let i = 0; i < n; i++) if (!Number.isFinite(a[i]!)) return false;
  return true;
}

describe('AntRenderer verify: runtime quality changes', () => {
  // BUG: VariantStore.setOptions() disposes and clears every entry, but AntRenderer's per-ant render states keep the
  // cached variant index (st.vi), so the next update dereferences entries[vi] === undefined and throws.
  it('switching quality test -> high (physical LOD0 / shadows change) keeps rendering', () => {
    const { r, camera } = setup([ant(1, 0, 0), ant(2, 2, 0)]);
    r.update(frame(camera));
    expect(r.stats.visible.reduce((a, b) => a + b, 0)).toBe(2);
    r.setQuality(getPreset('high'));
    expect(() => r.update(frame(camera))).not.toThrow();
    expect(r.stats.visible.reduce((a, b) => a + b, 0)).toBe(2);
  });

  it('switching quality test -> low (shadows turn on) keeps rendering', () => {
    const { r, camera } = setup([ant(1, 0, 0)]);
    r.update(frame(camera));
    r.setQuality(getPreset('low'));
    expect(() => r.update(frame(camera))).not.toThrow();
  });
});

describe('AntRenderer verify: variants follow the sim', () => {
  // Fixer's note: the sim sets AntFlag.WINGED on every gyne at spawn (src/sim/entities/ants.ts) and clears it when
  // she sheds her wings. The original fixture had a gyne with flags 0, which the next test (rightly) defines as a
  // dealate gyne; the fixture now carries the flag, and the caste change clears it as the sim's dealation does.
  it('a gyne that becomes a queen loses its wings (variant re-resolved on caste change)', () => {
    const a = ant(1, 0, 0, { caste: 'gyne', lengthBu: 2.1, flags: 1 << 3 });
    const { r, camera } = setup([a]);
    r.update(frame(camera));
    expect(r.stats.wings).toBe(1);
    a.caste = 'queen'; a.flags = 0;
    r.update(frame(camera));
    expect(r.stats.wings).toBe(0);
  });

  // GAP: SimReader computes AntSample.winged (caste gyne/male OR AntFlag.WINGED) but nothing uses it: wings follow the
  // caste only. The founding queen of every new game is caste 'queen' with wings until dealation (GDD 06 5.2), and
  // a gyne that has shed its wings (flag cleared) still shows them.
  it('wings follow the sim WINGED flag, not only the caste', () => {
    const a = setup([ant(1, 0, 0, { caste: 'queen', lengthBu: 2.1, flags: 1 << 3 })]); // founding queen, wings on
    a.r.update(frame(a.camera));
    const b = setup([ant(2, 0, 0, { caste: 'gyne', lengthBu: 2.1, flags: 0 })]); // gyne after shedding its wings
    b.r.update(frame(b.camera));
    expect([a.r.stats.wings, b.r.stats.wings]).toEqual([1, 0]);
  });

  it('dead ants are not drawn and their render state is recycled', () => {
    const a = ant(1, 0, 0); const b = ant(2, 1, 0);
    const { r, camera } = setup([a, b]);
    r.update(frame(camera));
    b.alive = false;
    r.update(frame(camera));
    expect(r.stats.ants).toBe(1);
    expect(r.debugFeet(2)).toBeNull();
  });

  it('setSim(null) clears the frame without throwing', () => {
    const { r, camera } = setup([ant(1, 0, 0)]);
    r.update(frame(camera));
    r.setSim(null);
    expect(() => r.update(frame(camera))).not.toThrow();
  });

  it('the update frame may swap the sim source (frame.sim)', () => {
    const { r, camera } = setup([ant(1, 0, 0)]);
    r.update(frame(camera));
    const other: AntSimSource = { state: { tick: 0, ants: [ant(5, 0, 0), ant(6, 1, 0)], brood: [], items: [], colonies: [{ id: 0, species: 'messor-barbarus' }], player: { possessedAntId: -1 } } };
    r.update({ ...frame(camera), sim: other });
    expect(r.stats.ants).toBe(2);
  });
});

describe('AntRenderer verify: cap policy', () => {
  it('the possessed ant is drawn at LOD0 even when it is behind the camera and every cap is 0', () => {
    const list = [ant(1, 0, 0), ant(2, 0, -40)]; // 2 is behind the camera (camera at z = -14 looking +z)
    const { r, camera } = setup(list, [], [], 2);
    r.setLod({ maxDrawn: 0, maxNear: 0 });
    r.update(frame(camera));
    expect(r.stats.visible).toEqual([1, 0, 0, 0]);
    expect(r.debugFeet(2)).not.toBeNull();
  });

  it('possessed by flag only (player id unset) is also kept', () => {
    const list = [ant(1, 0, 0), ant(2, 0, 300, { flags: 1 })];
    const { r, camera } = setup(list);
    r.setLod({ maxDrawn: 1 });
    r.update(frame(camera));
    expect(r.debugFeet(2)).not.toBeNull();
    expect(r.stats.visible[0]).toBe(1);
  });

  it('LOD0 never exceeds maxNear (possessed included)', () => {
    const list: AntView[] = [];
    for (let i = 0; i < 40; i++) list.push(ant(i + 1, (i % 8) * 1.2 - 4, Math.floor(i / 8) * 1.2));
    const { r, camera } = setup(list, [], [], 40);
    r.setLod({ maxNear: 5, nearPx: 1 });
    r.update(frame(camera));
    expect(r.stats.visible[0]).toBe(5);
    expect(r.stats.visible.reduce((a, b) => a + b, 0)).toBe(40);
  });
});

describe('AntRenderer verify: instance data', () => {
  it('staged instance matrices and attributes are finite for degenerate frames (fwd parallel to up, zero speed)', () => {
    const list = [
      ant(1, 0, 0, { fwd: { x: 0, y: 1, z: 0 }, prevFwd: { x: 0, y: 1, z: 0 } }),
      ant(2, 1, 0, { up: { x: 0, y: -1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 } }), // flips through zero mid-tick
      ant(3, 2, 0, { cropCap: 0, cropC: 1 }),
    ];
    const { r, camera, sim } = setup(list);
    r.update({ ...frame(camera), alpha: 0.5 });
    void sim;
    for (const id of [1, 2, 3]) {
      const feet = r.debugFeet(id);
      expect(feet).not.toBeNull();
      for (const f of feet!) expect(Number.isFinite(f.x) && Number.isFinite(f.y) && Number.isFinite(f.z)).toBe(true);
    }
  });

  it('carried items get the real item size relative to the carrier (aExtra.x) and only at LOD0/1', () => {
    const carrier = ant(1, 0, 0, { carry: { kind: 'item', id: 60 } });
    const far = ant(2, 0, 2000, { carry: { kind: 'item', id: 61 } });
    const items: ItemView[] = [
      { id: 60, alive: true, kind: 'seed', pos: { x: 0, y: 0, z: 0 }, carrierIds: [1], lengthMm: 1.6, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null },
      { id: 61, alive: true, kind: 'seed', pos: { x: 0, y: 0, z: 2000 }, carrierIds: [2], lengthMm: 1.6, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null },
    ];
    const { r, camera } = setup([carrier, far], [], items);
    r.update(frame(camera));
    expect(r.stats.carried).toBe(1);
    expect(r.stats.looseItems).toBe(0); // neither is drawn loose
  });

  it('an item moved cooperatively (2 carriers) is drawn loose, not attached to either ant', () => {
    const a = ant(1, 0, 0, { carry: { kind: 'item', id: 60 } }); const b = ant(2, 1, 0, { carry: { kind: 'item', id: 60 } });
    const items: ItemView[] = [{ id: 60, alive: true, kind: 'carcass', pos: { x: 0.5, y: 0, z: 1 }, carrierIds: [1, 2], lengthMm: 3, count: 1, species: null, colony: 0, decay: 0, foodKind: null, variant: null, wasteKind: null }];
    const { r, camera } = setup([a, b], [], items);
    r.update(frame(camera));
    expect(r.stats.carried).toBe(0);
    expect(r.stats.looseItems).toBe(1);
  });

  it('a teleport (possession switch, respawn) snaps instead of advancing the gait over the jump', () => {
    const a = ant(1, 0, 0, { speed: 24 });
    const { r, camera } = setup([a]);
    r.update(frame(camera));
    const before = r.debugFeet(1)!.map((f) => f.stance);
    a.prevPos = { x: 0, y: 0, z: 500 }; a.pos = { x: 0, y: 0, z: 500 };
    camera.position.set(0, 6, 486); camera.lookAt(0, 0, 500); camera.updateMatrixWorld();
    r.update(frame(camera));
    expect(r.debugFeet(1)!.map((f) => f.stance)).toEqual(before); // phase unchanged by a 500 mm jump
  });

  it('per-frame update with 2000 ants stays allocation-light: the stats object is replaced, buffers are not regrown', () => {
    const list: AntView[] = [];
    for (let i = 0; i < 2000; i++) list.push(ant(i + 1, ((i % 50) - 25) * 0.8, Math.floor(i / 50) * 0.8, { speed: 20 }));
    const { r, camera, scene } = setup(list);
    r.update(frame(camera));
    const meshes = scene.children[0]!.children.length;
    for (let k = 0; k < 5; k++) r.update(frame(camera));
    expect(scene.children[0]!.children.length).toBe(meshes); // no batch re-allocation in steady state
    expect(finite(new Float32Array([r.stats.cpuMs]), 1)).toBe(true);
  });
});

describe('AntRenderer verify: recycled render states', () => {
  // BUG: AntStateTable.get() reuses pooled states without resetting `pose`; stepAntState snaps the pose only while
  // `fresh`, but trackOffscreen() (ant first seen outside the frustum) clears `fresh` without touching the pose.
  // A new ant that appears off-screen and then walks into view starts from the pose of a dead, recycled ant.
  it('a new ant first seen off-screen does not inherit the pose of a recycled state', () => {
    const alarmed = ant(1, 0, 0, { pose: 0, flags: 1 << 2, alarmLevel: 1 }); // ALARMED: gaster raised
    const list: AntView[] = [alarmed];
    const { r, camera, scene } = setup(list);
    for (let i = 0; i < 30; i++) r.update(frame(camera)); // pose converged to the alarm display
    list.length = 0;
    r.update(frame(camera)); // state of ant 1 recycled
    const fresh = ant(2, 16, 0); // just outside the side of the frustum: culled on its first frame
    list.push(fresh);
    r.update(frame(camera));
    expect(r.stats.culled).toBe(1);
    fresh.prevPos = { x: 13, y: 0, z: 0 }; fresh.pos = { x: 12, y: 0, z: 0 }; // walks into view (no teleport)
    r.update(frame(camera));
    let gaster = Number.NaN;
    scene.traverse((o) => {
      if (o instanceof InstancedMesh && o.count > 0 && Number.isNaN(gaster)) gaster = (o.geometry.getAttribute('aPose').array as Float32Array)[1]!;
    });
    expect(Math.abs(gaster)).toBeLessThan(0.05); // a calm walker: gaster 0
  });
});
