// Scene darkening under the overlays (GDD 08 §10.1: overlays darken the scene by 25 % to raise contrast): one
// full-screen triangle drawn after the opaque world and before the overlay layers.
import { BufferAttribute, BufferGeometry, Mesh, ShaderMaterial, type Scene } from 'three';
import { DIM_RENDER_ORDER } from './tuning';

export class DimLayer {
  readonly mesh: Mesh;
  private readonly material: ShaderMaterial;

  constructor(scene: Scene) {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    this.material = new ShaderMaterial({
      name: 'fx:overlay-dim',
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform float uDim; void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uDim); }',
      uniforms: { uDim: { value: 0 } },
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(g, this.material);
    this.mesh.name = 'fx:overlay-dim';
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = DIM_RENDER_ORDER;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  /** 0 = off. */
  set(dim: number): void {
    this.material.uniforms.uDim.value = dim;
    this.mesh.visible = dim > 0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
    this.mesh.removeFromParent();
  }
}
