// Image-based light from the sky dome: the same dome shader (without the sun disc, the DirectionalLight carries the
// sun) rendered into a PMREM cube -> scene.environment, so ambient and reflections always match the visible sky
// (spike-look.md 2.3). Re-baking is expensive under software GL, so it happens only when the sun moved more than a
// few degrees or the weather changed, and at most once per ENV_REBAKE_MIN_S.
import { Mesh, PMREMGenerator, Scene, SphereGeometry, type Texture, type WebGLRenderer, type WebGLRenderTarget } from 'three';
import { createSkyMaterial, type SkyUniforms } from './skyDome';

export class SkyEnvironment {
  private scene = new Scene();
  private pmrem: PMREMGenerator;
  private target: WebGLRenderTarget | null = null;
  private lastKey = '';
  private lastSun = { x: 0, y: -2, z: 0 };
  private lastBakeS = -1e9;
  bakes = 0;

  constructor(renderer: WebGLRenderer, private uniforms: SkyUniforms) {
    const mesh = new Mesh(new SphereGeometry(100, 32, 16), createSkyMaterial(uniforms));
    this.scene.add(mesh);
    this.pmrem = new PMREMGenerator(renderer);
  }

  get texture(): Texture | null {
    return this.target?.texture ?? null;
  }

  /**
   * Re-bakes when needed. `key` summarises discrete changes (weather, underground); the sun direction is
   * compared by angle. `nowS` is REAL time (the animation clock may be frozen); `force` bakes any pending change
   * at once (settle frames, screenshots). Returns true if a new texture was produced.
   */
  update(nowS: number, key: string, rebakeDeg: number, minIntervalS: number, force = false): boolean {
    const s = this.uniforms.sunDir.value;
    const cos = s.x * this.lastSun.x + s.y * this.lastSun.y + s.z * this.lastSun.z;
    const changed = !this.target || key !== this.lastKey || cos < Math.cos((rebakeDeg * Math.PI) / 180);
    if (!changed) return false;
    if (!force && nowS - this.lastBakeS < minIntervalS) return false;
    this.uniforms.envPass.value = 1;
    const rt = this.pmrem.fromScene(this.scene, 0, 0.1, 1000);
    this.uniforms.envPass.value = 0;
    this.target?.dispose();
    this.target = rt;
    this.lastKey = key;
    this.lastSun = { x: s.x, y: s.y, z: s.z };
    this.lastBakeS = nowS;
    this.bakes++;
    return true;
  }

  dispose(): void {
    this.target?.dispose();
    this.pmrem.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.isMesh) { m.geometry.dispose(); (m.material as { dispose(): void }).dispose(); }
    });
  }
}
