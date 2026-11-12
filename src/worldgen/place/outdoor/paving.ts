// Paved surfaces (GDD 04 §5.4, §2.1-2.3, §6.2, §7): slab grids on patios (stack, stretcher or random-coursed
// bond) and sidewalks (with expansion gaps), slab courses along footpaths (or block pavers on short paths), joints
// of real width clamped to the 0.6 BU minimum, 6 % cracked slabs, under-slab lenses off a joint (paving-joint),
// sealant-cracked expansion gaps (expansion-gap), edging kerbs along paths, the back step, outside doormat and the
// linear drain at the house wall. Slab tops sit `joint depth` (3-5 mm) above the terrain, which becomes the joint
// sand; the bedding (sand) and sub-base (gravel) are painted into the ground layers.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import { materialCode, type MaterialId } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import { terrainAt } from '../../kit/surface';
import { dcos, dsin } from '../../kit/dmath';
import { backStep, doormatOutside, edgingKerb, linearDrain, pavingSlab, PAVEMENT } from '../../catalog/outdoor/pavement';
import type { Built, Env, LocalCavity, LocalMicro } from '../../catalog/outdoor/types';
import { v } from '../../catalog/outdoor/prims';
import type { BuiltShape, Point2, Rect } from '../../layout/types';
import { inRect } from '../../layout/geom';
import { commit, envFor, outdoorState, range, takeCount } from './commit';
import { yawAlong, zoneIdAt } from './zones';
import { OUTDOOR } from './tuning';

const P = OUTDOOR.pavement;

/** Joint width: real range clamped up to 0.6 BU when the range allows (GDD 04 §6.1). */
export function clampGap(rng: RngState, lo: number, hi: number, bu: number): number {
  const min = Math.max(lo, 0.6 * bu);
  return min <= hi ? min + rngFloat(rng) * (hi - min) : hi;
}

interface Surface { jw: number; jd: number; mat: () => MaterialId }

function surfaceFor(rng: RngState, bu: number): Surface {
  const J = PAVEMENT.joint;
  const sand = rngFloat(rng) < J.sandP;
  const jw = sand ? clampGap(rng, J.sand[0], J.sand[1], bu) : clampGap(rng, J.mortar[0], J.mortar[1], bu);
  const jd = range(rng, J.depth[0], J.depth[1]);
  const stone = rngFloat(rng) < PAVEMENT.slab.stoneP;
  return { jw, jd, mat: () => (stone ? 'stone' : 'concrete') };
}

/** Bedding sand over gravel under paving: the terrain surface is the joint sand. */
function paintBedding(ctx: GenContext, accept: (j: number) => boolean, crust: number): void {
  const g = ctx.world.ground, n = g.surface.data.length;
  const sand = materialCode('sand'), gravel = materialCode('gravel'), c = Math.min(255, Math.round(crust));
  for (let j = 0; j < n; j++) if (accept(j)) { g.surface.data[j] = sand; g.crustMm.data[j] = c; g.subsoil.data[j] = gravel; }
}

/** Socket of one slab: an under-slab lens off its +X joint, or a sealant-cracked expansion gap on its +X side. */
function slabSocket(env: Env, rng: RngState, w: number, t: number, jd: number, jw: number, kind: 'under-slab' | 'expansion', d: number): { cavities: LocalCavity[]; micro: LocalMicro[] } {
  const bu = env.bu;
  const ground = t - jd, jx = w / 2 + jw / 2;
  if (kind === 'under-slab') {
    const rr = Math.min(P.lensMaxRBu * bu, (Math.min(w, d) / 2) * range(rng, P.underSlabFoot[0], P.underSlabFoot[1]));
    const ry = Math.max(0.6 * bu, (range(rng, P.underSlabLens[0], P.underSlabLens[1]) * bu) / 2);
    const rc = Math.max(jw / 2, 0.5 * bu);
    const lens = v(w / 2 - rr * 0.9, -0.6 * ry, 0);
    return {
      cavities: [{ kind: 'under-slab', carves: [{ shape: 'capsule', a: v(jx, ground + 0.3 * rc, 0), b: v(jx, -0.6 * ry, 0), r: rc }, { shape: 'ellipsoid', a: lens, b: v(rr, ry, rr), r: 0 }], openings: [{ pos: v(jx, ground, 0), normal: v(0, 1, 0), radius: jw / 2 }] }],
      micro: [{ kind: 'paving-joint', a: v(jx, t + 2 * bu, 0), path: [v(jx, ground, 0), v(jx, -0.6 * ry, 0)], b: lens, gapMm: jw, clearMm: jw, cavity: 0 }],
    };
  }
  // expansion gap: shaft to the gravel sub-base and a short gallery along the gap line
  const rc = Math.max(jw / 2, 0.75 * bu);
  const deep = -(P.bedding + 0.5 * bu);
  const z1 = Math.min(d / 2 - rc, 30 * bu);
  return {
    cavities: [{ kind: 'crack-slot', carves: [{ shape: 'capsule', a: v(jx, ground + 0.3 * rc, 0), b: v(jx, deep, 0), r: rc }, { shape: 'capsule', a: v(jx, deep, 0), b: v(jx, deep, z1), r: rc }], openings: [{ pos: v(jx, ground, 0), normal: v(0, 1, 0), radius: jw / 2 }] }],
    micro: [{ kind: 'expansion-gap', a: v(jx, t + 2 * bu, 0), path: [v(jx, ground, 0), v(jx, deep, 0)], b: v(jx, deep, z1), gapMm: jw, clearMm: Math.min(jw, 2 * rc), cavity: 0 }],
  };
}

interface SlabSpec { x: number; z: number; yaw: number; w: number; t: number; d: number; mat: MaterialId; socket?: 'under-slab' | 'expansion'; jw: number; jd: number }

/** One slab, cut shorter (along local X) when it collides (curves, obstacles). */
function placeSlab(ctx: GenContext, s: SlabSpec, rng: RngState, zoneIds: readonly number[], keepOut: Rect[]): boolean {
  const env = envFor(ctx);
  for (const k of [1, 0.7, 0.45]) {
    const w = s.w * k;
    if (!cornersIn(ctx, s.x, s.z, s.yaw, w / 2 - 2, s.d / 2 - 2, zoneIds, keepOut)) continue;
    const crack = rngFloat(rng) < P.crackShare ? range(rng, PAVEMENT.crack.gap[0], PAVEMENT.crack.gap[1]) : 0;
    const b: Built = pavingSlab(rng, w, s.t, s.d, s.mat, crack);
    if (s.socket) Object.assign(b, slabSocket(env, rng, w, s.t, s.jd, s.jw, s.socket, s.d));
    const lip = rngFloat(rng) < P.lipShare ? P.lipMm : 0;
    const h = terrainAt(ctx, s.x, s.z);
    const id = commit(ctx, b, { x: s.x, z: s.z, yaw: s.yaw, embed: s.t - s.jd - lip, tilt: true, belowY: h + 1, collide: true, category: 'structures' });
    if (id >= 0) return true;
  }
  return false;
}

function cornersIn(ctx: GenContext, x: number, z: number, yaw: number, hx: number, hz: number, zoneIds: readonly number[], keepOut: Rect[]): boolean {
  const c = dcos(yaw), sn = dsin(yaw);
  for (const [u, w] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    const px = x + u * hx * c + w * hz * sn, pz = z - u * hx * sn + w * hz * c;
    if (!zoneIds.includes(zoneIdAt(ctx, px, pz))) return false;
    if (keepOut.some((r) => inRect(r, px, pz))) return false;
  }
  return true;
}

/** Grid of slabs over an axis-aligned rect (rows along X). */
function slabGrid(ctx: GenContext, rect: Rect, zoneId: number, label: string, sizes: [number, number, number][], pattern: 'stack' | 'stretcher' | 'random', expansion: boolean): void {
  const rng = ctx.rng(`wg/structures/outdoor/paving/${label}`);
  const bu = ctx.dims.bu;
  const sf = surfaceFor(rng, bu);
  const keepOut = outdoorState(ctx).keepOut;
  const [w0, t, d] = sizes[rngInt(rng, 0, sizes.length - 1)];
  paintBedding(ctx, (j) => ctx.layout.cells[j] === zoneId, t - sf.jd + P.bedding);
  let z = rect.z0 + sf.jw;
  let row = 0, idx = 0;
  // expansion gaps: wider joints every 3-6 m along X
  const expAt: number[] = [];
  if (expansion) for (let x = rect.x0 + range(rng, P.expansionEvery[0], P.expansionEvery[1]); x < rect.x1 - 1000; x += range(rng, P.expansionEvery[0], P.expansionEvery[1])) expAt.push(x);
  const expW = clampGap(rng, P.expansionGap[0], P.expansionGap[1], bu);
  while (z + d <= rect.z1 + 1) {
    const off = pattern === 'stack' ? 0 : pattern === 'stretcher' ? (row % 2) * (w0 / 2) : range(rng, 0, w0 * 0.8);
    let x = rect.x0 + sf.jw - off;
    let e = 0;
    while (x < rect.x1) {
      let w = w0, gap = sf.jw, socket: SlabSpec['socket'];
      if (e < expAt.length && x + w0 + sf.jw >= expAt[e]) {
        // the slab before an expansion gap ends at the gap line (cut), the gap is wider
        w = Math.max(100, expAt[e] - x - expW / 2);
        gap = expW;
        if (row === 1 && rngFloat(rng) < P.expansionCrackP && takeCount(ctx, 'expansion', OUTDOOR.maxExpansionSlots)) socket = 'expansion';
        e++;
      } else if (rngFloat(rng) < P.underSlabShare && takeCount(ctx, 'under-slab', OUTDOOR.maxUnderSlab)) socket = 'under-slab';
      const cx = x + w / 2, cz = z + d / 2;
      if (x >= rect.x0 - 1 && x + w <= rect.x1 + 1) {
        placeSlab(ctx, { x: cx, z: cz, yaw: 0, w, t, d, mat: sf.mat(), socket, jw: gap, jd: sf.jd }, ctx.rngFor(`wg/structures/outdoor/paving/${label}`, idx++), [zoneId], keepOut);
      }
      x += w + gap;
    }
    z += d + sf.jw;
    row++;
  }
}

/** Slab (or block-paver) courses along a footpath polyline, plus edging kerbs (p 0.5). */
function pathCourses(ctx: GenContext, sh: BuiltShape, label: string): void {
  if (!sh.line || sh.line.length < 2) return;
  const rng = ctx.rng(`wg/structures/outdoor/path/${label}`);
  const bu = ctx.dims.bu;
  const keepOut = outdoorState(ctx).keepOut;
  const line = sh.line;
  let total = 0;
  for (let i = 1; i < line.length; i++) total += dist(line[i - 1], line[i]);
  const pavers = rngFloat(rng) < PAVEMENT.paver.pathP && (total * sh.width) / (PAVEMENT.paver.size[0] * PAVEMENT.paver.size[2]) <= PAVEMENT.paver.maxCount;
  const sf = surfaceFor(rng, bu);
  if (pavers) sf.jw = clampGap(rng, PAVEMENT.paver.joint[0], PAVEMENT.paver.joint[1], bu);
  const [sw0, t, sd0] = pavers ? [PAVEMENT.paver.size[0], PAVEMENT.paver.size[1], PAVEMENT.paver.size[2]] : PAVEMENT.slab.sizes[rngInt(rng, 0, 1)];
  // along = local X (tangent), across = local Z: pavers 100 along x 200 across, slabs d along x w across
  const along = sd0, across = sw0;
  const m = Math.max(1, Math.floor((sh.width + sf.jw) / (across + sf.jw)));
  const span = m * across + (m - 1) * sf.jw;
  paintBedding(ctx, (j) => ctx.layout.cells[j] === sh.zoneId, t - sf.jd + P.bedding);
  const at = walker(line);
  let idx = 0, course = 0;
  for (let u = along / 2 + sf.jw; u < total - along / 2; u += along + sf.jw, course++) {
    const { p, tx, tz } = at(u);
    const nx = -tz, nz = tx;
    const yaw = yawAlong(tx, tz);
    const shift = pavers && course % 2 ? across / 2 : 0;
    for (let k = 0; k < m + (shift ? 1 : 0); k++) {
      const o = -span / 2 + across / 2 + k * (across + sf.jw) - shift;
      if (Math.abs(o) > span / 2) continue;
      const cx = p.x + nx * o, cz = p.z + nz * o;
      const socket = !pavers && rngFloat(rng) < P.underSlabShare && takeCount(ctx, 'under-slab', OUTDOOR.maxUnderSlab) ? 'under-slab' as const : undefined;
      placeSlab(ctx, { x: cx, z: cz, yaw, w: along, t, d: across, mat: pavers ? 'concrete' : sf.mat(), socket, jw: sf.jw, jd: sf.jd },
        ctx.rngFor(`wg/structures/outdoor/path/${label}`, idx++), [sh.zoneId], keepOut);
    }
  }
  if (rngFloat(rng) < P.edgingP) {
    const unit = PAVEMENT.edgingKerb.size[2], kw = PAVEMENT.edgingKerb.size[0];
    for (const side of [-1, 1]) {
      for (let u = unit / 2; u < total - unit / 2; u += unit + PAVEMENT.edgingKerb.joint) {
        const { p, tx, tz } = at(u);
        const o = side * (span / 2 + sf.jw + kw / 2);
        commit(ctx, edgingKerb(), { x: p.x - tz * o, z: p.z + tx * o, yaw: yawAlong(tx, tz), collide: true, category: 'structures' });
      }
    }
  }
}

function dist(a: Point2, b: Point2): number {
  return Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
}

/** Point and unit tangent at arc length u along a polyline. */
function walker(line: Point2[]): (u: number) => { p: Point2; tx: number; tz: number } {
  const cum = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + dist(line[i - 1], line[i]));
  return (u) => {
    let i = 1;
    while (i < line.length - 1 && cum[i] < u) i++;
    const a = line[i - 1], b = line[i], l = Math.max(1e-6, cum[i] - cum[i - 1]), t = Math.min(1, Math.max(0, (u - cum[i - 1]) / l));
    return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
  };
}

/** Back step, outside doormat and (p 0.5) the linear drain along the house wall beside the door. */
function doorThings(ctx: GenContext): void {
  const house = ctx.layout.house;
  if (!house?.door) return;
  const d = house.door, rng = ctx.rng('wg/structures/outdoor/door');
  const env = envFor(ctx);
  const yaw = yawAlong(-d.nz, d.nx); // local X along the wall, local +Z out into the garden
  if (!ctx.world.objects.some((o) => o.templateId === 'back-step')) {
    const sx = d.x + d.nx * 152, sz = d.z + d.nz * 152;
    commit(ctx, backStep(rng), { x: sx, z: sz, yaw, atGround: 'terrain', collide: true, category: 'structures' });
  }
  if (rngFloat(rng) < P.drainP) {
    const alongWall = (rngFloat(rng) < 0.5 ? -1 : 1) * (d.width / 2 + 700);
    const off = 70;
    const cx = d.x + d.nx * off + -d.nz * alongWall, cz = d.z + d.nz * off + d.nx * alongWall;
    // axis-aligned yaw (terrain hole); the drain runs along the wall
    const ay = Math.abs(d.nx) > 0.5 ? Math.PI / 2 : 0;
    const top = terrainAt(ctx, cx, cz) + PAVEMENT.joint.depth[0];
    commit(ctx, linearDrain(rng, env), { x: cx, z: cz, y: top, snap: false, yaw: ay, collide: true, category: 'structures' });
  }
}

/** Doormat on the paving in front of the step (after the slabs). */
export function placeDoormat(ctx: GenContext): void {
  const d = ctx.layout.house?.door;
  if (!d) return;
  const rng = ctx.rng('wg/structures/outdoor/doormat');
  const env = envFor(ctx);
  const yaw = yawAlong(-d.nz, d.nx);
  for (let t = 0; t < 4; t++) {
    const off = 300 + PAVEMENT.doormat.size[2] / 2 + 30 + t * 40;
    if (commit(ctx, doormatOutside(rng, env), { x: d.x + d.nx * off, z: d.z + d.nz * off, yaw, collide: true, category: 'props' }) >= 0) return;
  }
}

export function placePaving(ctx: GenContext): void {
  doorThings(ctx);
  const sizes = PAVEMENT.slab.sizes;
  let n = 0;
  for (const sh of ctx.layout.built) {
    if (sh.kind === 'patio' && sh.rect) {
      const rng = ctx.rng(`wg/structures/outdoor/patio/${n}`);
      const pattern = (['stack', 'stretcher', 'random'] as const)[rngInt(rng, 0, 2)];
      slabGrid(ctx, sh.rect, sh.zoneId, `patio${n}`, sizes, pattern, false);
    } else if (sh.kind === 'sidewalk' && sh.rect) {
      slabGrid(ctx, sh.rect, sh.zoneId, `sidewalk${n}`, [P.sidewalkSlab], 'stack', true);
    } else if (sh.kind === 'path') pathCourses(ctx, sh, `${n}`);
    n++;
  }
  placeDoormat(ctx);
}
