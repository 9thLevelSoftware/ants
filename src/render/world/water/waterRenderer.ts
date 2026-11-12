// Water surfaces as one mesh: discs for bodies (bowls, gullies, static puddles) and flat sheets over wet puddle
// cells. Rebuilt only when the water changes: body levels and inputs are compared every frame, the puddle store
// (a whole moisture grid) every DECOR_WATCH_FRAMES frames or when its array is replaced.
import { BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3 } from 'three';
import type { Sim } from '@/sim/types';
import type { GroundView } from '../decor/ground';
import type { DecorShared } from '../decor/shared';
import { createWaterMaterial } from './waterMaterial';
import { DECOR_WATCH_FRAMES } from '../decor/tuning';
import {
  collectWater, puddleSignature, puddleStore, waterLevelSignature, type WaterInputs, type WaterSurface,
} from './waterSurfaces';

const DISC_SEGMENTS = 48;

/** Triangle soup of all surfaces: position (y = level) and aWater (cx, cz, radius, vessel depth or -1). */
export function buildWaterGeometry(list: readonly WaterSurface[]): BufferGeometry | null {
  const pos: number[] = [], aw: number[] = [];
  const vert = (x: number, y: number, z: number, w: [number, number, number, number]) => { pos.push(x, y, z); aw.push(...w); };
  for (const s of list) {
    if (s.kind === 'disc') {
      const w: [number, number, number, number] = [s.x, s.z, s.r, s.vesselDepth];
      for (let i = 0; i < DISC_SEGMENTS; i++) {
        const a0 = (i / DISC_SEGMENTS) * Math.PI * 2, a1 = ((i + 1) / DISC_SEGMENTS) * Math.PI * 2;
        vert(s.x, s.y, s.z, w);
        vert(s.x + Math.cos(a1) * s.r, s.y, s.z + Math.sin(a1) * s.r, w);
        vert(s.x + Math.cos(a0) * s.r, s.y, s.z + Math.sin(a0) * s.r, w);
      }
    } else {
      const w: [number, number, number, number] = [0, 0, 0, -1];
      for (let i = 0; i < s.rects.length; i += 4) {
        const [x0, z0, x1, z1] = [s.rects[i], s.rects[i + 1], s.rects[i + 2], s.rects[i + 3]];
        vert(x0, s.y, z0, w); vert(x0, s.y, z1, w); vert(x1, s.y, z0, w);
        vert(x1, s.y, z0, w); vert(x0, s.y, z1, w); vert(x1, s.y, z1, w);
      }
    }
  }
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('aWater', new BufferAttribute(new Float32Array(aw), 4));
  const n = new Float32Array(pos.length);
  for (let i = 1; i < n.length; i += 3) n[i] = 1;
  g.setAttribute('normal', new BufferAttribute(n, 3));
  g.computeBoundingSphere();
  if (!g.boundingSphere) g.boundingSphere = new Sphere(new Vector3(), 1e9);
  return g;
}

export class WaterRenderer {
  readonly group = new Group();
  private mesh: Mesh | null = null;
  private readonly material;
  private levelSig = Number.NaN;
  private puddleSig = Number.NaN;
  private puddleRef: Uint8Array | null = null;
  private frame = 0;
  surfaces: WaterSurface[] = [];

  constructor(shared: DecorShared) {
    this.group.name = 'decor:water';
    this.material = createWaterMaterial(shared);
  }

  update(ground: GroundView, sim: Sim | null, inputs: WaterInputs): void {
    const ls = waterLevelSignature(ground.world, sim, inputs), store = puddleStore(sim);
    let ps = this.puddleSig;
    if (store !== this.puddleRef || this.frame++ % DECOR_WATCH_FRAMES === 0) { ps = puddleSignature(store); this.puddleRef = store; }
    if (ls === this.levelSig && ps === this.puddleSig) return;
    this.levelSig = ls;
    this.puddleSig = ps;
    this.surfaces = collectWater(ground, sim, inputs);
    this.clear();
    const g = buildWaterGeometry(this.surfaces);
    if (!g) return;
    this.mesh = new Mesh(g, this.material);
    this.mesh.name = 'decor:water:surfaces';
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    this.group.add(this.mesh);
  }

  /** Forget the current surfaces (new world). */
  reset(): void {
    this.levelSig = this.puddleSig = Number.NaN;
    this.puddleRef = null;
    this.frame = 0;
    this.surfaces = [];
    this.clear();
  }

  private clear(): void {
    if (!this.mesh) return;
    this.group.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh = null;
  }

  get triangles(): number {
    const p = this.mesh?.geometry.getAttribute('position');
    return p ? p.count / 3 : 0;
  }

  dispose(): void {
    this.clear();
    this.material.dispose();
  }
}
