/**
 * Where the bird event's visible parts are at a moment (GDD 05 §2.6): during the approach (BIRD_APPROACH_S) a soft
 * shadow sweeps in and grows; once landed it stays over the target while the beak waits above the next aim, cocks
 * the head in the last BIRD_HEAD_COCK_S before a peck, strikes and recovers; while leaving the shadow slides away and
 * fades and the beak rises out of frame. Pure: driven by the event record and the interpolated tick only.
 */
import type { Vec3 } from '@/core/math/vec3';
import { BIRD_HEAD_COCK_S, BIRD_LEAVE_S, BIRD_PECK_EVERY_S } from '@/sim/balance/creatures';
import { TICKS_PER_SECOND } from '@/sim/time';
import { hash3 } from '@/render/ants/geometry/curves';
import type { BirdView } from './simAdapter';
import { BIRD_LOOK } from './tuning';

export interface BirdPoseOut {
  shadow: { visible: boolean; x: number; z: number; scale: number; opacity: number; dirX: number; dirZ: number };
  beak: { visible: boolean; tip: Vec3; tilt: number };
}

export function newBirdPose(): BirdPoseOut {
  return { shadow: { visible: false, x: 0, z: 0, scale: 1, opacity: 0, dirX: 1, dirZ: 0 }, beak: { visible: false, tip: { x: 0, y: 0, z: 0 }, tilt: 0 } };
}

const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** Fills `out` for event `ev` at fractional tick `t` (tick + alpha); groundY = ground height at the event. */
export function birdPose(ev: BirdView, t: number, groundY: number, out: BirdPoseOut): BirdPoseOut {
  const sh = out.shadow, bk = out.beak;
  // approach direction: fixed per event (from its start tick), so the sweep is repeatable
  const a = hash3(ev.startTick, 13, 5) * Math.PI * 2;
  sh.dirX = Math.cos(a); sh.dirZ = Math.sin(a);
  sh.visible = true; bk.visible = false;
  const land = ev.landTick ?? ev.startTick;
  const aim = ev.peckAim ?? ev.pos;
  if (ev.phase === 'approach' || t < land) {
    const p = smooth((t - ev.startTick) / Math.max(1, land - ev.startTick));
    const off = BIRD_LOOK.approachFromMm * (1 - p);
    sh.x = ev.pos.x - sh.dirX * off; sh.z = ev.pos.z - sh.dirZ * off;
    sh.scale = 1.3 - 0.3 * p; sh.opacity = BIRD_LOOK.shadowDarkness * (0.55 + 0.45 * p);
    return out;
  }
  sh.x = ev.pos.x; sh.z = ev.pos.z; sh.scale = 1; sh.opacity = BIRD_LOOK.shadowDarkness;
  const rest = BIRD_LOOK.restHeightMm;
  if (ev.phase === 'leaving') {
    const leaveT = BIRD_LEAVE_S * TICKS_PER_SECOND;
    const q = smooth(1 - ((ev.endTick ?? t) - t) / leaveT);
    sh.x = ev.pos.x + sh.dirX * BIRD_LOOK.approachFromMm * q; sh.z = ev.pos.z + sh.dirZ * BIRD_LOOK.approachFromMm * q;
    sh.opacity = BIRD_LOOK.shadowDarkness * (1 - q);
    sh.visible = q < 1;
    bk.visible = q < 0.6;
    bk.tip.x = aim.x; bk.tip.z = aim.z; bk.tip.y = groundY + rest + BIRD_LOOK.leaveRiseMm * q; bk.tilt = 0;
    return out;
  }
  // landed: wait above the aim, cock, strike, recover
  bk.visible = true;
  const every = BIRD_PECK_EVERY_S * TICKS_PER_SECOND, cock = BIRD_HEAD_COCK_S * TICKS_PER_SECOND;
  const next = ev.nextPeckTick ?? land + every;
  const since = (t - (next - every)) / TICKS_PER_SECOND; // seconds since the last peck
  const until = (next - t) / TICKS_PER_SECOND;
  let h = rest, tilt = 0;
  const strike = BIRD_LOOK.strikeS, recover = BIRD_LOOK.recoverS;
  if (since >= 0 && since < strike) h = rest * (1 - since / strike);
  else if (since >= strike && since < strike + recover) h = rest * smooth((since - strike) / recover);
  else if (until >= 0 && until < cock / TICKS_PER_SECOND) { tilt = BIRD_LOOK.cockTiltRad * smooth(1 - until / (cock / TICKS_PER_SECOND)); h = rest * 0.8; }
  bk.tip.x = aim.x; bk.tip.z = aim.z; bk.tip.y = Math.max(aim.y, groundY) + h; bk.tilt = tilt;
  return out;
}
