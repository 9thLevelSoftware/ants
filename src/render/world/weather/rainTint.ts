// The colour of a rain streak follows the light of the scene it falls in: the haze (fog) colour, which the world
// lighting already moves with the time of day and the weather, lifted a little (RAIN_TINT_GAIN). Streaks are drawn in
// the scene's own linear HDR units before tone mapping and exposure, so they dim with the scene at dusk and by night
// and are never pure white.
import { HemisphereLight, type Fog, type FogExp2, type Scene } from 'three';
import { RAIN_COLOR, RAIN_TINT_GAIN, RAIN_TINT_MAX } from './tuning';

const out: [number, number, number] = [0, 0, 0];
const HEMI_SHARE = 0.6;

/** Streak colour for the scene's current light (a shared array: copy before keeping). */
export function rainTint(scene: Scene): readonly [number, number, number] {
  const fog = scene.fog as Fog | FogExp2 | null;
  if (fog) {
    out[0] = fog.color.r * RAIN_TINT_GAIN; out[1] = fog.color.g * RAIN_TINT_GAIN; out[2] = fog.color.b * RAIN_TINT_GAIN;
    return capped(out);
  }
  // haze off in Settings: lit by the sky ambient instead
  const hemi = scene.getObjectByName('world:sky-ambient');
  const k = hemi instanceof HemisphereLight ? hemi.intensity * HEMI_SHARE : 0.3;
  const c = hemi instanceof HemisphereLight ? hemi.color : null;
  out[0] = (c ? c.r : RAIN_COLOR[0]) * k; out[1] = (c ? c.g : RAIN_COLOR[1]) * k; out[2] = (c ? c.b : RAIN_COLOR[2]) * k;
  return capped(out);
}

/** In a bright haze the lift would exceed what a streak can add to a lit sky: scale the colour so no channel passes RAIN_TINT_MAX. */
function capped(c: [number, number, number]): [number, number, number] {
  const m = Math.max(c[0], c[1], c[2]);
  if (m > RAIN_TINT_MAX) { const k = RAIN_TINT_MAX / m; c[0] *= k; c[1] *= k; c[2] *= k; }
  return c;
}
