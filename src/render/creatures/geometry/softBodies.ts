/**
 * Legless and soft-bodied animals (GDD 05 §2.2): earthworm, fly larva (maggot), caterpillar (smooth and hairy
 * variants; the medium variant is the same mesh scaled by the renderer), the snail with its coiled shell and the
 * antlion larva (a plump, bristly body that lies buried in its pit).
 * Bodies are part FLEX so the shader can run peristaltic and looping waves along them (GDD 08 §11.9).
 */
import { lin, type V3 } from '@/render/ants/geometry/meshBuilder';
import { mulberry32, vnoise3 } from '@/render/ants/geometry/curves';
import { CreatureBuilder, PART, bilateral, blob, body, feeler, setae, type Detail } from './builder';
import { row, type Built } from './types';

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ---------------------------------------------------------------- earthworm (100 mm)

export function buildEarthworm(d: Detail): Built {
  const b = new CreatureBuilder();
  const pink = lin('#9b5a50'), dark = lin('#6e322d'), clit = lin('#b87a62'), belly = lin('#c2948a');
  body(b, d, {
    zTail: -50, zHead: 50, rings: 60, radial: [8, 6, 4], segments: 60, segDepth: 0.05, part: PART.FLEX, lower: 0.85,
    rows: [row(0, 0.9, 0.7, 0.7), row(0.04, 1.7, 1.25, 1.25), row(0.4, 2.0, 1.75, 1.75), row(0.66, 2.1, 1.9, 1.9), row(0.71, 2.45, 2.2, 2.2), row(0.76, 2.15, 1.95, 1.95), row(0.95, 1.6, 1.45, 1.45), row(1, 0.5, 0.45, 1.2)],
    color: (p, n, u) => {
      if (u > 0.67 && u < 0.75 && n[1] > -0.3) return clit;
      const base = mix3(pink, dark, Math.max(0, (u - 0.6) * 1.8));
      return n[1] < -0.5 ? mix3(base, belly, 0.5) : mix3(base, dark, 0.15 * vnoise3(p[0], p[1], p[2] * 0.4));
    },
  });
  return { body: b };
}

// ---------------------------------------------------------------- fly larva / maggot (8 mm)

export function buildFlyLarva(d: Detail): Built {
  const b = new CreatureBuilder();
  const cream = lin('#e7dcc0'), shade = lin('#cbbd98');
  body(b, d, {
    zTail: -4, zHead: 4, rings: 18, radial: [10, 6, 4], segments: 11, segDepth: 0.07, part: PART.FLEX, lower: 0.8,
    rows: [row(0, 0.55, 0.5, 0.95), row(0.05, 0.95, 0.85, 1.0), row(0.3, 1.15, 1.0, 1.05), row(0.7, 0.95, 0.85, 0.9), row(0.92, 0.45, 0.4, 0.6), row(1, 0.12, 0.1, 0.5)],
    color: (p) => mix3(cream, shade, 0.4 * vnoise3(p[0] * 3, p[1] * 3, p[2] * 3)),
  });
  if (d < 2) {
    // posterior spiracles on the blunt tail and the dark mouth hooks
    b.part(PART.FLEX, [0, 0, 0], 0, 0, -4);
    bilateral(b, (L) => { L.part(PART.FLEX, [0, 0, 0], 0, 0, -4); blob(L, d, [0.3, 1.05, -4.08], [0.18, 0.18, 0.06], lin('#3a2a1c'), 4, 6); });
    b.part(PART.FLEX, [0, 0, 0], 0, 0, 4);
    blob(b, d, [0, 0.45, 4.0], [0.08, 0.06, 0.12], lin('#1d1712'), 4, 6);
  }
  return { body: b };
}

// ---------------------------------------------------------------- caterpillar (10 mm; medium = x 2.2)

export function buildCaterpillar(hairy: boolean) {
  return (d: Detail): Built => {
    const b = new CreatureBuilder();
    const green = lin(hairy ? '#4a3424' : '#6f9a36'), line = lin(hairy ? '#7a5a3a' : '#d3e28c'), dorsal = lin(hairy ? '#2a1d14' : '#4e7428');
    const segs = 13, r = 0.85, yc = 0.95;
    body(b, d, {
      zTail: -5, zHead: 4.4, rings: 26, radial: [12, 7, 4], segments: segs, segDepth: 0.09, part: PART.FLEX, lower: 0.85,
      rows: [row(0, 0.35, 0.35, yc * 0.85), row(0.06, 0.75, 0.72, yc), row(0.5, r, r, yc), row(0.9, 0.8, 0.8, yc), row(1, 0.6, 0.6, yc)],
      color: (p) => {
        if (Math.abs(p[1] - yc + 0.15) < 0.12 && Math.abs(p[0]) > r * 0.7) return line;
        if (Math.abs(p[0]) < 0.12 && p[1] > yc + r * 0.8) return dorsal;
        return mix3(green, dorsal, 0.25 * vnoise3(p[0] * 4, p[1] * 4, p[2] * 4));
      },
    });
    // head capsule
    b.part(PART.FLEX, [0, 0, 0], 0, 0, 4.6);
    blob(b, d, [0, yc * 0.85, 4.75], [0.62, 0.62, 0.55], lin(hairy ? '#1e1610' : '#4f6a2a'), 6, 10);
    if (d < 2) {
      // true legs (3 pairs behind the head) and prolegs (abdominal segments 3-6 and the anal claspers)
      const segZ = (k: number) => 4.4 - (k + 0.5) * (9.4 / segs);
      bilateral(b, (L) => {
        for (const k of [1, 2, 3]) {
          const z = segZ(k);
          L.part(PART.FLEX, [0, 0, 0], 0, 0, z); L.color = lin('#2e3a1a');
          L.tubePath([[r * 0.45, yc * 0.45, z], [r * 0.55, 0.12, z + 0.1]], [0.12, 0.05], 3, false, true);
        }
        for (const k of [6, 7, 8, 9, 12]) {
          const z = segZ(k);
          L.part(PART.FLEX, [0, 0, 0], 0, 0, z); L.color = mix3(green, line, 0.3);
          L.tubePath([[r * 0.5, yc * 0.5, z], [r * 0.58, 0.12, z]], [0.22, 0.17], d === 0 ? 5 : 3, false, true);
        }
      });
    }
    if (hairy && d < 2) {
      // tufts of long setae (woolly-bear-like); the hairs ride the body wave at their own axial position
      const rnd = mulberry32(29); const n = d === 0 ? 160 : 60;
      for (let i = 0; i < n; i++) {
        const z = -4.6 + rnd() * 9, th = rnd() * Math.PI * 1.1 - 0.05;
        const nn: V3 = [Math.cos(th), Math.sin(th), (rnd() - 0.5) * 0.4];
        b.part(PART.FLEX, [0, 0, 0], 0, 0, z);
        setae(b, [{ p: [nn[0] * r * 0.95, yc + nn[1] * r * 0.95, z], n: nn }], 1.1 + rnd() * 0.6, 0.05, mix3(lin('#c9a46e'), lin('#3a2a1c'), rnd()));
      }
    }
    return { body: b };
  };
}

// ---------------------------------------------------------------- snail (shell 20 mm)

/** Shell parameters: aperture coil radius, whorl expansion per turn, turns, tube/coil ratio, spire drop. */
/** Shell coil (mm, turns); the last lipSpan of the whorl flares by lipFlare into the lip. */
const SHELL = { R: 6.2, expand: 2.1, turns: 4.2, tube: 0.62, drop: 0.5, lipSpan: 0.015, lipFlare: 0.14 };

export function buildSnail(d: Detail): Built & { retract: V3 } {
  const b = new CreatureBuilder();
  const skin = lin('#7b6c5c'), skinDark = lin('#4f443a');
  // foot and head (SOFT: retracts into the shell)
  body(b, d, {
    zTail: -13, zHead: 15.5, rings: 24, radial: [12, 7, 4], part: PART.SOFT, lower: 0.35, e: 2.4,
    rows: [row(0, 0.6, 0.3, 0.35), row(0.15, 3.0, 1.1, 1.1), row(0.55, 3.6, 1.7, 1.7), row(0.85, 2.8, 2.6, 2.4), row(0.97, 2.0, 2.2, 2.6), row(1, 0.9, 1.0, 2.6)],
    color: (p) => mix3(skin, skinDark, 0.55 * vnoise3(p[0] * 1.6, p[1] * 1.6, p[2] * 1.6)),
  });
  if (d < 2) {
    // upper tentacles (eye stalks; a plain darker bulb at the tip, no face) and short lower tentacles
    bilateral(b, (L) => {
      feeler(L, d, [1.0, 3.8, 14.8], [[1.6, 6.0, 16.2], [2.3, 8.0, 17.4]], 0.4, skin, PART.TENTACLE);
      L.part(PART.TENTACLE, [1.0, 3.8, 14.8], 1, 0, 14.8);
      blob(L, d, [2.35, 8.1, 17.5], [0.42, 0.42, 0.42], skinDark, 4, 6);
      feeler(L, d, [1.3, 1.6, 15.6], [[1.8, 1.4, 17.0]], 0.3, skin, PART.TENTACLE);
    });
  }
  const aperture = shell(b, d, SHELL_AT);
  // the mantle collar filling the aperture: the soft body reads as coming out of the shell (and retracts with it)
  b.part(PART.SOFT);
  if (d < 2) blob(b, d, aperture, [SHELL.R * SHELL.tube * 0.85, SHELL.R * SHELL.tube * 0.85, SHELL.R * SHELL.tube * 0.85], mix3(skin, skinDark, 0.5), 8, 12);
  return { body: b, retract: aperture };
}

const SHELL_AT: V3 = [0, 3.0, -1.5];
const SHELL_YAW = -Math.PI / 2;

/** Shell-local (coil frame) -> body frame: turned so the aperture faces the side, base on the snail's back. */
function shellPlace(at: V3, x: number, y: number, z: number): V3 {
  const c = Math.cos(SHELL_YAW), s = Math.sin(SHELL_YAW);
  return [at[0] + x * c + z * s, at[1] + y + SHELL.R * SHELL.drop * 1.4 + SHELL.R * SHELL.tube, at[2] - x * s + z * c];
}

/** Where the snail's soft body retracts to: the shell aperture centre (body frame, mm). */
export function snailAperture(): V3 {
  const R = SHELL.R, T = SHELL.turns * Math.PI * 2; // the coil radius at the aperture (t = T)
  return shellPlace(SHELL_AT, R * Math.cos(T), -SHELL.drop * R * 1.4, R * Math.sin(T));
}

/**
 * Logarithmic-spiral shell around a vertical columella, apex up, placed with its base at `at`; spiral colour
 * bands and growth lines. Returns the aperture centre (where the soft body retracts to).
 */
function shell(b: CreatureBuilder, d: Detail, at: V3): V3 {
  b.part(PART.BODY);
  const brown = lin('#8b6a3e'), band = lin('#4a3520'), pale = lin('#b89a6a');
  // far detail stays under the reference ant's triangles at the same size (detail.ts)
  const steps = [110, 60, 24][d]!, radial = [12, 8, 4][d]!;
  const T = SHELL.turns * Math.PI * 2, k = Math.log(SHELL.expand) / (Math.PI * 2);
  const Rt = (t: number) => SHELL.R * Math.exp(k * (t - T));
  const yAt = (t: number) => -SHELL.drop * Rt(t) * 1.4;
  const place = (x: number, y: number, z: number): V3 => shellPlace(at, x, y, z);
  const rows: number[][] = [];
  const v0 = b.vcount;
  for (let i = 0; i <= steps; i++) {
    // the last few percent of the whorl flare into a thickened, paler lip (peristome) instead of ending in a cut
    const t = (i / steps) * T, R = Rt(t), lipT = Math.max(0, (t / T - 1 + SHELL.lipSpan) / SHELL.lipSpan);
    const r = R * SHELL.tube * (1 + SHELL.lipFlare * lipT * lipT);
    const c: V3 = [R * Math.cos(t), yAt(t), R * Math.sin(t)];
    const N: V3 = [Math.cos(t), 0, Math.sin(t)];
    const Tg: V3 = [-Math.sin(t), 0, Math.cos(t)];
    const B: V3 = [Tg[1] * N[2] - Tg[2] * N[1], Tg[2] * N[0] - Tg[0] * N[2], Tg[0] * N[1] - Tg[1] * N[0]];
    const rowIds: number[] = [];
    for (let j = 0; j < radial; j++) {
      const ph = (j / radial) * Math.PI * 2;
      const o: V3 = [N[0] * Math.cos(ph) + B[0] * Math.sin(ph), N[1] * Math.cos(ph) + B[1] * Math.sin(ph), N[2] * Math.cos(ph) + B[2] * Math.sin(ph)];
      const p = place(c[0] + o[0] * r, c[1] + o[1] * r, c[2] + o[2] * r);
      const bandOn = Math.sin(ph * 3 + 0.6) > 0.72;
      const growth = 0.5 + 0.5 * Math.sin(t * 9);
      const base = bandOn ? band : mix3(brown, pale, 0.35 * growth);
      const col = lipT > 0 ? mix3(base, pale, 0.6 * lipT) : base;
      rowIds.push(b.vert(p, [0, 1, 0], [0, 0], col));
    }
    rows.push(rowIds);
  }
  b.beginPieceAt(v0);
  for (let i = 0; i + 1 < rows.length; i++) for (let j = 0; j < radial; j++) {
    const j1 = (j + 1) % radial; const A = rows[i]!, C = rows[i + 1]!;
    b.tri(A[j]!, A[j1]!, C[j]!); b.tri(A[j1]!, C[j1]!, C[j]!);
  }
  b.endPiece();
  // the dark mouth: a funnel from the lip back into the whorl (both faces), not a flat cap at the aperture
  const last = rows[rows.length - 1]!, Tb = T * (1 - SHELL.lipSpan * 1.5), Tn = Rt(Tb);
  b.beginPiece();
  const mid = b.vert(place(Tn * Math.cos(Tb), yAt(Tb), Tn * Math.sin(Tb)), [0, 1, 0], [0, 0], lin('#2e2620'));
  const lip = last.map((i) => b.vert(b.p(i), [0, 1, 0], [0, 0], lin('#5a4d40')));
  for (let j = 0; j < radial; j++) { const j1 = (j + 1) % radial; b.tri(lip[j]!, lip[j1]!, mid); b.tri(lip[j1]!, lip[j]!, mid); }
  b.endPiece();
  // close the apex
  const apex = Rt(0);
  b.color = brown;
  b.ellipsoid(place(apex, yAt(0), 0), [apex * SHELL.tube * 1.2, apex * SHELL.tube * 1.2, apex * SHELL.tube * 1.2], 4, 6);
  const ap = Rt(T);
  return place(ap * Math.cos(T), yAt(T), ap * Math.sin(T));
}

/**
 * Antlion larva: plump bristly sand-grey abdomen, flat dark head, long reddish-brown sickle jaws with teeth. In its
 * pit only the head and the open jaws show (the renderer buries the rest, tuning ANTLION_LOOK).
 */
export function buildAntlion(d: Detail): Built {
  const b = new CreatureBuilder();
  const grey = lin('#6e604c'), dark = lin('#3a2f23'), headC = lin('#4e3d2b'), jaw = lin('#4e2c17'), jawTip = lin('#22150c');
  body(b, d, {
    zTail: -5, zHead: 1.2, rings: 14, radial: [12, 7, 4], segments: 8, segDepth: 0.06, lower: 0.6,
    rows: [row(0, 0.6, 0.5, 1.2), row(0.25, 2.5, 1.6, 1.6), row(0.6, 2.8, 1.7, 1.7), row(0.9, 1.6, 1.1, 1.4), row(1, 0.8, 0.6, 1.2)],
    color: (p) => mix3(grey, dark, vnoise3(p[0] * 2.5, p[1] * 2.5, p[2] * 2.5) > 0.56 ? 0.85 : 0.2),
  });
  // flat, broad head with two dark stripes
  b.color = headC;
  const h0 = b.vcount;
  blob(b, d, [0, 1.25, 2.0], [1.1, 0.42, 0.95], headC, 6, 10);
  b.recolor(h0, (p) => (Math.abs(Math.abs(p[0]) - 0.45) < 0.14 && p[1] > 1.3 ? dark : headC));
  if (d === 0) {
    const r = mulberry32(17); const bases: { p: V3; n: V3 }[] = [];
    for (let i = 0; i < 50; i++) { const th = r() * Math.PI * 2, z = -4.4 + r() * 5; const w = 2.2 * Math.sin(Math.PI * Math.min(1, (z + 5) / 6.2)); bases.push({ p: [Math.cos(th) * w, 1.6 + Math.sin(th) * w * 0.6, z], n: [Math.cos(th), Math.sin(th) * 0.6, 0] }); }
    setae(b, bases, 0.45, 0.06, dark);
  }
  // sickle jaws: thick at the base, curving inward to fine dark tips, three teeth on the inner edge
  bilateral(b, (L) => {
    L.part(PART.JAW, [0.55, 1.25, 2.7], 1, 0, 2.7); L.color = jaw;
    const j0 = L.vcount;
    L.tubePath([[0.55, 1.25, 2.7], [1.15, 1.3, 3.8], [1.1, 1.33, 5.0], [0.45, 1.3, 6.1]], [0.3, 0.24, 0.16, 0.04], d === 0 ? 6 : 3, false, true);
    L.recolor(j0, (p) => (p[2] > 5.3 ? jawTip : jaw));
    if (d === 0) for (const z of [3.6, 4.3, 5.0]) { L.color = jawTip; L.tubePath([[1.0 - (z - 3.6) * 0.3, 1.3, z], [0.6 - (z - 3.6) * 0.3, 1.3, z + 0.18]], [0.09, 0.02], 3, false, true); }
  });
  bilateral(b, (L) => feeler(L, d, [0.7, 1.45, 2.6], [[1.1, 1.7, 3.0]], 0.06, dark));
  return { body: b };
}
