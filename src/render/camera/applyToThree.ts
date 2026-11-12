// The only camera file that touches three: copies a pure CameraPose onto a PerspectiveCamera.
import type { PerspectiveCamera } from 'three';
import type { CameraPose } from './types';

export function applyPose(camera: PerspectiveCamera, pose: CameraPose, aspect?: number): void {
  camera.position.set(pose.pos.x, pose.pos.y, pose.pos.z);
  camera.up.set(pose.up.x, pose.up.y, pose.up.z);
  camera.lookAt(pose.look.x, pose.look.y, pose.look.z);
  let dirty = false;
  if (camera.fov !== pose.fov) { camera.fov = pose.fov; dirty = true; }
  if (camera.near !== pose.near) { camera.near = pose.near; dirty = true; }
  if (camera.far !== pose.far) { camera.far = pose.far; dirty = true; }
  if (aspect !== undefined && camera.aspect !== aspect) { camera.aspect = aspect; dirty = true; }
  if (dirty) camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
