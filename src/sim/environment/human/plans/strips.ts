// Boustrophedon coverage (GDD 04 §15.2 mowing / vacuum / broom / wipe): parallel strips along the long axis of an
// area, alternating direction, advancing one step at a time. Positions outside the area are crossed without an
// impact (the machine is carried / lifted over them) at STRIP_CROSS_SPEED_MULT times the speed.

import { STRIP_CROSS_SPEED_MULT } from '@/sim/balance/human';
import type { Rect } from '../grid';

export interface StripStep {
  x: number; z: number;
  /** Heading of travel, radians from +X toward +Z. */
  yaw: number;
  /** Seconds after the coverage started. */
  s: number;
  strip: number;
}

export interface StripOptions {
  rect: Rect;
  inside: (x: number, z: number) => boolean;
  /** Distance between strip centrelines and the step along a strip, mm. */
  spacing: number;
  step: number;
  speed: number;
  maxS: number;
  /** First strip; strips past the last wrap to 0. */
  startStrip: number;
  /** Passes over each strip (vacuum: 2, there and back). */
  passes: number;
}

/** Steps of the coverage and the strip to resume from next time. */
export function coverStrips(o: StripOptions): { steps: StripStep[]; nextStrip: number; strips: number } {
  const alongX = o.rect.x1 - o.rect.x0 >= o.rect.z1 - o.rect.z0;
  const a0 = alongX ? o.rect.x0 : o.rect.z0, a1 = alongX ? o.rect.x1 : o.rect.z1;
  const w0 = alongX ? o.rect.z0 : o.rect.x0, w1 = alongX ? o.rect.z1 : o.rect.x1;
  const strips = Math.max(1, Math.ceil((w1 - w0) / o.spacing));
  const steps: StripStep[] = [];
  let s = 0, strip = ((o.startStrip % strips) + strips) % strips, done = 0;
  const stepS = o.step / o.speed;
  while (s < o.maxS && done < strips) {
    const across = w0 + (strip + 0.5) * o.spacing;
    for (let pass = 0; pass < o.passes && s < o.maxS; pass++) {
      const fwd = (strip + pass) % 2 === 0;
      const n = Math.max(1, Math.floor((a1 - a0) / o.step));
      for (let i = 0; i <= n && s < o.maxS; i++) {
        const along = fwd ? a0 + i * o.step : a1 - i * o.step;
        const x = alongX ? along : across, z = alongX ? across : along;
        const yaw = alongX ? (fwd ? 0 : Math.PI) : (fwd ? Math.PI / 2 : -Math.PI / 2);
        if (o.inside(x, z)) { steps.push({ x, z, yaw, s, strip }); s += stepS; } else s += stepS / STRIP_CROSS_SPEED_MULT;
      }
    }
    if (s < o.maxS) { done++; strip = (strip + 1) % strips; }
  }
  return { steps, nextStrip: strip, strips };
}
