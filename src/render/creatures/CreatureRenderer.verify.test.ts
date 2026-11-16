// Adversarial checks of the creature renderer (review of task render-creatures). Node only: update() fills instance
// buffers without a GPU, so instance data, culling bounds, comfort marks and LOD caps can be read back directly.
// Tests that FAIL here demonstrate real defects and are left for the fixer (see the review report).
import { describe, expect, it, vi } from 'vitest';
import { PerspectiveCamera, Scene, type InstancedMesh, type Object3D } from 'three';
import { getPreset } from '@/render/app/quality';
import type { CreatureKind } from '@/sim/types';
import { CreatureRenderer } from './CreatureRenderer';
import { CreaturesRenderer } from './CreaturesRenderer';
import { LOOKS, lookKeyFor } from './looks';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { createSharedUniforms, makeCreatureMaterial } from './shader/materials';
import type { CreatureSimSource, CreatureView } from './simAdapter';
import { cullBoundsOf } from './cullBounds';
import { PART } from './geometry/builder';

function view(id: number, kind: CreatureKind, x: number, z = 0, o: Partial<CreatureView> = {}): CreatureView {
  const p = { x, y: 0, z };
  return {
    id, alive: true, kind, variant: null, pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 },
    prevFwd: { x: 1, y: 0, z: 0 }, speed: 0, footOffset: 0, medium: 'surface', state: 'wander', stateTick: 0, flags: 0, hp: 10, bb: {}, ...o,
  };
}

function rig(creatures: CreatureView[], quality = getPreset('high'), camPos: [number, number, number] = [0, 60, 120]) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(...camPos); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new CreatureRenderer();
  r.init({ scene, camera, quality });
  const src: CreatureSimSource = { state: { tick: 5, creatures, ecology: { herds: [], hazards: [], birdEvent: null } } };
  r.setSim(src);
  const frame = (time = 0) => r.update({ dt: 1 / 60, time, alpha: 1, camera, viewportHeightPx: 720 });
  return { r, scene, camera, src, frame };
}

type Batches = { store: { entries: Map<string, { lods: ({ body: { n: number; m: Float32Array; a: Record<string, Float32Array>; mesh: InstancedMesh } } | null)[] }> } };
const internals = (r: CreatureRenderer) => r as unknown as Batches;

function visible(o: Object3D, name: string): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  o.traverse((c) => { if ((c as InstancedMesh).isInstancedMesh && c.visible && c.name === name && (c as InstancedMesh).count > 0) out.push(c as InstancedMesh); });
  return out;
}

describe('CreatureRenderer (verify)', () => {
  it('comfort marker mode: every marker-mode creature in view gets its ring (no silent cap)', () => {
    // 40 spiders on screen; the ring buffer (props/comfortMarks.ts RingSet cap 32) must not drop any of them, or a
    // spider in marker mode has no representation at all (no body, no ring)
    const list: CreatureView[] = [];
    for (let i = 0; i < 40; i++) list.push(view(i + 1, 'wolf-spider', (i % 8) * 12 - 42, Math.floor(i / 8) * 12 - 24));
    const { r, frame } = rig(list);
    r.setComfort({ spiderComfort: 'marker' });
    frame();
    expect(r.stats.creatures).toBe(40);
    expect(r.stats.culled).toBe(0);
    expect(r.stats.markers).toBe(40);
    r.dispose();
  });

  it('the cull sphere of each look contains its rest-pose geometry (no limbs popping at the screen edge)', () => {
    // Fixer's note: the first version of this test hard-coded the renderer's old sphere (centre pos + up * 0.3 size,
    // radius 0.9 size). The renderer now culls with each look's own bounds (cullBounds.ts, the sphere CreatureRenderer
    // builds in cullSphere()), so the test checks those against the NEAR-detail geometry, at rest and with every leg
    // swung to its full protraction / retraction about its hip and lifted.
    const bad: string[] = [];
    for (const [key, def] of Object.entries(LOOKS)) {
      if (key === 'antlion' || key === 'aphid' || key === 'scale-insect') continue; // antlion: buried; herd members: herd bounds
      const b = cullBoundsOf(def);
      const g = def.build(0).body.toCreatureGeometry();
      const pos = g.getAttribute('position').array as Float32Array;
      const rig = g.getAttribute('aRig').array as Float32Array, piv = g.getAttribute('aPivot').array as Float32Array;
      const swing = def.motion.leg[0], lift = def.motion.leg[1];
      let far = 0;
      for (let i = 0; i < pos.length / 3; i++) {
        const x = pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!;
        far = Math.max(far, Math.hypot(x - b.cx, y - b.cy, z - b.cz));
        if (Math.round(rig[i * 4]!) !== PART.LEG) continue;
        const px = piv[i * 4]!, pz = piv[i * 4 + 2]!;
        for (const a of [-swing, swing]) {
          const c = Math.cos(a), s = Math.sin(a), qx = x - px, qz = z - pz;
          const rx = px + c * qx + s * qz, rz = pz - s * qx + c * qz;
          far = Math.max(far, Math.hypot(rx - b.cx, y + lift - b.cy, rz - b.cz));
        }
      }
      if (far > b.r) bad.push(`${key}: extent ${far.toFixed(2)} mm > cull radius ${b.r.toFixed(2)} mm`);
    }
    expect(bad).toEqual([]);
  });

  it('a wolf spider whose body is just off screen but whose legs reach into view is drawn', () => {
    // camera looking down -Z at the origin; the spider stands right of the frustum facing -x (into view), placed so
    // that only the last 1 mm of its front legs is inside the right frustum plane
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(0, 0, 60); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const halfW = Math.tan((20 * Math.PI) / 180) * 60 * (16 / 9);
    const pos = LOOKS['wolf-spider']!.build(0).body.toCreatureGeometry().getAttribute('position').array as Float32Array;
    let zmax = 0;
    for (let i = 2; i < pos.length; i += 3) zmax = Math.max(zmax, pos[i]!);
    const c = view(1, 'wolf-spider', halfW + zmax - 1, 0, { fwd: { x: -1, y: 0, z: 0 }, prevFwd: { x: -1, y: 0, z: 0 } });
    const { r } = rig([c], getPreset('high'), [0, 0, 60]);
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    expect(r.stats.culled).toBe(0);
    expect(r.stats.drawn[0] + r.stats.drawn[1] + r.stats.drawn[2]).toBe(1);
    r.dispose();
  });

  it('one frame with a NaN position does not poison the gait phase for the rest of the creature\'s life', () => {
    const c = view(1, 'wolf-spider', 0, 0, { speed: 10 });
    const { r, frame } = rig([c]);
    frame();
    c.prevPos = { x: Number.NaN, y: 0, z: 0 }; c.pos = { x: Number.NaN, y: 0, z: 0 };
    frame();
    c.prevPos = { x: 0, y: 0, z: 0 }; c.pos = { x: 0.5, y: 0, z: 0 };
    frame();
    c.prevPos = { x: 0.5, y: 0, z: 0 }; c.pos = { x: 1, y: 0, z: 0 };
    frame();
    const e = internals(r).store.entries.get('wolf-spider')!;
    const lod = e.lods.find((l) => l && l.body.n > 0)!;
    expect(Number.isFinite(lod.body.a.aAnim![0]!)).toBe(true);
    r.dispose();
  });

  it('only near-detail batches cast shadows; quality without shadows turns them off', () => {
    const list = [view(1, 'woodlouse', 0, 0), view(2, 'woodlouse', 600, -2000)];
    const { r, frame, scene } = rig(list, getPreset('high'), [0, 10, 25]);
    frame();
    const casters = visible(scene, 'creature-batch').filter((m) => m.castShadow);
    expect(r.stats.drawn[0]).toBeGreaterThanOrEqual(1);
    expect(casters.length).toBe(1);
    const e = internals(r).store.entries.get('woodlouse')!;
    for (let d = 1; d < 3; d++) if (e.lods[d]) expect(e.lods[d]!.body.mesh.castShadow).toBe(false);
    r.setQuality(getPreset('test'));
    frame();
    expect(visible(scene, 'creature-batch').filter((m) => m.castShadow).length).toBe(getPreset('test').shadows.enabled ? 1 : 0);
    r.dispose();
  });

  it('is deterministic: two renderers given the same input write identical instance data', () => {
    const mk = () => [view(1, 'centipede', 0, 0, { speed: 20 }), view(2, 'ladybird', 10, 0), view(3, 'snail', -15, 4, { speed: 1 })];
    const a = rig(mk()), b = rig(mk());
    for (const t of [0, 0.4, 0.9]) { a.frame(t); b.frame(t); }
    for (const [k, e] of internals(a.r).store.entries) {
      const f = internals(b.r).store.entries.get(k)!;
      e.lods.forEach((l, d) => {
        if (!l) return;
        const m = f.lods[d]!;
        expect(Array.from(l.body.m.subarray(0, l.body.n * 16))).toEqual(Array.from(m.body.m.subarray(0, m.body.n * 16)));
        expect(Array.from(l.body.a.aAnim!.subarray(0, l.body.n * 4))).toEqual(Array.from(m.body.a.aAnim!.subarray(0, m.body.n * 4)));
      });
    }
    a.r.dispose(); b.r.dispose();
  });

  it('nothing stays visible once the source is removed, and dispose leaves the scene clean', () => {
    const { r, frame, scene, camera } = rig([view(1, 'wolf-spider', 0), view(2, 'earthworm', 20)]);
    r.setComfort({ spiderComfort: 'marker' });
    frame();
    expect(r.stats.markers).toBe(1);
    r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720, sim: null });
    let shown = 0;
    scene.traverse((o) => { if ((o as InstancedMesh).isInstancedMesh && o.visible && (o as InstancedMesh).count > 0) shown++; });
    expect(shown).toBe(0);
    r.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('edge inputs: zero/degenerate frames, hp 0, huge speed and zero-size lists do not produce non-finite matrices', () => {
    const list = [
      view(1, 'woodlouse', 0, 0, { fwd: { x: 0, y: 1, z: 0 }, prevFwd: { x: 0, y: 1, z: 0 } }), // fwd parallel to up
      view(2, 'rove-beetle', 5, 0, { up: { x: 0, y: 0, z: 0 }, prevUp: { x: 0, y: 0, z: 0 } }), // zero up
      view(3, 'ladybird', -5, 0, { hp: 0 }),
      view(4, 'centipede', 10, 5, { speed: 1e9 }),
    ];
    const { r, frame } = rig(list);
    frame(); frame(123.4);
    for (const [, e] of internals(r).store.entries) for (const l of e.lods) {
      if (!l) continue;
      for (const v of l.body.m.subarray(0, l.body.n * 16)) expect(Number.isFinite(v)).toBe(true);
    }
    const empty = rig([]);
    empty.frame();
    expect(empty.r.stats.creatures).toBe(0);
    r.dispose(); empty.r.dispose();
  });

  it('building a body material logs no three.js warning (side: undefined is passed for opaque looks)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      makeCreatureMaterial(LOOKS.woodlouse!.motion, createSharedUniforms(), { roughness: 0.5 }).dispose();
      expect(warn.mock.calls.map((c) => String(c[0]))).toEqual([]);
    } finally { warn.mockRestore(); }
  });

  it('every simulated kind except the bird event and herd aphids has a look (GDD 05 §2.2)', () => {
    for (const k of Object.keys(CREATURE_STATS) as CreatureKind[]) {
      if (k === 'bird' || k === 'aphid') continue;
      expect(lookKeyFor(k, null, 0, 'off'), k).not.toBeNull();
    }
  });

  it('the SubRenderer takes the comfort level from the frame (accessibility section) and switches on the next frame', () => {
    const cr = new CreaturesRenderer();
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(0, 60, 120); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    cr.init({ scene, camera, quality: getPreset('high') } as never);
    const src = { state: { tick: 5, creatures: [view(1, 'jumping-spider', 0)], ecology: { herds: [], hazards: [], birdEvent: null } } };
    const frame = (comfort: unknown) => cr.update({ dt: 1 / 60, time: 0, alpha: 1, sim: src, camera, viewportHeightPx: 720, comfort } as never);
    frame({ spiderComfort: 'off', comfortMites: false, comfortCentipedes: false });
    expect(cr.creatures.stats.spiderBodies).toBe(1);
    frame({ spiderComfort: 'marker', comfortMites: false, comfortCentipedes: false });
    expect(cr.creatures.stats.spiderBodies).toBe(0);
    expect(cr.creatures.stats.markers).toBe(1);
    cr.dispose();
  });
});
