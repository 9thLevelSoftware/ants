// Debug maps of a generated world as PNG files (zones, height, materials, moisture, shade, suitability, nav and
// an overview), for looking at layouts.
//
//   node tools/sim/run-ts.mjs tools/sim/worldmap.ts [--archetype A|all] [--seed N] [--size S] [--species ID] [--out DIR]
//   defaults: all five Tier 1 archetypes, seed 1, standard, lasius-niger, test-output/worldmap
// Prints one JSON line per world (fingerprint, attempts, repairs, zone shares, timings) and the files written.

import { zlibSync } from 'fflate';
import type { ArchetypeId, SpeciesId, WorldData, WorldSizeId } from '@/sim/types';
import { MATERIAL_IDS } from '@/sim/types';
import { defaultWorldParams, generateWorldReport } from '@/worldgen';
import { entryOf, primColumn, type ColumnHit } from '@/worldgen/kit/column';

type Fs = { mkdirSync(p: string, o: { recursive: boolean }): void; writeFileSync(p: string, d: Uint8Array | string): void };

const T1: ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];

// ---- PNG (RGB, 8 bit) ----
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}
function png(w: number, h: number, rgb: Uint8Array): Uint8Array {
  const raw = new Uint8Array((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (w * 3 + 1) + 1); }
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 2;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

// ---- palettes ----
const ZONE_RGB: Record<string, [number, number, number]> = {
  forest: [34, 92, 40], lawn: [120, 190, 80], 'garden-bed': [130, 90, 55], pavement: [190, 190, 185],
  asphalt: [60, 60, 66], sand: [230, 210, 140], rubber: [200, 70, 60], interior: [240, 230, 205],
};
const MAT_RGB: Record<string, [number, number, number]> = {
  loam: [125, 90, 60], humus: [70, 50, 35], sand: [225, 205, 140], clay: [170, 110, 80], gravel: [150, 150, 140],
  concrete: [195, 195, 190], asphalt: [55, 55, 60], rubber: [190, 60, 55], tile: [235, 225, 200],
};
const NAV_RGB: [number, number, number][] = [[230, 230, 230], [30, 30, 30], [240, 170, 40], [40, 90, 220], [140, 0, 140], [200, 60, 60]];
const ramp = (t: number, a: number[], b: number[]) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t)))) as [number, number, number];

function image(n: number, scale: number, pixel: (i: number, k: number) => [number, number, number]): { w: number; data: Uint8Array } {
  const w = n * scale;
  const data = new Uint8Array(w * w * 3);
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const c = pixel(i, k);
    for (let dk = 0; dk < scale; dk++) for (let di = 0; di < scale; di++) data.set(c, ((k * scale + dk) * w + i * scale + di) * 3);
  }
  return { w, data };
}

function maps(world: WorldData): Record<string, { w: number; data: Uint8Array }> {
  const t = world.terrain, cells = world.ground.surface.nx, nav = world.nav.cls.nx;
  const navScale = Math.max(1, Math.round(cells / nav / 2)), cellStep = Math.max(1, Math.round(cells / 1000));
  const nT = Math.floor(cells / cellStep);
  let hmin = Infinity, hmax = -Infinity;
  for (const v of t.data) { if (v < hmin) hmin = v; if (v > hmax) hmax = v; }
  const zoneType = world.zones.map((z) => z.type);
  const zoneVar = world.zones.map((z) => z.variant);
  const H = (i: number, k: number) => t.data[Math.min(t.nz - 1, k) * t.nx + Math.min(t.nx - 1, i)];
  const shadeAt = (i: number, k: number) => {
    const dx = H(i + 1, k) - H(i, k), dz = H(i, k + 1) - H(i, k);
    return Math.max(0.35, Math.min(1.2, 1 - (dx + dz) * 0.04 * (16 / t.cell) * 4));
  };
  const q = world.maps.suitability[world.params.speciesId];
  const navAt = (i: number, k: number) => Math.min(nav - 1, Math.floor((i * cellStep) / (cells / nav))) + Math.min(nav - 1, Math.floor((k * cellStep) / (cells / nav))) * nav;
  const out: Record<string, { w: number; data: Uint8Array }> = {};
  out.zones = image(nT, 1, (i, k) => {
    const z = world.maps.zone.data[k * cellStep * cells + i * cellStep];
    const base = ZONE_RGB[zoneType[z]] ?? [255, 0, 255];
    const v = zoneVar[z];
    return v === 'rough' || v === 'sealed' || v === 'path' ? ramp(0.25, base, [255, 255, 255]) : base;
  });
  out.height = image(nT, 1, (i, k) => {
    const v = (H(i * cellStep, k * cellStep) - hmin) / Math.max(1, hmax - hmin);
    return ramp(v, [20, 20, 60], [250, 250, 230]).map((c) => Math.min(255, Math.round(c * shadeAt(i * cellStep, k * cellStep)))) as [number, number, number];
  });
  out.materials = image(nT, 1, (i, k) => {
    const j = k * cellStep * cells + i * cellStep;
    const m = MATERIAL_IDS[world.ground.surface.data[j]];
    const c = MAT_RGB[m] ?? [255, 0, 255];
    return ramp(world.ground.crustMm.data[j] / 600, c, [0, 0, 0]);
  });
  out.moisture = image(nav, navScale, (i, k) => ramp(world.maps.moisture.data[k * nav + i] / 255, [240, 220, 160], [20, 60, 200]));
  out.shade = image(nav, navScale, (i, k) => { const v = 255 - world.maps.shade.data[k * nav + i]; return [v, v, Math.min(255, v + 20)]; });
  out.flood = image(nav, navScale, (i, k) => ramp(world.maps.floodRisk.data[k * nav + i] / 255, [250, 250, 250], [0, 40, 160]));
  out.suitability = image(nav, navScale, (i, k) => {
    const v = q ? q.data[k * nav + i] / 255 : 0;
    return v === 0 ? [40, 40, 40] : v >= 0.6 ? ramp((v - 0.6) / 0.4, [150, 220, 60], [0, 140, 0]) : v >= 0.4 ? [240, 200, 40] : [210, 90, 40];
  });
  out.nav = image(nav, navScale, (i, k) => NAV_RGB[world.nav.cls.data[k * nav + i]] ?? [255, 0, 255]);
  // overview: zones shaded by relief, primitives dark, start pose as a red cross
  const ov = image(nT, 1, (i, k) => {
    const base = out.zones.data.subarray((k * nT + i) * 3, (k * nT + i) * 3 + 3);
    const s = shadeAt(i * cellStep, k * cellStep);
    const blocked = world.nav.cls.data[navAt(i, k)] === 1;
    return blocked ? [20, 20, 20] : [Math.min(255, base[0] * s), Math.min(255, base[1] * s), Math.min(255, base[2] * s)].map(Math.round) as [number, number, number];
  });
  const sx = Math.floor(world.queenStart.pos.x / t.cell / cellStep), sz = Math.floor(world.queenStart.pos.z / t.cell / cellStep);
  for (let d = -12; d <= 12; d++) for (const [x, z] of [[sx + d, sz], [sx, sz + d], [sx + d, sz + 1], [sx + 1, sz + d]]) {
    if (x >= 0 && z >= 0 && x < nT && z < nT) ov.data.set([255, 0, 0], (z * nT + x) * 3);
  }
  out.overview = ov;
  return out;
}

// ---- objects layer (worldgen-outdoor): primitive footprints by material, shaded by height; micro-connection
// mouths magenta, climb-route nodes yellow, cavities cyan, water bodies blue. Full map or a zoomed crop.
const OBJ_RGB: Record<string, [number, number, number]> = {
  bark: [95, 70, 50], 'wood-sound': [170, 125, 80], 'wood-decayed': [120, 90, 60], stone: [150, 150, 145], concrete: [205, 205, 198],
  brick: [170, 80, 60], metal: [120, 140, 160], plastic: [60, 140, 210], rubber: [40, 40, 45], plant: [60, 160, 50], leaf: [150, 120, 40],
  ceramic: [220, 130, 90], loam: [110, 80, 50], fabric: [150, 60, 120], paper: [245, 245, 235], plaster: [240, 235, 225], tile: [235, 225, 200], glass: [180, 220, 230],
};

function objectsLayer(world: WorldData, x0: number, z0: number, span: number, px: number): { w: number; data: Uint8Array } {
  const data = new Uint8Array(px * px * 3);
  const mm = span / px, zc = world.maps.zone;
  const zoneType = world.zones.map((z) => z.type);
  for (let k = 0; k < px; k++) for (let i = 0; i < px; i++) {
    const x = x0 + (i + 0.5) * mm, z = z0 + (k + 0.5) * mm;
    const zi = Math.floor(z / zc.cell) * zc.nx + Math.floor(x / zc.cell);
    const c = ZONE_RGB[zoneType[zc.data[zi] ?? 0]] ?? [255, 0, 255];
    data.set(ramp(0.55, c, [255, 255, 255]), (k * px + i) * 3);
  }
  const col: ColumnHit = { hit: false, bottom: 0, top: 0 };
  const order = world.prims.map((p, i) => i).filter((i) => (world.prims[i].flags & 64) === 0);
  const entries = order.map((i) => entryOf(world.prims[i]));
  const idx = order.map((_, j) => j).sort((a, b) => entries[a].maxY - entries[b].maxY);
  for (const j of idx) {
    const e = entries[j], p = world.prims[order[j]];
    const i0 = Math.max(0, Math.floor((e.minX - x0) / mm)), i1 = Math.min(px - 1, Math.floor((e.maxX - x0) / mm));
    const k0 = Math.max(0, Math.floor((e.minZ - z0) / mm)), k1 = Math.min(px - 1, Math.floor((e.maxZ - z0) / mm));
    if (i1 < i0 || k1 < k0) continue;
    const base = OBJ_RGB[p.material] ?? [200, 0, 200];
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
      primColumn(e, x0 + (i + 0.5) * mm, z0 + (k + 0.5) * mm, col);
      if (!col.hit) continue;
      const h = Math.max(0, Math.min(1, (col.top + 200) / 2600));
      data.set(base.map((v) => Math.min(255, Math.round(v * (0.65 + 0.55 * h)))) as [number, number, number], (k * px + i) * 3);
    }
  }
  const dot = (x: number, z: number, r: number, rgb: [number, number, number]) => {
    const ci = Math.floor((x - x0) / mm), ck = Math.floor((z - z0) / mm);
    for (let dk = -r; dk <= r; dk++) for (let di = -r; di <= r; di++) {
      const a = ci + di, b = ck + dk;
      if (a >= 0 && b >= 0 && a < px && b < px) data.set(rgb, (b * px + a) * 3);
    }
  };
  const rd = Math.max(1, Math.round(px / 500));
  for (const r of world.climbRoutes) for (const q of r.points) dot(q.x, q.z, 0, [250, 220, 0]);
  for (const c of world.cavities) for (let x = c.min.x; x <= c.max.x; x += mm) { dot(x, c.min.z, 0, [0, 220, 230]); dot(x, c.max.z, 0, [0, 220, 230]); }
  for (const c of world.cavities) for (let z = c.min.z; z <= c.max.z; z += mm) { dot(c.min.x, z, 0, [0, 220, 230]); dot(c.max.x, z, 0, [0, 220, 230]); }
  for (const w of world.waterBodies) dot(w.pos.x, w.pos.z, rd + 1, [30, 80, 230]);
  for (const m of world.micro) { dot(m.posA.x, m.posA.z, rd + 1, [240, 0, 220]); dot(m.posB.x, m.posB.z, rd, [160, 0, 160]); }
  return { w: px, data };
}

/** Zoom crops centred on the first instance of characteristic templates. */
const ZOOM_TEMPLATES = ['paving-slab', 'kerb', 'gully-grate', 'slide', 'sand-edging', 'stepping-stone', 'standing-tree', 'log', 'fence', 'garden-wall', 'patio-table', 'parked-car', 'bench'];

function arg(args: string[], k: string, d: string): string {
  const i = args.indexOf(k);
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : d;
}

export default async function main(args: string[]): Promise<void> {
  const fs = (await import('node:fs' as string)) as Fs;
  const archArg = arg(args, '--archetype', 'all');
  const archs = archArg === 'all' ? T1 : [archArg as ArchetypeId];
  const seed = Number(arg(args, '--seed', '1'));
  const size = arg(args, '--size', 'standard') as WorldSizeId;
  const species = arg(args, '--species', 'lasius-niger') as SpeciesId;
  const outDir = arg(args, '--out', 'test-output/worldmap');
  for (const a of archs) {
    const params = { ...defaultWorldParams(species, seed, 'naturalist', size), archetype: a };
    const t0 = performance.now();
    const r = generateWorldReport(params, { now: () => performance.now() });
    const ms = Math.round(performance.now() - t0);
    const dir = `${outDir}/${a}-${species}-${size}-s${seed}`;
    fs.mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    const all = maps(r.world);
    all.objects = objectsLayer(r.world, 0, 0, r.world.size, 1000);
    const zoomMm = Number(arg(args, '--zoom', '4000'));
    for (const tid of ZOOM_TEMPLATES) {
      const o = r.world.objects.find((ob) => ob.templateId === tid);
      if (!o) continue;
      const x0 = Math.max(0, Math.min(r.world.size - zoomMm, o.pos.x - zoomMm / 2)), z0 = Math.max(0, Math.min(r.world.size - zoomMm, o.pos.z - zoomMm / 2));
      all[`zoom-${tid}`] = objectsLayer(r.world, x0, z0, zoomMm, 800);
    }
    for (const [name, img] of Object.entries(all)) {
      const f = `${dir}/${name}.png`;
      fs.writeFileSync(f, png(img.w, img.w, img.data));
      files.push(f);
    }
    const L2 = r.world.size * r.world.size;
    console.log(JSON.stringify({
      archetype: a, seed, size, species, ms, fingerprint: r.world.meta.fingerprint, attempts: r.attempts, repairs: r.repairs,
      zones: r.world.zones.map((z) => `${z.type}/${z.variant} ${(z.areaMm2 / L2).toFixed(3)}`),
      edges: r.world.edges?.map((e) => `${e.side}:${e.kind}`), start: r.world.queenStart,
      checks: r.checks.map((c) => `${c.id}:${c.status}`), files: files.length, dir,
    }));
  }
}
