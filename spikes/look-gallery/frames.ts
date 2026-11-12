/**
 * Gallery frames of a generated world: where the subject ant stands and which way the macro camera looks.
 * Pure (no three): picks the start pose, the nearest flowering plant, the nearest large prop, the nearest paving
 * and, where the map has one, a spot indoors. Each frame is a ground point + heading (unit XZ) for the ant.
 */
import type { WorldData, WorldObject } from '@/sim/types';

export type FrameId = 'start' | 'plant' | 'prop' | 'object' | 'paving' | 'interior';
export const FRAME_IDS: readonly FrameId[] = ['start', 'plant', 'prop', 'object', 'paving', 'interior'];

export interface GalleryFrame {
  id: FrameId;
  /** Point above the ground where the ant is dropped (walkerPlace traces down), mm. */
  drop: { x: number; y: number; z: number };
  /** Heading of the ant and the camera, unit XZ. */
  dir: { x: number; z: number };
  /** What the frame shows (report text). */
  note: string;
  /** Camera override (BU / radians), e.g. the wide swatch view; default = the macro framing. */
  cam?: { distBU: number; pitch: number; aheadBU: number; upBU: number; yawOff: number };
}

const PLANTS = ['dandelion', 'daisy', 'clover-patch', 'herb-plant', 'perennial-plant', 'bean-row'];
const PROPS = ['parked-car', 'log', 'fridge', 'litter-bin', 'bench', 'stump', 'compost-bin', 'water-butt', 'plant-pot', 'slide', 'pet-bowl-pair', 'pedal-bin', 'toy-bucket', 'garden-wall'];
const PAVING = ['paving-slab', 'cracked-slab', 'stepping-stone', 'kerb', 'edging-kerb', 'back-step'];

function objRadius(w: WorldData, o: WorldObject): number {
  let r = 0;
  for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
    const p = w.prims[i];
    const d = Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) + Math.max(p.size.x, p.size.z);
    if (d > r) r = d;
  }
  return r;
}

function objTop(w: WorldData, o: WorldObject): number {
  let top = -Infinity;
  for (let i = o.primStart; i < o.primStart + o.primCount; i++) top = Math.max(top, w.prims[i].pos.y + w.prims[i].size.y);
  return top;
}

function nearest(w: WorldData, ids: readonly string[], from: { x: number; z: number }, minR = 0): WorldObject | null {
  let best: WorldObject | null = null, bd = Infinity;
  for (const o of w.objects) {
    const rank = ids.indexOf(o.templateId);
    if (rank < 0 || o.primCount === 0) continue;
    if (minR > 0 && objRadius(w, o) < minR) continue;
    // earlier ids are preferred: a dandelion 3 m away beats a herb at 1 m
    const d = Math.hypot(o.pos.x - from.x, o.pos.z - from.z) * (1 + rank * 0.5);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** Half extent of a primitive along a horizontal unit direction (support distance of its oriented box), mm. */
function extentAlong(p: WorldData['prims'][number], dx: number, dz: number): number {
  const { x, y, z, w } = p.rot;
  // columns of the rotation matrix = the primitive's local axes in world space
  const ax = [1 - 2 * (y * y + z * z), 2 * (x * y + w * z), 2 * (x * z - w * y)];
  const ay = [2 * (x * y - w * z), 1 - 2 * (x * x + z * z), 2 * (y * z + w * x)];
  const az = [2 * (x * z + w * y), 2 * (y * z - w * x), 1 - 2 * (x * x + y * y)];
  const s = p.shape === 'box' || p.shape === 'ellipsoid' ? [p.size.x, p.size.y, p.size.z] : [p.size.x, p.size.y + (p.shape === 'capsule' ? p.size.x : 0), p.size.x];
  return Math.abs(ax[0] * dx + ax[2] * dz) * s[0] + Math.abs(ay[0] * dx + ay[2] * dz) * s[1] + Math.abs(az[0] * dx + az[2] * dz) * s[2];
}

/** Terrain height (bilinear), mm: drops for ground-level frames start just above the ground, not on a roof. */
function groundY(w: WorldData, x: number, z: number): number {
  const t = w.terrain;
  const fx = Math.min(t.nx - 1.001, Math.max(0, x / t.cell)), fz = Math.min(t.nz - 1.001, Math.max(0, z / t.cell));
  const i = Math.floor(fx), k = Math.floor(fz), u = fx - i, v = fz - k, d = t.data, n = t.nx;
  return (d[k * n + i] * (1 - u) + d[k * n + i + 1] * u) * (1 - v) + (d[(k + 1) * n + i] * (1 - u) + d[(k + 1) * n + i + 1] * u) * v;
}

function unit(x: number, z: number): { x: number; z: number } {
  const l = Math.hypot(x, z) || 1;
  return { x: x / l, z: z / l };
}

/** Frames of a world; missing ones (no interior) are left out. */
export function findFrames(w: WorldData): GalleryFrame[] {
  const bu = w.bu;
  const s = w.queenStart;
  const start = { x: s.pos.x, z: s.pos.z };
  const out: GalleryFrame[] = [{
    id: 'start', drop: { x: s.pos.x, y: s.pos.y + 3 * bu, z: s.pos.z }, dir: unit(s.fwd.x, s.fwd.z), note: 'queen start pose',
  }];
  // ant a few BU in front of the object, looking at it
  const facing = (o: WorldObject, gapBu: number, id: FrameId, note: string): GalleryFrame => {
    const r = objRadius(w, o);
    const away = unit(start.x - o.pos.x, start.z - o.pos.z);
    const dist = id === 'plant' ? gapBu * bu : r + gapBu * bu;
    const x = o.pos.x + away.x * dist, z = o.pos.z + away.z * dist;
    return { id, drop: { x, y: objTop(w, o) + 4 * bu, z }, dir: { x: -away.x, z: -away.z }, note: `${note} ${o.templateId} #${o.id}` };
  };
  const plant = nearest(w, PLANTS, start);
  if (plant) out.push(facing(plant, 6, 'plant', 'beside'));
  const prop = nearest(w, PROPS, start, 25 * bu);
  if (prop) out.push(facing(prop, 7, 'prop', 'large prop'));
  // 'object' (added after the before-gallery): the same large prop, but the ant faces the prop's nearest part, so
  // the prop fills the frame (the 'prop' frame aims at the object's centre and often misses long objects)
  if (prop) {
    let best = -1, bd = Infinity;
    for (let i = prop.primStart; i < prop.primStart + prop.primCount; i++) {
      const p = w.prims[i];
      const d = Math.hypot(p.pos.x - start.x, p.pos.z - start.z) - Math.max(p.size.x, p.size.z);
      if (d < bd && p.size.y > 2 * bu) { bd = d; best = i; }
    }
    if (best >= 0) {
      const p = w.prims[best];
      const away = unit(start.x - p.pos.x, start.z - p.pos.z);
      const reach = extentAlong(p, away.x, away.z) + 9 * bu;
      const x = p.pos.x + away.x * reach, z = p.pos.z + away.z * reach;
      out.push({
        id: 'object', drop: { x, y: groundY(w, x, z) + 2 * bu, z }, dir: { x: -away.x, z: -away.z },
        note: `near part of ${prop.templateId} #${prop.id}`,
      });
    }
  }
  const pave = nearest(w, PAVING, start);
  if (pave) {
    // on top of the slab, looking across it
    const t = objTop(w, pave);
    out.push({ id: 'paving', drop: { x: pave.pos.x, y: t + 3 * bu, z: pave.pos.z }, dir: unit(start.x - pave.pos.x + 0.3, start.z - pave.pos.z), note: `on ${pave.templateId} #${pave.id}` });
  }
  const floor = w.objects.find((o) => o.templateId === 'floor-slab');
  const look = w.objects.find((o) => o.templateId === 'fridge') ?? w.objects.find((o) => o.templateId === 'chair');
  if (floor && look) {
    const t = objTop(w, floor);
    const r = objRadius(w, look);
    const away = unit(floor.pos.x - look.pos.x, floor.pos.z - look.pos.z);
    const x = look.pos.x + away.x * (r + 40 * bu), z = look.pos.z + away.z * (r + 40 * bu);
    out.push({ id: 'interior', drop: { x, y: t + 3 * bu, z }, dir: { x: -away.x, z: -away.z }, note: `kitchen floor facing ${look.templateId}` });
  }
  return out;
}
