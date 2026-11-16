// int-1A review fixes in the ant look: highlight colours follow the exposure without re-parsing hex strings every
// frame (finding 4), and the hyaline wing membrane scatters little light (finding 3: the milky queen).
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Color, PerspectiveCamera, Scene } from 'three';
import { getPreset } from '@/render/app/quality';
import { AntRenderer } from './AntRenderer';
import { HIGHLIGHT } from './tuning';

function renderer() {
  const r = new AntRenderer();
  r.init({ scene: new Scene(), camera: new PerspectiveCamera(), quality: getPreset('test') });
  const shared = (r as unknown as { shared: { uHiWarm: { value: Color }; uHiCool: { value: Color } } }).shared;
  return { r, shared };
}

describe('AntRenderer.setHighlightExposure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('parses no colour strings when called every frame', () => {
    const { r } = renderer();
    const parse = vi.spyOn(Color.prototype, 'setStyle');
    for (let i = 0; i < 100; i++) r.setHighlightExposure(i < 50 ? 2.5 : -1);
    expect(parse).not.toHaveBeenCalled();
    r.dispose();
  });

  it('compensates the exposure: 2^-EV times the 0 EV colour, back to it at 0 EV', () => {
    const { r, shared } = renderer();
    const warm0 = new Color(HIGHLIGHT.warm).multiplyScalar(HIGHLIGHT.warmGain);
    const cool0 = new Color(HIGHLIGHT.cool).multiplyScalar(HIGHLIGHT.coolGain);
    expect(shared.uHiWarm.value.g).toBeCloseTo(warm0.g, 9);
    r.setHighlightExposure(2);
    r.setHighlightExposure(2);
    expect(shared.uHiWarm.value.g).toBeCloseTo(warm0.g / 4, 9);
    expect(shared.uHiCool.value.b).toBeCloseTo(cool0.b / 4, 9);
    r.setHighlightExposure(0);
    expect(shared.uHiWarm.value.r).toBeCloseTo(warm0.r, 9);
    r.dispose();
  });
});

describe('queen wing membrane (int-1A review finding 3)', () => {
  it('scatters little light: the membrane albedo is the species tint x WING_LOOK.membraneScatter', async () => {
    const { WING_LOOK } = await import('./tuning');
    const { r } = renderer();
    const store = (r as unknown as { store: { index(s: string, c: string, z: null, w: boolean): number; entries: { wings: { mesh: { material: Color & { color: Color; uniforms?: unknown } } } | null }[] } }).store;
    const i = store.index('lasius-niger', 'queen', null, true);
    const wings = store.entries[i].wings;
    expect(wings).not.toBeNull();
    const albedo = (wings!.mesh.material as unknown as { color: Color }).color;
    const tint = new Color('#c8b896').multiplyScalar(WING_LOOK.membraneScatter);
    expect(albedo.r).toBeCloseTo(tint.r, 6);
    // a clear membrane: far darker than the sunlit soil it covers (linear albedo of light soil about 0.3)
    expect(0.2126 * albedo.r + 0.7152 * albedo.g + 0.0722 * albedo.b).toBeLessThan(0.08);
    r.dispose();
  });
});

describe('camera-to-ant capsule (GDD 01 6.5 rule 2)', () => {
  const view = (id: number, x: number, flags = 0) => {
    const p = { x, y: 0, z: 0 };
    return {
      id, alive: true, colony: 0, caste: 'worker', pos: p, prevPos: { ...p }, up: { x: 0, y: 1, z: 0 }, prevUp: { x: 0, y: 1, z: 0 },
      fwd: { x: 0, y: 0, z: 1 }, prevFwd: { x: 0, y: 0, z: 1 }, speed: 0, footOffset: 0, medium: 'surface', lengthBu: 1, sizeClass: null,
      flags, pose: 0, carry: { kind: 'none', id: -1 }, cropC: 0, cropP: 0, cropCap: 1, bornTick: 0, alarmLevel: 0,
    };
  };

  it('spans from the camera to the possessed ant with radius 0.6 L, and is off without a possessed ant', async () => {
    const { CAMERA_CAPSULE } = await import('./tuning');
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(-20, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const r = new AntRenderer();
    r.init({ scene: new Scene(), camera, quality: getPreset('test') });
    const shared = (r as unknown as { shared: { uCapA: { value: { x: number } }; uCapB: { value: { x: number; y: number } }; uCapR: { value: number } } }).shared;
    const ants = [view(1, 0), view(2, -10)];
    const state = { tick: 0, ants, brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: 1 } };
    r.setSim({ state } as never);
    const frame = { dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 };
    r.update(frame);
    const L = 4; // lengthBu 1 x Lasius BU 4 mm
    expect(shared.uCapR.value).toBeCloseTo(CAMERA_CAPSULE.radiusL * L, 6);
    expect(shared.uCapA.value.x).toBe(-20);
    expect(shared.uCapB.value.x).toBeCloseTo(0, 6);
    expect(shared.uCapB.value.y).toBeGreaterThan(0); // the thorax, above the feet
    state.player.possessedAntId = -1;
    r.update(frame);
    expect(shared.uCapR.value).toBe(0);
    r.dispose();
  });

  it('photo mode can hide the possession rim: hidePossessedHighlight makes the possessed ant draw with no highlight (GDD 01 6.9)', () => {
    const camera = new PerspectiveCamera(40, 16 / 9, 0.1, 5000);
    camera.position.set(-20, 10, 0); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
    const r = new AntRenderer();
    r.init({ scene: new Scene(), camera, quality: getPreset('test') });
    const state = { tick: 0, ants: [view(1, 0)], brood: [], items: [], colonies: [{ id: 0, species: 'lasius-niger' }], player: { possessedAntId: 1 } };
    r.setSim({ state } as never);
    const hi = (): number => (r as unknown as { highlightOf(k: string, id: number, possessed: boolean): number }).highlightOf('ant', 1, true);
    const frame = { dt: 1 / 60, time: 0, alpha: 1, camera, viewportHeightPx: 720 };
    r.update(frame);
    expect(hi()).toBe(HIGHLIGHT.possessed);
    r.update({ ...frame, hidePossessedHighlight: true });
    expect(hi()).toBe(0);
    r.update(frame); // the flag is per frame: leaving photo mode brings the rim back
    expect(hi()).toBe(HIGHLIGHT.possessed);
    r.dispose();
  });
});
