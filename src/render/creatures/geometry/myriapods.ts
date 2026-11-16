/**
 * Many-legged animals (GDD 05 §2.2): woodlouse (7 leg pairs under overlapping plates, rolls into a ball),
 * millipede (two leg pairs per ring, coils into a flat spiral), centipede (one long leg pair per segment,
 * poison claws, long antennae, the last legs trailing). Legs run metachronal waves (phase offset per pair).
 */
import { lin, type V3 } from '@/render/ants/geometry/meshBuilder';
import { vnoise3 } from '@/render/ants/geometry/curves';
import { CreatureBuilder, PART, bilateral, blob, body, feeler, leg, type Detail } from './builder';
import { row, type Built } from './types';

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- woodlouse (10 mm)

export function buildWoodlouse(d: Detail): Built {
  const b = new CreatureBuilder();
  const slate = lin('#5f6164'), pale = lin('#8d8c86'), edge = lin('#3e3f42');
  const yc = 0.9;
  body(b, d, {
    zTail: -5, zHead: 4.6, rings: 30, radial: [16, 8, 5], segments: 12, segDepth: 0.05, e: 2.6, lower: 0.3,
    rows: [row(0, 0.5, 0.25, yc), row(0.08, 1.9, 0.9, yc), row(0.45, 2.6, 1.45, yc), row(0.8, 2.45, 1.35, yc), row(0.95, 1.7, 0.9, yc), row(1, 0.9, 0.5, yc * 0.9)],
    color: (p, n, u) => {
      // each tergite: darker at its hind margin, pale mottling (Porcellio-like)
      const plate = (u * 12) % 1;
      const base = n[1] < -0.3 ? lin('#7a7468') : mix3(slate, pale, vnoise3(p[0] * 2.2, p[1] * 2.2, p[2] * 2.2) > 0.6 ? 0.7 : 0.1);
      return plate < 0.14 ? mix3(base, edge, 0.6) : base;
    },
  });
  if (d < 2) bilateral(b, (L) => {
    blob(L, d, [1.15, yc + 0.35, 4.3], [0.18, 0.14, 0.14], lin('#101011'), 4, 6);
    // uropods at the tail
    L.part(PART.BODY); L.color = edge;
    L.tubePath([[0.35, yc * 0.8, -4.8], [0.55, yc * 0.6, -5.7]], [0.14, 0.05], 3, false, true);
  });
  // second antennae (long, elbowed) and seven leg pairs under the margin
  bilateral(b, (L) => feeler(L, d, [0.7, yc + 0.2, 4.55], [[1.6, yc + 0.5, 5.6], [2.6, yc + 0.3, 6.2], [3.2, yc - 0.1, 6.9]], 0.12, edge));
  bilateral(b, (L) => {
    for (let i = 0; i < 7; i++) {
      const z = 3.4 - i * 1.0;
      leg(L, d, { hip: [1.1, 0.35, z], yawDeg: 25 - i * 9, reach: 2.6, kneeAt: 0.45, kneeUp: 0.15, radius: 0.1, phase: (i * 0.14) % 1, color: lin('#8a8478') });
    }
  });
  return { body: b };
}

// ---------------------------------------------------------------- millipede (30 mm, Julid-like)

export function buildMillipede(d: Detail): Built {
  const b = new CreatureBuilder();
  const brown = lin('#2c2018'), ring = lin('#56402e'), legC = lin('#b59a78');
  const rings = 44, r = 1.35, yc = 1.55, L = 30;
  body(b, d, {
    zTail: -L / 2, zHead: L / 2 - 1.2, rings: 44, radial: [8, 6, 4], segments: rings, segDepth: 0.08, part: PART.FLEX,
    rows: [row(0, 0.5, 0.5, yc), row(0.03, 1.1, 1.1, yc), row(0.12, r, r, yc), row(0.92, r, r, yc), row(1, 1.2, 1.15, yc)],
    color: (_p, _n, u) => ((u * rings) % 1 < 0.22 ? ring : brown),
  });
  b.part(PART.FLEX, [0, 0, 0], 0, 0, L / 2 - 0.5);
  blob(b, d, [0, yc - 0.1, L / 2 - 0.8], [1.15, 1.05, 0.95], lin('#3a2a1e'), 6, 10);
  bilateral(b, (Lb) => feeler(Lb, d, [0.6, yc - 0.2, L / 2 - 0.2], [[1.0, yc - 0.4, L / 2 + 0.6], [1.2, yc - 0.9, L / 2 + 1.3]], 0.1, ring));
  if (d < 2) {
    const every = d === 0 ? 1 : 3;
    bilateral(b, (Lb) => {
      for (let i = 2; i < rings - 2; i += every) {
        const z = -L / 2 + (i + 0.5) * ((L - 1.2) / rings);
        for (const dz of [0]) {
          leg(Lb, d, { hip: [0.55, yc - r * 0.75, z + dz], yawDeg: -5, reach: 1.25, kneeAt: 0.5, kneeUp: 0.05, radius: 0.08, phase: ((rings - i) * 0.06) % 1, color: legC });
        }
      }
    });
  }
  return { body: b };
}

// ---------------------------------------------------------------- centipede (20 mm, Lithobius-like)

export function buildCentipede(d: Detail): Built {
  const b = new CreatureBuilder();
  const chestnut = lin('#7b3f1e'), dark = lin('#4e2610'), legC = lin('#b07a4a');
  const segs = 15, yc = 0.75, L = 20;
  body(b, d, {
    zTail: -L / 2, zHead: L / 2 - 1.4, rings: 40, radial: [12, 6, 4], segments: segs, segDepth: 0.12, e: 2.4, lower: 0.5, part: PART.FLEX,
    rows: [row(0, 0.5, 0.25, yc), row(0.05, 1.1, 0.42, yc), row(0.5, 1.45, 0.55, yc), row(0.95, 1.25, 0.48, yc), row(1, 1.0, 0.4, yc)],
    color: (p, _n, u) => {
      const k = Math.floor(u * segs);
      const base = k % 2 === 0 ? chestnut : mix3(chestnut, dark, 0.35);
      return mix3(base, dark, 0.2 * vnoise3(p[0] * 3, p[1] * 3, p[2] * 3));
    },
  });
  b.part(PART.FLEX, [0, 0, 0], 0, 0, L / 2 - 0.7);
  blob(b, d, [0, yc, L / 2 - 0.7], [1.1, 0.42, 0.85], dark, 6, 10);
  bilateral(b, (Lb) => {
    // forcipules (poison claws) curving in under the head
    Lb.part(PART.JAW, [0.55, yc - 0.25, L / 2 - 0.9], 1, 0, L / 2 - 0.9); Lb.color = lin('#2a140a');
    Lb.tubePath([[0.55, yc - 0.25, L / 2 - 0.9], [0.95, yc - 0.3, L / 2 - 0.1], [0.35, yc - 0.3, L / 2 + 0.45]], [0.16, 0.12, 0.03], 3, false, true);
    feeler(Lb, d, [0.45, yc + 0.1, L / 2 - 0.1], [[1.4, yc + 0.6, L / 2 + 2.0], [2.6, yc + 0.4, L / 2 + 4.0], [3.8, yc - 0.1, L / 2 + 5.2]], 0.07, legC);
  });
  if (d < 2) bilateral(b, (Lb) => {
    for (let i = 0; i < segs; i++) {
      const z = L / 2 - 2.2 - i * ((L - 3) / segs);
      const last = i === segs - 1;
      leg(Lb, d, {
        hip: [1.1, yc - 0.15, z], yawDeg: last ? -68 : 20 - i * 4, reach: last ? 5.5 : 3.2 + i * 0.08, kneeAt: 0.4, kneeUp: last ? 0.2 : 0.55,
        radius: 0.1, phase: (i * 0.12) % 1, raise: i === 0 ? 1 : i === 1 ? 0.5 : 0, color: legC,
      });
    }
  });
  return { body: b };
}
