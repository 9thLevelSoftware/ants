// Map-edge treatments (GDD 04 §4.2 step 1g, §14): fence lines (suburban garden, kitchen door) a few nav cells
// inside the soft margin, so a beyond-fence strip remains, with fence gaps (p 0.4 per panel, at least one per line)
// and fence-rail routes; the dry-stone wall of a woodland edge against the margin with its wall crevice. Hedges
// (playground) and road continuations are render impostors beyond the map. Panels stop where the line meets
// built ground (the house, asphalt, a path: a gate).

import { rngFloat } from '@/core/rng';
import type { MapEdge } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import { terrainAt } from '../../kit/surface';
import { fenceSection, dryStoneWall, BEDS } from '../../catalog/outdoor/beds';
import { inwardNormal } from '../../layout/geom';
import { NAV } from '../../tuning/maps';
import { commit, envFor } from './commit';
import { yawAlong, zoneIdAt } from './zones';
import { OUTDOOR } from './tuning';

const NATURAL = new Set(['forest', 'lawn', 'garden-bed']);

interface Line { side: MapEdge['side']; inset: number; x0: number; z0: number; dx: number; dz: number; len: number; nx: number; nz: number }

/** The line `inset` mm inside side s, between the fenced neighbours' lines (or the map corners). */
function edgeLine(ctx: GenContext, s: MapEdge['side'], inset: number, fenced: Set<string>): Line {
  const L = ctx.dims.size;
  const n = inwardNormal(s);
  const dx = n.z, dz = -n.x; // run direction (local +X when local +Z = inward)
  // the side's start corner along the run direction
  const sx = s === 'x0' ? inset : s === 'x1' ? L - inset : dx > 0 ? 0 : L;
  const sz = s === 'z0' ? inset : s === 'z1' ? L - inset : dz > 0 ? 0 : L;
  // trim at perpendicular fenced sides
  const before = sideAt(sx - dx, sz - dz, L), after = sideAt(sx + dx * L, sz + dz * L, L);
  const t0 = before && fenced.has(before) ? inset : 0;
  const t1 = after && fenced.has(after) ? L - inset : L;
  return { side: s, inset, x0: sx + dx * t0, z0: sz + dz * t0, dx, dz, len: t1 - t0, nx: n.x, nz: n.z };
}

/** Which perpendicular side a point just beyond a line end lies on. */
function sideAt(x: number, z: number, L: number): MapEdge['side'] | null {
  if (x <= 0) return 'x0';
  if (x >= L) return 'x1';
  if (z <= 0) return 'z0';
  if (z >= L) return 'z1';
  return null;
}

function naturalAt(ctx: GenContext, x: number, z: number): boolean {
  return NATURAL.has(ctx.layout.zones[zoneIdAt(ctx, x, z)].type);
}

function placeFenceLine(ctx: GenContext, ln: Line, idx: number): void {
  const F = BEDS.fence;
  const rngLine = ctx.rng(`wg/structures/outdoor/fence/${ln.side}`);
  const yaw = yawAlong(ln.dx, ln.dz);
  const n = Math.ceil(ln.len / F.panelW);
  const sections: { t: number; w: number; panel: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const t = k * F.panelW, w = Math.min(F.panelW, ln.len - t);
    const at = (u: number) => ({ x: ln.x0 + ln.dx * u, z: ln.z0 + ln.dz * u });
    const p0 = at(t), pm = at(t + w / 2), p1 = at(t + w);
    const panel = w > 300 && naturalAt(ctx, p0.x, p0.z) && naturalAt(ctx, pm.x, pm.z) && naturalAt(ctx, p1.x, p1.z);
    sections.push({ t, w, panel });
  }
  const panels = sections.map((s, i) => (s.panel ? i : -1)).filter((i) => i >= 0);
  const gaps = new Set<number>();
  for (const i of panels) if (rngFloat(rngLine) < F.gapP) gaps.add(i);
  if (gaps.size === 0 && panels.length > 0 && OUTDOOR.edges.gapGuarantee) gaps.add(panels[Math.floor(panels.length / 2)]);
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const x = ln.x0 + ln.dx * s.t, z = ln.z0 + ln.dz * s.t;
    if (!s.panel && !naturalAt(ctx, x, z)) continue;
    const rng = ctx.rngFor(`wg/structures/outdoor/fence/${idx}`, i);
    const env = envFor(ctx, (lx, lz) => terrainAt(ctx, x + lx * ln.dx + lz * ln.nx, z + lx * ln.dz + lz * ln.nz) - terrainAt(ctx, x, z));
    const b = fenceSection(rng, env, { panel: s.panel, gap: gaps.has(i), route: s.panel, width: s.w });
    commit(ctx, b, { x, z, yaw, atGround: 'terrain', collide: true, category: 'structures' });
  }
  // closing post at the line end
  const xe = ln.x0 + ln.dx * ln.len, ze = ln.z0 + ln.dz * ln.len;
  if (naturalAt(ctx, xe, ze)) {
    const env = envFor(ctx, (lx, lz) => terrainAt(ctx, xe + lx * ln.dx + lz * ln.nx, ze + lx * ln.dz + lz * ln.nz) - terrainAt(ctx, xe, ze));
    commit(ctx, fenceSection(ctx.rngFor(`wg/structures/outdoor/fence/${idx}`, 9999), env, { panel: false, gap: false, route: false }), { x: xe, z: ze, yaw, atGround: 'terrain', collide: true, category: 'structures' });
  }
}

function placeWallLine(ctx: GenContext, ln: Line, idx: number, thick: number, height: number): void {
  const SEC = 2000;
  const yaw = yawAlong(ln.dx, ln.dz);
  const n = Math.floor(ln.len / SEC);
  const off = (ln.len - n * SEC) / 2;
  for (let k = 0; k < n; k++) {
    const t = off + (k + 0.5) * SEC;
    const x = ln.x0 + ln.dx * t, z = ln.z0 + ln.dz * t;
    let ok = true, y = Infinity;
    for (let u = -SEC / 2; u <= SEC / 2; u += SEC / 8) {
      for (const w of [-thick / 2, 0, thick / 2]) {
        const px = x + ln.dx * u + ln.nx * w, pz = z + ln.dz * u + ln.nz * w;
        if (!naturalAt(ctx, px, pz)) ok = false;
        y = Math.min(y, terrainAt(ctx, px, pz));
      }
    }
    if (!ok) continue;
    const env = envFor(ctx, (lx, lz) => terrainAt(ctx, x + lx * ln.dx + lz * ln.nx, z + lx * ln.dz + lz * ln.nz) - y);
    const b = dryStoneWall(ctx.rngFor(`wg/structures/outdoor/wall/${idx}`, k), env, SEC - 20, height, thick);
    commit(ctx, b, { x, z, y, yaw, snap: false, collide: true, category: 'structures' });
  }
}

export function placeEdges(ctx: GenContext): void {
  const edges = ctx.world.edges ?? ctx.layout.edges;
  const bu = ctx.dims.bu;
  const fenced = new Set(edges.filter((e) => e.kind === 'fence').map((e) => e.side));
  const fenceInset = (NAV.edgeMarginBu + OUTDOOR.edges.fenceInsetCells * 16) * bu;
  edges.forEach((e, idx) => {
    if (e.kind === 'fence') placeFenceLine(ctx, edgeLine(ctx, e.side, fenceInset, fenced), idx);
    if (e.kind === 'dry-stone-wall') {
      const rng = ctx.rng(`wg/structures/outdoor/wall/${e.side}`);
      const W = BEDS.wall;
      const thick = W.thick[0] + rngFloat(rng) * (W.thick[1] - W.thick[0]);
      const height = W.h[0] + rngFloat(rng) * (W.h[1] - W.h[0]);
      placeWallLine(ctx, edgeLine(ctx, e.side, NAV.edgeMarginBu * bu + thick / 2, new Set()), idx, thick, height);
    }
  });
}
