// Garden structures (GDD 04 §5.2-5.4): shed, compost bin [T2], water butt by the façade (with its wet patch),
// raised-bed boards, plant pots (with saucers) on patio and bed edges, planters at patio corners, bird table [T2],
// lawn edging along lawn/bed boundaries (p 0.4 per pair) and the patio table with its chairs (p 0.6).

import { rngFloat, rngInt } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { terrainAt } from '../../kit/surface';
import { birdTable, BEDS, compostBin, plantPot, raisedBedBoard, shed, waterButt } from '../../catalog/outdoor/beds';
import { lawnEdge } from '../../catalog/outdoor/lawn';
import { patioChair, patioTable, planter, PAVEMENT } from '../../catalog/outdoor/pavement';
import { inward, inwardNormal } from '../../layout/geom';
import type { Rect } from '../../layout/types';
import { NAV } from '../../tuning/maps';
import { commit, envFor, localToWorld, range } from './commit';
import { datan2, edgeDistAt, footprintIn, pointInZone, yawAlong, zonesOf } from './zones';
import { dcos as dc, dsin as ds } from '../../kit/dmath';
import { OUTDOOR } from './tuning';
import { wallSection } from './edges';

const B = OUTDOOR.beds;

function softZoneIds(ctx: GenContext): number[] {
  return ctx.layout.zones.filter((z) => z.type === 'lawn' || z.type === 'garden-bed').map((z) => z.id);
}

/** Tries random spots in the soft zones (sorted toward the map edges) until `place` succeeds. */
function spot(ctx: GenContext, label: string, hx: number, hz: number, place: (x: number, z: number, yaw: number) => boolean, nearEdge = true): boolean {
  const rng = ctx.rng(label);
  const ids = softZoneIds(ctx);
  if (ids.length === 0) return false;
  const L = ctx.dims.size, margin = (NAV.edgeMarginBu + 3 * 16) * ctx.dims.bu + Math.max(hx, hz) + 200;
  const cands: { x: number; z: number; yaw: number; d: number }[] = [];
  for (let t = 0; t < 48; t++) {
    const x = range(rng, margin, L - margin), z = range(rng, margin, L - margin);
    const yaw = (rngInt(rng, 0, 3) * Math.PI) / 2;
    if (!footprintIn(ctx, x, z, yaw, hx + 150, hz + 150, ids)) continue;
    cands.push({ x, z, yaw, d: nearEdge ? Math.min(x, z, L - x, L - z) : t });
  }
  cands.sort((a, b) => a.d - b.d || a.x - b.x || a.z - b.z);
  for (const c of cands) if (place(c.x, c.z, c.yaw)) return true;
  return false;
}

function shedAndCompost(ctx: GenContext): void {
  const a = ctx.params.archetype;
  const env = envFor(ctx);
  const rng = ctx.rng('wg/structures/outdoor/shed');
  const pShed = B.shedArchetypes[a] ?? 0;
  if (rngFloat(rng) < pShed) {
    const bShed = shed(rng, env);
    spot(ctx, 'wg/structures/outdoor/shed/spot', BEDS.shed.w / 2, BEDS.shed.d / 2, (x, z, yaw) => commit(ctx, bShed, { x, z, yaw, tilt: false, collide: true, category: 'structures' }) >= 0);
  }
  const pComp = B.compostP[a] ?? 0;
  if (rngFloat(rng) < pComp) {
    const bc = compostBin(ctx.rng('wg/structures/outdoor/compost'), env);
    spot(ctx, 'wg/structures/outdoor/compost/spot', BEDS.compost.w / 2, BEDS.compost.d / 2, (x, z, yaw) => commit(ctx, bc, { x, z, yaw, atGround: 'terrain', collide: true, category: 'structures' }) >= 0);
  }
}

/** Water butt against the façade, outside the patio. */
function waterButtAtFacade(ctx: GenContext): void {
  const side = ctx.layout.facadeSide;
  if (!side) return;
  const rng = ctx.rng('wg/structures/outdoor/butt');
  if (rngFloat(rng) >= B.buttP) return;
  const L = ctx.dims.size;
  const strip = ctx.layout.house ? inward(side, (ctx.layout.house.strip.x0 + ctx.layout.house.strip.x1) / 2, (ctx.layout.house.strip.z0 + ctx.layout.house.strip.z1) / 2, L) * 2 : NAV.edgeMarginBu * ctx.dims.bu;
  const n = inwardNormal(side);
  const d = strip + BEDS.butt.standW / 2 + 120;
  const ids = softZoneIds(ctx);
  const b = waterButt(envFor(ctx));
  const yaw = yawAlong(-n.z, n.x); // the tap (+X) points along the wall
  for (let t = 0; t < 24; t++) {
    const a = range(rng, 0.1 * L, 0.9 * L);
    const x = side === 'x0' ? d : side === 'x1' ? L - d : a, z = side === 'z0' ? d : side === 'z1' ? L - d : a;
    if (!footprintIn(ctx, x, z, 0, 350, 350, ids)) continue;
    if (commit(ctx, b, { x, z, yaw, tilt: false, collide: true, category: 'structures' }) >= 0) return;
  }
}

function raisedBedBoards(ctx: GenContext): void {
  const T = BEDS.board.thick;
  ctx.layout.raisedBeds.forEach((rb, i) => {
    const r = rb.rect;
    const sides = [
      { x: (r.x0 + r.x1) / 2, z: r.z0 - T / 2, len: r.x1 - r.x0 + 2 * T, yaw: 0 },
      { x: (r.x0 + r.x1) / 2, z: r.z1 + T / 2, len: r.x1 - r.x0 + 2 * T, yaw: 0 },
      { x: r.x0 - T / 2, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0, yaw: Math.PI / 2 },
      { x: r.x1 + T / 2, z: (r.z0 + r.z1) / 2, len: r.z1 - r.z0, yaw: Math.PI / 2 },
    ];
    sides.forEach((s, k) => {
      let y = Infinity;
      for (let u = -0.5; u <= 0.5; u += 0.125) y = Math.min(y, terrainAt(ctx, s.yaw === 0 ? s.x + u * s.len : s.x, s.yaw === 0 ? s.z : s.z + u * s.len));
      commit(ctx, raisedBedBoard(ctx.rngFor('wg/structures/outdoor/raisedbed', i * 4 + k), s.len, rb.lift), { x: s.x, z: s.z, y: y - 40, snap: false, yaw: s.yaw, collide: true, category: 'structures' });
    });
  });
}

/** Pots on patio and bed edges (maps with pavement), planters at patio corners. */
function potsAndPlanters(ctx: GenContext): void {
  const patios = ctx.layout.built.filter((b) => b.kind === 'patio' && b.rect).map((b) => b.rect!) as Rect[];
  if (!ctx.layout.zones.some((z) => z.type === 'pavement')) return;
  const rng = ctx.rng('wg/structures/outdoor/pots');
  const env = envFor(ctx);
  const n = rngInt(rng, B.pots[0], B.pots[1]);
  const beds = zonesOf(ctx, 'garden-bed');
  for (let i = 0; i < n; i++) {
    const pr = ctx.rngFor('wg/structures/outdoor/pots', i);
    const b = plantPot(pr, env);
    for (let t = 0; t < 12; t++) {
      let p: { x: number; z: number } | null = null;
      if (i % 2 === 0 && patios.length) {
        const r = patios[0], e = 350;
        const edge = rngInt(pr, 0, 3), u = rngFloat(pr);
        p = edge === 0 ? { x: r.x0 + e, z: r.z0 + u * (r.z1 - r.z0) } : edge === 1 ? { x: r.x1 - e, z: r.z0 + u * (r.z1 - r.z0) } : edge === 2 ? { x: r.x0 + u * (r.x1 - r.x0), z: r.z0 + e } : { x: r.x0 + u * (r.x1 - r.x0), z: r.z1 - e };
      } else if (beds.length) p = pointInZone(ctx, pr, beds[rngInt(pr, 0, beds.length - 1)].id, (x, z) => edgeDistAt(ctx, x, z) < 300);
      if (!p) continue;
      const onPatio = i % 2 === 0 && patios.length > 0;
      if (commit(ctx, b, { x: p.x, z: p.z, yaw: range(pr, 0, 2 * Math.PI), collide: true, category: 'props', ...(onPatio ? { atGround: 'support' as const } : {}) }) >= 0) break;
    }
  }
  if (patios.length) {
    const r = patios[0];
    const corners = [[r.x0, r.z0, 1, 1], [r.x1, r.z0, -1, 1], [r.x0, r.z1, 1, -1], [r.x1, r.z1, -1, -1]];
    const np = rngInt(rng, B.planters[0], Math.min(B.planters[1], 3));
    for (let i = 0; i < np; i++) {
      const [cx, cz, sx, sz] = corners[(i * 3 + rngInt(rng, 0, 3)) % 4];
      const pl = planter(ctx.rngFor('wg/structures/outdoor/planters', i), env);
      // flat on the slab tops, nudged inwards when a wall would stand over a joint
      for (let t = 0; t < OUTDOOR.pavement.planterTries; t++) {
        const e = OUTDOOR.pavement.planterInset + t * OUTDOOR.pavement.planterNudge;
        if (commit(ctx, pl, { x: cx + sx * e, z: cz + sz * e, yaw: 0, atGround: 'support', collide: true, category: 'props' }) >= 0) break;
      }
    }
  }
}

function patioFurniture(ctx: GenContext): void {
  const r = ctx.layout.built.find((b) => b.kind === 'patio' && b.rect)?.rect;
  if (!r) return;
  const rng = ctx.rng('wg/structures/outdoor/patiotable');
  if (rngFloat(rng) >= OUTDOOR.pavement.tableP) return;
  const env = envFor(ctx);
  const door = ctx.layout.house?.door;
  const tb = patioTable(rng, env);
  for (let t = 0; t < 16; t++) {
    const x = range(rng, r.x0 + 900, r.x1 - 900), z = range(rng, r.z0 + 900, r.z1 - 900);
    if (door && Math.abs(x - door.x) + Math.abs(z - door.z) < 1500) continue;
    const yaw = range(rng, 0, Math.PI);
    // flat on the slab tops: a fitted rest would sink a leg into a joint
    if (commit(ctx, tb, { x, z, yaw, atGround: 'support', collide: true, category: 'structures' }) < 0) continue;
    const top = tb.tpl.prims[0];
    const round = top.shape === 'cylinder';
    const nc = rngInt(rng, OUTDOOR.pavement.chairs[0], OUTDOOR.pavement.chairs[1]);
    const seats = chairSeats(round ? { r: top.size.x } : { hx: top.size.x, hz: top.size.z }, range(rng, 0, 2 * Math.PI), PAVEMENT.chair.seat / 2 + OUTDOOR.pavement.chairClearMm);
    let placed = 0;
    for (let c = 0; c < seats.length && placed < nc; c++) {
      const p = localToWorld(x, z, yaw, seats[c].x, seats[c].z);
      // chair back (-Z) away from the table: local +Z points to the table centre
      const cy = datan2(x - p.x, z - p.z);
      if (commit(ctx, patioChair(ctx.rngFor('wg/structures/outdoor/chairs', c), env), { x: p.x, z: p.z, yaw: cy, atGround: 'support', collide: true, category: 'structures' }) >= 0) placed++;
    }
    return;
  }
}

/**
 * Chair centres around a table top in the table's frame, the seat's front edge `off` beyond the top's edge, in an
 * order that spreads the first few round the table: a round top gets 12 positions from angle a0, a rectangular one
 * the middle of each side and two more along each long side.
 */
export function chairSeats(top: { r: number } | { hx: number; hz: number }, a0: number, off: number): { x: number; z: number }[] {
  const n = OUTDOOR.pavement.chairCandidates;
  if ('r' in top) {
    const order = spreadOrder(n);
    return order.map((k) => { const a = a0 + (k * 2 * Math.PI) / n; return { x: (top.r + off) * dc(a), z: (top.r + off) * ds(a) }; });
  }
  const { hx, hz } = top;
  const long = hx >= hz ? 'x' : 'z', along = Math.max(hx, hz) / 2;
  const sides = [{ x: hx + off, z: 0 }, { x: -hx - off, z: 0 }, { x: 0, z: hz + off }, { x: 0, z: -hz - off }];
  const extra = long === 'x'
    ? [{ x: -along, z: hz + off }, { x: along, z: -hz - off }, { x: along, z: hz + off }, { x: -along, z: -hz - off }]
    : [{ x: hx + off, z: -along }, { x: -hx - off, z: along }, { x: hx + off, z: along }, { x: -hx - off, z: -along }];
  return [sides[0], sides[1], sides[2], sides[3], ...extra];
}

/** 0 .. n-1 ordered so that every prefix is spread round a circle (halving strides). */
function spreadOrder(n: number): number[] {
  const out: number[] = [], seen = new Set<number>();
  for (let stride = n; stride >= 1; stride = Math.floor(stride / 2)) {
    for (let k = 0; k < n; k += stride) if (!seen.has(k)) { seen.add(k); out.push(k); }
    if (stride === 1) break;
  }
  return out;
}

function birdTableIn(ctx: GenContext): void {
  const rng = ctx.rng('wg/structures/outdoor/birdtable');
  if (!['suburban-garden', 'kitchen-door'].includes(ctx.params.archetype) || rngFloat(rng) >= B.birdTableP) return;
  const b = birdTable(rng, envFor(ctx));
  spot(ctx, 'wg/structures/outdoor/birdtable/spot', 250, 250, (x, z) => commit(ctx, b, { x, z, yaw: 0, atGround: 'terrain', collide: true, category: 'structures' }) >= 0, false);
}

/**
 * Lawn/bed boundaries (GDD 04 §5.2-5.3): per pair, lawn edging (p 0.4) or else a low dry-stone garden wall
 * (p OUTDOOR.beds.bedWallP) along the boundary's straight runs on the 16 BU raster, cut into segments.
 */
function lawnEdges(ctx: GenContext): void {
  const lawns = zonesOf(ctx, 'lawn'), beds = zonesOf(ctx, 'garden-bed');
  if (!lawns.length || !beds.length) return;
  const rng = ctx.rng('wg/structures/outdoor/lawnedge');
  const { navN: n, navCell: c } = ctx.dims;
  const z = ctx.layout.nav;
  let idx = 0, widx = 0;
  for (const lz of lawns) for (const bz of beds) {
    const edging = rngFloat(rng) < OUTDOOR.lawn.edgeP;
    const wall = !edging && rngFloat(rng) < B.bedWallP;
    if (!edging && !wall) continue;
    const W = BEDS.wall;
    const thick = W.thick[0] + rngFloat(rng) * (W.thick[1] - W.thick[0]), height = B.bedWallH[0] + rngFloat(rng) * (B.bedWallH[1] - B.bedWallH[0]);
    const seg = edging ? OUTDOOR.lawn.edgeSeg : OUTDOOR.edges.wallSection;
    let wallVoid = false;
    // vertical boundaries (between i and i+1) as runs along k, horizontal ones along i
    for (const vert of [true, false]) {
      for (let a = 0; a < n - 1; a++) {
        let run = -1;
        for (let b = 0; b <= n; b++) {
          const on = b < n && (vert ? isPair(z[b * n + a], z[b * n + a + 1], lz.id, bz.id) : isPair(z[a * n + b], z[(a + 1) * n + b], lz.id, bz.id));
          if (on && run < 0) run = b;
          if (!on && run >= 0) {
            const from = run * c, to = b * c, fixed = (a + 1) * c;
            if (wall && to - from < B.bedWallMinRun) { run = -1; continue; }
            const m = Math.max(1, Math.round((to - from) / seg)), sl = (to - from) / m;
            for (let s = 0; s < m; s++) {
              const u = from + sl * (s + 0.5);
              const x = vert ? fixed : u, zz = vert ? u : fixed;
              if (edging) {
                commit(ctx, lawnEdge(ctx.rngFor('wg/structures/outdoor/lawnedge', idx++), sl - 4), { x, z: zz, yaw: vert ? Math.PI / 2 : 0, tilt: true, collide: true, category: 'structures' });
              } else {
                // one inner void per wall
                const at = vert ? { x, z: zz, dx: 0, dz: 1, nx: 1, nz: 0 } : { x, z: zz, dx: 1, dz: 0, nx: 0, nz: 1 };
                const r = wallSection(ctx, ctx.rngFor('wg/structures/outdoor/bedwall', widx++), at, sl, thick, height, !wallVoid);
                if (r?.crevice) wallVoid = true;
              }
            }
            run = -1;
          }
        }
      }
    }
  }
}
const isPair = (a: number, b: number, l: number, d: number) => (a === l && b === d) || (a === d && b === l);

export function placeGarden(ctx: GenContext): void {
  shedAndCompost(ctx);
  waterButtAtFacade(ctx);
  raisedBedBoards(ctx);
  potsAndPlanters(ctx);
  patioFurniture(ctx);
  birdTableIn(ctx);
  lawnEdges(ctx);
}
