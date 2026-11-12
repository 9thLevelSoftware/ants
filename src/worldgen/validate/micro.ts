// Micro-connection usefulness (GDD 04 §6.3): useful for the played species if passable by the standard worker
// and (a) a shortcut: the nav path between its mouth cells without it is >= 1.4 x its length (or there is none),
// (b) it reaches a sheltered cavity of >= 64 BU^3, or (c) it is the only non-climbing access into the interior
// (a special case of (a)). Writes MicroConn.useful / reason.

import type { MicroConn } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { navDistances, portals } from './graph';
import { MICRO } from '../tuning/pipeline';

function cavityNear(ctx: GenContext, m: MicroConn): boolean {
  const bu = ctx.dims.bu, reach = 2 * bu;
  for (const c of ctx.world.cavities) {
    const vol = ((c.max.x - c.min.x) * (c.max.y - c.min.y) * (c.max.z - c.min.z)) / (bu * bu * bu);
    if (vol < MICRO.shelterMinBu3) continue;
    for (const p of [m.posA, m.posB]) {
      if (p.x >= c.min.x - reach && p.x <= c.max.x + reach && p.y >= c.min.y - reach && p.y <= c.max.y + reach && p.z >= c.min.z - reach && p.z <= c.max.z + reach) return true;
    }
  }
  return false;
}

/** Evaluates every micro-connection; returns the number of useful ones. */
export function evaluateMicro(ctx: GenContext): number {
  const ports = portals(ctx);
  let n = 0;
  for (const m of ctx.world.micro) {
    if (m.minClearanceBu < MICRO.passClearK) { m.useful = false; m.reason = 'closed for this species'; continue; }
    const p = ports.find((q) => q.microId === m.id);
    let useful = false, reason = 'no gain';
    if (p) {
      const limit = MICRO.shortcutRatio * p.lenBu;
      const d = navDistances(ctx, [p.a], { skipMicro: m.id, maxBu: limit + 1 });
      if (!(d[p.b] < Infinity)) { useful = true; reason = 'only path'; }
      else if (d[p.b] >= limit) { useful = true; reason = 'shortcut'; }
    }
    if (!useful && cavityNear(ctx, m)) { useful = true; reason = 'shelter cavity'; }
    m.useful = useful;
    m.reason = reason;
    if (useful) n++;
  }
  return n;
}

/** Useful connections whose one mouth is in the interior and the other outside. */
export function usefulInteriorAccess(ctx: GenContext): number {
  const { cell, cells } = ctx.dims;
  const lay = ctx.layout;
  const interior = (x: number, z: number) => lay.zones[lay.cells[Math.min(cells - 1, Math.max(0, Math.floor(z / cell))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / cell)))]].type === 'interior';
  return ctx.world.micro.filter((m) => m.useful && interior(m.posA.x, m.posA.z) !== interior(m.posB.x, m.posB.z)).length;
}
