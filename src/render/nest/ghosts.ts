// Hook for dig-plan ghosts and markers (the `views` task draws those): translucent spheres / ellipsoids in nest
// space with a soft rim so their shape reads through the walls. `onTop` ghosts ignore depth (seen through soil).
import {
  Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Quaternion, ShaderMaterial, SphereGeometry, Vector3,
} from 'three';
import { GHOST_RENDER_ORDER } from './params';

export interface NestGhost {
  center: { x: number; y: number; z: number };
  /** Radii, mm (sphere: all equal). */
  radii: { x: number; y: number; z: number };
  /** Orientation (local -> world), default identity. */
  rotation?: { x: number; y: number; z: number; w: number };
  /** sRGB colour. */
  color: string | number;
  /** 0..1, default 0.35. */
  opacity?: number;
  /** Draw through solid (x-ray / cutaway overlays). */
  onTop?: boolean;
}

const VERT = /* glsl */ `
attribute vec4 iCol;
varying vec4 vCol;
varying vec3 vN;
varying vec3 vV;
void main() {
  vCol = iCol;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FRAG = /* glsl */ `
varying vec4 vCol;
varying vec3 vN;
varying vec3 vV;
void main() {
  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));
  gl_FragColor = vec4(vCol.rgb * (0.7 + 0.6 * rim), vCol.a * (0.45 + 0.55 * rim * rim));
  #include <colorspace_fragment>
}`;

const MAX_GHOSTS = 256;

export class NestGhosts {
  readonly group = new Group();
  private layers: { mesh: InstancedMesh; col: InstancedBufferAttribute }[] = [];
  private m = new Matrix4();
  private q = new Quaternion();
  private s = new Vector3();
  private p = new Vector3();
  private c = new Color();

  constructor() {
    this.group.name = 'nest:ghosts';
    for (const onTop of [false, true]) {
      const geo = new SphereGeometry(1, 32, 20);
      const col = new InstancedBufferAttribute(new Float32Array(MAX_GHOSTS * 4), 4);
      col.setUsage(DynamicDrawUsage);
      geo.setAttribute('iCol', col);
      const mat = new ShaderMaterial({
        name: onTop ? 'nest:ghost-top' : 'nest:ghost', vertexShader: VERT, fragmentShader: FRAG,
        transparent: true, depthWrite: false, depthTest: !onTop,
      });
      const mesh = new InstancedMesh(geo, mat, MAX_GHOSTS);
      mesh.count = 0;
      mesh.renderOrder = GHOST_RENDER_ORDER + (onTop ? 1 : 0);
      mesh.frustumCulled = false;
      this.layers.push({ mesh, col });
      this.group.add(mesh);
    }
  }

  /** Replaces the ghost list (at most 256 per layer). */
  set(list: readonly NestGhost[]): void {
    const counts = [0, 0];
    for (const g of list) {
      const li = g.onTop ? 1 : 0;
      const L = this.layers[li];
      const i = counts[li];
      if (i >= MAX_GHOSTS) continue;
      this.p.set(g.center.x, g.center.y, g.center.z);
      this.s.set(g.radii.x, g.radii.y, g.radii.z);
      if (g.rotation) this.q.set(g.rotation.x, g.rotation.y, g.rotation.z, g.rotation.w); else this.q.identity();
      L.mesh.setMatrixAt(i, this.m.compose(this.p, this.q, this.s));
      this.c.set(g.color);
      L.col.setXYZW(i, this.c.r, this.c.g, this.c.b, g.opacity ?? 0.35);
      counts[li] = i + 1;
    }
    this.layers.forEach((L, li) => {
      L.mesh.count = counts[li];
      L.mesh.instanceMatrix.needsUpdate = true;
      L.col.needsUpdate = true;
    });
  }

  get count(): number {
    return this.layers[0].mesh.count + this.layers[1].mesh.count;
  }

  dispose(): void {
    for (const L of this.layers) { L.mesh.geometry.dispose(); (L.mesh.material as ShaderMaterial).dispose(); L.mesh.dispose(); }
    this.group.clear();
  }
}
