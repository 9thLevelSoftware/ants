/**
 * Stand-in 4 mm Lasius niger worker (the real procedural model comes from spikes/ants): ellipsoid tagmata,
 * tube legs/antennae in a mid-stride pose, glossy dark cuticle (clearcoat), plus a contact-shadow decal and a
 * soft glow sprite + point light used by the underground "scent-lit" look.
 * Local frame: forward = -Z, up = +Y, origin between the feet on the ground.
 */
import {
  AdditiveBlending, Color, Group, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, PlaneGeometry, PointLight, Sprite,
  SpriteMaterial, Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ellipsoid, paint, strip, tube } from './geom';
import { addPatch } from './shaders';
import { Uniform } from 'three';
import { softDiscTexture } from './textures';

export function buildAnt() {
  const body = new Color('#2a201a'), leg = new Color('#4a3729'), eye = new Color('#0b0a09'), gas = new Color('#2d231c');
  const V = (x: number, y: number, z: number) => new Vector3(x, y, z);
  const parts = [
    paint(ellipsoid(V(0, 0.92, -1.12), V(0.46, 0.36, 0.5), 14), body),          // head
    paint(ellipsoid(V(0, 0.98, -0.42), V(0.3, 0.3, 0.42), 12), body),           // pronotum
    paint(ellipsoid(V(0, 0.9, 0.08), V(0.22, 0.24, 0.3), 10), body),            // meso/propodeum
    paint(ellipsoid(V(0, 0.82, 0.42), V(0.12, 0.24, 0.07), 8), body),           // petiole scale
    paint(ellipsoid(V(0, 0.95, 1.28), V(0.62, 0.55, 0.82), 16), gas),           // gaster
    paint(ellipsoid(V(0.38, 1.0, -1.18), V(0.1, 0.13, 0.16), 6), eye),          // eyes
    paint(ellipsoid(V(-0.38, 1.0, -1.18), V(0.1, 0.13, 0.16), 6), eye),
  ];
  // mandibles
  for (const s of [1, -1]) parts.push(paint(tube([V(0.18 * s, 0.75, -1.52), V(0.14 * s, 0.68, -1.72), V(0.02 * s, 0.66, -1.8)], (t) => 0.07 - 0.04 * t, 6, 5), leg));
  // antennae: scape up/forward/out, funiculus forward/down (elbowed), slight club
  for (const s of [1, -1]) {
    const sock = V(0.17 * s, 1.08, -1.42), elbow = V(0.62 * s, 1.55, -1.9);
    parts.push(paint(tube([sock, V(0.4 * s, 1.35, -1.68), elbow], () => 0.045, 8, 5), leg));
    parts.push(paint(tube([elbow, V(0.78 * s, 1.35, -2.35), V(0.86 * s, 0.95, -2.75)], (t) => 0.04 + 0.025 * t * t, 10, 5), leg));
  }
  // legs (coxa at the mesosoma underside -> femur up/out -> tibia down -> tarsus on the ground), tripod stance
  const legs: [number, number, number][] = [[-0.5, -1.0, 0.25], [0.0, -0.25, -0.15], [0.12, 0.9, 0.2]]; // [attach z, foot dz, stride phase offset]
  legs.forEach(([az, fz, ph], pair) => {
    for (const s of [1, -1]) {
      const stride = (pair === 1 ? -1 : 1) * s * 0.35 + ph * 0.3;
      const a = V(0.12 * s, 0.72, az), knee = V(0.75 * s, 1.15, az + fz * 0.35 + stride * 0.4);
      const ankle = V(1.25 * s, 0.35, az + fz * 0.8 + stride * 0.8), foot = V(1.42 * s, 0.02, az + fz + stride);
      parts.push(paint(tube([a, a.clone().lerp(knee, 0.5).add(V(0, 0.08, 0)), knee], () => 0.075, 8, 6), leg));
      parts.push(paint(tube([knee, knee.clone().lerp(ankle, 0.5).add(V(0.05 * s, 0.05, 0)), ankle], () => 0.055, 8, 6), leg));
      parts.push(paint(tube([ankle, ankle.clone().lerp(foot, 0.5).add(V(0, 0.05, 0)), foot], (t) => 0.04 - 0.012 * t, 6, 5), leg));
    }
  });
  const g = mergeGeometries(parts.map((p) => strip(p)))!;
  const mat = new MeshPhysicalMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.3, sheenRoughness: 0.5, sheenColor: new Color(0.55, 0.48, 0.4), // fine pubescence -> sheen
  });
  // scent glow for the controlled ant (underground): fresnel rim emission, picked up by bloom
  const uRim = new Uniform(new Color(0, 0, 0));
  addPatch(mat, 'antRim', (s) => {
    s.uniforms.uRim = uRim;
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\ntotalEmissiveRadiance += uRim * pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.5);');
  });
  const mesh = new Mesh(g, mat); mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = 'ant';
  // contact shadow (ambient occlusion under the body; the shadow map is too coarse for 0.1 mm legs)
  const cs = new Mesh(new PlaneGeometry(4.0, 6.2), new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.38, depthWrite: false, alphaMap: softDiscTexture() }));
  cs.rotation.x = -Math.PI / 2; cs.position.set(0, 0.05, 0.1); cs.renderOrder = 1;
  const group = new Group(); group.add(mesh, cs); group.name = 'antRig';
  // underground scent-glow: halo sprite + warm point light (off on the surface)
  const halo = new Sprite(new SpriteMaterial({ map: softDiscTexture(), color: new Color(1.0, 0.6, 0.25).multiplyScalar(0.025), blending: AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  halo.scale.set(5, 5, 1); halo.position.set(0, 1.0, 0.2); halo.visible = false;
  const glow = new PointLight(new Color(1.0, 0.62, 0.32), 0, 80, 1.4); glow.position.set(0, 4.5, 0.6); glow.visible = false;
  group.add(halo, glow);
  return { group, mesh, mat, halo, glow, contact: cs, rim: uRim };
}
