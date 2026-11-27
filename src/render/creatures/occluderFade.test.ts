// app-seams-4 fix pass: creatures between the camera and the possessed ant fade with alpha like the ants (GDD 01 6.5 rule 2,
// integrator ruling "an ant (or any creature)"). Node only: update() fills the instance buffers without a GPU.
import { describe, expect, it } from 'vitest';
import '@/sim/ecology'; // load order: the ecology <-> human-events import cycle resolves only when ecology comes first
import { PerspectiveCamera, Scene, type InstancedMesh, type Material } from 'three';
import { getPreset } from '@/render/app/quality';
import { CreatureRenderer } from './CreatureRenderer';
import type { CreatureSimSource, CreatureView } from './simAdapter';

function view(id: number, x: number, z = 0): CreatureView {
  const p = { x, y: 0, z };
  return {
    id, alive: true, kind: 'woodlouse', variant: null, pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 },
    prevFwd: { x: 1, y: 0, z: 0 }, speed: 0, footOffset: 0, medium: 'surface', state: 'wander', stateTick: 0, flags: 0, hp: 10, bb: {},
  };
}

// camera at x = -60 looking along +x at the subject (the possessed ant) at the origin
function rig(creatures: CreatureView[]) {
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(-60, 2, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new CreatureRenderer();
  r.init({ scene: new Scene(), camera, quality: getPreset('high') });
  r.setSim({ state: { tick: 5, creatures, ecology: { herds: [], hazards: [], birdEvent: null } } } as CreatureSimSource);
  const frame = () => r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
  type B = { n: number; hide: Float32Array; mesh: InstancedMesh };
  const batches = (): B[] => {
    const out: B[] = [];
    for (const e of (r as unknown as { store: { entries: Map<string, { lods: ({ body: B } | null)[] }> } }).store.entries.values()) for (const l of e.lods) if (l) out.push(l.body);
    return out;
  };
  const drawn = () => batches().reduce((a, b) => a + b.n, 0);
  const maxHide = () => batches().reduce((a, b) => Math.max(a, ...Array.from(b.hide.subarray(0, b.n))), 0);
  const blended = () => batches().some((b) => (b.mesh.material as Material).transparent);
  return { r, frame, drawn, maxHide, blended };
}

describe('creatures fade out of the camera-to-subject cone', () => {
  it('a creature in the cone fades with alpha (blended while it fades), is not drawn once gone, and returns when the subject is gone', () => {
    const { r, frame, drawn, maxHide, blended } = rig([view(1, -40)]);
    r.setOccluderSubject({ x: 0, y: 0, z: 0 }, 4);
    frame();
    expect(drawn()).toBe(1);
    expect(maxHide()).toBeGreaterThan(0); // one frame in: part way
    expect(maxHide()).toBeLessThan(1);
    expect(blended()).toBe(true);
    for (let i = 0; i < 60; i++) frame();
    expect(drawn()).toBe(0); // gone: no draw, no shadow
    expect(r.stats.faded).toBe(1);
    expect(r.stats.fadedHidden).toBe(1);
    expect(blended()).toBe(false); // nothing mid-fade: opaque again
    r.setOccluderSubject(null);
    frame();
    expect(drawn()).toBe(1);
    for (let i = 0; i < 60; i++) frame();
    expect(maxHide()).toBe(0);
    expect(blended()).toBe(false);
    r.dispose();
  });

  it('a creature beside the line of sight, or behind the subject, stays solid; so does everything without a subject', () => {
    const { r, frame, drawn, maxHide, blended } = rig([view(1, -40, 9), view(2, 30), view(3, -45, 0)]);
    r.setOccluderSubject({ x: 0, y: 0, z: 0 }, 4);
    for (let i = 0; i < 60; i++) frame();
    expect(r.stats.faded).toBe(1); // only the one on the line (id 3)
    expect(drawn()).toBe(2);
    expect(maxHide()).toBe(0);
    expect(blended()).toBe(false);
    r.setOccluderSubject(null);
    for (let i = 0; i < 60; i++) frame();
    expect(drawn()).toBe(3);
    expect(r.stats.faded).toBe(0);
    r.dispose();
  });
});
