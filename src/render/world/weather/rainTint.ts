// The colour of a rain streak follows the light of the scene it falls in: the haze (fog) colour, which the world
// lighting already moves with the time of day and the weather, lifted a little (RAIN_TINT_GAIN). Streaks are drawn in
// the scene's own linear HDR units before tone mapping and exposure, so they dim with the scene at dusk and by night
// and are never pure white.
import { HemisphereLight, type Fog, type FogExp2, type Scene } from 'three';
import { RAIN_COLOR, RAIN_TINT_GAIN, RAIN_TINT_MAX } from './tuning';

const out: [number, number, number] = [0, 0, 0];
const HEMI_SHARE = 0.6;
/** Re-search for a missing sky light only every this many calls (the search walks the whole scene graph). */
const HEMI_RETRY_CALLS = 240;
const hemiOf = new WeakMap<Scene, { light: HemisphereLight | null; wait: number }>();

/** The world's sky ambient light, looked up once per scene (a miss is retried rarely, not every frame). */
function skyAmbient(scene: Scene): HemisphereLight | null {
  let e = hemiOf.get(scene);
  if (!e) { e = { light: null, wait: 0 }; hemiOf.set(scene, e); }
  if (e.light && !e.light.parent) e.light = null; // removed from the scene
  if (!e.light && e.wait-- <= 0) {
    const found = scene.getObjectByName('world:sky-ambient');
    e.light = found instanceof HemisphereLight ? found : null;
    e.wait = HEMI_RETRY_CALLS;
  }
  return e.light;
}

/** Streak colour for the scene's current light (a shared array: copy before keeping). */
export function rainTint(scene: Scene): readonly [number, number, number] {
  const fog = scene.fog as Fog | FogExp2 | null;
  if (fog) {
    out[0] = fog.color.r * RAIN_TINT_GAIN; out[1] = fog.color.g * RAIN_TINT_GAIN; out[2] = fog.color.b * RAIN_TINT_GAIN;
    return capped(out);
  }
  // haze off in Settings: lit by the sky ambient instead
  const hemi = skyAmbient(scene);
  const k = hemi ? hemi.intensity * HEMI_SHARE : 0.3;
  const c = hemi ? hemi.color : null;
  out[0] = (c ? c.r : RAIN_COLOR[0]) * k; out[1] = (c ? c.g : RAIN_COLOR[1]) * k; out[2] = (c ? c.b : RAIN_COLOR[2]) * k;
  return capped(out);
}

/** In a bright haze the lift would exceed what a streak can add to a lit sky: scale the colour so no channel passes RAIN_TINT_MAX. */
function capped(c: [number, number, number]): [number, number, number] {
  const m = Math.max(c[0], c[1], c[2]);
  if (m > RAIN_TINT_MAX) { const k = RAIN_TINT_MAX / m; c[0] *= k; c[1] *= k; c[2] *= k; }
  return c;
}
