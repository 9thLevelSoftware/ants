/**
 * Insects and their larvae (GDD 05 §2.2 sizes): aphid, ladybird, ladybird larva, lacewing larva, springtail,
 * fruit fly (and the T3 phorid fly), rove beetle. Naturalistic proportions and colours; no faces (GDD 08 §11.8):
 * eyes are plain glossy domes.
 */
import { lin, type V3 } from '@/render/ants/geometry/meshBuilder';
import { hash3, mulberry32, vnoise3 } from '@/render/ants/geometry/curves';
import { CreatureBuilder, PART, bilateral, blob, body, feeler, leg, setae, wing, type Detail } from './builder';
import { row, type Built } from './types';

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export interface HexLegs {
  /** Hip z of the front, middle and hind pairs; hip x and y. */
  z: [number, number, number]; x: number; y: number;
  yaw: [number, number, number]; reach: [number, number, number];
  kneeUp: number; r: number; color: V3; tip?: V3; raise?: [number, number, number];
}

/** Six legs in alternating tripods (L1 R2 L3 / R1 L2 R3). */
export function hexLegs(b: CreatureBuilder, d: Detail, s: HexLegs): void {
  bilateral(b, (L) => {
    for (let i = 0; i < 3; i++) {
      leg(L, d, {
        hip: [s.x, s.y, s.z[i]!], yawDeg: s.yaw[i]!, reach: s.reach[i]!, kneeAt: 0.42, kneeUp: s.kneeUp, ankleAt: 0.8,
        ankleY: s.r * 2.2, radius: s.r, phase: (i % 2) * 0.5, raise: s.raise?.[i] ?? 0, color: s.color, tip: s.tip,
      });
    }
  });
}

// ---------------------------------------------------------------- aphid (2 mm)

/** Neutral pale aphid; each herd tints it soft green or black (tuning APHID_COLOURS). */
export function buildAphid(d: Detail): Built {
  const b = new CreatureBuilder();
  const base = lin('#e6e8de'), dark = lin('#6a6a60');
  body(b, d, {
    zTail: -1.0, zHead: 0.95, rings: 12, radial: [10, 6, 4], lower: 0.75,
    rows: [row(0, 0.18, 0.15, 0.55), row(0.12, 0.5, 0.42, 0.6), row(0.38, 0.62, 0.52, 0.62), row(0.66, 0.42, 0.34, 0.55), row(0.82, 0.3, 0.26, 0.55), row(1, 0.12, 0.1, 0.5)],
    color: (p) => mix3(base, dark, 0.15 * vnoise3(p[0] * 9, p[1] * 9, p[2] * 9)),
  });
  if (d === 2) return { body: b };
  bilateral(b, (L) => {
    // cornicles (siphunculi): short dark tubes on the rear back, pointing back and up
    L.part(PART.BODY); L.color = dark;
    L.tubePath([[0.28, 0.85, -0.45], [0.38, 1.05, -0.78]], [0.07, 0.05], 3, false, true);
    blob(L, d, [0.2, 0.68, 0.86], [0.08, 0.08, 0.08], lin('#5a1d16'), 4, 6);
  });
  hexLegs(b, d, { z: [0.62, 0.35, 0.05], x: 0.22, y: 0.42, yaw: [55, 5, -40], reach: [1.0, 1.1, 1.35], kneeUp: 0.42, r: 0.045, color: dark });
  bilateral(b, (L) => feeler(L, d, [0.12, 0.62, 0.95], [[0.35, 0.95, 0.8], [0.6, 1.1, 0.1], [0.75, 1.0, -0.8]], 0.03, dark));
  return { body: b };
}

// ---------------------------------------------------------------- scale insect (2.2 mm, T3 scale herds)

/** A soft scale: a flat waxy oval dome fixed to bark, legs and feelers hidden under it, a paler rim. */
export function buildScaleInsect(d: Detail): Built {
  const b = new CreatureBuilder();
  const wax = lin('#8a6a44'), rim = lin('#c2a57a'), dark = lin('#4e3a26');
  body(b, d, {
    zTail: -1.1, zHead: 1.1, rings: 10, radial: [14, 8, 5], lower: 0.15,
    rows: [row(0, 0.2, 0.04, 0.06), row(0.15, 0.62, 0.14, 0.08), row(0.5, 0.8, 0.24, 0.1), row(0.85, 0.6, 0.14, 0.08), row(1, 0.18, 0.04, 0.06)],
    color: (p, n) => mix3(n[1] < 0.55 ? rim : wax, dark, 0.3 * vnoise3(p[0] * 7, p[1] * 7, p[2] * 7)),
  });
  return { body: b };
}

// ---------------------------------------------------------------- ladybird (6.5 mm)

const SPOTS7: [number, number, number][] = [[0, -0.25, 0.42], [0.95, 0.75, 0.42], [1.45, -0.55, 0.5], [0.85, -1.95, 0.45]];

export function buildLadybird(d: Detail): Built {
  const b = new CreatureBuilder();
  const red = lin('#b8231a'), black = lin('#141210'), white = lin('#e9e4d6');
  // abdomen / underside core (hidden under the elytra, visible when they open)
  body(b, d, { zTail: -2.9, zHead: 1.6, rings: 8, radial: [10, 6, 4], rows: [row(0, 0.8, 0.5, 1.0), row(0.5, 2.3, 0.9, 1.1), row(1, 1.4, 0.6, 1.1)], color: () => black });
  // pronotum (black with white front corners) and head
  body(b, d, {
    zTail: 1.4, zHead: 2.65, rings: 8, radial: [14, 8, 4], lower: 0.4,
    rows: [row(0, 2.1, 1.2, 1.25), row(0.5, 1.9, 1.05, 1.25), row(1, 1.15, 0.55, 1.1)],
    color: (p) => (Math.abs(p[0]) > 0.95 && p[2] > 1.85 ? white : black),
  });
  blob(b, d, [0, 0.95, 2.75], [0.7, 0.5, 0.45], black, 6, 10);
  if (d < 2) bilateral(b, (L) => blob(L, d, [0.42, 1.12, 3.0], [0.18, 0.12, 0.1], white, 3, 6));
  // elytra: two domes meeting at the suture; they open in flight (part WING, hinge at the front inner corner)
  const elytra = (L: CreatureBuilder) => {
    body(L, d, {
      zTail: -3.25, zHead: 1.75, rings: 16, radial: [20, 10, 6], lower: 0.18, part: PART.WING, pivot: [0.15, 2.2, 1.6],
      rows: [row(0, 0.25, 0.4, 1.35), row(0.1, 0.95, 1.4, 1.2), row(0.45, 1.38, 2.0, 1.0), row(0.85, 1.25, 1.75, 1.05), row(1, 0.9, 1.15, 1.2)],
      color: () => red,
    });
    L.transform((p) => [p[0] + 1.32, p[1], p[2]], (n) => n);
    for (let i = 0; i < L.piv.length; i += 4) L.piv[i + 3] = 1;
    // after the shift: x = 0 is the suture
    L.recolor(0, (p) => {
      if (p[0] < 0.12 && p[1] > 1.4) return black;
      for (const [sx, sz, r] of SPOTS7) if ((p[0] - sx) ** 2 + (p[2] - sz) ** 2 < r * r && p[1] > 1.2) return black;
      return red;
    });
  };
  bilateral(b, elytra);
  hexLegs(b, d, { z: [1.6, 0.4, -0.7], x: 0.9, y: 0.55, yaw: [50, 0, -35], reach: [2.0, 2.1, 2.3], kneeUp: 0.25, r: 0.13, color: black });
  bilateral(b, (L) => feeler(L, d, [0.45, 0.95, 3.05], [[0.75, 1.0, 3.3], [0.95, 0.95, 3.45]], 0.05, black));
  const w = new CreatureBuilder();
  bilateral(w, (L) => wing(L, d, [0.4, 2.2, 1.0], 5.4, 2.8, lin('#c9b9a0'), PART.HINDWING, 0.2));
  return { body: b, wings: w };
}

// ---------------------------------------------------------------- ladybird larva (8 mm)

export function buildLadybirdLarva(d: Detail): Built {
  const b = new CreatureBuilder();
  const grey = lin('#2e3136'), orange = lin('#d77c2a'), pale = lin('#6b6f75');
  body(b, d, {
    zTail: -4.2, zHead: 3.0, rings: 22, radial: [10, 6, 4], segments: 11, segDepth: 0.14, lower: 0.5,
    rows: [row(0, 0.15, 0.12, 0.45), row(0.25, 0.75, 0.55, 0.75), row(0.55, 1.1, 0.7, 0.9), row(0.8, 0.95, 0.6, 0.9), row(1, 0.5, 0.35, 0.8)],
    color: (p, _n, u) => {
      const seg = Math.floor(u * 11);
      const spot = (seg === 4 || seg === 7) && p[1] > 1.0 && Math.abs(p[0]) > 0.25 && Math.abs(p[0]) < 0.8;
      return spot ? orange : mix3(grey, pale, 0.3 * vnoise3(p[0] * 4, p[1] * 4, p[2] * 4));
    },
  });
  blob(b, d, [0, 0.75, 3.15], [0.42, 0.32, 0.38], lin('#1c1d20'), 6, 8);
  if (d === 0) {
    // dorsal tubercles with short spines
    const r = mulberry32(11); const bases: { p: V3; n: V3 }[] = [];
    for (let s = 1; s < 10; s++) for (const x of [-0.6, -0.25, 0.25, 0.6]) {
      const z = -3.6 + s * 0.68; const w = 1 - Math.abs(z + 0.3) / 4.4;
      bases.push({ p: [x * Math.max(0.4, w + 0.2), 0.9 + 0.55 * w, z], n: [x * 0.6, 1, (r() - 0.5) * 0.3] });
    }
    setae(b, bases, 0.3, 0.05, lin('#17181b'));
  }
  hexLegs(b, d, { z: [2.2, 1.4, 0.6], x: 0.6, y: 0.55, yaw: [40, 0, -30], reach: [2.4, 2.6, 2.8], kneeUp: 0.7, r: 0.1, color: lin('#1f2023') });
  bilateral(b, (L) => feeler(L, d, [0.25, 0.85, 3.45], [[0.45, 1.0, 3.75]], 0.05, grey));
  return { body: b };
}

// ---------------------------------------------------------------- lacewing larva (7 mm)

export function buildLacewingLarva(d: Detail): Built {
  const b = new CreatureBuilder();
  const tan = lin('#a8875a'), brown = lin('#5d4128');
  body(b, d, {
    zTail: -3.6, zHead: 2.4, rings: 18, radial: [10, 6, 4], segments: 10, segDepth: 0.1, e: 2.4, lower: 0.45,
    rows: [row(0, 0.12, 0.1, 0.4), row(0.3, 0.85, 0.45, 0.6), row(0.6, 1.0, 0.5, 0.65), row(0.85, 0.6, 0.35, 0.6), row(1, 0.35, 0.22, 0.5)],
    color: (p) => (Math.abs(Math.abs(p[0]) - 0.45) < 0.12 ? brown : mix3(tan, brown, 0.35 * vnoise3(p[0] * 5, p[1] * 5, p[2] * 5))),
  });
  blob(b, d, [0, 0.55, 2.6], [0.5, 0.25, 0.42], lin('#8c6a42'), 6, 8);
  // camouflage packet: litter bits stuck on the dorsal bristles (GDD 05 §1.4)
  if (d < 2) {
    const r = mulberry32(5); const bits = ['#6e5a3a', '#8a7650', '#4f4430', '#9c8a62', '#5a6234'];
    for (let i = 0; i < (d === 0 ? 14 : 6); i++) {
      const z = -2.8 + r() * 4.2, x = (r() - 0.5) * 1.4;
      blob(b, d, [x, 1.05 + r() * 0.35, z], [0.25 + r() * 0.3, 0.12 + r() * 0.12, 0.25 + r() * 0.35], lin(bits[i % bits.length]!), 4, 6);
    }
  }
  // sickle jaws (sucking mandibles), curved forward and inward
  bilateral(b, (L) => {
    L.part(PART.JAW, [0.3, 0.55, 2.9], 1, 0, 2.9);
    L.color = lin('#3a2a1a');
    L.tubePath([[0.3, 0.55, 2.9], [0.5, 0.58, 3.6], [0.38, 0.6, 4.25], [0.1, 0.6, 4.6]], [0.09, 0.08, 0.06, 0.02], d === 0 ? 4 : 3, false, true);
  });
  hexLegs(b, d, { z: [1.7, 1.0, 0.3], x: 0.55, y: 0.45, yaw: [40, 0, -30], reach: [2.0, 2.2, 2.4], kneeUp: 0.6, r: 0.08, color: lin('#7d6448') });
  return { body: b };
}

// ---------------------------------------------------------------- springtail (1.5 mm)

export function buildSpringtail(d: Detail): Built {
  const b = new CreatureBuilder();
  const grey = lin('#6b6772'), dark = lin('#34303a');
  body(b, d, {
    zTail: -0.75, zHead: 0.55, rings: 12, radial: [8, 6, 4], segments: 6, segDepth: 0.06,
    rows: [row(0, 0.08, 0.08, 0.25), row(0.25, 0.18, 0.17, 0.3), row(0.6, 0.2, 0.19, 0.3), row(1, 0.15, 0.14, 0.28)],
    color: (p) => mix3(grey, dark, vnoise3(p[0] * 30, p[1] * 30, p[2] * 30) > 0.55 ? 0.8 : 0.1),
  });
  blob(b, d, [0, 0.27, 0.66], [0.13, 0.11, 0.13], dark, 5, 8);
  if (d < 2) {
    // furca folded forward under the abdomen
    b.part(PART.BODY); b.color = lin('#9a96a0');
    for (const x of [-0.04, 0.04]) b.tubePath([[x, 0.12, -0.6], [x, 0.06, -0.3], [x, 0.05, 0.0]], [0.02, 0.018, 0.012], 3, false, true);
  }
  hexLegs(b, d, { z: [0.4, 0.2, 0.0], x: 0.1, y: 0.18, yaw: [45, 0, -35], reach: [0.32, 0.34, 0.38], kneeUp: 0.1, r: 0.022, color: grey });
  bilateral(b, (L) => feeler(L, d, [0.06, 0.32, 0.76], [[0.16, 0.42, 0.95], [0.24, 0.45, 1.12], [0.3, 0.4, 1.28]], 0.022, dark));
  return { body: b };
}

// ---------------------------------------------------------------- fruit fly (2.5 mm) and phorid fly (T3)

export interface FlyLook { eye: string; thorax: string; abdomen: string; band: string; hump: number; eyeSize: number }
export const FRUIT_FLY: FlyLook = { eye: '#a3241b', thorax: '#a07548', abdomen: '#b58a55', band: '#2e2117', hump: 0, eyeSize: 1 };
export const PHORID_FLY: FlyLook = { eye: '#3a2a20', thorax: '#2b241e', abdomen: '#3a3028', band: '#1a1612', hump: 0.12, eyeSize: 0.6 };

export function buildFly(look: FlyLook) {
  return (d: Detail): Built => {
    const b = new CreatureBuilder();
    const band = lin(look.band), abd = lin(look.abdomen);
    body(b, d, {
      zTail: -1.2, zHead: -0.05, rings: 10, radial: [10, 6, 4], segments: 5, segDepth: 0.04,
      rows: [row(0, 0.1, 0.1, 0.6), row(0.35, 0.42, 0.38, 0.62), row(0.8, 0.38, 0.36, 0.65), row(1, 0.25, 0.25, 0.7)],
      color: (p) => (Math.sin((p[2] + 1.2) * 13) > 0.35 && p[1] > 0.6 ? band : abd),
    });
    blob(b, d, [0, 0.82 + look.hump, 0.3], [0.38, 0.4 + look.hump, 0.48], lin(look.thorax), 7, 10);
    blob(b, d, [0, 0.82, 0.88], [0.3, 0.28, 0.2], lin(look.thorax), 5, 8);
    bilateral(b, (L) => blob(L, d, [0.22, 0.86, 0.9], [0.13 * look.eyeSize, 0.2 * look.eyeSize, 0.16 * look.eyeSize], lin(look.eye), 6, 8));
    hexLegs(b, d, { z: [0.5, 0.3, 0.1], x: 0.18, y: 0.5, yaw: [55, 5, -40], reach: [0.75, 0.8, 0.9], kneeUp: 0.25, r: 0.03, color: lin(look.thorax) });
    bilateral(b, (L) => feeler(L, d, [0.08, 0.95, 1.05], [[0.12, 1.08, 1.12]], 0.03, lin(look.thorax)));
    const w = new CreatureBuilder();
    bilateral(w, (L) => wing(L, d, [0.18, 1.12, 0.35], 2.0, 0.85, lin('#cfd8dc'), PART.WING, 0.05));
    return { body: b, wings: w };
  };
}

// ---------------------------------------------------------------- rove beetle (5 mm)

export function buildRoveBeetle(d: Detail): Built {
  const b = new CreatureBuilder();
  const black = lin('#15120f'), sheen = lin('#2a221a');
  // exposed abdomen: raised over the back in the wind-up (raise weight grows toward the tip)
  body(b, d, {
    zTail: -2.6, zHead: -0.2, rings: 14, radial: [10, 6, 4], segments: 6, segDepth: 0.1, lower: 0.6,
    pivot: [0, 0.45, -0.3], raiseFrom: 1, raiseTo: 0, raiseW: 1,
    rows: [row(0, 0.12, 0.1, 0.5), row(0.4, 0.45, 0.35, 0.5), row(1, 0.55, 0.4, 0.5)],
    color: (p) => mix3(black, sheen, 0.4 * vnoise3(p[0] * 9, p[1] * 9, p[2] * 9)),
  });
  // fix the raise weight: 0 at the elytra, 1 at the tip
  for (let i = 0; i < b.vcount; i++) { const z = b.pos[i * 3 + 2]!; b.rig[i * 4 + 3] = Math.min(1, Math.max(0, (-0.2 - z) / 2.4)); }
  // short elytra + pronotum + head
  body(b, d, { zTail: -0.4, zHead: 0.9, rings: 6, radial: [10, 6, 4], e: 2.6, lower: 0.5, rows: [row(0, 0.6, 0.38, 0.6), row(1, 0.62, 0.4, 0.6)], color: () => sheen });
  body(b, d, { zTail: 0.85, zHead: 1.75, rings: 6, radial: [10, 6, 4], lower: 0.5, rows: [row(0, 0.48, 0.3, 0.6), row(0.5, 0.52, 0.33, 0.6), row(1, 0.35, 0.25, 0.58)], color: () => black });
  blob(b, d, [0, 0.58, 2.15], [0.48, 0.28, 0.42], black, 6, 10);
  if (d < 2) bilateral(b, (L) => blob(L, d, [0.36, 0.66, 2.3], [0.1, 0.1, 0.12], lin('#0a0a0c'), 4, 6));
  bilateral(b, (L) => {
    L.part(PART.JAW, [0.18, 0.5, 2.5], 1, 0, 2.5); L.color = lin('#2a1e14');
    L.tubePath([[0.18, 0.5, 2.5], [0.28, 0.5, 2.8], [0.1, 0.5, 3.0]], [0.06, 0.05, 0.02], 3, false, true);
  });
  hexLegs(b, d, { z: [1.4, 0.6, 0.1], x: 0.35, y: 0.42, yaw: [50, 0, -40], reach: [1.3, 1.4, 1.6], kneeUp: 0.35, r: 0.06, color: black, tip: lin('#3e3024') });
  bilateral(b, (L) => feeler(L, d, [0.3, 0.7, 2.45], [[0.55, 0.85, 2.8], [0.75, 0.9, 3.2], [0.85, 0.85, 3.5]], 0.04, black));
  return { body: b };
}

/** Deterministic per-index jitter in [-1, 1] (herd spots, scattered bits). */
export function jitter(i: number, k: number): number {
  return hash3(i, k, 7) * 2 - 1;
}
