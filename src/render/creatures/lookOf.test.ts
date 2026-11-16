// GDD 08 E17 needs `ui.look()` to report a creature's render variant: lookOf(id) says what each creature was drawn
// as in the last update (look key, comfort level, ring), and null for creatures not drawn.
import { describe, expect, it } from 'vitest';
// Load order: the sim's ecology <-> human-events import cycle only resolves when ecology is loaded first (also fails on HEAD; sim owners' fix).
import '@/sim/ecology';
import { PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import type { CreatureKind } from '@/sim/types';
import { CreatureRenderer } from './CreatureRenderer';
import type { CreatureSimSource, CreatureView } from './simAdapter';

function view(id: number, kind: CreatureKind, x: number, o: Partial<CreatureView> = {}): CreatureView {
  const p = { x, y: 0, z: 0 }, up = { x: 0, y: 1, z: 0 }, f = { x: 1, y: 0, z: 0 };
  return { id, alive: true, kind, variant: null, pos: p, prevPos: { ...p }, up, prevUp: up, fwd: f, prevFwd: f, speed: 0, footOffset: 0, medium: 'surface', state: 'wander', stateTick: 0, flags: 0, hp: 5, bb: {}, ...o };
}

describe('lookOf(creatureId)', () => {
  it('reports the drawn look and comfort level, and follows a comfort switch on the next frame', () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(0, 60, 120); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const r = new CreatureRenderer();
    r.init({ scene: new Scene(), camera, quality: getPreset('high') });
    const list = [view(1, 'wolf-spider', 0), view(2, 'caterpillar', 15, { variant: 'hairy' }), view(3, 'woodlouse', 30, { alive: false })];
    const src: CreatureSimSource = { state: { tick: 3, creatures: list, ecology: { herds: [], hazards: [], birdEvent: null } } };
    r.setSim(src);
    const frame = () => r.update({ dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 });
    frame();
    expect(r.lookOf(1)).toEqual({ look: 'wolf-spider', comfort: 'off', ring: false });
    expect(r.lookOf(2)).toEqual({ look: 'caterpillar-hairy', comfort: 'off', ring: false });
    expect(r.lookOf(3)).toBeNull();
    r.setComfort({ spiderComfort: 'abstract' });
    frame();
    expect(r.lookOf(1)).toEqual({ look: 'wolf-spider-abstract', comfort: 'abstract', ring: true });
    r.setComfort({ spiderComfort: 'marker' });
    frame();
    expect(r.lookOf(1)).toEqual({ look: null, comfort: 'marker', ring: true });
    r.dispose();
  });
});
