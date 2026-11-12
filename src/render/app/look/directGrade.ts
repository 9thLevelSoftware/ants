// The colour grade on the path without post-processing (test / low presets). Renderer tone mapping only runs when
// drawing to the screen, and the grade must act on linear HDR colour before it, so the scene is drawn into a HalfFloat
// target (with MSAA samples when the preset asks for MSAA) and one full-screen triangle grades, tone maps (the
// renderer's ACES and exposure through <tonemapping_fragment>) and converts to sRGB. The pass is skipped while the
// grade is neutral, so a neutral frame costs exactly what it did before.
import {
  BufferGeometry, Float32BufferAttribute, HalfFloatType, Mesh, OrthographicCamera, Scene, ShaderMaterial, UnsignedByteType, Vector2, Vector3, WebGLRenderTarget,
  type Camera, type Texture, type WebGLRenderer,
} from 'three';
import { GRADE_GLSL, isNeutralGrade, neutralGrade, type GradeParams } from './grade';

/** MSAA samples of the scene target when the preset asks for MSAA (matches the default framebuffer's 4x). */
export const DIRECT_GRADE_MSAA_SAMPLES = 4;

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tScene;
uniform float uGradeSat;
uniform vec3 uGradeGain;
varying vec2 vUv;
${GRADE_GLSL}
void main() {
  vec4 c = texture2D(tScene, vUv);
  gl_FragColor = vec4(lookGrade(c.rgb, uGradeSat, uGradeGain), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** One triangle covering the screen (uv 0..1 over the visible part). */
function fullScreenTriangle(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  return g;
}

export class DirectGrade {
  readonly grade: GradeParams = neutralGrade();
  readonly material: ShaderMaterial;
  private readonly quad: Mesh;
  private readonly quadScene = new Scene();
  private readonly quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private target: WebGLRenderTarget | null = null;
  private samples = 0;
  private readonly size = new Vector2();

  constructor() {
    this.material = new ShaderMaterial({
      name: 'look:direct-grade', vertexShader: VERTEX, fragmentShader: FRAGMENT, depthTest: false, depthWrite: false,
      uniforms: { tScene: { value: null as Texture | null }, uGradeSat: { value: 1 }, uGradeGain: { value: new Vector3(1, 1, 1) } },
    });
    this.quad = new Mesh(fullScreenTriangle(), this.material);
    this.quad.frustumCulled = false;
    this.quadScene.add(this.quad);
  }

  /** True when the next frame needs the grading pass (the grade is not neutral). */
  get active(): boolean {
    return !isNeutralGrade(this.grade);
  }

  set(g: GradeParams): void {
    this.grade.saturation = g.saturation;
    this.grade.gain[0] = g.gain[0]; this.grade.gain[1] = g.gain[1]; this.grade.gain[2] = g.gain[2];
    this.material.uniforms.uGradeSat!.value = g.saturation;
    (this.material.uniforms.uGradeGain!.value as Vector3).set(g.gain[0], g.gain[1], g.gain[2]);
  }

  /** MSAA of the scene target: on when the preset asks for MSAA on the direct path. */
  setMsaa(on: boolean): void {
    const s = on ? DIRECT_GRADE_MSAA_SAMPLES : 0;
    if (s === this.samples) return;
    this.samples = s;
    this.releaseTarget();
  }

  /** Draws the scene graded to the screen. */
  render(renderer: WebGLRenderer, scene: Scene, camera: Camera): void {
    renderer.getDrawingBufferSize(this.size);
    const w = Math.max(1, this.size.x), h = Math.max(1, this.size.y);
    if (!this.target) {
      // HDR target where float colour buffers exist (all WebGL2 desktop GPUs we target); 8-bit otherwise
      const ext = renderer.extensions;
      const type = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float') ? HalfFloatType : UnsignedByteType;
      this.target = new WebGLRenderTarget(w, h, { type, samples: this.samples, depthBuffer: true, stencilBuffer: false });
      this.target.texture.name = 'look:direct-grade';
    } else if (this.target.width !== w || this.target.height !== h) this.target.setSize(w, h);
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(prev);
    this.material.uniforms.tScene!.value = this.target.texture;
    renderer.render(this.quadScene, this.quadCamera);
  }

  /** Frees the scene target (it is rebuilt on the next graded frame). */
  releaseTarget(): void {
    this.target?.dispose();
    this.target = null;
    this.material.uniforms.tScene!.value = null;
  }

  dispose(): void {
    this.releaseTarget();
    this.quad.geometry.dispose();
    this.material.dispose();
  }
}
