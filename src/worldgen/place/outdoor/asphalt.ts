// Parking and asphalt (GDD 04 §5.5, §6.2, §7, §13.4). Before the paving: designed puddle basins in car parks,
// tree pits in the sidewalk (kept free of slabs), kerb units along every kerb line (kerb gaps p 0.15 per unit, at
// least one per line) and gully grates next to the kerbs (1 per 50 m^2, min 1). After the paving: wheel stops and
// parked cars in the bays, painted bay lines (decals), lamp post, bollards, manhole cover and asphalt cracks
// (decals; structural ones >= 5 mm carved to the gravel: asphalt-crack + crack-slot).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import { materialCode } from '@/sim/types';
import type { GenContext } from '../../kit/context';
import { editHeights } from '../../kit/terrainEdit';
import { terrainAt } from '../../kit/surface';
import { dcos, dsin } from '../../kit/dmath';
import { ASPHALT, bollard, gullyGrate, kerbUnit, lampPost, manholeCover, parkedCar, treePitTree, wheelStop } from '../../catalog/outdoor/asphalt';
import { PAVEMENT } from '../../catalog/outdoor/pavement';
import type { LocalCavity, LocalMicro } from '../../catalog/outdoor/types';
import type { KerbLine, Rect } from '../../layout/types';
import { commit, envFor, groundLocal, outdoorState, range, registerSockets, takeCount } from './commit';
import { datan2, yawAlong, zoneAreaM2, zoneIdAt, zoneRect as zoneRectOf, zonesOf } from './zones';
import { OUTDOOR } from './tuning';

const A = OUTDOOR.asphalt;
const typeAt = (ctx: GenContext, x: number, z: number) => ctx.layout.zones[zoneIdAt(ctx, x, z)].type;

/** Designed shallow depressions in car parks (GDD 04 §13.4: 2-6, 200-1500 across, 3-10 deep), away from kerbs. */
function puddleBasins(ctx: GenContext): void {
  const cp = ctx.layout.carPark;
  if (!cp) return;
  const rng = ctx.rng('wg/structures/outdoor/basins');
  const n = rngInt(rng, A.basins[0], A.basins[1]);
  const a = cp.aisle;
  for (let i = 0; i < n; i++) {
    const d = range(rng, A.basinDia[0], A.basinDia[1]), depth = range(rng, A.basinDepth[0], A.basinDepth[1]), r = d / 2;
    if (a.x1 - a.x0 < d + 1200 || a.z1 - a.z0 < d + 1200) continue;
    const cx = range(rng, a.x0 + r + 600, a.x1 - r - 600), cz = range(rng, a.z0 + r + 600, a.z1 - r - 600);
    editHeights(ctx, { x0: cx - r, z0: cz - r, x1: cx + r, z1: cz + r }, (x, z, old) => {
      const q = ((x - cx) ** 2 + (z - cz) ** 2) / (r * r);
      return q < 1 ? old - depth * (1 - q) * (1 - q) : old;
    });
  }
}

/** Tree pits in the sidewalk: a loam square kept free of slabs, with a small tree. */
function treePits(ctx: GenContext): void {
  const sw = ctx.layout.built.find((b) => b.kind === 'sidewalk' && b.rect);
  if (!sw?.rect) return;
  const r = sw.rect, rng = ctx.rng('wg/structures/outdoor/treepits');
  const side = ASPHALT.treePit.side;
  const alongX = r.x1 - r.x0 > r.z1 - r.z0;
  const width = alongX ? r.z1 - r.z0 : r.x1 - r.x0, length = alongX ? r.x1 - r.x0 : r.z1 - r.z0;
  if (width < side + 300) return;
  const n = rngInt(rng, A.treePits[0], A.treePits[1]);
  const placed: number[] = [];
  const st = outdoorState(ctx);
  for (let i = 0, t = 0; i < n && t < 20; t++) {
    const u = range(rng, 1500, length - 1500);
    if (placed.some((p) => Math.abs(p - u) < A.treePitSpacing)) continue;
    const cx = alongX ? r.x0 + u : (r.x0 + r.x1) / 2, cz = alongX ? (r.z0 + r.z1) / 2 : r.z0 + u;
    const pit: Rect = { x0: cx - side / 2, z0: cz - side / 2, x1: cx + side / 2, z1: cz + side / 2 };
    const yaw = range(rng, 0, 2 * Math.PI);
    const b = treePitTree(ctx.rngFor('wg/structures/outdoor/treepits', i), envFor(ctx, groundLocal(ctx, cx, cz, yaw)));
    if (commit(ctx, b, { x: cx, z: cz, yaw, atGround: 'terrain', collide: true, category: 'trees' }) < 0) continue;
    st.keepOut.push(pit);
    const g = ctx.world.ground, { cell, cells } = ctx.dims;
    for (let k = Math.ceil(pit.z0 / cell - 0.5); k < Math.ceil(pit.z1 / cell - 0.5); k++) for (let j = Math.ceil(pit.x0 / cell - 0.5); j < Math.ceil(pit.x1 / cell - 0.5); j++) {
      if (j < 0 || k < 0 || j >= cells || k >= cells) continue;
      g.surface.data[k * cells + j] = materialCode('loam'); g.crustMm.data[k * cells + j] = 255; g.subsoil.data[k * cells + j] = materialCode('clay');
    }
    placed.push(u);
    i++;
  }
}

/** Kerb units along one kerb line: top at the verge level, upstand to the gutter, kerb gaps. */
function kerbLine(ctx: GenContext, kl: KerbLine, li: number): void {
  const K = ASPHALT.kerb;
  const rng = ctx.rng(`wg/structures/outdoor/kerb/${li}`);
  const dx = -kl.nz, dz = kl.nx; // local +X along the line, local +Z toward the verge (-n)
  const sx = Math.sign((kl.x1 - kl.x0) * dx + (kl.z1 - kl.z0) * dz) || 1;
  const len = Math.sqrt((kl.x1 - kl.x0) ** 2 + (kl.z1 - kl.z0) ** 2);
  const x0 = sx > 0 ? kl.x0 : kl.x1, z0 = sx > 0 ? kl.z0 : kl.z1;
  const yaw = yawAlong(dx, dz);
  const units: { t: number; l: number }[] = [];
  for (let t = 0; t < len - 50; ) {
    const joint = range(rng, K.joint[0], K.joint[1]);
    const l = Math.min(K.unit, len - t);
    units.push({ t, l });
    t += l + joint;
  }
  const gaps = new Set<number>();
  for (let i = 1; i < units.length - 1; i++) if (rngFloat(rng) < K.gapP) gaps.add(i);
  if (gaps.size === 0 && units.length > 2) gaps.add(Math.floor(units.length / 2));
  for (let i = 0; i < units.length; i++) {
    const u = units[i], c = u.t + u.l / 2;
    const x = x0 + dx * c, z = z0 + dz * c;
    const top = terrainAt(ctx, x, z);
    const road = terrainAt(ctx, x + kl.nx * (K.width + 40), z + kl.nz * (K.width + 40));
    const behind = typeAt(ctx, x - kl.nx * 200, z - kl.nz * 200);
    const paved = behind === 'pavement';
    const b = kerbUnit(ctx.rngFor(`wg/structures/outdoor/kerb/${li}`, i), envFor(ctx), {
      len: u.l, upstand: Math.max(20, top - road), gap: gaps.has(i), paved, pavedDepth: PAVEMENT.slab.sizes[2][1] + 6,
    });
    commit(ctx, b, { x, z, y: top, snap: false, yaw, collide: true, category: 'structures' });
  }
}

/** Gully grates next to the kerb lines, spread over the lines by length. */
function gullies(ctx: GenContext): void {
  const G = ASPHALT.gully;
  const rng = ctx.rng('wg/structures/outdoor/gully');
  const env = envFor(ctx);
  let idx = 0;
  for (const zn of zonesOf(ctx, 'asphalt')) {
    const want = Math.max(1, Math.round(zoneAreaM2(ctx, zn.id) * A.gullyPerM2));
    const lines = ctx.layout.kerbs.filter((k) => zoneIdAt(ctx, (k.x0 + k.x1) / 2 + k.nx * 400, (k.z0 + k.z1) / 2 + k.nz * 400) === zn.id);
    const total = lines.reduce((s, k) => s + lineLen(k), 0);
    let placed = 0;
    for (const k of lines) {
      const len = lineLen(k);
      const n = Math.max(1, Math.round((want * len) / Math.max(1, total)));
      for (let i = 0; i < n && placed < want; i++) {
        const t = ((i + 0.5) / n) * len + range(rng, -300, 300);
        const ux = (k.x1 - k.x0) / len, uz = (k.z1 - k.z0) / len;
        const x = k.x0 + ux * t + k.nx * G.kerbOffset, z = k.z0 + uz * t + k.nz * G.kerbOffset;
        if (![-1, 1].every((a) => [-1, 1].every((c) => zoneIdAt(ctx, x + (a * G.frame) / 2, z + (c * G.frame) / 2) === zn.id))) continue;
        if (commit(ctx, gullyGrate(ctx.rngFor('wg/structures/outdoor/gully', idx++), env), { x, z, y: terrainAt(ctx, x, z), snap: false, yaw: 0, collide: true, category: 'structures' }) >= 0) placed++;
      }
    }
  }
}
const lineLen = (k: KerbLine) => Math.sqrt((k.x1 - k.x0) ** 2 + (k.z1 - k.z0) ** 2);

export function placeAsphaltBefore(ctx: GenContext): void {
  puddleBasins(ctx);
  treePits(ctx);
  ctx.layout.kerbs.forEach((k, i) => kerbLine(ctx, k, i));
  gullies(ctx);
}

/** Bays: wheel stops (p 0.5), parked cars (30-70 % of bays), painted side lines. */
function bays(ctx: GenContext): void {
  const cp = ctx.layout.carPark;
  if (!cp) return;
  const rng = ctx.rng('wg/structures/outdoor/bays');
  const env = envFor(ctx);
  const n = { x: cp.side === 'x0' ? 1 : cp.side === 'x1' ? -1 : 0, z: cp.side === 'z0' ? 1 : cp.side === 'z1' ? -1 : 0 };
  const carYaw = datan2(n.x, n.z); // local +Z (car length) along the inward normal
  const stopYaw = yawAlong(-n.z, n.x);
  const share = range(rng, A.carShare[0], A.carShare[1]);
  const st = outdoorState(ctx);
  cp.bays.forEach((b, i) => {
    const r = ctx.rngFor('wg/structures/outdoor/bays', i);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const half = Math.abs(n.x) > 0 ? (b.x1 - b.x0) / 2 : (b.z1 - b.z0) / 2;
    // head of the bay = its inner end (against the sidewalk)
    const hx = cx + n.x * (half - 600), hz = cz + n.z * (half - 600);
    if (rngFloat(r) < A.wheelStopP) commit(ctx, wheelStop(r), { x: hx, z: hz, yaw: stopYaw, collide: true, category: 'structures' });
    if (rngFloat(r) < share) commit(ctx, parkedCar(r, env), { x: cx, z: cz, yaw: carYaw + range(r, -0.04, 0.04), tilt: true, collide: true, category: 'structures' });
    // side line between this bay and the next (and the first one's outer line)
    const lines: number[][] = [];
    if (Math.abs(n.x) > 0) { lines.push([b.x0, b.z1, b.x1, b.z1]); if (i === 0) lines.push([b.x0, b.z0, b.x1, b.z0]); }
    else { lines.push([b.x1, b.z0, b.x1, b.z1]); if (i === 0) lines.push([b.x0, b.z0, b.x0, b.z1]); }
    for (const l of lines) st.decals.push({ kind: 'painted-line', pts: l, widthMm: A.lineW, palette: 'paint-white' });
  });
}

/** Asphalt cracks: decals, the structural ones carved through the crust into the gravel. */
function cracks(ctx: GenContext): void {
  const st = outdoorState(ctx), bu = ctx.dims.bu;
  for (const zn of zonesOf(ctx, 'asphalt')) {
    const rng = ctx.rng(`wg/structures/outdoor/cracks/${zn.id}`);
    const n = Math.round(zoneAreaM2(ctx, zn.id) * A.crackPerM2);
    for (let i = 0; i < n; i++) {
      const r = ctx.rngFor(`wg/structures/outdoor/cracks/${zn.id}`, i);
      const rect = zoneRectOf(ctx, zn.id);
      let x = range(r, rect.x0, rect.x1), z = range(r, rect.z0, rect.z1);
      if (zoneIdAt(ctx, x, z) !== zn.id) continue;
      const len = range(r, A.crackLen[0], A.crackLen[1]), segs = rngInt(r, 3, 5);
      let a = range(r, 0, 2 * Math.PI);
      const pts: number[] = [x, z];
      const P3: Vec3[] = [{ x, y: terrainAt(ctx, x, z), z }];
      let ok = true;
      for (let s = 0; s < segs; s++) {
        a += range(r, -0.6, 0.6);
        x += (len / segs) * dcos(a); z += (len / segs) * dsin(a);
        if (zoneIdAt(ctx, x, z) !== zn.id || ctx.world.terrainHoles?.data[cellIdx(ctx, x, z)]) { ok = false; break; }
        pts.push(x, z);
        P3.push({ x, y: terrainAt(ctx, x, z), z });
      }
      if (!ok) continue;
      const real = range(r, A.crackReal[0], A.crackReal[1]);
      st.decals.push({ kind: 'crack', pts, widthMm: real, palette: 'asphalt-crack' });
      if (real < A.crackStructural || !takeCount(ctx, 'crack', OUTDOOR.maxCracks)) continue;
      const rc = Math.max(real, bu) / 2 + 0.1 * bu;
      const depth = 60 + rc + A.crackDepthBu * bu * 0.25;
      const gal = P3.map((p) => ({ x: p.x, y: p.y - depth, z: p.z }));
      const carves: LocalCavity['carves'] = [{ shape: 'capsule', a: { ...P3[0], y: P3[0].y + 0.3 * rc }, b: gal[0], r: rc }];
      for (let s = 1; s < gal.length; s++) carves.push({ shape: 'capsule', a: gal[s - 1], b: gal[s], r: rc });
      const micro: LocalMicro = { kind: 'asphalt-crack', a: { ...P3[0], y: P3[0].y + 2 * bu }, path: gal.slice(0, -1), b: gal[gal.length - 1], gapMm: real, clearMm: 2 * rc, cavity: 0 };
      registerSockets(ctx, { cavities: [{ kind: 'crack-slot', carves, openings: [{ pos: P3[0], normal: { x: 0, y: 1, z: 0 }, radius: rc }] }], micro: [micro] }, (p) => p, -1);
    }
  }
}
function cellIdx(ctx: GenContext, x: number, z: number): number {
  const { cell, cells } = ctx.dims;
  return Math.min(cells - 1, Math.max(0, Math.floor(z / cell))) * cells + Math.min(cells - 1, Math.max(0, Math.floor(x / cell)));
}

/** Lamp post, bollards along the sidewalk edge, manhole cover in the aisle. */
function streetFurniture(ctx: GenContext, rng: RngState): void {
  const env = envFor(ctx);
  const kl = ctx.layout.kerbs.find((k) => typeAt(ctx, (k.x0 + k.x1) / 2 - k.nx * 300, (k.z0 + k.z1) / 2 - k.nz * 300) === 'pavement') ?? ctx.layout.kerbs[0];
  if (kl) {
    const len = Math.sqrt((kl.x1 - kl.x0) ** 2 + (kl.z1 - kl.z0) ** 2), ux = (kl.x1 - kl.x0) / len, uz = (kl.z1 - kl.z0) / len;
    const behind = (t: number, d: number) => ({ x: kl.x0 + ux * t - kl.nx * d, z: kl.z0 + uz * t - kl.nz * d });
    if (ctx.layout.carPark) {
      for (let t = 0; t < 6; t++) {
        const p = behind(range(rng, 0.3, 0.7) * len, 450);
        if (commit(ctx, lampPost(env), { x: p.x, z: p.z, yaw: 0, tilt: false, embed: 0, collide: true, category: 'structures' }) >= 0) break;
      }
    }
    const nb = rngInt(rng, A.bollards[0], A.bollards[1]);
    const t0 = range(rng, 800, 3000);
    for (let i = 0; i < nb; i++) {
      const t = t0 + i * A.bollardSpacing;
      if (t > len - 500) break;
      const p = behind(t, 300);
      commit(ctx, bollard(ctx.rngFor('wg/structures/outdoor/bollard', i), env), { x: p.x, z: p.z, yaw: 0, tilt: false, embed: 0, collide: true, category: 'structures' });
    }
  }
  const cp = ctx.layout.carPark;
  if (cp && rngFloat(rng) < A.manholeP) {
    const a = cp.aisle;
    for (let t = 0; t < 8; t++) {
      const x = range(rng, a.x0 + 800, a.x1 - 800), z = range(rng, a.z0 + 800, a.z1 - 800);
      if (commit(ctx, manholeCover(), { x, z, collide: true, category: 'structures' }) >= 0) break;
    }
  }
}

export function placeAsphaltAfter(ctx: GenContext): void {
  bays(ctx);
  streetFurniture(ctx, ctx.rng('wg/structures/outdoor/street'));
  cracks(ctx);
}
