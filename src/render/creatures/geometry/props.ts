/**
 * Plain (non-instanced) geometry: the antlion pit cone with its loose-sand lip and the bird's beak and the front of
 * its head (GDD 05 §2.6; GDD 08 §11.7: a giant enters from out of frame and is never shown whole). Vertex colours,
 * body frame +Y up.
 */
import { BufferAttribute, BufferGeometry, CircleGeometry } from 'three';
import { lin, type V3 } from '@/render/ants/geometry/meshBuilder';
import { vnoise3 } from '@/render/ants/geometry/curves';
import { CreatureBuilder, blob, body } from './builder';
import { row } from './types';
import { PIT_LOOK } from '../tuning';
import { pitProfileUnit } from '../pitProfile';

const mix3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/**
 * Pit of radius 1 and depth 1 (scaled per pit): a concave cone at the angle of repose with a rounded bottom, then a
 * low lip of thrown-out sand from r = 1 to 1 + lipFraction. Faces point up/inward (seen from above).
 */
export function pitGeometry(): BufferGeometry {
  const { rings, radial, lipFraction } = PIT_LOOK;
  const sand = lin(PIT_LOOK.sand), dark = lin(PIT_LOOK.sandDark);
  const pos: number[] = [], col: number[] = [], idx: number[] = [];
  const lipRings = 4, total = rings + lipRings;
  // concave cone, slightly rounded at the bottom, then the lip (pitProfile.ts: the same shape walkers can stand on)
  const profile = (i: number): [number, number] => {
    const r = i <= rings ? i / rings : 1 + lipFraction * ((i - rings) / lipRings);
    return [r, pitProfileUnit(r, lipFraction, PIT_LOOK.lipHeightPerR)];
  };
  for (let i = 0; i <= total; i++) {
    const [r, y] = profile(i);
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2, x = Math.cos(a) * r, z = Math.sin(a) * r;
      const n = vnoise3(x * 9, y * 9, z * 9);
      const yy = y + (i > 0 && i < rings ? (n - 0.5) * 0.03 : 0);
      pos.push(x, yy, z);
      const shade = i <= rings ? 0.35 * (1 - i / rings) + 0.25 * n : 0.15 * n;
      const c = mix3(sand, dark, shade);
      col.push(c[0], c[1], c[2]);
    }
  }
  for (let i = 0; i < total; i++) for (let j = 0; j < radial; j++) {
    const a = i * radial + j, b = i * radial + ((j + 1) % radial), c = (i + 1) * radial + j, d = (i + 1) * radial + ((j + 1) % radial);
    idx.push(a, b, c, b, d, c);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('color', new BufferAttribute(new Float32Array(col), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** The disc that clears the ground's depth inside a pit's rim (radius 1, horizontal, facing up). */
export function punchGeometry(): BufferGeometry {
  return new CircleGeometry(1, PIT_LOOK.radial).rotateX(-Math.PI / 2);
}

export type BirdVariant = 'thrush' | 'sparrow' | 'woodpecker';

interface BirdLook {
  beakLen: number; beakBase: number;
  /** Upper and lower mandible (natural horn colours) and the tip. */
  beak: string; beakLower: string; beakTip: string;
  back: string; breast: string; speckle: string | null; head: string;
}
const BIRDS: Record<BirdVariant, BirdLook> = {
  // thrush: slim dark-horn beak with a yellowish lower base, brown back, cream breast with dark spots; sparrow: short
  // stout dark cone, grey-brown; woodpecker: long straight chisel, black back and head, pale breast
  thrush: { beakLen: 22, beakBase: 5.5, beak: '#4b3b2b', beakLower: '#a58642', beakTip: '#2c2219', back: '#6b5235', breast: '#d8c398', speckle: '#3a2a1c', head: '#6b5235' },
  sparrow: { beakLen: 12, beakBase: 7, beak: '#3c3a38', beakLower: '#6b6258', beakTip: '#22201e', back: '#7a5c3c', breast: '#a7a194', speckle: null, head: '#6e6a62' },
  woodpecker: { beakLen: 30, beakBase: 6, beak: '#4a4a4c', beakLower: '#5e5d5a', beakTip: '#2a2a2c', back: '#1c1a1a', breast: '#e4ded2', speckle: null, head: '#1c1a1a' },
};

/** Height of the bird's body column above the beak base (mm): far out of any ant-level frame. */
const BIRD_COLUMN_MM = 320;

/**
 * Beak pointing down -Y from the origin (tip at y = -beakLen), then the head, neck and breast rising and leaning back
 * out of frame (the bird is 150-300 mm; from an ant's eye only the beak and the feathered front are ever in view).
 * Returns the geometry and the beak length (mm).
 */
export function birdHeadGeometry(variant: BirdVariant): { geometry: BufferGeometry; beakLen: number } {
  const L = BIRDS[variant];
  const b = new CreatureBuilder();
  const beak = lin(L.beak), lower = lin(L.beakLower), tip = lin(L.beakTip);
  // beak: loft along +Z (then turned to point down), a little deeper than wide, the culmen curving slightly down;
  // dark upper and paler lower mandible meeting at a dark seam
  body(b, 0, {
    zTail: 0, zHead: L.beakLen, rings: 20, radial: [20, 8, 5], e: variant === 'woodpecker' ? 2.6 : 2,
    rows: [row(0, L.beakBase * 0.5, L.beakBase * 0.55, 0), row(0.45, L.beakBase * 0.3, L.beakBase * 0.34, -L.beakBase * 0.04), row(0.9, L.beakBase * 0.08, L.beakBase * 0.09, -L.beakBase * 0.12), row(1, 0.02, 0.02, -L.beakBase * 0.16)],
    color: (p, _n, u) => {
      if (Math.abs(p[1] + L.beakBase * 0.06 * u) < L.beakBase * 0.04) return tip;
      return mix3(p[1] < -L.beakBase * 0.06 * u ? lower : beak, tip, Math.max(0, u - 0.6) * 1.6);
    },
  });
  // head, neck and breast (loft y = the bird's front; negative z = up the column, leaning back): dense rings near the
  // head so the skull reads round from an ant's eye; feathers as small scalloped tips over a soft streaked base
  const back = lin(L.back), breast = lin(L.breast), head = lin(L.head), speck = L.speckle ? lin(L.speckle) : null;
  const H = BIRD_COLUMN_MM;
  // feather size follows the mesh resolution: small on the head, breast-feather size down the column
  const feather = (p: V3, base: V3): V3 => {
    const scale = p[2] > -60 ? 3 : 9, a = p[0] / scale, c = p[2] / scale;
    const tipEdge = Math.abs(((c + 0.5 * Math.floor(a)) % 1 + 1) % 1 - 0.5) * 2; // 0 at a feather's edge
    const n = vnoise3(p[0] * 0.5, p[1] * 0.5, p[2] * 0.5);
    return mix3(base, mix3(base, [0, 0, 0], 0.55), 0.3 * (1 - tipEdge) + 0.15 * n);
  };
  body(b, 0, {
    zTail: -H, zHead: 3.6, rings: 84, radial: [44, 12, 6],
    rows: [row(0, 55, 60, -120), row(0.3, 62, 72, -70), row(0.6, 30, 34, -18), row(0.78, 18, 20, -5), row(0.88, 13.5, 14.5, -1.5), row(0.95, 9, 9.5, 0), row(1, 3.6, 3.6, 0)],
    color: (p, n) => {
      if (p[2] > -60) return feather(p, mix3(head, back, 0.3 * vnoise3(p[0] * 0.4, p[1] * 0.4, p[2] * 0.4)));
      if (n[1] > 0.15) {
        const spot = speck && vnoise3(p[0] * 0.35, p[1] * 0.35, p[2] * 0.35) > 0.62;
        return spot ? speck! : feather(p, mix3(breast, back, 0.15 * vnoise3(p[0] * 0.2, p[1] * 0.2, p[2] * 0.2)));
      }
      return feather(p, mix3(back, head, 0.35 * vnoise3(p[0] * 0.15, p[1] * 0.15, p[2] * 0.15)));
    },
  });
  // eyes: dark glossy domes on the sides of the head above the beak base (plain, no face drawn on them)
  for (const sx of [-1, 1]) blob(b, 0, [sx * 8.6, 2.5, -14], [2.0, 2.3, 2.3], lin('#121010'), 8, 12);
  // turn: +Z (beak direction) -> -Y
  b.transform((p) => [p[0], -p[2], p[1]], (n) => [n[0], -n[2], n[1]]);
  const g = b.toGeometry({ rig: false });
  g.deleteAttribute('uv');
  return { geometry: g, beakLen: L.beakLen };
}
