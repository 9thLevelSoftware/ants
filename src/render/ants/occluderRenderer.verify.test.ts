// Reviewer tests (app-seams-4 item 3, second pass): the occluder fade inside AntRenderer, end to end on instance data (no GPU).
// - Possessing an ant that is faded out (Tab to the ant in front of the camera) shows her at once: the possessed ant is never faded.
// - The stats of the fade do not allocate per frame (AntRenderer.update is a per-frame hot path).
import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';

const view = (id: number, x: number, z = 0) => {
  const p = { x, y: 0, z };
  return {
    id, alive: true, colony: 0, caste: 'worker', pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
    fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 }, speed: 0, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null,
    flags: 0, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0,
  };
};

function rig() {
  const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
  camera.position.set(-40, 3, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const r = new AntRenderer();
  r.init({ scene: new Scene(), camera, quality: getPreset('test') });
  // ant 1 is the subject at x = 0, ant 2 stands in the cone near the camera
  const ants = [view(1, 0), view(2, -32)];
  const state = { tick: 0, ants, brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: 1 } };
  r.setSim({ state } as never);
  const frame = { dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 };
  const hidden = (id: number): number => (r as unknown as { states: { peek(id: number): { hidden: number } | undefined } }).states.peek(id)?.hidden ?? -1;
  const drawn = (): number => r.stats.visible.reduce((a, b) => a + b, 0);
  return { r, state, frame, hidden, drawn };
}

describe('occluder fade in the renderer (reviewer)', () => {
  it('possessing the ant that was faded out draws her at once, solid', () => {
    const { r, state, frame, hidden, drawn } = rig();
    for (let i = 0; i < 40; i++) r.update(frame);
    expect(hidden(2)).toBe(1);
    expect(drawn()).toBe(1);
    state.player.possessedAntId = 2; // Tab to the ant in front of the camera
    r.update(frame);
    expect(hidden(2)).toBe(0);
    expect(drawn()).toBe(2);
    r.dispose();
  });

  it('the fade statistics reuse their storage from frame to frame (no array per frame in update)', () => {
    const { r, frame } = rig();
    r.update(frame);
    const a = r.stats.fadeDbg;
    r.update(frame);
    expect(r.stats.fadeDbg).toBe(a);
    r.dispose();
  });
});
