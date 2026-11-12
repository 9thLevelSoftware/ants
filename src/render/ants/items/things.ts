/**
 * Non-brood item meshes (item-local frame, see itemDef.ts). Nominal sizes are Lasius-scale; the renderers scale by
 * Item.lengthMm or a per-kind default. Colours: GDD 08 §11.6 (pellets match soil, droplets as beads).
 */
import { MeshBuilder, type V3, add, lin, rotX } from '../geometry/meshBuilder';
import { vnoise3 } from '../geometry/curves';
import { PART } from '../geometry/rig';
import { asItem, lump, makeDef, mix3, type ItemDef } from './itemDef';

const grainy = (a: V3, b: V3, freq: number, thr: number) => (p: V3) => { const g = vnoise3(p[0] * freq, p[1] * freq, p[2] * freq); return mix3(a, b, g > thr ? 1 : g * 0.25); };
const blend = (a: V3, b: V3, freq: number) => (p: V3, d: number) => mix3(a, b, Math.min(1, Math.max(0, 0.5 + d * 0.9 + vnoise3(p[0] * freq, p[1] * freq, p[2] * freq) * 0.3 - 0.15)));

function lumpDef(kind: string, r: V3, amp: number, freq: number, seed: number, color: (p: V3, d: number) => V3, rough: number, carry: ItemDef['carry'], detail = 1): ItemDef {
  const mb = new MeshBuilder();
  lump(mb, [0, 0, r[2] * 0.85], r, Math.round(8 * detail), Math.round(12 * detail), amp, freq, seed, color);
  asItem(mb, rough);
  return makeDef(kind, mb.toGeometry(), Math.max(r[0], r[2]) * 2, carry);
}

export function buildThings(): ItemDef[] {
  const out: ItemDef[] = [];
  out.push(lumpDef('soil-pellet', [0.42, 0.38, 0.42], 0.07, 9, 7, grainy(lin('#3d2b1c'), lin('#7a6449'), 30, 0.72), 0.7, { pitch: 0, gape: 0.4, raise: 0.4 }));
  out.push(lumpDef('frass', [0.36, 0.22, 0.4], 0.09, 12, 11, grainy(lin('#9a7a52'), lin('#c8a878'), 25, 0.6), 0.85, { pitch: 0, gape: 0.35, raise: 0.4 }, 0.8));
  out.push(lumpDef('chaff', [0.4, 0.07, 0.55], 0.05, 6, 13, blend(lin('#a48a5a'), lin('#d6c08c'), 9), 0.8, { pitch: 0.1, gape: 0.25, raise: 0.5 }, 0.7));
  out.push(lumpDef('pebble', [0.4, 0.33, 0.45], 0.06, 4, 17, blend(lin('#7d7266'), lin('#b8ab98'), 6), 0.6, { pitch: 0, gape: 0.5, raise: 0.5 }));
  out.push(lumpDef('food-piece', [0.72, 0.52, 0.6], 0.18, 3.2, 3, blend(lin('#c9944e'), lin('#ecd4a2'), 8), 0.86, { pitch: 0.1, gape: 0.6, raise: 0.7 }, 1.2));
  out.push(lumpDef('seed-paste', [0.4, 0.3, 0.4], 0.05, 6, 19, blend(lin('#b89a64'), lin('#d9c08a'), 10), 0.4, { pitch: 0, gape: 0.35, raise: 0.5 }));
  out.push(lumpDef('leaf-pulp', [0.38, 0.3, 0.4], 0.08, 7, 23, blend(lin('#4a6a24'), lin('#7c9446'), 10), 0.5, { pitch: 0, gape: 0.35, raise: 0.5 }));
  out.push(lumpDef('staphylae', [0.28, 0.24, 0.3], 0.06, 14, 29, blend(lin('#e6e0c8'), lin('#fbf6e4'), 18), 0.5, { pitch: 0, gape: 0.3, raise: 0.5 }));
  out.push(lumpDef('fungus-piece', [0.6, 0.45, 0.6], 0.16, 6, 31, blend(lin('#bfb79a'), lin('#e8e2c8'), 14), 0.9, { pitch: 0.1, gape: 0.5, raise: 0.6 }));
  out.push(lumpDef('garden-waste', [0.5, 0.38, 0.5], 0.12, 5, 37, blend(lin('#5a4a32'), lin('#8a7a5a'), 8), 0.9, { pitch: 0, gape: 0.5, raise: 0.5 }));
  out.push(lumpDef('waste', [0.45, 0.35, 0.45], 0.1, 5, 41, blend(lin('#4a3a2c'), lin('#7a6650'), 8), 0.9, { pitch: 0, gape: 0.45, raise: 0.5 }));
  out.push(seed(), leafFragment(), droplet(), carcass(), aphid());
  return out;
}

/** Seed with a pale fatty elaiosome (Lasius carries such seeds by it). */
function seed(): ItemDef {
  const mb = new MeshBuilder(); const sc = lin('#4f321c'), el = lin('#f0e0a8');
  const s0 = mb.vcount; mb.color = sc; mb.ellipsoid([0, 0, 0.95], [0.42, 0.36, 0.72], 10, 14);
  for (let i = s0; i < mb.vcount; i++) { const p = mb.p(i); mb.pos[i * 3 + 1] = p[1] + Math.exp(-Math.pow(p[0] / 0.05, 2)) * 0.03 * Math.max(0, p[1]); }
  mb.beginPieceAt(s0); mb.endPiece();
  asItem(mb, 0.3);
  const e0 = mb.vcount; mb.color = el; mb.ellipsoid([0, 0.02, 0.18], [0.3, 0.24, 0.22], 6, 10);
  for (let i = e0; i < mb.vcount; i++) { mb.rig[i * 4] = PART.ITEM; mb.rig[i * 4 + 3] = 0.45; }
  return makeDef('seed', mb.toGeometry(), 1.65, { pitch: 0.15, gape: 0.35, raise: 0.6 });
}

/** Thin, irregular, curled, two-sided leaf piece with midrib and veins; carried upright. */
function leafFragment(): ItemDef {
  const mb = new MeshBuilder(); const top = lin('#5c8a2c'), bot = lin('#86a85a'), vein = lin('#a9c278');
  const nx = 9, nz = 9; const W = 2.2, H = 2.6;
  const shape = (u: number, v: number): V3 => [(u - 0.5) * W, -0.35 * Math.pow((u - 0.5) * 2, 2) + 0.15 * Math.sin(v * 3), v * H];
  const inside = (u: number, v: number) => { const cx = (u - 0.5) * 2, cz = v * 2 - 1; const r = 0.92 + 0.12 * Math.sin(u * 17 + v * 9) - (v > 0.7 && u > 0.55 ? 0.3 : 0); return cx * cx + cz * cz * 0.9 < r * r; };
  for (const side of [1, -1]) {
    mb.beginPiece(); const ids: number[][] = [];
    for (let j = 0; j <= nz; j++) {
      const row: number[] = [];
      for (let i = 0; i <= nx; i++) {
        const u = i / nx, v = j / nz; const mid = Math.exp(-Math.pow((u - 0.5) / 0.04, 2));
        const lat = Math.exp(-Math.pow(((v - Math.abs(u - 0.5) * 0.9) * 6) % 1 - 0.5, 2) * 40) * 0.5;
        row.push(mb.vert(add(shape(u, v), [0, side * 0.02, 0]), [0, side, 0], [u, v], mix3(side > 0 ? top : bot, vein, Math.min(1, mid + lat) * 0.7)));
      }
      ids.push(row);
    }
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (!inside((i + 0.5) / nx, (j + 0.5) / nz)) continue;
      const a = ids[j]![i]!, b = ids[j]![i + 1]!, c = ids[j + 1]![i]!, d = ids[j + 1]![i + 1]!;
      if (side > 0) { mb.tri(a, c, b); mb.tri(b, c, d); } else { mb.tri(a, b, c); mb.tri(b, d, c); }
    }
    mb.endPiece();
  }
  asItem(mb, 0.55);
  mb.transform((p) => rotX(p, -1.15), (q) => rotX(q, -1.15));
  return makeDef('leaf-fragment', mb.toGeometry(), 2.6, { pitch: 0, gape: 0.2, raise: 0.6 }, 1.15);
}

/** Honeydew / water droplet (transparent bead). */
function droplet(): ItemDef {
  const mb = new MeshBuilder(); mb.color = lin('#f2d58a');
  mb.ellipsoid([0, 0, 0.42], [0.46, 0.42, 0.46], 10, 14);
  asItem(mb, 0.04);
  return makeDef('droplet', mb.toGeometry(), 0.92, { pitch: 0, gape: 0.35, raise: 0.5 }, 0, true);
}

/** Small dead insect prey: segmented dark body with a few stiff legs. */
function carcass(): ItemDef {
  const mb = new MeshBuilder(); const dark = lin('#2e2a20'), mid = lin('#5a5038');
  mb.color = mid; mb.ellipsoid([0, 0.1, 0.35], [0.28, 0.24, 0.3], 6, 10);
  mb.color = dark; mb.ellipsoid([0, 0.12, 0.85], [0.3, 0.26, 0.28], 6, 10);
  mb.color = mid; mb.ellipsoid([0, 0.1, 1.5], [0.36, 0.3, 0.45], 7, 12);
  mb.color = dark;
  for (const s of [1, -1]) for (let k = 0; k < 3; k++) {
    const b: V3 = [0.2 * s, 0.05, 0.6 + k * 0.25];
    mb.tubePath([b, add(b, [0.35 * s, 0.2, 0.05]), add(b, [0.6 * s, -0.15, 0.1])], [0.04, 0.03, 0.015], 4);
  }
  asItem(mb, 0.55);
  return makeDef('carcass', mb.toGeometry(), 2.0, { pitch: 0.1, gape: 0.55, raise: 0.7 });
}

/** A live aphid held by the ant (Ch 05 `live-aphid`): soft green pear shape with cornicles. */
function aphid(): ItemDef {
  const mb = new MeshBuilder(); const g = lin('#7f9a3a'), g2 = lin('#a6b860');
  mb.color = g; mb.ellipsoid([0, 0.05, 0.75], [0.42, 0.36, 0.62], 8, 12);
  mb.color = g2; mb.ellipsoid([0, 0.08, 0.18], [0.2, 0.18, 0.2], 5, 8);
  mb.color = lin('#3c4a1c');
  for (const s of [1, -1]) mb.tubePath([[0.18 * s, 0.25, 1.05], [0.24 * s, 0.4, 1.2]], [0.04, 0.025], 4);
  asItem(mb, 0.45);
  return makeDef('live-aphid', mb.toGeometry(), 1.6, { pitch: 0, gape: 0.35, raise: 0.6 });
}
