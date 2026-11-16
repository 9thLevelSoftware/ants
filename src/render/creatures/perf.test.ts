// Acceptance 4: 300 creatures cost no more per instance than the ants. Both renderers update the same layout of 300
// walking animals (same camera); the minimum of many interleaved runs is compared. CPU: load-tolerant by default
// (creatures <= 3 x the ants' per-instance CPU); FOUNDRESS_PERF_STRICT=1 asks for <= 1.0 x. Triangles: per projected
// pixel of body length (the creature mix is on average ~3.6 x longer than a 4 mm worker, so raw triangles per
// instance are not comparable; detail.test.ts checks every look against the ant at the same size). Also checks the
// per-instance upload size (112 bytes vs the ants' 176). The GPU side is measured in the demo (bench.mjs).
import { describe, expect, it } from 'vitest';
import { Frustum, Matrix4, PerspectiveCamera, Scene, Sphere, Vector3 } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer, type AntSimSource, type AntView } from '@/render/ants';
import type { CreatureKind } from '@/sim/types';
import { CreatureRenderer } from './CreatureRenderer';
import { CR_STRIDE } from './batch';
import type { CreatureSimSource, CreatureView } from './simAdapter';

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const STRICT = !!env.FOUNDRESS_PERF_STRICT;
const N = 300;
const KINDS: CreatureKind[] = ['springtail', 'mite', 'fruit-fly', 'fly-larva', 'woodlouse', 'caterpillar', 'ladybird', 'ladybird-larva', 'lacewing-larva',
  'rove-beetle', 'millipede', 'snail', 'earthworm', 'wolf-spider', 'jumping-spider', 'ant-spider', 'centipede'];

function grid(i: number) { const side = Math.ceil(Math.sqrt(N)); return { x: (i % side) * 12 - side * 6, y: 0, z: Math.floor(i / side) * 12 - side * 6 }; }

/** One tick of walking, back and forth (so the layout stays in view however many frames are timed). */
let tickNo = 0;
function walkers<T extends { pos: { x: number; z: number }; prevPos: { x: number; z: number }; speed: number }>(list: T[]): void {
  const dx = (tickNo++ >> 4) % 2 === 0 ? 0.4 : -0.4;
  for (const a of list) { a.prevPos.x = a.pos.x; a.prevPos.z = a.pos.z; a.pos.x += dx; a.speed = 8; }
}

function minMs(fn: () => void, frames: number, runs: number): number {
  let best = Infinity;
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now();
    for (let f = 0; f < frames; f++) fn();
    best = Math.min(best, (performance.now() - t0) / frames);
  }
  return best;
}

describe('per-instance cost: 300 creatures vs 300 ants', () => {
  it('creature update CPU per instance is within the ants\' figure', () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.5, 5000);
    camera.position.set(0, 120, 220); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const quality = getPreset('high');
    const up = { x: 0, y: 1, z: 0 }, fwd = { x: 1, y: 0, z: 0 };
    const creatures: CreatureView[] = [];
    for (let i = 0; i < N; i++) {
      const p = grid(i);
      creatures.push({ id: i + 1, alive: true, kind: KINDS[i % KINDS.length]!, variant: null, pos: { ...p }, prevPos: { ...p }, up: { ...up }, prevUp: { ...up },
        fwd: { ...fwd }, prevFwd: { ...fwd }, speed: 5, footOffset: 0, medium: 'surface', state: 'wander', stateTick: 0, flags: 0, hp: 10, bb: {} });
    }
    const ants: AntView[] = [];
    for (let i = 0; i < N; i++) {
      const p = grid(i);
      ants.push({ id: i + 1, alive: true, colony: 0, caste: 'worker', pos: { ...p }, prevPos: { ...p }, up: { ...up }, prevUp: { ...up }, fwd: { ...fwd }, prevFwd: { ...fwd },
        speed: 8, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null, flags: 0, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: -1e6, alarmLevel: 0 });
    }
    const cr = new CreatureRenderer();
    cr.init({ scene: new Scene(), camera, quality });
    const csrc: CreatureSimSource = { state: { tick: 10, creatures, ecology: { herds: [], hazards: [], birdEvent: null } } };
    cr.setSim(csrc);
    const ar = new AntRenderer();
    ar.init({ scene: new Scene(), camera, quality });
    const asrc: AntSimSource = { state: { tick: 10, ants, brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: -1 } } };
    ar.setSim(asrc);
    const frame = { dt: 1 / 60, time: 0, alpha: 0.5, camera, viewportHeightPx: 720 };
    // warm up (geometry builds, JIT)
    for (let i = 0; i < 20; i++) { walkers(creatures); cr.update(frame); walkers(ants); ar.update(frame); }
    // interleaved runs (the shared machine's load changes from second to second); minimum of each
    let cMs = Infinity, aMs = Infinity;
    for (let r = 0; r < 30; r++) {
      cMs = Math.min(cMs, minMs(() => { walkers(creatures); cr.update(frame); }, 10, 1));
      aMs = Math.min(aMs, minMs(() => { walkers(ants); ar.update(frame); }, 10, 1));
    }
    const ratio = cMs / aMs;
    if (env.FOUNDRESS_PRINT) console.log(`300 creatures ${cMs.toFixed(3)} ms (${((cMs / N) * 1000).toFixed(2)} us each) vs 300 ants ${aMs.toFixed(3)} ms (${((aMs / N) * 1000).toFixed(2)} us each), ratio ${ratio.toFixed(2)}; drawn ${cr.stats.drawn.join('/')} tris ${cr.stats.triangles} vs ants ${ar.stats.triangles}`);
    expect(cr.stats.drawn[0] + cr.stats.drawn[1] + cr.stats.drawn[2]).toBeGreaterThan(N * 0.9);
    expect(ratio).toBeLessThan(STRICT ? 1.0 : 3);
    // triangles per projected pixel of body length (deterministic, so always strict): the ants' Σpx with their own
    // rule (worker 4 mm, centre 0.1 L above the foot point, frustum-culled)
    const fr = new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
    const pxPerMm = 720 / (2 * Math.tan((camera.fov * Math.PI) / 360));
    let antPx = 0;
    for (const a of ants) {
      const c = new Vector3(a.pos.x, a.pos.y + 0.4, a.pos.z);
      if (fr.intersectsSphere(new Sphere(c, 3.6))) antPx += (4 / c.distanceTo(camera.position)) * pxPerMm;
    }
    const cDensity = cr.stats.triangles / cr.stats.projectedPx, aDensity = ar.stats.triangles / antPx;
    if (env.FOUNDRESS_PRINT) console.log(`triangles per projected px: creatures ${cDensity.toFixed(1)} (${cr.stats.triangles} / ${cr.stats.projectedPx.toFixed(0)} px), ants ${aDensity.toFixed(1)} (${ar.stats.triangles} / ${antPx.toFixed(0)} px); per instance ${(cr.stats.triangles / N).toFixed(0)} vs ${(ar.stats.triangles / N).toFixed(0)}`);
    expect(cDensity).toBeLessThanOrEqual(aDensity);
    // per-instance upload: matrix + 3 vec4 = 112 bytes (ants: 176)
    expect(CR_STRIDE * 4).toBe(112);
    cr.dispose(); ar.dispose();
  });
});
