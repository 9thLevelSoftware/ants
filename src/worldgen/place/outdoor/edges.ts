// Map-edge treatments (GDD 04 §4.2 step 1g, §14): fence lines (suburban garden, kitchen door) a few nav cells
// inside the soft margin, so a beyond-fence strip remains, with fence gaps (p 0.4 per panel, at least one per line)
// and fence-rail routes; the dry-stone wall of a woodland edge against the margin with its wall crevice. Hedges
// (playground) and road continuations are render impostors beyond the map. Panels stop where the line meets
// built ground (the house, asphalt, a path: a gate).

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { MapEdge } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import { terrainAt } from '../../kit/surface';
import { fenceSection, dryStoneWall, BEDS } from '../../catalog/outdoor/beds';
import { inwardNormal } from '../../layout/geom';
import { NAV } from '../../tuning/maps';
import { commit, envFor, outdoorState, range } from './commit';
import { yawAlong, zoneIdAt } from './zones';
import { OUTDOOR } from './tuning';

const NATURAL = new Set(['forest', 'lawn', 'garden-bed']);

interface Line {
  side: MapEdge['side']; inset: number; x0: number; z0: number; dx: number; dz: number; len: number; nx: number; nz: number;
  /** The line starts / ends at a fenced corner (the perpendicular fence line runs through that point). */
  cornerStart: boolean; cornerEnd: boolean;
}

/**
 * The line `inset` mm inside side s, between the fenced neighbours' lines; towards an unfenced side it stops half a
 * post short of the map edge (the end post stays inside the world). The four lines run round the map in one
 * direction, so at a fenced corner one line ends and the next one starts.
 */
function edgeLine(ctx: GenContext, s: MapEdge['side'], inset: number, fenced: Set<string>, endPad = 0): Line {
  const L = ctx.dims.size;
  const n = inwardNormal(s);
  const dx = n.z, dz = -n.x; // run direction (local +X when local +Z = inward)
  // the side's start corner along the run direction
  const sx = s === 'x0' ? inset : s === 'x1' ? L - inset : dx > 0 ? 0 : L;
  const sz = s === 'z0' ? inset : s === 'z1' ? L - inset : dz > 0 ? 0 : L;
  // trim at perpendicular fenced sides
  const before = sideAt(sx - dx, sz - dz, L), after = sideAt(sx + dx * L, sz + dz * L, L);
  const cornerStart = !!before && fenced.has(before), cornerEnd = !!after && fenced.has(after);
  const t0 = cornerStart ? inset : endPad;
  const t1 = cornerEnd ? L - inset : L - endPad;
  return { side: s, inset, x0: sx + dx * t0, z0: sz + dz * t0, dx, dz, len: t1 - t0, nx: n.x, nz: n.z, cornerStart, cornerEnd };
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

/** Post size at a fenced corner: both lines through it draw it from the same stream. */
function cornerPost(ctx: GenContext, x: number, z: number): number {
  const F = BEDS.fence;
  return range(ctx.rng(`wg/structures/outdoor/fence/corner/${Math.round(x)},${Math.round(z)}`), F.postSq[0], F.postSq[1]);
}

function placeFenceLine(ctx: GenContext, ln: Line, idx: number): void {
  const F = BEDS.fence;
  const rngLine = ctx.rng(`wg/structures/outdoor/fence/${ln.side}`);
  const yaw = yawAlong(ln.dx, ln.dz);
  const n = Math.ceil(ln.len / F.panelW);
  const at = (u: number) => ({ x: ln.x0 + ln.dx * u, z: ln.z0 + ln.dz * u });
  const sections: { t: number; w: number; panel: boolean }[] = [];
  for (let k = 0; k < n; k++) {
    const t = k * F.panelW, w = Math.min(F.panelW, ln.len - t);
    const p0 = at(t), pm = at(t + w / 2), p1 = at(t + w);
    const panel = w > 300 && naturalAt(ctx, p0.x, p0.z) && naturalAt(ctx, pm.x, pm.z) && naturalAt(ctx, p1.x, p1.z);
    sections.push({ t, w, panel });
  }
  // the post sizes of the whole line first (n + 1 posts), so that every panel ends at its next post's face
  const rngPosts = ctx.rng(`wg/structures/outdoor/fence/${ln.side}/posts`);
  const posts = Array.from({ length: n + 1 }, () => range(rngPosts, F.postSq[0], F.postSq[1]));
  if (ln.cornerStart) posts[0] = cornerPost(ctx, ln.x0, ln.z0);
  const end = at(ln.len);
  if (ln.cornerEnd) posts[n] = cornerPost(ctx, end.x, end.z);
  const panels = sections.map((s, i) => (s.panel ? i : -1)).filter((i) => i >= 0);
  const gaps = new Set<number>();
  for (const i of panels) if (rngFloat(rngLine) < F.gapP) gaps.add(i);
  if (gaps.size === 0 && panels.length > 0 && OUTDOOR.edges.gapGuarantee) gaps.add(panels[Math.floor(panels.length / 2)]);
  let gapsPlaced = 0, owedGap = false;
  const groundAt = (x: number, z: number) => envFor(ctx, (lx, lz) => terrainAt(ctx, x + lx * ln.dx + lz * ln.nx, z + lx * ln.dz + lz * ln.nz) - terrainAt(ctx, x, z));
  for (let i = 0; i < sections.length; i++) {
    const s = sections[i];
    const { x, z } = at(s.t);
    if (!s.panel && !naturalAt(ctx, x, z)) continue;
    const gap = s.panel && (gaps.has(i) || owedGap);
    const rng = ctx.rngFor(`wg/structures/outdoor/fence/${idx}`, i);
    // no rail route on the end sections: at a corner the perpendicular line's board stands against the post
    const b = fenceSection(rng, groundAt(x, z), {
      panel: s.panel, gap, route: s.panel && i > 0 && i < sections.length - 1, width: s.w,
      postSq: posts[i], nextPostSq: posts[i + 1], post: !(i === 0 && ln.cornerStart),
    });
    if (b.tpl.prims.length === 0) continue;
    const id = commit(ctx, b, { x, z, yaw, atGround: 'terrain', collide: true, category: 'structures' });
    if (gap) { if (id >= 0) { gapsPlaced++; owedGap = false; } else owedGap = true; }
  }
  // a guaranteed gap whose section was refused moved on to the next panel; past the last panel it is lost (the
  // map-wide guarantee of worldgen-life can still open a targeted fence gap)
  if (OUTDOOR.edges.gapGuarantee && panels.length > 0 && gapsPlaced === 0) ctx.notes.push(`outdoor: fence line ${ln.side} has no fence gap`);
  // closing post at the line end
  if (naturalAt(ctx, end.x, end.z)) {
    commit(ctx, fenceSection(ctx.rngFor(`wg/structures/outdoor/fence/${idx}`, 9999), groundAt(end.x, end.z), { panel: false, gap: false, route: false, postSq: posts[n] }),
      { x: end.x, z: end.z, yaw, atGround: 'terrain', collide: true, category: 'structures' });
  }
}

/**
 * One dry-stone wall section of length `len` centred at (x, z) along the unit direction (dx, dz) (inward normal
 * (nx, nz)), standing on the lowest ground under its footprint; null (nothing placed) when part of the footprint
 * is not natural ground. Returns the object id (-1 refused) and whether its crevice (with the inner void) is in.
 */
export function wallSection(ctx: GenContext, rng: RngState, at: { x: number; z: number; dx: number; dz: number; nx: number; nz: number }, len: number, thick: number, height: number, crevice: boolean): { id: number; crevice: boolean } | null {
  const { x, z, dx, dz, nx, nz } = at;
  let y = Infinity;
  for (let u = -len / 2; u <= len / 2; u += len / 8) {
    for (const w of [-thick / 2, 0, thick / 2]) {
      const px = x + dx * u + nx * w, pz = z + dz * u + nz * w;
      if (!naturalAt(ctx, px, pz)) return null;
      y = Math.min(y, terrainAt(ctx, px, pz));
    }
  }
  const env = envFor(ctx, (lx, lz) => terrainAt(ctx, x + lx * dx + lz * nx, z + lx * dz + lz * nz) - y);
  const b = dryStoneWall(rng, env, len - OUTDOOR.edges.wallJoint, height, thick, crevice);
  const id = commit(ctx, b, { x, z, y, yaw: yawAlong(dx, dz), snap: false, collide: true, category: 'structures' });
  const withCrevice = id >= 0 && crevice && ctx.world.micro.some((m) => m.kind === 'wall-crevice' && outdoorState(ctx).extras.get(id)?.micro.includes(m.id));
  return { id, crevice: withCrevice };
}

function placeWallLine(ctx: GenContext, ln: Line, idx: number, thick: number, height: number): void {
  const SEC = OUTDOOR.edges.wallSection;
  const n = Math.floor(ln.len / SEC);
  const off = (ln.len - n * SEC) / 2;
  const rng = ctx.rng(`wg/structures/outdoor/wall/${ln.side}/crevices`);
  // inner voids behind a share of the sections (each costs carve chunks), at least one per wall
  const voids = Array.from({ length: n }, () => rngFloat(rng) < OUTDOOR.edges.wallVoidP);
  let placedVoid = false;
  for (let k = 0; k < n; k++) {
    const t = off + (k + 0.5) * SEC;
    // the guaranteed void moves on along the wall until a section takes it
    const crevice = voids[k] || (!placedVoid && k >= Math.floor(n / 2));
    const at = { x: ln.x0 + ln.dx * t, z: ln.z0 + ln.dz * t, dx: ln.dx, dz: ln.dz, nx: ln.nx, nz: ln.nz };
    const r = wallSection(ctx, ctx.rngFor(`wg/structures/outdoor/wall/${idx}`, k), at, SEC, thick, height, crevice);
    if (r?.crevice) placedVoid = true;
  }
}

export function placeEdges(ctx: GenContext): void {
  const edges = ctx.world.edges ?? ctx.layout.edges;
  const bu = ctx.dims.bu;
  const fenced = new Set(edges.filter((e) => e.kind === 'fence').map((e) => e.side));
  const fenceInset = (NAV.edgeMarginBu + OUTDOOR.edges.fenceInsetCells * 16) * bu;
  edges.forEach((e, idx) => {
    if (e.kind === 'fence') placeFenceLine(ctx, edgeLine(ctx, e.side, fenceInset, fenced, BEDS.fence.postSq[1] / 2), idx);
    if (e.kind === 'dry-stone-wall') {
      const rng = ctx.rng(`wg/structures/outdoor/wall/${e.side}`);
      const W = BEDS.wall;
      const thick = W.thick[0] + rngFloat(rng) * (W.thick[1] - W.thick[0]);
      const height = W.h[0] + rngFloat(rng) * (W.h[1] - W.h[0]);
      placeWallLine(ctx, edgeLine(ctx, e.side, NAV.edgeMarginBu * bu + thick / 2, new Set()), idx, thick, height);
    }
  });
}
