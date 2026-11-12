// The colour grade as a pmndrs postprocessing effect: merged into the post chain's main EffectPass after bloom and
// before tone mapping, so it works on linear HDR colour exactly like the no-post path (DirectGrade).
import { Uniform, Vector3 } from 'three';
import { Effect } from 'postprocessing';
import { GRADE_GLSL, type GradeParams } from './grade';

const FRAGMENT = /* glsl */ `
uniform float uGradeSat;
uniform vec3 uGradeGain;
${GRADE_GLSL}
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  outputColor = vec4(lookGrade(inputColor.rgb, uGradeSat, uGradeGain), inputColor.a);
}
`;

export class GradeEffect extends Effect {
  private readonly sat: Uniform<number>;
  private readonly gain: Uniform<Vector3>;

  constructor(initial?: GradeParams) {
    const sat = new Uniform(1), gain = new Uniform(new Vector3(1, 1, 1));
    super('GradeEffect', FRAGMENT, { uniforms: new Map<string, Uniform>([['uGradeSat', sat], ['uGradeGain', gain]]) });
    this.sat = sat;
    this.gain = gain;
    if (initial) this.set(initial);
  }

  set(g: GradeParams): void {
    this.sat.value = g.saturation;
    this.gain.value.set(g.gain[0], g.gain[1], g.gain[2]);
  }

  /** Current uniform values (tests, debug). */
  get current(): GradeParams {
    const v = this.gain.value;
    return { saturation: this.sat.value, gain: [v.x, v.y, v.z] };
  }
}
