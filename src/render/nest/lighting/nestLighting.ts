// Feeds the nest lighting uniforms each frame: the sky openings nearest to the camera, daylight colour, ambient,
// and the sense light centred on the possessed ant (the camera when nobody is possessed).
import { Color, Vector3 } from 'three';
import type { Vec3 } from '@/core/math/vec3';
import type { NestUniforms } from '../materials/nestUniforms';
import { CAVITY_SKIN_BU, HOLE_LIP_BU, CUTAWAY, NEST_LIGHT, XRAY } from '../params';
import type { NestSource, Opening } from '../simAdapter';

const tmp = new Color();
// Linear base colours of the artificial light, parsed once (Color.set(hex) parses and colour-manages a string).
const AMBIENT_BASE = new Color(NEST_LIGHT.ambientHex).multiplyScalar(NEST_LIGHT.ambientLevel);
const LANTERN_BASE = new Color(NEST_LIGHT.lanternHex).multiplyScalar(NEST_LIGHT.lanternLevel);

export class NestLighting {
  /** Linear daylight radiance at the surface (0 at night), set by the caller (world lighting) or the default. */
  readonly daylight = new Color(NEST_LIGHT.daylightHex);
  readonly lantern = new Vector3();
  private openings: Opening[] = [];
  private order: number[] = [];
  private openingCount = 0;
  private artificialGain = 1;
  /** Squared camera distance per opening (reused; the sort comparator below is created once). */
  private dist2: number[] = [];
  private readonly byDistance = (a: number, b: number): number => this.dist2[a] - this.dist2[b];

  constructor(private readonly u: NestUniforms) {}

  /** Static values that depend only on BU. */
  setBodyUnit(bu: number): void {
    const u = this.u;
    u.uBu.value = bu;
    u.uSkin.value = CAVITY_SKIN_BU * bu;
    u.uHoleLip.value = HOLE_LIP_BU * bu;
    u.uSkyLen.value = NEST_LIGHT.skyFalloffBU * bu;
    u.uAmb.value.copy(AMBIENT_BASE).multiplyScalar(this.artificialGain);
    u.uAmbNear.value.set(NEST_LIGHT.ambientNearBoost, NEST_LIGHT.ambientNearBU * bu);
    u.uAmbDeep.value.set(NEST_LIGHT.ambientDeepFactor, NEST_LIGHT.ambientDeepBU * bu);
    u.uLanternCol.value.copy(LANTERN_BASE).multiplyScalar(this.artificialGain);
    u.uLanternR.value = NEST_LIGHT.lanternRadiusBU * bu;
    u.uLanternWrap.value = NEST_LIGHT.lanternWrap;
    u.uCutFill.value.set(CUTAWAY.fillHex).multiplyScalar(CUTAWAY.fillLevel);
    u.uCutFillLen.value = CUTAWAY.fillFalloffBU * bu;
    u.uXDepth.value = XRAY.deepBU * bu;
  }

  /**
   * Scales the nest's own artificial light (the warm ambient and the sense light), which is calibrated for the
   * underground exposure. Above ground the eye adapts to the surface (night exposure is 2-3 EV brighter), and the
   * unscaled ambient made open holes glow orange at night; the caller passes 2^(underground EV - current EV), <= 1.
   */
  setArtificialGain(g: number): void {
    const k = Number.isFinite(g) ? Math.max(0, g) : 1;
    if (k === this.artificialGain) return; // called every frame; the gain changes only with the exposure
    this.artificialGain = k;
    this.u.uAmb.value.copy(AMBIENT_BASE).multiplyScalar(k);
    this.u.uLanternCol.value.copy(LANTERN_BASE).multiplyScalar(k);
  }

  /** Daylight as linear RGB radiance (e.g. the world's sky ambient + sun at the surface); 0 = night. */
  setDaylight(r: number, g: number, b: number): void {
    this.daylight.setRGB(r, g, b);
  }

  /** Re-reads the openings (entrances / breaches) from the source; call when the nest changed. */
  refreshOpenings(src: NestSource): void {
    this.openingCount = src.openings(this.openings);
  }

  update(src: NestSource | null, cam: Vec3, lanternAt: Vec3 | null): void {
    const u = this.u;
    // the nearest openings to the camera
    const n = this.openingCount;
    this.order.length = 0;
    for (let i = 0; i < n; i++) {
      const o = this.openings[i];
      this.dist2[i] = (o.x - cam.x) ** 2 + (o.y - cam.y) ** 2 + (o.z - cam.z) ** 2;
      this.order.push(i);
    }
    this.order.sort(this.byDistance);
    const m = Math.min(n, NEST_LIGHT.maxOpenings);
    for (let i = 0; i < m; i++) {
      const o = this.openings[this.order[i]];
      u.uSky.value[i].set(o.x, o.y, o.z, o.r);
    }
    u.uSkyN.value = m;
    u.uSkyCol.value.copy(tmp.copy(this.daylight).multiplyScalar(NEST_LIGHT.skyLevel));
    const at = lanternAt ?? cam;
    this.lantern.set(at.x, at.y, at.z);
    u.uLanternPos.value.copy(this.lantern);
    if (!src) u.uSkyN.value = 0;
  }

  get openingsInUse(): number {
    return this.u.uSkyN.value;
  }
}
