// Camera placements of the demo, derived from the generated nest so they stay valid when the seed changes.
import type { Vec3 } from '@/core/math/vec3';
import type { DemoNest, Feature } from './demoWorld';

export interface View {
  pos: [number, number, number];
  look: [number, number, number];
  /** Possessed-ant stand-in (and sense-light centre), mm. */
  subject: [number, number, number];
  near: number;
  fov: number;
  ant: boolean;
}

const FOOT = 0.6; // body centre above the floor, mm (spike walker foot offset)

/** Point at fraction t of a polyline (by arc length). */
export function along(pts: readonly Vec3[], t: number): Vec3 {
  const seg: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < pts.length; i++) { const l = dist(pts[i], pts[i + 1]); seg.push(l); total += l; }
  let s = Math.max(0, Math.min(1, t)) * total;
  for (let i = 0; i < seg.length; i++) {
    if (s <= seg[i] || i === seg.length - 1) {
      const f = seg[i] > 0 ? Math.min(1, s / seg[i]) : 0;
      return lerp(pts[i], pts[i + 1], f);
    }
    s -= seg[i];
  }
  return { ...pts[pts.length - 1] };
}

const arr = (p: Vec3): [number, number, number] => [p.x, p.y, p.z];
const add = (p: Vec3, x: number, y: number, z: number): Vec3 => ({ x: p.x + x, y: p.y + y, z: p.z + z });

function tunnelView(f: Feature, t0: number, t1: number, tAnt: number, near: number): View {
  const cam = add(along(f.pts, t0), 0, 0.9, 0);
  const look = add(along(f.pts, t1), 0, -0.6, 0);
  const ant = add(along(f.pts, tAnt), 0, -f.r + FOOT, 0);
  return { pos: arr(cam), look: arr(look), subject: arr(ant), near, fov: 75, ant: true };
}

export function makeViews(nest: DemoNest, H: (x: number, z: number) => number): Record<string, View> {
  const E = nest.entrance;
  const tunnel = nest.tunnels.find((t) => t.name === 'C1-C2')!;
  const c2 = nest.chambers[1];
  const g = (x: number, z: number, up: number) => H(x, z) + up;
  const eg = E.y;
  const ax = E.x - 13, az = E.z - 8;
  const cx = 830, cz = 870;
  const fl = (fx: number, fz: number) => c2.c.y - c2.r.y * Math.sqrt(Math.max(0, 1 - fx * fx - fz * fz)) + FOOT;
  return {
    entrance: {
      pos: [E.x - 34, g(E.x - 34, E.z - 22, 9), E.z - 22], look: [E.x + 3, eg - 3, E.z + 2],
      subject: [ax, g(ax, az, FOOT), az], near: 0.5, fov: 55, ant: true,
    },
    shaft: { pos: [E.x - 5, eg + 24, E.z - 3], look: [E.x + 12, eg - 18, E.z + 8], subject: [E.x + 8, eg - 10, E.z + 5], near: 0.5, fov: 55, ant: false },
    tunnel: tunnelView(tunnel, 0.3, 0.55, 0.39, 0.1),
    chamber: {
      pos: [c2.c.x - 0.72 * c2.r.x, c2.c.y + 1.2, c2.c.z - 0.5 * c2.r.z], look: [c2.c.x + 0.5 * c2.r.x, c2.c.y - 4, c2.c.z + 0.4 * c2.r.z],
      subject: [c2.c.x - 0.32 * c2.r.x, fl(-0.32, -0.2), c2.c.z - 0.2 * c2.r.z], near: 0.15, fov: 72, ant: true,
    },
    wood: tunnelView(nest.log.gallery, 0.15, 0.9, 0.3, 0.1),
    colony: { pos: [cx - 300, eg + 380, cz - 330], look: [cx + 10, eg - 70, cz + 10], subject: [cx, eg - 70, cz], near: 2, fov: 45, ant: false },
    side: sideView(nest),
    dig: digView(nest),
    log: { pos: [610, g(610, 820, 22), 820], look: [660, nest.log.a.y, 880], subject: [650, nest.log.a.y, 880], near: 0.5, fov: 55, ant: false },
  };
}

/** Centre of the vertical section: the line from the first to the last chamber cuts most of the nest. */
export function sectionCenter(nest: DemoNest): { x: number; z: number } {
  const a = nest.chambers[0].c, b = nest.chambers[nest.chambers.length - 1].c;
  return { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
}

/** Looking at the section plane square-on, from the side, a little above the ground. */
function sideView(nest: DemoNest): View {
  const a = nest.chambers[0].c, b = nest.chambers[nest.chambers.length - 1].c, c = sectionCenter(nest);
  const lx = b.x - a.x, lz = b.z - a.z, l = Math.hypot(lx, lz);
  const d = { x: lz / l, z: -lx / l }; // view direction: perpendicular to the chamber line
  const y = nest.entrance.y;
  return { pos: [c.x - d.x * 520, y + 140, c.z - d.z * 520], look: [c.x, y - 80, c.z], subject: [c.x, y - 80, c.z], near: 2, fov: 45, ant: false };
}

/** Inside chamber C3 looking at the wall where the scripted dig starts. */
function digView(nest: DemoNest): View {
  const s = nest.digStart, d = nest.digDir, l = Math.hypot(d.x, d.y, d.z);
  const f = { x: d.x / l, y: 0, z: d.z / l };
  return {
    pos: [s.x - f.x * 16, s.y + 2.5, s.z - f.z * 16], look: [s.x + f.x * 8, s.y - 1, s.z + f.z * 8],
    subject: [s.x - f.x * 7, s.y - 4.5, s.z - f.z * 7], near: 0.15, fov: 72, ant: false,
  };
}

/** Surface -> down the shaft -> chamber C1 -> back up: a camera path for the exposure transition series. */
export function cameraPath(nest: DemoNest, H: (x: number, z: number) => number): (t: number) => View {
  const E = nest.entrance, shaft = nest.tunnels.find((t) => t.name === 'shaft')!, toC1 = nest.tunnels.find((t) => t.name === 'to-C1')!;
  const c1 = nest.chambers[0];
  const keys: { pos: Vec3; look: Vec3; near: number; fov: number }[] = [
    { pos: { x: E.x - 30, y: H(E.x - 30, E.z - 20) + 9, z: E.z - 20 }, look: { x: E.x, y: E.y - 2, z: E.z }, near: 0.5, fov: 60 },
    { pos: { x: E.x - 6, y: E.y + 6, z: E.z - 4 }, look: along(shaft.pts, 0.5), near: 0.3, fov: 65 },
    { pos: along(shaft.pts, 0.3), look: along(shaft.pts, 0.9), near: 0.1, fov: 72 },
    { pos: along(shaft.pts, 0.85), look: along(toC1.pts, 0.6), near: 0.1, fov: 72 },
    { pos: along(toC1.pts, 0.7), look: { x: c1.c.x + 0.4 * c1.r.x, y: c1.c.y - 3, z: c1.c.z + 0.3 * c1.r.z }, near: 0.1, fov: 72 },
    { pos: { x: c1.c.x - 0.4 * c1.r.x, y: c1.c.y + 1, z: c1.c.z - 0.3 * c1.r.z }, look: { x: c1.c.x + 0.6 * c1.r.x, y: c1.c.y - 3, z: c1.c.z + 0.5 * c1.r.z }, near: 0.15, fov: 72 },
  ];
  const at = (u: number) => {
    const s = Math.max(0, Math.min(1, u)) * (keys.length - 1), i = Math.min(keys.length - 2, Math.floor(s)), f = s - i;
    const a = keys[i], b = keys[i + 1];
    return { pos: lerp(a.pos, b.pos, f), look: lerp(a.look, b.look, f), near: Math.min(a.near, b.near), fov: a.fov + (b.fov - a.fov) * f };
  };
  return (t) => {
    // 0..0.45 down, 0.45..0.55 hold in the chamber, 0.55..1 back up
    const u = t < 0.45 ? t / 0.45 : t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    const k = at(u);
    return { pos: arr(k.pos), look: arr(k.look), subject: arr(k.look), near: k.near, fov: k.fov, ant: false };
  };
}

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}
function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
