// Micro-connection usefulness (GDD 04 §6.3): useful for the played species if passable by the standard worker
// and (a) a shortcut: the nav path between its mouth cells without it is >= 1.4 x its length (or there is none),
// (b) it reaches a sheltered cavity of >= 64 BU^3 (a pre-carved cavity, or the void of an enclosed terrain hole:
// the gully pot under a drain grille), or (c) it is the only non-climbing access into the interior (a special
// case of (a)). Asphalt cracks count only with >= 300 BU of slot (GDD 04 §6.2 "counts for N"). Writes
// MicroConn.useful / reason.

import type { MicroConn } from '@/sim/types';
import { heightAt } from '@/sim/world/terrainSample';
import { primEval } from '@/sim/world/primHash';
import type { GenContext } from '../kit/context';
import { primIndex } from '../kit/surface';
import { groundComponents, navDistanceTo, portals, type Portal } from './graph';
import { NAV } from '../tuning/maps';
import { MICRO, VALID } from '../tuning/pipeline';

/** Mouths within this of a cavity's box (or of a hole cell) reach it, BU. */
const REACH_BU = 2;

function boxNear(c: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }, p: { x: number; y: number; z: number }, reach: number): boolean {
  return p.x >= c.min.x - reach && p.x <= c.max.x + reach && p.y >= c.min.y - reach && p.y <= c.max.y + reach && p.z >= c.min.z - reach && p.z <= c.max.z + reach;
}

function cavityNear(ctx: GenContext, m: MicroConn): boolean {
  const bu = ctx.dims.bu, reach = REACH_BU * bu;
  for (const c of ctx.world.cavities) {
    const vol = ((c.max.x - c.min.x) * (c.max.y - c.min.y) * (c.max.z - c.min.z)) / (bu * bu * bu);
    if (vol < MICRO.shelterMinBu3) continue;
    if (boxNear(c, m.posA, reach) || boxNear(c, m.posB, reach)) return true;
  }
  return holeVoidNear(ctx, m, reach);
}

/** Depth of the void under terrain-hole cell (i, k): down to the first primitive below the surface, mm. */
function holeDepth(ctx: GenContext, i: number, k: number): number {
  const holes = ctx.world.terrainHoles!;
  const x = (i + 0.5) * holes.cell, z = (k + 0.5) * holes.cell, top = heightAt(ctx.world.terrain, x, z);
  const ix = primIndex(ctx);
  const hits: number[] = [];
  ix.query(x, z, x, z, hits);
  const step = ctx.dims.bu;
  for (let y = top - step; y >= top - VALID.holeProbeMaxMm; y -= step) {
    if (hits.some((h) => primEval(ix.entries[h], x, y, z, null) <= 0)) return top - y;
  }
  return 0;
}

/**
 * A mouth over (or within reach of) a terrain hole whose connected void holds >= 64 BU^3: gully pots and linear
 * drain channels are terrain holes enclosed by primitives, not carve cavities (GDD 04 §13.2).
 */
function holeVoidNear(ctx: GenContext, m: MicroConn, reach: number): boolean {
  const holes = ctx.world.terrainHoles;
  if (!holes) return false;
  const bu = ctx.dims.bu, cell = holes.cell, need = MICRO.shelterMinBu3 * bu * bu * bu;
  for (const p of [m.posA, m.posB]) {
    const i0 = Math.max(0, Math.floor((p.x - reach) / cell)), i1 = Math.min(holes.nx - 1, Math.floor((p.x + reach) / cell));
    const k0 = Math.max(0, Math.floor((p.z - reach) / cell)), k1 = Math.min(holes.nz - 1, Math.floor((p.z + reach) / cell));
    let vol = 0;
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      if (holes.data[k * holes.nx + i]) vol += cell * cell * holeDepth(ctx, i, k);
    }
    if (vol >= need) return true;
  }
  return false;
}

/** Whether cells a and b are joined by the ground and the portals other than `skip` (standard clearance). */
function joinedWithout(label: Int32Array, ports: readonly Portal[], a: number, b: number, skip: number): boolean {
  const parent = new Map<number, number>();
  const find = (x: number): number => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const p of ports) {
    if (p.microId === skip || p.clearanceBu < NAV.clearanceBu || label[p.a] < 0 || label[p.b] < 0) continue;
    const ra = find(label[p.a]), rb = find(label[p.b]);
    if (ra !== rb) parent.set(ra, rb);
  }
  return label[a] >= 0 && label[b] >= 0 && find(label[a]) === find(label[b]);
}

/** Evaluates every micro-connection; returns the number of useful ones. */
export function evaluateMicro(ctx: GenContext): number {
  const ports = portals(ctx);
  let label: Int32Array | null = null;
  let n = 0;
  for (const m of ctx.world.micro) {
    if (m.minClearanceBu < MICRO.passClearK) { m.useful = false; m.reason = 'closed for this species'; continue; }
    if (m.kind === 'asphalt-crack' && m.lengthBu < MICRO.crackMinSlotBu) { m.useful = false; m.reason = 'short crack'; continue; }
    const p = ports.find((q) => q.microId === m.id);
    let useful = false, reason = 'no gain';
    if (p) {
      const limit = MICRO.shortcutRatio * p.lenBu;
      const d = navDistanceTo(ctx, p.a, p.b, { skipMicro: m.id, maxBu: limit + 1 }, ports);
      if (d >= limit) {
        // the capped search cannot tell a long detour from no path at all: the components decide the label
        label ??= groundComponents(ctx);
        useful = true;
        reason = d < Infinity || joinedWithout(label, ports, p.a, p.b, m.id) ? 'shortcut' : 'only path';
      }
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
