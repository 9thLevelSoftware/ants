/**
 * Post chain (pmndrs postprocessing 6.39.6):
 *   RenderPass -> EffectPass[ DoF (macro CoC), Bloom (HDR threshold), ACES tone map, Grade, Vignette ] -> EffectPass[ SMAA | FXAA ]
 * Low quality drops DoF/bloom/AA; the presets are in quality.ts.
 *
 * Macro depth of field: postprocessing's stock CoC is linear in |distance - focus| (smoothstep over focusRange in
 * world units). A real lens has CoC proportional to |1 - focus/distance|, i.e. foreground blur grows much faster
 * than background blur - that asymmetry is what makes a shot read as "macro". The CoC shader is patched to
 *   coc = smoothstep(dead, dead + range, |1 - focus / distance|)
 * where `dead` keeps the whole 4 mm subject sharp and `range` sets how quickly things fall out of focus.
 */
import {
  BloomEffect, BlendFunction, DepthOfFieldEffect, Effect, EffectComposer, EffectPass, FXAAEffect, KernelSize, RenderPass,
  SMAAEffect, SMAAPreset, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing';
import { HalfFloatType, Uniform, Vector3 } from 'three';
import type { Camera, Scene, WebGLRenderer } from 'three';
import type { QualityPreset } from './quality';

export class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', /* glsl */`
      uniform float saturation; uniform vec3 lift; uniform vec3 gain; uniform float contrast;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb, 0.0);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, saturation);
        c = c * gain + lift * (1.0 - c);
        c = mix(vec3(0.18), c, contrast);
        outputColor = vec4(max(c, 0.0), inputColor.a);
      }`, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ['saturation', new Uniform(1)], ['lift', new Uniform(new Vector3(0, 0, 0))], ['gain', new Uniform(new Vector3(1, 1, 1))], ['contrast', new Uniform(1)],
      ]),
    });
  }
  set(saturation: number, lift: [number, number, number], gain: [number, number, number], contrast = 1) {
    this.uniforms.get('saturation')!.value = saturation;
    (this.uniforms.get('lift')!.value as Vector3).set(...lift);
    (this.uniforms.get('gain')!.value as Vector3).set(...gain);
    this.uniforms.get('contrast')!.value = contrast;
  }
}

export interface PostChain {
  composer: EffectComposer; renderPass: RenderPass;
  dof: DepthOfFieldEffect | null; bloom: BloomEffect | null; tone: ToneMappingEffect; grade: GradeEffect; vignette: VignetteEffect;
  aa: SMAAEffect | FXAAEffect | null; mainPass: EffectPass; aaPass: EffectPass | null;
  ready: Promise<void>;
  setDofParams(dead: number, range: number): void;
  /** for the stage benchmark: rebuild the effect passes with a subset of effects */
  configure(on: { dof: boolean; bloom: boolean; aa: boolean }): void;
}

export function buildPost(renderer: WebGLRenderer, scene: Scene, camera: Camera, q: QualityPreset, subject: Vector3): PostChain {
  const composer = new EffectComposer(renderer, { frameBufferType: HalfFloatType, multisampling: 0 });
  const renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  let dof: DepthOfFieldEffect | null = null;
  const cocUniforms: { dead: Uniform; range: Uniform } = { dead: new Uniform(0.06), range: new Uniform(0.5) };
  if (q.post.dof) {
    dof = new DepthOfFieldEffect(camera, { focusDistance: 25, focusRange: 0.5, bokehScale: 4, resolutionScale: q.post.dofRes });
    dof.target = subject; // auto-focus on the controlled ant every frame
    const cm = dof.cocMaterial as unknown as { fragmentShader: string; uniforms: Record<string, Uniform>; needsUpdate: boolean };
    const before = cm.fragmentShader;
    cm.fragmentShader = before
      .replace('uniform float focusRange;', 'uniform float focusRange;uniform float cocDead;uniform float cocRange;')
      .replace('float magnitude=smoothstep(0.0,focusRange,abs(signedDistance));',
        'float magnitude=smoothstep(cocDead,cocDead+cocRange,abs(1.0-focusDistance/max(distance,1e-3)));');
    if (cm.fragmentShader === before) console.warn('[look] DoF CoC patch did not apply');
    cm.uniforms.cocDead = cocUniforms.dead; cm.uniforms.cocRange = cocUniforms.range; cm.needsUpdate = true;
  }
  const bloom = q.post.bloom ? new BloomEffect({ intensity: 0.4, luminanceThreshold: 1.0, luminanceSmoothing: 0.3, mipmapBlur: true, radius: 0.7, levels: q.post.bloomLevels }) : null;
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC });
  const grade = new GradeEffect();
  const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 });
  let aa: SMAAEffect | FXAAEffect | null = null;
  let ready = Promise.resolve();
  if (q.post.aa === 'smaa') {
    const smaa = new SMAAEffect({ preset: q.post.smaaPreset === 'ultra' ? SMAAPreset.ULTRA : SMAAPreset.HIGH });
    aa = smaa;
    ready = new Promise<void>((res) => {
      (smaa as unknown as { addEventListener(t: string, f: () => void): void }).addEventListener('load', () => res());
      setTimeout(res, 3000); // the LUT images are data URLs; never block forever
    });
  } else if (q.post.aa === 'fxaa') aa = new FXAAEffect();

  let mainPass!: EffectPass; let aaPass: EffectPass | null = null;
  const configure = (on: { dof: boolean; bloom: boolean; aa: boolean }) => {
    for (const p of [mainPass, aaPass]) if (p) { composer.removePass(p); }
    const fx: Effect[] = [];
    if (dof && on.dof) fx.push(dof);
    if (bloom && on.bloom) fx.push(bloom);
    fx.push(tone, grade, vignette);
    mainPass = new EffectPass(camera, ...fx);
    composer.addPass(mainPass);
    aaPass = aa && on.aa ? new EffectPass(camera, aa) : null;
    if (aaPass) composer.addPass(aaPass);
  };
  configure({ dof: true, bloom: true, aa: true });
  void KernelSize;
  return {
    composer, renderPass, dof, bloom, tone, grade, vignette, aa, get mainPass() { return mainPass; }, get aaPass() { return aaPass; }, ready,
    setDofParams(dead, range) { cocUniforms.dead.value = dead; cocUniforms.range.value = range; },
    configure,
  };
}
