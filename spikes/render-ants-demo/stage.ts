/**
 * The demo's surroundings (not part of the ant renderer): sky-gradient environment map for cuticle reflections,
 * sun + hemisphere light, a procedural soil ground, scattered grains for scale, and a wall with an overhang for the
 * wall / ceiling walkers. The sun's shadow frustum follows the camera target.
 */
import {
  BackSide, BoxGeometry, Color, DirectionalLight, Fog, HemisphereLight, IcosahedronGeometry, InstancedMesh, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, PMREMGenerator, Scene, ShaderMaterial, SphereGeometry, Vector3, type WebGLRenderer,
} from 'three';
import { mulberry32 } from './demoSim';

const SKY = new Color('#cdd3d6');
export const SUN_DIR = new Vector3(-0.5, 0.62, 0.35).normalize();

export interface Stage { scene: Scene; sun: DirectionalLight; ground: Mesh; grains: InstancedMesh; wall: Object3D; fog: Fog }

export function createStage(renderer: WebGLRenderer, shadows: boolean): Stage {
  const scene = new Scene();
  scene.background = SKY;
  const fog = new Fog(SKY, 200, 2000);
  scene.fog = fog;
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.75;
  scene.add(new HemisphereLight(0xc4d6f0, 0x5a4530, 0.65));
  const sun = new DirectionalLight(0xfff0d8, 3.2);
  sun.castShadow = shadows; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const ground = new Mesh(new PlaneGeometry(6000, 6000, 1, 1).rotateX(-Math.PI / 2), soilMaterial());
  ground.receiveShadow = true; scene.add(ground);
  const grains = makeGrains(5, 900, 40, 0.08, 0.7);
  scene.add(grains);
  const wall = makeWall();
  scene.add(wall);
  return { scene, sun, ground, grains, wall, fog };
}

/** Re-fits the sun's shadow camera around the focus (crisp leg shadows in close-ups, shadows near the focus in crowds). */
export function fitSun(sun: DirectionalLight, target: Vector3, dist: number): void {
  const sz = Math.min(Math.max(dist * 0.55, 6), 260);
  const sc = sun.shadow.camera;
  sun.position.copy(SUN_DIR).multiplyScalar(sz * 4).add(target); sun.target.position.copy(target); sun.target.updateMatrixWorld();
  sc.left = -sz; sc.right = sz; sc.top = sz; sc.bottom = -sz; sc.near = sz * 0.5; sc.far = sz * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = sz * 0.0015;
}

function skyEnvironment(renderer: WebGLRenderer) {
  const env = new Scene();
  env.add(new Mesh(new SphereGeometry(10, 32, 16), new ShaderMaterial({
    side: BackSide, depthWrite: false,
    vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vD; void main(){
      float y = vD.y; vec3 sky = mix(vec3(0.62,0.72,0.86), vec3(0.32,0.48,0.75), clamp(y,0.0,1.0));
      vec3 ground = mix(vec3(0.32,0.25,0.18), vec3(0.16,0.12,0.09), clamp(-y*2.0,0.0,1.0));
      vec3 c = mix(ground, y > 0.0 ? sky : ground, smoothstep(-0.05, 0.05, y));
      float sun = pow(max(dot(vD, normalize(vec3(-0.5,0.62,0.35))), 0.0), 400.0) * 40.0;
      gl_FragColor = vec4(c * 1.2 + vec3(1.0,0.92,0.8) * sun, 1.0); }`,
  })));
  const pm = new PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0, 0.1, 100).texture;
  pm.dispose();
  return tex;
}

function soilMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
float gh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float gfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * gn(p); p *= 2.03; a *= 0.5; } return s; }
float soilH(vec2 p){ return gfbm(p * 0.35) * 0.25 + gn(p * 3.1) * 0.06 + gn(p * 8.3) * 0.025; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { vec2 p = vGW.xz;
    float big = gfbm(p * 0.012), mid = gfbm(p * 0.18), g1 = gn(p * 3.1), g2 = gn(p * 8.3);
    vec3 c = mix(vec3(0.16, 0.115, 0.08), vec3(0.42, 0.33, 0.24), clamp(big * 0.7 + mid * 0.5 - 0.15, 0.0, 1.0));
    c *= 0.72 + 0.45 * g1 * (0.7 + 0.3 * g2);
    float sand = smoothstep(0.86, 0.95, gn(p * 11.0 + 7.0)) * smoothstep(0.3, 0.7, gn(p * 0.9));
    diffuseColor.rgb = mix(c, vec3(0.5, 0.44, 0.37), sand * 0.45); }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  { float h = soilH(vGW.xz) * smoothstep(400.0, 40.0, length(vViewPosition));
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition); vec2 dH = vec2(dFdx(h), dFdy(h));
    vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx); float det = dot(dpx, R1);
    normal = normalize(abs(det) * normal - sign(det) * (dH.x * R1 + dH.y * R2)); }`);
  };
  return m;
}

/** Sand grains / pebbles around the origin (scale cues), keeping the hero's footprint clear. */
function makeGrains(seed: number, n: number, radius: number, minR: number, maxR: number): InstancedMesh {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position'); const r0 = mulberry32(seed);
  for (let i = 0; i < pos.count; i++) { const f = 0.85 + 0.3 * r0(); pos.setXYZ(i, pos.getX(i) * f, pos.getY(i) * f * 0.8, pos.getZ(i) * f); }
  g.computeVertexNormals();
  const m = new InstancedMesh(g, new MeshStandardMaterial({ roughness: 0.75, metalness: 0 }), n);
  const rnd = mulberry32(seed + 1); const o = new Object3D(); const col = new Color();
  const palette = ['#8c7a66', '#b8a58b', '#6e5a47', '#d6cbb8', '#9a8a7a', '#5b4a3c'];
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2, r = 9 + Math.sqrt(rnd()) * (radius - 9);
    const s = minR + (maxR - minR) * Math.pow(rnd(), 3);
    o.position.set(Math.cos(a) * r, s * 0.25, Math.sin(a) * r);
    o.rotation.set(rnd() * 3, rnd() * 6, rnd() * 3); o.scale.set(s * (0.8 + 0.4 * rnd()), s * (0.5 + 0.3 * rnd()), s);
    o.updateMatrix(); m.setMatrixAt(i, o.matrix);
    m.setColorAt(i, col.set(palette[Math.floor(rnd() * palette.length)]!).multiplyScalar(0.7 + 0.5 * rnd()));
  }
  m.castShadow = true; m.receiveShadow = true;
  return m;
}

/** A stone block at x = 200 (its -X face is the wall) with an overhanging slab whose underside is at y = 30 mm. */
export const WALL = { x: 200, ceilingY: 30, ceilingX0: 150 };
function makeWall(): Object3D {
  const o = new Object3D();
  const mat = new MeshStandardMaterial({ color: '#8f8576', roughness: 0.85 });
  const block = new Mesh(new BoxGeometry(40, 60, 80), mat); block.position.set(WALL.x + 20, 30, 0);
  const slab = new Mesh(new BoxGeometry(70, 6, 80), mat); slab.position.set(WALL.ceilingX0 + 35, WALL.ceilingY + 3, 0);
  for (const m of [block, slab]) { m.castShadow = true; m.receiveShadow = true; o.add(m); }
  o.visible = false;
  return o;
}
