// Step 4 — props (GDD 04 §4.2, §5.1-5.5): logs and stumps first (largest), the stepping-stone line, the lawn's
// single objects (lost ball, hose, sprinkler head), then the density tables of small props: forest floor (fallen
// branch, twig, flat stone, pebble, moss, curled leaf), lawn stones, mulch chips in mulched beds, cigarette butts
// on sidewalks and paths, cans and bottle caps on asphalt. Fungus caps, nuts and windfalls are seasonal food
// (ecology), not static props.

import { rngFloat, rngInt } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { poissonDisk } from '../../kit/poisson';
import { terrainAt } from '../../kit/surface';
import { curledLeaf, fallenBranch, flatStone, log, mossCushion, pebble, stump, twig } from '../../catalog/outdoor/forest';
import { gardenHose, lawnStone, lostBall, sprinklerHead, steppingStone } from '../../catalog/outdoor/lawn';
import { mulchChip } from '../../catalog/outdoor/beds';
import { cigaretteButt } from '../../catalog/outdoor/pavement';
import { bottleCap, drinkCan } from '../../catalog/outdoor/asphalt';
import { commit, envFor, groundLocal, range } from './commit';
import { runTables, type OutTable } from './tables';
import { edgeDistAt, footprintIn, pointInZone, yawAlong, zoneAreaM2, zoneIdAt, zoneRect, zonesOf } from './zones';
import { OUTDOOR } from './tuning';
import { dcos as dc, dsin as ds } from '../../kit/dmath';
import { quatRotateVec3 } from '@/core/math/quat';

/** x * x (not **: DET-4). */
const sq = (x: number): number => x * x;

/** Canopy shade at (x, z): 1 - the product of the transmittances of the canopy discs over it. */
function canopyShade(ctx: GenContext, x: number, z: number): number {
  let t = 1;
  for (const c of ctx.canopies) if (sq(c.x - x) + sq(c.z - z) < c.r * c.r) t *= c.transmittance;
  return 1 - t;
}

/**
 * Where moss grows (GDD 04 §5.1 "on logs, stones, tree bases"): over a log, stump or flat stone, or within a band
 * round a tree's foot. The hosts are collected on the first call (after the logs, stumps and flat stones).
 */
function mossHost(ctx: GenContext): (x: number, z: number) => boolean {
  let discs: { x: number; z: number; r2: number }[] | null = null;
  const M = OUTDOOR.forestProps;
  return (x, z) => {
    if (!discs) {
      discs = [];
      for (const o of ctx.world.objects) {
        if (o.tags.includes('tree')) discs.push({ x: o.pos.x, z: o.pos.z, r2: sq(M.mossTreeBandMm) });
        else if (['log', 'stump', 'flat-stone'].includes(o.templateId)) {
          // the object's primitives as discs over their horizontal extent
          for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
            const p = ctx.world.prims[i];
            if (p.material === 'humus') continue;
            const r = Math.max(p.size.x, p.shape === 'box' || p.shape === 'ellipsoid' ? p.size.z : p.size.x);
            if (p.shape === 'cylinder' || p.shape === 'capsule') {
              // a lying log: discs along its axis
              const ax = quatRotateVec3({ x: 0, y: 0, z: 0 }, p.rot, { x: 0, y: p.size.y, z: 0 });
              const n = Math.max(1, Math.ceil(Math.abs(p.size.y) / Math.max(1, p.size.x)));
              for (let k = -n; k <= n; k++) discs.push({ x: p.pos.x + (ax.x * k) / n, z: p.pos.z + (ax.z * k) / n, r2: sq(p.size.x + M.mossHostMarginMm) });
            } else discs.push({ x: p.pos.x, z: p.pos.z, r2: sq(r + M.mossHostMarginMm) });
          }
        }
      }
    }
    return discs.some((d) => sq(d.x - x) + sq(d.z - z) < d.r2);
  };
}

function logsAndStumps(ctx: GenContext): void {
  const trees = ctx.world.objects.filter((o) => o.tags.includes('tree'));
  for (const zn of zonesOf(ctx, 'forest')) {
    const area = zoneAreaM2(ctx, zn.id);
    const L = OUTDOOR.logs, label = `wg/props/outdoor/logs/${zn.id}`;
    const pts = poissonDisk(ctx.rng(label), zoneRect(ctx, zn.id), L.spacing, (x, z) => zoneIdAt(ctx, x, z) === zn.id && edgeDistAt(ctx, x, z) > 800);
    const want = Math.max(L.min, Math.round(area * L.perM2));
    let n = 0;
    for (let i = 0; i < pts.length && n < want; i++) {
      const rng = ctx.rngFor(label, i);
      const { x, z } = pts[i];
      // axis within 30 deg of the contour (perpendicular to the slope)
      const gx = terrainAt(ctx, x + 300, z) - terrainAt(ctx, x - 300, z), gz = terrainAt(ctx, x, z + 300) - terrainAt(ctx, x, z - 300);
      const yaw = (Math.abs(gx) + Math.abs(gz) > 1e-3 ? yawAlong(-gz, gx) : range(rng, 0, Math.PI)) + range(rng, -1, 1) * ((L.contourDeg * Math.PI) / 180);
      if (commit(ctx, log(rng, envFor(ctx, groundLocal(ctx, x, z, yaw))), { x, z, yaw, atGround: 'terrain', collide: true, category: 'props' }) >= 0) n++;
    }
    const S = OUTDOOR.stumps, sl = `wg/props/outdoor/stumps/${zn.id}`;
    const sp = poissonDisk(ctx.rng(sl), zoneRect(ctx, zn.id), S.spacing, (x, z) => zoneIdAt(ctx, x, z) === zn.id && trees.every((t) => sq(t.pos.x - x) + sq(t.pos.z - z) >= S.treeDist * S.treeDist));
    const ws = Math.round(area * S.perM2);
    let m = 0;
    for (let i = 0; i < sp.length && m < ws; i++) {
      const rng = ctx.rngFor(sl, i), yaw = range(rng, 0, 2 * Math.PI);
      if (commit(ctx, stump(rng, envFor(ctx, groundLocal(ctx, sp[i].x, sp[i].z, yaw))), { x: sp[i].x, z: sp[i].z, yaw, atGround: 'terrain', collide: true, category: 'props' }) >= 0) m++;
    }
  }
}

/** A line of 3-8 stepping stones from the patio (or door) into the lawn. */
function steppingStones(ctx: GenContext): void {
  if (!['suburban-garden', 'kitchen-door'].includes(ctx.params.archetype)) return;
  const rng = ctx.rng('wg/props/outdoor/stepping');
  if (rngFloat(rng) >= OUTDOOR.lawn.steppingP) return;
  const lawn = zonesOf(ctx, 'lawn')[0];
  if (!lawn) return;
  const patio = ctx.layout.built.find((b) => b.kind === 'patio' && b.rect)?.rect;
  const door = ctx.layout.house?.door;
  const from = patio ? { x: (patio.x0 + patio.x1) / 2, z: (patio.z0 + patio.z1) / 2 } : door ? { x: door.x, z: door.z } : null;
  const target = pointInZone(ctx, rng, lawn.id, (x, z) => edgeDistAt(ctx, x, z) > 1500) ?? pointInZone(ctx, rng, lawn.id);
  if (!from || !target) return;
  const dx = target.x - from.x, dz = target.z - from.z, l = Math.sqrt(dx * dx + dz * dz);
  if (l < 1000) return;
  const ux = dx / l, uz = dz / l;
  const env = envFor(ctx);
  const count = rngInt(rng, OUTDOOR.stepping.count[0], OUTDOOR.stepping.count[1]);
  let placed = 0;
  for (let u = 0; u < l + 3000 && placed < count; u += 50) {
    const x = from.x + ux * u, z = from.z + uz * u;
    if (zoneIdAt(ctx, x, z) !== lawn.id || !footprintIn(ctx, x, z, 0, 260, 260, [lawn.id])) continue;
    const r = ctx.rngFor('wg/props/outdoor/stepping', placed);
    if (commit(ctx, steppingStone(r, env), { x, z, yaw: yawAlong(ux, uz), collide: true, category: 'props' }) >= 0) {
      placed++;
      u += range(r, OUTDOOR.stepping.spacing[0], OUTDOOR.stepping.spacing[1]) - 50;
    }
  }
}

function lawnSingles(ctx: GenContext): void {
  const L = OUTDOOR.lawn;
  const beds = zonesOf(ctx, 'garden-bed').map((z) => z.id);
  for (const zn of zonesOf(ctx, 'lawn')) {
    const rng = ctx.rng(`wg/props/outdoor/lawn/${zn.id}`);
    if (rngFloat(rng) < L.ballP) {
      const p = pointInZone(ctx, rng, zn.id);
      if (p) commit(ctx, lostBall(rng), { ...p, yaw: 0, collide: true, category: 'props' });
    }
    if (ctx.params.humanActivity !== 'off' && rngFloat(rng) < L.hoseP && (beds.length || ctx.layout.facadeSide)) {
      const near = (x: number, z: number) => {
        for (let a = 0; a < 8; a++) {
          const px = x + L.hoseNear * dc((a * Math.PI) / 4), pz = z + L.hoseNear * ds((a * Math.PI) / 4);
          if (beds.includes(zoneIdAt(ctx, px, pz)) || ctx.layout.zones[zoneIdAt(ctx, px, pz)].type === 'interior') return true;
        }
        return false;
      };
      const p = pointInZone(ctx, rng, zn.id, (x, z) => near(x, z) && footprintIn(ctx, x, z, 0, 550, 550, [zn.id]));
      if (p) commit(ctx, gardenHose(rng), { ...p, yaw: range(rng, 0, 6.28), tilt: true, collide: true, category: 'props' });
    }
    if (ctx.params.humanActivity !== 'off' && zn.variant === 'mown' && rngFloat(rng) < L.sprinklerP) {
      const r = zoneRect(ctx, zn.id), j = L.sprinklerJitter;
      for (let t = 0; t < 8; t++) {
        const x = (r.x0 + r.x1) / 2 + range(rng, -j, j) * (r.x1 - r.x0), z = (r.z0 + r.z1) / 2 + range(rng, -j, j) * (r.z1 - r.z0);
        if (zoneIdAt(ctx, x, z) === zn.id && commit(ctx, sprinklerHead(), { x, z, yaw: range(rng, 0, 6.28), collide: true, category: 'props' }) >= 0) break;
      }
    }
  }
}

export function placeProps(ctx: GenContext): void {
  logsAndStumps(ctx);
  steppingStones(ctx);
  lawnSingles(ctx);
  const env = envFor(ctx);
  const F = OUTDOOR.forestProps;
  const ids = (type: Parameters<typeof zonesOf>[1], variants?: Parameters<typeof zonesOf>[2]) => zonesOf(ctx, type, variants).map((z) => z.id);
  const forest = ids('forest'), lawn = ids('lawn');
  const mulched = ctx.layout.zones.filter((z) => z.type === 'garden-bed' && z.mulched).map((z) => z.id);
  const walks = ids('pavement', ['sidewalk', 'path']), asphalt = ids('asphalt');
  const tables: OutTable[] = [
    { id: 'fallen-branch', category: 'props', zones: forest, densityPerM2: F.branch, spacingMm: 400, make: (r) => fallenBranch(r, env) },
    // half the flat stones in the canopy gaps (shade < 0.6), half anywhere (GDD 04 §5.1)
    { id: 'flat-stone', category: 'props', zones: forest, densityPerM2: F.stone * (1 - F.stoneGapShare), spacingMm: 120, make: (r) => flatStone(r, env) },
    { id: 'flat-stone-gap', category: 'props', zones: forest, densityPerM2: F.stone * F.stoneGapShare, spacingMm: 120, eligible: (x, z) => canopyShade(ctx, x, z) < F.stoneGapShade, make: (r) => flatStone(r, env) },
    // moss on logs, stones and tree bases (it rests on the host's top)
    { id: 'moss-cushion', category: 'props', zones: forest, densityPerM2: F.moss, spacingMm: 150, eligible: mossHost(ctx), make: (r) => mossCushion(r) },
    { id: 'curled-leaf', category: 'props', zones: forest, densityPerM2: F.leaf, spacingMm: 90, make: (r) => curledLeaf(r, env) },
    { id: 'twig', category: 'props', zones: forest, densityPerM2: F.twig, spacingMm: 60, make: (r) => twig(r) },
    { id: 'pebble', category: 'props', zones: forest, densityPerM2: F.pebble, spacingMm: 30, make: (r) => pebble(r) },
    { id: 'stone', category: 'props', zones: lawn, densityPerM2: OUTDOOR.lawn.stone, spacingMm: 200, make: (r) => lawnStone(r, env) },
    { id: 'mulch-chip', category: 'props', zones: mulched, densityPerM2: OUTDOOR.beds.mulch, spacingMm: 40, make: (r) => mulchChip(r) },
    { id: 'cigarette-butt', category: 'props', zones: walks, densityPerM2: OUTDOOR.pavement.butt, spacingMm: 200, make: (r) => cigaretteButt(r) },
    { id: 'drink-can', category: 'props', zones: asphalt, densityPerM2: OUTDOOR.asphalt.can, spacingMm: 600, make: (r) => drinkCan(r) },
    { id: 'bottle-cap', category: 'props', zones: asphalt, densityPerM2: OUTDOOR.asphalt.cap, spacingMm: 400, make: () => bottleCap() },
  ];
  const res = runTables(ctx, 'props', tables);
  for (const [k, v] of Object.entries(res)) ctx.notes.push(`outdoor:table ${k} area=${v.areaM2.toFixed(1)} expected=${v.expected.toFixed(1)} placed=${v.placed} thin=${v.thin.toFixed(3)}`);
}
