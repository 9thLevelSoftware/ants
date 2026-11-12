// Picking in the rendered scene: the ray through the cursor from the camera the player is looking through, the
// distance to the first thing that hides what lies behind it (the terrain / objects field, or in the colony view the
// nest renderer's cut face or wall), and the entity hits in front of it.
import type { PerspectiveCamera } from 'three';
import type { Vec3 } from '@/core';
import type { NestPick } from '@/render/nest';
import type { CutawayParams } from '@/render/camera';
import type { Sim } from '@/sim/types';
import { pickEntities, type PickHit } from './entityPick';
import { makeRay, pxToNdc, rayFromNdc, type PickCamera, type Ray } from './pickMath';

/** Longest pick ray, BU. */
export const PICK_MAX_BU = 3000;

/** Reads the camera's world basis into a PickCamera (call after the camera's matrixWorld is current). */
export function pickCameraOf(camera: PerspectiveCamera, heightPx: number, out?: PickCamera): PickCamera {
  const e = camera.matrixWorld.elements;
  const o = out ?? { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, tanHalfFov: 1, aspect: 1, heightPx: 1 };
  o.right.x = e[0]; o.right.y = e[1]; o.right.z = e[2];
  o.up.x = e[4]; o.up.y = e[5]; o.up.z = e[6];
  o.fwd.x = -e[8]; o.fwd.y = -e[9]; o.fwd.z = -e[10];
  o.pos.x = e[12]; o.pos.y = e[13]; o.pos.z = e[14];
  for (const v of [o.right, o.up, o.fwd]) { const l = Math.hypot(v.x, v.y, v.z) || 1; v.x /= l; v.y /= l; v.z /= l; }
  o.tanHalfFov = Math.tan((camera.fov * Math.PI) / 360);
  o.aspect = camera.aspect;
  o.heightPx = heightPx;
  return o;
}

export interface ScenePickInput {
  sim: Sim;
  camera: PerspectiveCamera;
  /** Canvas size, CSS px. */
  width: number;
  height: number;
  /** Cursor, CSS px. */
  x: number;
  y: number;
  /** Colony-view cutaway (null elsewhere). */
  cutaway: CutawayParams | null;
  /** The camera is underground (observer: chambers become pickable). */
  underground: boolean;
  /** The nest renderer's pick at NDC (cut face, walls, surface), when there is a nest renderer. */
  nestPick: ((ndcX: number, ndcY: number) => NestPick | null) | null;
}

export interface ScenePick {
  ray: Ray;
  ndc: { x: number; y: number };
  /** Entity / structure hits, nearest first. */
  hits: PickHit[];
  /** The surface point under the cursor (nest pick in the colony view, else the field), or null. */
  surface: { point: Vec3; normal: Vec3; kind: 'cap' | 'wall' | 'surface'; underground: boolean } | null;
}

const _cam: PickCamera = { pos: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 0, z: -1 }, tanHalfFov: 1, aspect: 1, heightPx: 1 };

export function scenePick(p: ScenePickInput, out: ScenePick = { ray: makeRay(), ndc: { x: 0, y: 0 }, hits: [], surface: null }): ScenePick {
  const sim = p.sim, bu = sim.world.bu;
  const cam = pickCameraOf(p.camera, p.height, _cam);
  out.ndc = pxToNdc(p.x, p.y, p.width, p.height);
  rayFromNdc(cam, out.ndc.x, out.ndc.y, out.ray);
  const max = PICK_MAX_BU * bu;
  const mode = p.cutaway?.mode ?? 'off';
  // what hides things behind it, and the surface point for placing markers
  out.surface = null;
  let occluderT = Infinity;
  const np = mode !== 'off' && p.nestPick ? p.nestPick(out.ndc.x, out.ndc.y) : null;
  if (np) {
    out.surface = { point: np.point, normal: np.normal, kind: np.kind, underground: np.underground };
    occluderT = mode === 'xray' ? Infinity : np.distance;
  } else if (mode !== 'xray') {
    const t = sim.field.sphereTrace(out.ray.o, out.ray.d, max, 0);
    if (t < max) {
      const pt = { x: out.ray.o.x + out.ray.d.x * t, y: out.ray.o.y + out.ray.d.y * t, z: out.ray.o.z + out.ray.d.z * t };
      const n = { x: 0, y: 1, z: 0 };
      sim.field.gradient(pt, n);
      const l = Math.hypot(n.x, n.y, n.z) || 1;
      n.x /= l; n.y /= l; n.z /= l;
      out.surface = { point: pt, normal: n, kind: 'surface', underground: sim.field.substrate(pt) < 0 };
      if (mode === 'off') occluderT = t;
    }
  }
  pickEntities(sim, cam, out.ray, { occluderT, structures: mode !== 'off' || p.underground }, out.hits);
  return out;
}
