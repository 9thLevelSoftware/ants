// Derived maps (GDD 04 §11-13): nav classes under the building, shade and shelter, moisture, flood and puddles,
// nesting suitability (App. E 6, 25), and the building shell's door crack (App. E 4, 5).
import { describe, expect, it, vi } from 'vitest';
import { NAV_CELL_FLAGS, NAV_CLASSES } from '@/sim/types';
import { generateWorldReport } from '../pipeline';
import { createContext } from '../kit/context';
import { paramsFor, report } from '../testing/fixtures';
import { moistFactor } from './suitability';
import { MICRO } from '../tuning/pipeline';
import { LEVELS } from '../tuning/terrain';
import { SUITABILITY, THETA, WATER } from '../tuning/maps';
import { evaluateMicro, usefulInteriorAccess } from '../validate/micro';
import { navDistances, cellAt } from '../validate/graph';

// world generation takes ~1-2 s per world and the shared machine is often loaded
vi.setConfig({ testTimeout: 120_000 });

const CLS = (c: (typeof NAV_CLASSES)[number]) => NAV_CLASSES.indexOf(c);

describe('nav grid around the building', () => {
  it('sealed house blocked, kitchen floor open at +150 with the interior flag, reachable through the door crack', () => {
    const r = report('kitchen-door', 4);
    const w = r.world, nav = w.nav, n = nav.cls.nx;
    const house = w.zones.filter((z) => z.type === 'interior');
    const sealed = house.find((z) => z.variant === 'sealed')!, kitchen = house.find((z) => z.variant === 'kitchen')!;
    let blocked = 0, sealedCells = 0, openKitchen = 0;
    for (let c = 0; c < n * n; c++) {
      const x = ((c % n) + 0.5) * nav.cls.cell, z = (Math.floor(c / n) + 0.5) * nav.cls.cell;
      const zi = w.maps.zone.data[Math.floor(z / w.terrain.cell) * w.ground.surface.nx + Math.floor(x / w.terrain.cell)];
      if (nav.cls.data[c] === CLS('edge')) continue;
      if (zi === sealed.id) { sealedCells++; if (nav.cls.data[c] === CLS('blocked-solid')) blocked++; }
      if (zi === kitchen.id && (nav.cls.data[c] === CLS('open') || nav.cls.data[c] === CLS('step'))) {
        openKitchen++;
        expect(nav.groundY![c]).toBeCloseTo(LEVELS.floorTop, 0);
        expect(nav.flags!.data[c] & NAV_CELL_FLAGS.INTERIOR).toBeTruthy();
        expect(w.maps.shade.data[c]).toBe(255);
      }
    }
    expect(blocked / sealedCells).toBeGreaterThan(0.95);
    expect(openKitchen).toBeGreaterThan(100);
    expect(r.checks.find((c) => c.id === 'v-connect')?.status).toBe('pass');
  });

  it('E4/E5: the door crack is passable (>= 0.6 BU, Camponotus >= 5.4 mm) and the only non-climbing way in', () => {
    for (const sp of ['lasius-niger', 'camponotus-pennsylvanicus'] as const) {
      const r = report('kitchen-door', 3, 'standard', sp);
      const crack = r.world.micro.find((m) => m.kind === 'door-crack')!;
      expect(crack).toBeDefined();
      expect(crack.gapMm).toBeGreaterThanOrEqual(MICRO.gapMinBu * r.world.bu - 1e-9);
      if (sp === 'camponotus-pennsylvanicus') expect(crack.gapMm).toBeGreaterThanOrEqual(5.4);
    }
    const r = generateWorldReport(paramsFor('kitchen-door', 3));
    // usefulness needs the map state of a live context: rebuild one around the world
    const w = r.world;
    const ctx = createContext(w.params, { bu: w.bu, size: w.size, cell: w.terrain.cell, cells: w.ground.surface.nx, samples: w.terrain.nx, navCell: w.nav.cls.cell, navN: w.nav.cls.nx, sub: 4 }, 0, 0, { zones: w.zones.map((z) => ({ id: z.id, type: z.type, variant: z.variant!, built: z.type === 'interior' ? 'interior' : null, target: 0, range: null, mulched: false })), nav: new Uint8Array(0), cells: w.maps.zone.data, built: [], house: null, facadeSide: null, carPark: null, kerbs: [], humanNodes: [], raisedBeds: [], edges: [] });
    ctx.world = w;
    expect(evaluateMicro(ctx)).toBeGreaterThanOrEqual(1);
    expect(usefulInteriorAccess(ctx)).toBeGreaterThanOrEqual(1);
    // the doorway under the leaf is itself the crack: useful as the only or a much shorter way in
    expect(w.micro.find((m) => m.kind === 'door-crack')?.useful).toBe(true);
  }, 60_000);
});

describe('moisture, flood and puddles', () => {
  it('theta0 within its clamp, forest wetter than asphalt; puddles only on impermeable cells, capped at 30 mm', () => {
    const w = report('car-park-verge', 2).world;
    const nn = w.nav.cls.nx * w.nav.cls.nz;
    for (let c = 0; c < nn; c++) {
      const t = w.maps.moisture.data[c] / 255;
      expect(t).toBeGreaterThanOrEqual(THETA.min - 0.01);
      expect(t).toBeLessThanOrEqual(THETA.max + 0.01);
      const cap = w.maps.puddleCapMm!.data[c];
      expect(cap).toBeLessThanOrEqual(WATER.puddleCapMaxMm);
      if (cap > 0) expect(w.maps.permeable!.data[c] / 255).toBeLessThan(WATER.impermeableBelow);
    }
    expect(w.maps.catchAreaBu2!.length).toBe(nn);
    const wood = report('woodland-edge', 2).world;
    const mean = (ww: typeof w, type: string) => {
      let s = 0, n = 0;
      for (let c = 0; c < ww.nav.cls.nx * ww.nav.cls.nz; c++) {
        const x = ((c % ww.nav.cls.nx) + 0.5) * ww.nav.cls.cell, z = (Math.floor(c / ww.nav.cls.nx) + 0.5) * ww.nav.cls.cell;
        const zone = ww.zones[ww.maps.zone.data[Math.floor(z / ww.terrain.cell) * ww.ground.surface.nx + Math.floor(x / ww.terrain.cell)]];
        if (zone.type === type) { s += ww.maps.moisture.data[c]; n++; }
      }
      return s / Math.max(1, n);
    };
    expect(mean(wood, 'forest')).toBeGreaterThan(mean(w, 'asphalt'));
  }, 60_000);
});

describe('nesting suitability (GDD 04 §12)', () => {
  it('moisture windows are linear ramps; Camponotus keeps 0.5 above the mould threshold', () => {
    const ln = SUITABILITY['lasius-niger'].moist;
    expect(moistFactor(ln, 0.1)).toBe(0);
    expect(moistFactor(ln, 0.2)).toBeCloseTo(0.5);
    expect(moistFactor(ln, 0.4)).toBe(1);
    expect(moistFactor(ln, 0.85)).toBe(0);
    const cp = SUITABILITY['camponotus-pennsylvanicus'].moist;
    expect(moistFactor(cp, 0.4)).toBeCloseTo(0.5);
    expect(moistFactor(cp, 0.6)).toBe(0.5);
  });

  it('E6: >= 6 good cells (Q >= 0.6) and >= 2 within 250 BU path distance of the start; interior and paving are 0', () => {
    for (const a of ['suburban-garden', 'kitchen-door', 'car-park-verge'] as const) {
      const w = report(a, 2).world;
      const q = w.maps.suitability['lasius-niger'].data;
      let good = 0;
      for (const v of q) if (v / 255 >= 0.6) good++;
      expect(good).toBeGreaterThanOrEqual(6);
      const n = w.nav.cls.nx;
      for (let c = 0; c < n * n; c++) {
        const x = ((c % n) + 0.5) * w.nav.cls.cell, z = (Math.floor(c / n) + 0.5) * w.nav.cls.cell;
        const zone = w.zones[w.maps.zone.data[Math.floor(z / w.terrain.cell) * w.ground.surface.nx + Math.floor(x / w.terrain.cell)]];
        if (zone.type === 'interior') expect(q[c]).toBe(0);
      }
      expect(report(a, 2).checks.find((c) => c.id === 'v-found')?.status).toBe('pass');
    }
  });

  it('E25: Messor (mediterranean): every interior and paving cell has Q 0, the best cell has canopy shade < 0.3', () => {
    const w = report('suburban-garden', 6, 'standard', 'messor-barbarus').world;
    expect(w.params.region).toBe('mediterranean');
    const q = w.maps.suitability['messor-barbarus'].data;
    const n = w.nav.cls.nx;
    let best = 0;
    // a cell counts as paving/interior when its whole footprint is (cells straddling a border keep their soil samples)
    const pure = (c: number, type: string) => {
      const i0 = (c % n) * 4, k0 = Math.floor(c / n) * 4, cn = w.ground.surface.nx;
      for (let dk = 0; dk < 4; dk++) for (let di = 0; di < 4; di++) {
        if (w.zones[w.maps.zone.data[Math.min(cn - 1, k0 + dk) * cn + Math.min(cn - 1, i0 + di)]].type !== type) return false;
      }
      return true;
    };
    for (let c = 0; c < n * n; c++) {
      if (pure(c, 'interior') || pure(c, 'pavement')) expect(q[c]).toBe(0);
      if (q[c] > q[best]) best = c;
    }
    expect(w.maps.shade.data[best] / 255).toBeLessThan(0.3);
  }, 60_000);

  it('path distances: the start reaches its good sites; unreachable cells are Infinity', () => {
    const r = report('playground-park', 2);
    const w = r.world;
    const ctx = { dims: { navN: w.nav.cls.nx, navCell: w.nav.cls.cell, bu: w.bu }, world: w } as unknown as Parameters<typeof navDistances>[0];
    const d = navDistances(ctx, [cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z)]);
    expect(d[cellAt(ctx, w.queenStart.pos.x, w.queenStart.pos.z)]).toBe(0);
    expect(d[0]).toBe(Infinity); // corner cell is edge class
  });
});
