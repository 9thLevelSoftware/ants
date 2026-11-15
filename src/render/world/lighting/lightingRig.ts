// Lights of the surface world: one shadow-casting key light (sun by day, moon at night), a hemisphere light for the
// sky ambient, fog, and the sun shadow frustum that follows the view with texel snapping.
import { DirectionalLight, FogExp2, HemisphereLight, Object3D, Vector3, type Scene } from 'three';
import { configureSunShadow, type QualityPreset } from '@/render/app';
import { UNDERGROUND, SHADOW_AHEAD, SHADOW_BIAS_TEXELS, SHADOW_LIGHT_DIST, SHADOW_NORMAL_BIAS_TEXELS, SHADOW_RADIUS_TEXELS } from './constants';
import { shadowFocus, snapShadowCenter } from './shadowSnap';
import type { LightingState } from './timeOfDay';

/** The fill comes from above the camera (mm, added to a point 100 mm behind the subject along the view). */
const FILL_LIFT = new Vector3(0, 60, 0);

export class LightingRig {
  readonly key: DirectionalLight;
  /** Soft warm fill from the camera's side, only underground (LightingState.fillIntensity); never casts shadows. */
  readonly fill: DirectionalLight;
  readonly hemi: HemisphereLight;
  readonly fog: FogExp2;
  readonly group = new Object3D();
  private quality: QualityPreset;
  private bu: number;
  private focus = new Vector3();
  private snapped = new Vector3();
  /** Last applied shadow half-extent, mm. */
  halfExtent = 0;

  constructor(quality: QualityPreset, bu: number) {
    this.quality = quality;
    this.bu = bu;
    this.key = new DirectionalLight(0xffffff, 3);
    this.key.name = 'world:key-light';
    this.fill = new DirectionalLight(UNDERGROUND.fillHex, 0);
    this.fill.name = 'world:sense-fill';
    this.fill.castShadow = false;
    this.hemi = new HemisphereLight(0xffffff, 0x554433, 0.5);
    this.hemi.name = 'world:sky-ambient';
    this.fog = new FogExp2(0xffffff, 0);
    this.group.name = 'world:lights';
    this.group.add(this.key, this.key.target, this.fill, this.fill.target, this.hemi);
    this.setQuality(quality, bu);
  }

  setQuality(q: QualityPreset, bu: number): void {
    this.quality = q;
    this.bu = bu;
    configureSunShadow(this.key, q, bu);
    this.halfExtent = q.shadows.distanceBU * bu;
    const cam = this.key.shadow.camera;
    cam.near = 1;
    cam.far = this.halfExtent * (SHADOW_LIGHT_DIST * 2 + 2);
    cam.updateProjectionMatrix();
    // the depth bias is a fraction of the shadow camera's depth range: express it in mm, or a 10 m deep frustum
    // turns the app's -0.0004 into a 4 mm gap under every pebble and toy (objects float on detached shadows)
    if (q.shadows.enabled) {
      const texel = (2 * this.halfExtent) / q.shadows.mapSize;
      this.key.shadow.bias = -(SHADOW_BIAS_TEXELS * texel) / (cam.far - cam.near);
      this.key.shadow.normalBias = SHADOW_NORMAL_BIAS_TEXELS * texel;
    }
  }

  /** Applies a lighting state; `fogEnabled` follows the preset (haze off in Settings). */
  apply(l: LightingState, scene: Scene, fogEnabled: boolean): void {
    this.key.color.copy(l.keyColor);
    this.key.intensity = l.keyIntensity;
    this.key.shadow.radius = SHADOW_RADIUS_TEXELS * l.penumbra;
    this.hemi.color.copy(l.hemiSky);
    this.hemi.groundColor.copy(l.hemiGround);
    this.hemi.intensity = l.hemiIntensity;
    // kept in the scene at intensity 0 on the surface: adding / removing a light would recompile every program
    this.fill.intensity = l.fillIntensity;
    this.fog.color.copy(l.fogColor);
    this.fog.density = l.fogDensity;
    scene.fog = fogEnabled && l.fogDensity > 0 ? this.fog : null;
    scene.environmentIntensity = l.envIntensity;
  }

  /**
   * Places the key light and its shadow frustum: centred ahead of the subject along the view, snapped to shadow
   * texels in light space so edges stay still while the camera moves.
   */
  follow(subject: Vector3, viewDir: Vector3, keyDir: Vector3): void {
    const half = this.halfExtent;
    shadowFocus(subject, viewDir, SHADOW_AHEAD * half, this.focus);
    const size = this.quality.shadows.enabled ? this.quality.shadows.mapSize : 1024;
    snapShadowCenter(this.focus, keyDir, half, size, this.snapped);
    this.key.target.position.copy(this.snapped);
    this.key.position.copy(this.snapped).addScaledVector(keyDir, half * SHADOW_LIGHT_DIST);
    this.key.target.updateMatrixWorld();
    this.key.updateMatrixWorld();
    // fill: from behind and above the camera toward the subject
    this.fill.target.position.copy(subject);
    this.fill.position.copy(subject).addScaledVector(viewDir, -100).add(FILL_LIFT);
    this.fill.target.updateMatrixWorld();
    this.fill.updateMatrixWorld();
  }

  get shadowCenter(): Vector3 {
    return this.snapped;
  }

  get bodyUnit(): number {
    return this.bu;
  }

  dispose(): void {
    this.key.shadow.map?.dispose();
    this.key.dispose();
    this.fill.dispose();
    this.hemi.dispose();
  }
}
