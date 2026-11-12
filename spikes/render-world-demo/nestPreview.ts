/**
 * Demo-only stand-in for the nest renderer (render-nest owns the real one): marching-cubes meshes of the carve
 * grid in a plain dark soil material, with the kernel's substrate attribute discarding the parts that poke into
 * open air. It lets the demo show that a breach really opens into a tunnel.
 */
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Kernel } from '@/sim/kernel';

export class NestPreview {
  readonly group = new Group();
  private material: MeshStandardMaterial;

  constructor() {
    this.group.name = 'demo:nest-preview';
    this.material = new MeshStandardMaterial({ color: 0x3a2a1d, roughness: 0.95 });
    this.material.onBeforeCompile = (s) => {
      s.vertexShader = s.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSub; varying float vSub;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSub = aSub;');
      s.fragmentShader = s.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSub;')
        .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (vSub > -0.2) discard;');
    };
    this.material.customProgramCacheKey = () => 'demo-nest-preview';
  }

  rebuild(kernel: Kernel): void {
    for (const c of [...this.group.children]) { (c as Mesh).geometry.dispose(); this.group.remove(c); }
    for (const key of kernel.meshKeys()) {
      const m = kernel.meshChunk(key);
      if (!m || m.indices.length === 0) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(m.positions, 3));
      g.setAttribute('normal', new BufferAttribute(m.normals, 3));
      g.setAttribute('aSub', new BufferAttribute(m.substrate, 1));
      g.setIndex(new BufferAttribute(m.indices, 1));
      g.computeBoundingSphere();
      const mesh = new Mesh(g, this.material);
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }
}
