// Camera tremor from the sim's `tremor` cues (GDD 01 §6.1: only footstep-like tremor shakes the camera; none in
// reduced motion). The game's views layer already relays cues to the possession camera (src/game/views/tremorCue.ts);
// this pure helper gives demos and other cameras the same shake: an offset that decays after each impact in reach.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';

export interface TremorShake {
  /** Camera offset, mm. */
  x: number; y: number; z: number;
}

/** Shake length after an impact (game s) and amplitude per unit cue intensity at the impact point (mm). */
const SHAKE_S = 0.6;
const SHAKE_AMP_MM = 6;
const SHAKE_HZ = 13;

/**
 * Offset of a camera at `pos` at render time `tickF` (fractional tick) from the tremor cues whose impact fell in the
 * last SHAKE_S: amplitude falls with distance inside the cue radius and with time. Zero in reduced motion.
 */
export function tremorShake(sim: Sim, pos: Vec3, tickF: number, reducedMotion: boolean, out: TremorShake): TremorShake {
  out.x = out.y = out.z = 0;
  if (reducedMotion) return out;
  for (const run of sim.state.env.human.active) {
    for (const c of run.cues) {
      if (c.kind !== 'tremor') continue;
      const age = (tickF - c.impactTick) / 10;
      if (age < 0 || age > SHAKE_S) continue;
      const d = Math.hypot(pos.x - c.origin.x, pos.z - c.origin.z);
      if (d > c.radiusMm) continue;
      const a = SHAKE_AMP_MM * c.intensity * (1 - d / c.radiusMm) * (1 - age / SHAKE_S);
      const w = 2 * Math.PI * SHAKE_HZ * age;
      out.y += a * Math.sin(w);
      out.x += a * 0.5 * Math.sin(w * 1.3 + 1);
      out.z += a * 0.5 * Math.sin(w * 0.7 + 2);
    }
  }
  return out;
}
