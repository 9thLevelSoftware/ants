// Footstep tremor for the possession camera (GDD 01 §6.1 "Shake: only footstep tremor"). The human-events module
// writes `tremor` cues into sim.state.env.human.active (GDD 04); a cue whose impact tick has passed since the last
// check and whose radius reaches the ant shakes the camera once (the ViewDirector does the shaking).
import type { Vec3 } from '@/core';
import type { Sim } from '@/sim/types';

/** True when a tremor cue struck within reach of `pos` in the ticks (sinceTick, now]. */
export function tremorStruck(sim: Sim, pos: Vec3, sinceTick: number): boolean {
  const now = sim.state.tick;
  if (now <= sinceTick) return false;
  for (const run of sim.state.env.human.active) {
    for (const c of run.cues) {
      if (c.kind !== 'tremor' || c.impactTick <= sinceTick || c.impactTick > now) continue;
      if (Math.hypot(pos.x - c.origin.x, pos.z - c.origin.z) <= c.radiusMm) return true;
    }
  }
  return false;
}
