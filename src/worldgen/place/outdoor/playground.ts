// Playground and park furniture (GDD 04 §5.6, §6.2): timber edging around every sand pit, toys in the sand, the
// play equipment on the rubber surface (slide, swing frame p 0.7, spring rider p 0.5), mat seams at the
// rubber/lawn lip (p 0.3 per metre, carved into the gravel base), benches beside footpaths (with litter bins) and a
// picnic table [T2] on the park lawn.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { terrainAt } from '../../kit/surface';
import { bench, litterBin, picnicTable, PLAYGROUND, sandEdging, slide, springRider, swingFrame, toyBucket, toySpade } from '../../catalog/outdoor/playground';
import type { Built, LocalCavity, LocalMicro } from '../../catalog/outdoor/types';
import type { Point2, Rect } from '../../layout/types';
import { commit, envFor, localToWorld, outdoorState, range, registerSockets, takeCount } from './commit';
import { footprintIn, pointInZone, yawAlong, zoneIdAt, zonesOf } from './zones';
import { OUTDOOR } from './tuning';

const G = OUTDOOR.playground;

function edgeSand(ctx: GenContext, r: Rect, idx: number): void {
  const E = PLAYGROUND.edging;
  const rng = ctx.rng(`wg/structures/outdoor/edging/${idx}`);
  const sides: { x: number; z: number; len: number; yaw: number }[] = [
    { x: (r.x0 + r.x1) / 2, z: r.z0, len: r.x1 - r.x0 + E.w, yaw: 0 },
    { x: (r.x0 + r.x1) / 2, z: r.z1, len: r.x1 - r.x0 + E.w, yaw: 0 },
    { x: r.x0, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0 - E.w, yaw: Math.PI / 2 },
    { x: r.x1, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0 - E.w, yaw: Math.PI / 2 },
  ];
  let k = 0;
  for (const s of sides) {
    const n = Math.max(1, Math.ceil(s.len / E.board));
    const bl = s.len / n;
    for (let i = 0; i < n; i++) {
      const t = -s.len / 2 + bl * (i + 0.5);
      const x = s.yaw === 0 ? s.x + t : s.x, z = s.yaw === 0 ? s.z : s.z + t;
      commit(ctx, sandEdging(ctx.rngFor(`wg/structures/outdoor/edging/${idx}`, k++), bl - 2), { x, z, y: terrainAt(ctx, x, z), snap: false, yaw: s.yaw, collide: true, category: 'structures' });
    }
  }
  // toys in the sand
  const zid = zoneIdAt(ctx, (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
  const toys: [(rr: RngState) => Built, [number, number]][] = [[toyBucket, PLAYGROUND.bucket.count], [toySpade, PLAYGROUND.spade.count]];
  for (const [make, cnt] of toys) {
    const n = rngInt(rng, cnt[0], cnt[1]);
    for (let i = 0; i < n; i++) {
      const p = pointInZone(ctx, rng, zid, (x, z) => x > r.x0 + 300 && x < r.x1 - 300 && z > r.z0 + 300 && z < r.z1 - 300);
      if (p) commit(ctx, make(rng), { x: p.x, z: p.z, yaw: range(rng, 0, 2 * Math.PI), collide: true, category: 'props' });
    }
  }
}

/** Play equipment at random free spots inside the rubber rect. */
function equipment(ctx: GenContext, r: Rect, zoneId: number): void {
  const rng = ctx.rng('wg/structures/outdoor/equipment');
  const env = envFor(ctx);
  const items: { make: () => Built; p: number; hx: number; hz: number }[] = [
    { make: () => slide(ctx.rngFor('wg/structures/outdoor/equipment', 0), env), p: 1, hx: 400, hz: 1600 },
    { make: () => swingFrame(ctx.rngFor('wg/structures/outdoor/equipment', 1), env), p: G.swingP, hx: 1350, hz: 700 },
    { make: () => springRider(ctx.rngFor('wg/structures/outdoor/equipment', 2)), p: G.riderP, hx: 400, hz: 400 },
  ];
  for (const it of items) {
    if (rngFloat(rng) >= it.p) continue;
    const b = it.make();
    for (let t = 0; t < 24; t++) {
      const yaw = (rngInt(rng, 0, 3) * Math.PI) / 2;
      const x = range(rng, r.x0, r.x1), z = range(rng, r.z0, r.z1);
      // the slide's local origin is its platform centre; its chute runs toward +Z
      const cz = it.hz === 1600 ? 1000 : 0;
      const c = localToWorld(x, z, yaw, 0, cz);
      if (!footprintIn(ctx, c.x, c.z, yaw, it.hx, it.hz, [zoneId])) continue;
      if (commit(ctx, b, { x, z, yaw, atGround: 'terrain', collide: true, category: 'structures' }) >= 0) break;
    }
  }
}

/** Mat seams along the rubber edge where it meets lawn: slot through the mat into the gravel base. */
function matSeams(ctx: GenContext, r: Rect): void {
  const rng = ctx.rng('wg/structures/outdoor/matseams');
  const bu = ctx.dims.bu;
  const per = 1000;
  const edges: { x0: number; z0: number; dx: number; dz: number; len: number; ox: number; oz: number }[] = [
    { x0: r.x0, z0: r.z0, dx: 1, dz: 0, len: r.x1 - r.x0, ox: 0, oz: -1 }, { x0: r.x0, z0: r.z1, dx: 1, dz: 0, len: r.x1 - r.x0, ox: 0, oz: 1 },
    { x0: r.x0, z0: r.z0, dx: 0, dz: 1, len: r.z1 - r.z0, ox: -1, oz: 0 }, { x0: r.x1, z0: r.z0, dx: 0, dz: 1, len: r.z1 - r.z0, ox: 1, oz: 0 },
  ];
  for (const e of edges) for (let t = per / 2; t < e.len; t += per) {
    if (rngFloat(rng) >= G.matSeamP) continue;
    const x = e.x0 + e.dx * t, z = e.z0 + e.dz * t;
    if (ctx.layout.zones[zoneIdAt(ctx, x + e.ox * 200, z + e.oz * 200)].type !== 'lawn') continue;
    if (!takeCount(ctx, 'mat-seam', OUTDOOR.maxMatSeams)) return;
    const rc = 0.6 * bu, y = terrainAt(ctx, x - e.ox * rc * 1.5, z - e.oz * rc * 1.5);
    const top = { x: x - e.ox * rc * 1.5, y: y + 0.3 * rc, z: z - e.oz * rc * 1.5 };
    const depth = range(rng, G.matSeamDepthBu[0], G.matSeamDepthBu[1]) * bu;
    const bot = { x: top.x, y: y - depth, z: top.z };
    const cav: LocalCavity = { kind: 'crack-slot', carves: [{ shape: 'capsule', a: top, b: bot, r: rc }], openings: [{ pos: top, normal: { x: 0, y: 1, z: 0 }, radius: rc }] };
    const micro: LocalMicro = { kind: 'mat-seam', a: { ...top, y: y + 2 * bu }, b: { ...bot, y: bot.y + rc }, gapMm: range(rng, 2, 5), clearMm: 2 * rc, cavity: 0 };
    registerSockets(ctx, { cavities: [cav], micro: [micro] }, (p) => p, -1);
    outdoorState(ctx).decals.push({ kind: 'seam', pts: [top.x - e.dx * 150, top.z - e.dz * 150, top.x + e.dx * 150, top.z + e.dz * 150], widthMm: 4, palette: 'rubber-seam' });
  }
}

function pathPoint(line: Point2[], u: number): { p: Point2; tx: number; tz: number } {
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], l = Math.sqrt((b.x - a.x) ** 2 + (b.z - a.z) ** 2);
    if (acc + l >= u || i === line.length - 1) {
      const t = l > 0 ? Math.min(1, (u - acc) / l) : 0;
      return { p: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }, tx: (b.x - a.x) / (l || 1), tz: (b.z - a.z) / (l || 1) };
    }
    acc += l;
  }
  return { p: line[0], tx: 1, tz: 0 };
}

/** Benches beside the footpaths (1-3) with 1-2 litter bins each. */
function benches(ctx: GenContext): void {
  const paths = ctx.layout.built.filter((b) => b.kind === 'path' && b.line && b.line.length > 1);
  if (paths.length === 0) return;
  const rng = ctx.rng('wg/structures/outdoor/benches');
  const env = envFor(ctx);
  const n = rngInt(rng, G.benches[0], G.benches[1]);
  const natural = ctx.layout.zones.filter((z) => z.type === 'lawn' || z.type === 'forest').map((z) => z.id);
  for (let i = 0, t = 0; i < n && t < 30; t++) {
    const sh = paths[rngInt(rng, 0, paths.length - 1)];
    let total = 0;
    for (let k = 1; k < sh.line!.length; k++) total += Math.sqrt((sh.line![k].x - sh.line![k - 1].x) ** 2 + (sh.line![k].z - sh.line![k - 1].z) ** 2);
    const { p, tx, tz } = pathPoint(sh.line!, range(rng, 0.15, 0.85) * total);
    const side = rngFloat(rng) < 0.5 ? -1 : 1;
    const off = sh.width / 2 + G.benchOffset + 250;
    const x = p.x - tz * off * side, z = p.z + tx * off * side;
    const yaw = yawAlong(tx, tz);
    if (!footprintIn(ctx, x, z, yaw, 950, 250, natural)) continue;
    if (commit(ctx, bench(ctx.rngFor('wg/structures/outdoor/benches', i), env), { x, z, yaw, atGround: 'terrain', collide: true, category: 'structures' }) < 0) continue;
    i++;
    const nb = rngInt(rng, G.binsPerBench[0], G.binsPerBench[1]);
    for (let b = 0; b < nb; b++) {
      const s = b === 0 ? 1 : -1, u = 900 + 450;
      const bx = x + tx * u * s, bz = z + tz * u * s;
      if (footprintIn(ctx, bx, bz, 0, 220, 220, natural)) commit(ctx, litterBin(ctx.rngFor('wg/structures/outdoor/bins', i * 4 + b), env), { x: bx, z: bz, yaw: 0, atGround: 'terrain', collide: true, category: 'structures' });
    }
  }
}

export function placePlayground(ctx: GenContext): void {
  let i = 0;
  for (const sh of ctx.layout.built) {
    if (sh.kind === 'sand' && sh.rect) edgeSand(ctx, sh.rect, i++);
    if (sh.kind === 'rubber' && sh.rect) { equipment(ctx, sh.rect, sh.zoneId); matSeams(ctx, sh.rect); }
  }
  if (ctx.params.archetype === 'playground-park' || ctx.params.archetype === 'woodland-edge') benches(ctx);
  if (ctx.params.archetype === 'playground-park') {
    const rng = ctx.rng('wg/structures/outdoor/picnic');
    if (rngFloat(rng) < G.picnicP) {
      const lawn = zonesOf(ctx, 'lawn')[0];
      for (let t = 0; lawn && t < 16; t++) {
        const p = pointInZone(ctx, rng, lawn.id);
        if (p && footprintIn(ctx, p.x, p.z, 0, 1000, 800, [lawn.id]) && commit(ctx, picnicTable(rng), { x: p.x, z: p.z, yaw: range(rng, 0, Math.PI), atGround: 'terrain', collide: true, category: 'structures' }) >= 0) break;
      }
    }
  }
}
