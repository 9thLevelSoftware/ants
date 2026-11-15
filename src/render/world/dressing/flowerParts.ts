// Flower heads built from parts (pure, tested): the render-only dressing that replaces the flat ellipsoid of a
// procedural plant's flower (GDD 04 §5.3 PlantTemplate) with ligules, petals, florets, bracts and seed parachutes
// near the camera. The collision ellipsoid is untouched; parts sit on and around it (an ant on the flower walks
// among the florets, as on a real one). Everything is in world space, deterministic per primitive.
//
// A part is either a STRAP (a thin blade along its local +x, face normal +y, width across z, bent toward +y by
// `curl` radians over its length) or a DISC (a round card in its local xz plane, face +y).
import type { Primitive } from '@/sim/types';
import { FINISH } from './finishes';
import { hash01 } from './looks';
import { FLOWER_PARTS } from './tuning';
import type { Rgb } from './palette';

/** Outline / pattern of a part, read by the fragment shader (flowerMaterial.ts). */
export const PART_SHAPE = { ligule: 0, petal: 1, bract: 2, beak: 3, floret: 4, pappus: 5, star: 6 } as const;
export type PartShape = keyof typeof PART_SHAPE;

export interface FlowerHead {
  /** Primitive id (seed of the layout). */
  id: number;
  finish: number;
  pos: { x: number; y: number; z: number };
  /** Local axes of the head in world space (unit): x, y (up through the head), z. */
  ax: [number, number, number];
  ay: [number, number, number];
  az: [number, number, number];
  /** Radii of the head ellipsoid, mm (x, y, z). */
  r: [number, number, number];
  color: Rgb;
}

export interface FlowerPart {
  disc: boolean;
  shape: number;
  /** Base point, mm (strap root / disc centre). */
  p: [number, number, number];
  /** Unit direction along the part (strap) or a tangent of the disc. */
  dir: [number, number, number];
  /** Unit face normal (perpendicular to dir). */
  nrm: [number, number, number];
  /** Strap length / disc radius, mm. */
  len: number;
  /** Strap width, mm (discs: = 2 len). */
  width: number;
  /** Bend toward the face normal over the length, rad (straps). */
  curl: number;
  base: Rgb;
  tip: Rgb;
  /** Back-lit translucency 0..1. */
  transl: number;
}

/** True when a primitive look finish is a flower head that gets dressed. */
export function isFlowerFinish(f: number): boolean {
  return f >= FINISH.daisy && f <= FINISH.umbel;
}

/** The flower head of a primitive (ellipsoid or box) with its look finish and colour. */
export function flowerHead(p: Primitive, finish: number, color: Rgb): FlowerHead {
  const { x, y, z, w } = p.rot;
  const ax: [number, number, number] = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const ay: [number, number, number] = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  const az: [number, number, number] = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  return { id: p.id, finish, pos: { ...p.pos }, ax, ay, az, r: [p.size.x, p.size.y, p.size.z], color };
}

type V3 = [number, number, number];
const norm = (v: V3): V3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const mixc = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scalec = (a: Rgb, k: number): Rgb => [a[0] * k, a[1] * k, a[2] * k];

/** Head-local (u along ax, v along ay, w along az) -> world point / direction. */
function toWorld(h: FlowerHead, u: number, v: number, w: number): V3 {
  return [
    h.pos.x + h.ax[0] * u + h.ay[0] * v + h.az[0] * w,
    h.pos.y + h.ax[1] * u + h.ay[1] * v + h.az[1] * w,
    h.pos.z + h.ax[2] * u + h.ay[2] * v + h.az[2] * w,
  ];
}
function dirWorld(h: FlowerHead, u: number, v: number, w: number): V3 {
  return norm([
    h.ax[0] * u + h.ay[0] * v + h.az[0] * w,
    h.ax[1] * u + h.ay[1] * v + h.az[1] * w,
    h.ax[2] * u + h.ay[2] * v + h.az[2] * w,
  ]);
}

/**
 * A strap rooted at head-local polar position (radius rr as a fraction of the head radius, angle a, height y),
 * pointing outward at elevation `elev` (rad, 0 = horizontal, pi/2 = up); its face looks up/outward.
 */
function radialStrap(h: FlowerHead, shape: PartShape, rr: number, a: number, y: number, elev: number, len: number, width: number, curl: number, base: Rgb, tip: Rgb, transl: number): FlowerPart {
  const ca = Math.cos(a), sa = Math.sin(a);
  const p = toWorld(h, ca * rr * h.r[0], y, sa * rr * h.r[2]);
  const dir = dirWorld(h, ca * Math.cos(elev), Math.sin(elev), sa * Math.cos(elev));
  const side = dirWorld(h, -sa, 0, ca);
  const nrm = norm(cross(side, dir)); // up-facing for an outward strap
  return { disc: false, shape: PART_SHAPE[shape], p, dir, nrm, len, width, curl, base, tip, transl };
}

/** Height of the head's dome above its centre at radius fraction rr (parts sit on the dome, not inside it). */
const dome = (h: FlowerHead, rr: number) => h.r[1] * Math.sqrt(Math.max(0, 1 - rr * rr));
/** Slope angle of the dome at rr (negative: falling away from the centre), rad. */
const domeSlope = (h: FlowerHead, rr: number) => -Math.atan((h.r[1] / Math.max(h.r[0], 1e-3)) * rr / Math.sqrt(Math.max(1e-3, 1 - rr * rr)));

const GREEN: Rgb = [0.05, 0.12, 0.025];
const GREEN_DARK: Rgb = [0.025, 0.06, 0.015];

/** Parts of one flower head (appended to `out`). */
export function flowerParts(h: FlowerHead, out: FlowerPart[]): FlowerPart[] {
  const R = Math.max(h.r[0], h.r[2]), H = h.r[1];
  const rnd = (k: number) => hash01(h.id, 100 + k);
  const F = FLOWER_PARTS;
  switch (h.finish) {
    case FINISH.dandelion: {
      // ligules in rings: long and nearly flat outside, short and upright toward the centre; deeper orange inside
      const rings = F.dandelion.rings;
      for (let ring = 0; ring < rings; ring++) {
        const t = ring / (rings - 1); // 0 outer .. 1 inner
        const n = Math.round(F.dandelion.outer * (1 - 0.55 * t));
        const rr = 0.74 - 0.66 * t, y = dome(h, rr) + 0.15;
        const elev = Math.max(0.05, domeSlope(h, rr) + 0.35) + t * 1.0, len = R * (0.6 - 0.36 * t), w = R * F.dandelion.widthK * (1 - 0.3 * t);
        const base = mixc(h.color, scalec(h.color, 0.7), t), tip = mixc(h.color, [h.color[0], h.color[1] * 0.75, h.color[2] * 0.4], 0.35 * t);
        for (let i = 0; i < n; i++) {
          const a = ((i + 0.5 * ring + 0.3 * rnd(ring * 97 + i)) / n) * Math.PI * 2;
          out.push(radialStrap(h, 'ligule', rr, a, y, elev + (rnd(ring * 31 + i) - 0.5) * 0.25, len * (0.9 + 0.2 * rnd(i + 7 * ring)), w, 0.25 + 0.3 * t, base, tip, 0.6));
        }
      }
      // involucre: green bracts under the head, the outer ones bent back down
      for (let i = 0; i < F.dandelion.bracts; i++) {
        const a = (i / F.dandelion.bracts) * Math.PI * 2 + rnd(500 + i) * 0.3;
        out.push(radialStrap(h, 'bract', 0.45, a, -H * 0.4, -0.9 - 0.4 * rnd(600 + i), R * 0.45, R * 0.13, -0.5, GREEN, GREEN_DARK, 0.3));
      }
      break;
    }
    case FINISH.daisy: {
      // one or two rings of white ray petals around the yellow disc (the ellipsoid's top), tips pink-flushed
      const n = F.daisy.petals;
      for (let ring = 0; ring < 2; ring++) {
        for (let i = 0; i < n; i++) {
          const a = ((i + 0.5 * ring + 0.2 * rnd(i + ring * 50)) / n) * Math.PI * 2;
          const tip: Rgb = rnd(300 + i) < 0.4 ? mixc(h.color, [0.75, 0.35, 0.4], 0.35) : h.color;
          // rooted on the dome round the yellow disc, following its curve outward, then spreading past the rim
          const rr = 0.38 + 0.04 * ring;
          out.push(radialStrap(h, 'petal', rr, a, dome(h, rr) + 0.12 - 0.1 * ring, domeSlope(h, rr) * 0.6 + (rnd(i * 3 + ring) - 0.5) * 0.15, R * (0.95 + 0.15 * rnd(i + 90)), R * F.daisy.widthK, -0.45, h.color, tip, 0.8));
        }
      }
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        out.push(radialStrap(h, 'bract', 0.5, a, -H * 0.3, -0.5, R * 0.42, R * 0.18, -0.3, GREEN, GREEN_DARK, 0.3));
      }
      break;
    }
    case FINISH.seedClock: {
      // a sphere of seeds: from the receptacle each beak runs outward and carries a parachute of radial hairs
      const n = F.seedClock.seeds, S = F.seedClock.radiusK * R;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const yy = 1 - (2 * (i + 0.5)) / n;
        if (yy < -0.55) continue; // the stalk side stays bare
        const rr = Math.sqrt(1 - yy * yy), a = i * golden + rnd(i) * 0.2;
        const d = dirWorld(h, Math.cos(a) * rr, yy, Math.sin(a) * rr);
        const side = norm(cross(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]));
        const nrm = norm(cross(side, d));
        const root = toWorld(h, Math.cos(a) * rr * R * 0.2, yy * H * 0.5, Math.sin(a) * rr * R * 0.2);
        const len = S * (0.92 + 0.12 * rnd(i + 400));
        out.push({ disc: false, shape: PART_SHAPE.beak, p: root, dir: d, nrm, len, width: 0.18, curl: 0, base: [0.25, 0.2, 0.12], tip: [0.75, 0.74, 0.7], transl: 0.6 });
        const top: V3 = [root[0] + d[0] * len, root[1] + d[1] * len, root[2] + d[2] * len];
        out.push({ disc: true, shape: PART_SHAPE.pappus, p: top, dir: side, nrm: d, len: S * 0.32, width: S * 0.64, curl: 0, base: h.color, tip: h.color, transl: 1 });
      }
      break;
    }
    case FINISH.cloverHead: {
      // tubular florets radiating from a ball; the lower, older ones bent down and browning
      const n = F.clover.florets;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const yy = 1 - (2 * (i + 0.5)) / n;
        const rr = Math.sqrt(1 - yy * yy), a = i * golden;
        const old = yy < -0.2;
        const elev = Math.asin(yy) - (old ? 0.6 : 0);
        const base: Rgb = old ? [0.32, 0.24, 0.16] : [0.55, 0.62, 0.5];
        const tip: Rgb = old ? [0.42, 0.3, 0.22] : h.color;
        // from the head's centre out to about one head radius in every direction: a ball, not the flat ellipsoid
        out.push(radialStrap(h, 'floret', rr * 0.15, a, yy * H * 0.3, elev, R * (old ? 0.85 : 1.0), R * 0.24, 0.2, base, tip, 0.5));
      }
      break;
    }
    case FINISH.umbel:
    default: {
      // many small five-petalled florets facing up over the head
      const n = F.umbel.florets;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const rr = Math.sqrt((i + 0.5) / n), a = i * golden;
        const p = toWorld(h, Math.cos(a) * rr * R * 0.95, H * (0.7 + 0.3 * (1 - rr)) + 0.6, Math.sin(a) * rr * R * 0.95);
        const nrm = dirWorld(h, Math.cos(a) * rr * 0.4, 1, Math.sin(a) * rr * 0.4);
        const dir = norm(cross(nrm, [0, 0, 1]));
        out.push({ disc: true, shape: PART_SHAPE.star, p, dir, nrm, len: R * 0.22, width: R * 0.44, curl: 0, base: scalec(h.color, 0.85), tip: h.color, transl: 0.6 });
      }
      break;
    }
  }
  return out;
}
