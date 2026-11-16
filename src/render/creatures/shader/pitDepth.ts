/**
 * Drawing a hole below an unbroken ground mesh (the antlion pit is a hazard record, not a carve: GDD 05 §2.2 /
 * creatures README). The renderer has no stencil buffer, so the pit's own fragments are given a depth just in front
 * of the pit's rim plane instead of their real depth:
 *
 *   t_out = min(t_real, t_plane - uPitBias + uPitK * (t_real - t_plane))       (distances along the view ray, mm)
 *
 * so the ground lying across the opening (just under the rim plane) loses the depth test inside the opening, while
 * anything in front of the plane (an ant on the rim, a stone, the near ground seen at a low angle) still hides the
 * pit. The small uPitK keeps the order of the pit's own surfaces (the buried antlion stays under the sand). In the
 * fragment shader, a fragment below the plane whose view ray enters the plane outside the rim is discarded: that
 * part of the pit is behind the near ground. Assumes a horizontal rim plane (pits are on level dry sand).
 *
 * Mesh pits use the uniforms uPitC (rim centre on the plane) and uPitR; the instanced antlion takes them from its
 * instance (translation + aPose.x up, radius aPose.y; see CreatureRenderer). A radius of 0 switches the rule off
 * (sunk pits, props/pitRenderer.ts).
 */
export const PIT_VERT_PARS = /* glsl */ `
uniform float uPitBias;
uniform float uPitK;
varying vec3 vPitW;
varying vec3 vPitC;
varying float vPitR;
void pitDepth(vec3 wp, vec3 pitC, float pitR) {
  vPitW = wp; vPitC = pitC; vPitR = pitR;
  if (pitR <= 0.0) return; // sunk pit: the ground already follows it, real depths are right
  vec3 d = wp - cameraPosition; float tReal = length(d); d /= max(tReal, 1e-6);
  float tPlane = d.y < -1e-5 ? (pitC.y - cameraPosition.y) / d.y : tReal;
  float tOut = min(tReal, tPlane - uPitBias + uPitK * max(0.0, tReal - tPlane));
  tOut = max(tOut, 1e-3);
  vec4 c = projectionMatrix * viewMatrix * vec4(cameraPosition + d * tOut, 1.0);
  gl_Position.z = c.z / c.w * gl_Position.w;
}
`;

/** After <project_vertex> of a plain mesh (uniforms). */
export const PIT_VERT_MESH = /* glsl */ `
#include <project_vertex>
pitDepth((modelMatrix * vec4(transformed, 1.0)).xyz, uPitC, uPitR);
`;
export const PIT_VERT_MESH_PARS = /* glsl */ `uniform vec3 uPitC;\nuniform float uPitR;\n`;

/** After <project_vertex> of an instanced creature (pit from the instance). */
export const PIT_VERT_INSTANCE = /* glsl */ `
#include <project_vertex>
#ifdef USE_INSTANCING
pitDepth((modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz, (modelMatrix * vec4(instanceMatrix[3].xyz, 1.0)).xyz + vec3(0.0, aPose.x, 0.0), aPose.y);
#endif
`;

export const PIT_FRAG_PARS = /* glsl */ `
varying vec3 vPitW;
varying vec3 vPitC;
varying float vPitR;
`;

/** At the start of the fragment shader: discard pit fragments seen through the near ground. */
export const PIT_FRAG_CLIP = /* glsl */ `
if (vPitR > 0.0 && vPitW.y < vPitC.y - 0.4) {
  vec3 d = normalize(vPitW - cameraPosition);
  if (d.y > -1e-5) discard;
  vec3 q = cameraPosition + d * ((vPitC.y - cameraPosition.y) / d.y);
  if (length(q.xz - vPitC.xz) > vPitR) discard;
}
#include <clipping_planes_fragment>
`;
