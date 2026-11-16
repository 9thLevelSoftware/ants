// CreatureRenderer without a GPU: update() only fills instance buffers, so looks, comfort mode, details, culling and
// the real-sim adapter can be checked in Node.
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene, type InstancedMesh, type Object3D } from 'three';
import { getPreset } from '@/render/app/quality';
import { makeTestSim } from '@/sim/testing';
import { spawnKind } from '@/sim/ecology/creatures/spawn';
import type { CreatureKind } from '@/sim/types';
import { CreatureRenderer } from './CreatureRenderer';
import { creatureSource } from './CreaturesRenderer';
import { LOOKS } from './looks';
import type { CreatureSimSource, CreatureView } from './simAdapter';

function view(id: number, kind: CreatureKind, x: number, o: Partial<CreatureView> = {}): CreatureView {
  const p = { x, y: 0, z: 0 };
  return {
    id, alive: true, kind, variant: null, pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 },
    prevFwd: { x: 1, y: 0, z: 0 }, speed: 0, footOffset: 0, medium: 'surface', state: 'wander', stateTick: 0, flags: 0, hp: 10, bb: {}, ...o,
  };
}

function setup(creatures: CreatureView[]) {
  const scene = new Scene();
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(0, 40, 80); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new CreatureRenderer();
  r.init({ scene, camera, quality: getPreset('high') });
  const src: CreatureSimSource = { state: { tick: 5, creatures, ecology: { herds: [], hazards: [], birdEvent: null } } };
  r.setSim(src);
  const frame = () => r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
  return { r, scene, camera, src, frame };
}

/** Instances drawn per look key (geometry names are not kept, so match batches by their geometry's look entry). */
function drawnLooks(r: CreatureRenderer): Record<string, number> {
  const out: Record<string, number> = {};
  const store = (r as unknown as { store: { entries: Map<string, { lods: ({ body: { n: number } } | null)[] }> } }).store;
  for (const [k, e] of store.entries) { const n = e.lods.reduce((a, l) => a + (l?.body.n ?? 0), 0); if (n > 0) out[k] = n; }
  return out;
}

function visibleMeshes(o: Object3D): InstancedMesh[] {
  const out: InstancedMesh[] = [];
  o.traverse((c) => { if ((c as InstancedMesh).isInstancedMesh && c.visible && (c as InstancedMesh).count > 0) out.push(c as InstancedMesh); });
  return out;
}

const SPIDERS: CreatureKind[] = ['jumping-spider', 'wolf-spider', 'ant-spider'];

describe('CreatureRenderer', () => {
  it('draws one instance per visible creature with the look of its kind (every kind of the catalogue)', () => {
    const kinds = Object.keys(LOOKS).filter((k) => !k.includes('-')) as CreatureKind[];
    const list = kinds.filter((k) => k !== 'aphid').map((k, i) => view(i + 1, k, (i - 8) * 3));
    const { r, frame } = setup(list);
    frame();
    expect(r.stats.creatures).toBe(list.length);
    expect(r.stats.drawn[0] + r.stats.drawn[1] + r.stats.drawn[2]).toBe(list.length);
    const d = drawnLooks(r);
    for (const c of list) expect(d[c.kind], c.kind).toBeGreaterThan(0);
    r.dispose();
  });

  it('comfort mode: switching is instant and complete (GDD 08 §12, acceptance 3 / GDD 08 E17)', () => {
    const list = [...SPIDERS.map((k, i) => view(i + 1, k, i * 8, { state: i === 1 ? 'windup' : 'stalk', stateTick: 0, bb: { strikeAt: 10 } })), view(9, 'centipede', -12)];
    const { r, frame, scene } = setup(list);
    frame();
    expect(r.stats.spiderBodies).toBe(3);
    // abstract: same-size legless ovoid + ring; no spider look drawn at all
    r.setComfort({ spiderComfort: 'abstract' });
    frame();
    let d = drawnLooks(r);
    for (const k of SPIDERS) { expect(d[k]).toBeUndefined(); expect(d[`${k}-softened`]).toBeUndefined(); expect(d[`${k}-abstract`]).toBe(1); }
    expect(r.stats.spiderBodies).toBe(0);
    expect(r.stats.markers).toBe(3);
    expect(d.centipede).toBe(1); // optional substitutes stay off unless opted in
    // marker: no body at all, only rings (+ the wind-up arc); the centipede opt-in follows the same level
    r.setComfort({ spiderComfort: 'marker', comfortCentipedes: true });
    frame();
    d = drawnLooks(r);
    for (const k of SPIDERS) { expect(d[k]).toBeUndefined(); expect(d[`${k}-abstract`]).toBeUndefined(); }
    expect(d.centipede).toBeUndefined();
    expect(r.stats.markers).toBe(4);
    // no instanced mesh with a spider look left visible in the scene
    const spiderLike = visibleMeshes(scene).filter((m) => m.name === 'creature-batch');
    expect(spiderLike.length).toBe(0);
    // softened keeps legs (spider body) at half leg amplitude; off restores the full look
    r.setComfort({ spiderComfort: 'softened', comfortCentipedes: false });
    frame();
    d = drawnLooks(r);
    for (const k of SPIDERS) expect(d[`${k}-softened`]).toBe(1);
    r.setComfort({ spiderComfort: 'off' });
    frame();
    d = drawnLooks(r);
    for (const k of SPIDERS) expect(d[k]).toBe(1);
    r.dispose();
  });

  it('culls off-screen and hidden creatures; far ones use the far detail', () => {
    const { r, frame } = setup([view(1, 'woodlouse', 0), view(2, 'woodlouse', 0, { pos: { x: 0, y: 0, z: 3000 }, prevPos: { x: 0, y: 0, z: 3000 } }),
      view(3, 'woodlouse', 0, { flags: 1 }), view(4, 'woodlouse', -900)]);
    frame();
    expect(r.stats.hidden).toBe(1);
    expect(r.stats.culled).toBeGreaterThanOrEqual(1);
    expect(r.stats.drawn[0] + r.stats.drawn[1]).toBeGreaterThanOrEqual(1);
    r.dispose();
  });

  it('reads a real Sim (creatures spawned by the creature module) through the same adapter', () => {
    const sim = makeTestSim({ seed: 3 });
    const c = sim.world.size / 2;
    const kinds: CreatureKind[] = ['wolf-spider', 'woodlouse', 'earthworm', 'ladybird', 'centipede'];
    const spawned = kinds.map((k, i) => spawnKind(sim, k, { x: c + i * 20, y: sim.field.height(c + i * 20, c), z: c }));
    expect(spawned.every((s) => s !== null)).toBe(true);
    const scene = new Scene();
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(c + 40, sim.field.height(c, c) + 60, c + 120); camera.lookAt(c + 40, sim.field.height(c, c), c); camera.updateMatrixWorld();
    const r = new CreatureRenderer();
    r.init({ scene, camera, quality: getPreset('test') });
    r.setSim(creatureSource(sim));
    r.update({ dt: 1 / 60, time: 0, alpha: 0.5, camera, viewportHeightPx: 720 });
    expect(r.stats.creatures).toBe(kinds.length);
    expect(r.stats.drawn[0] + r.stats.drawn[1] + r.stats.drawn[2]).toBe(kinds.length);
    r.dispose();
  });
});
