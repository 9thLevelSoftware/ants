/**
 * The demo's surroundings (not part of the creature renderer): sky-gradient environment, sun + hemisphere light, a
 * procedural soil / sand ground, and plain meshes for the demo plants' primitives (capsule stems, ellipsoid leaves).
 */
import {
  BackSide, CapsuleGeometry, Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, MeshStandardMaterial, PlaneGeometry,
  PMREMGenerator, Quaternion, Scene, ShaderMaterial, SphereGeometry, Vector3, type WebGLRenderer,
} from 'three';
import type { Primitive } from '@/sim/types';

const SKY = new Color('#cdd3d6');
export const SUN_DIR = new Vector3(-0.5, 0.62, 0.35).normalize();

export interface Stage { scene: Scene; sun: DirectionalLight; ground: Mesh; groundMat: MeshStandardMaterial; plants: Group; fog: Fog }

export function createStage(renderer: WebGLRenderer, shadows: boolean): Stage {
  const scene = new Scene();
  scene.background = SKY;
  const fog = new Fog(SKY, 400, 3000);
  scene.fog = fog;
  scene.environment = skyEnvironment(renderer);
  scene.environmentIntensity = 0.75;
  scene.add(new HemisphereLight(0xc4d6f0, 0x5a4530, 0.65));
  const sun = new DirectionalLight(0xfff0d8, 3.2);
  sun.castShadow = shadows; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004;
  scene.add(sun, sun.target);
  const groundMat = groundMaterial();
  const ground = new Mesh(new PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true; scene.add(ground);
  const plants = new Group(); scene.add(plants);
  return { scene, sun, ground, groundMat, plants, fog };
}

/** 0 = garden soil, 1 = dry play sand. */
export function setGround(st: Stage, sand: number): void {
  (st.groundMat.userData.uSand as { value: number }).value = sand;
}

export function fitSun(sun: DirectionalLight, target: Vector3, dist: number): void {
  const sz = Math.min(Math.max(dist * 0.55, 6), 300);
  const sc = sun.shadow.camera;
  sun.position.copy(SUN_DIR).multiplyScalar(sz * 4).add(target); sun.target.position.copy(target); sun.target.updateMatrixWorld();
  sc.left = -sz; sc.right = sz; sc.top = sz; sc.bottom = -sz; sc.near = sz * 0.5; sc.far = sz * 8; sc.updateProjectionMatrix();
  sun.shadow.normalBias = sz * 0.0015;
}

const plantMat = new MeshStandardMaterial({ color: '#5d7f34', roughness: 0.7, metalness: 0 });
const leafMat = new MeshStandardMaterial({ color: '#6b9440', roughness: 0.6, metalness: 0 });

/** Plain meshes for plant primitives (the game draws them with its primitive renderer). */
export function drawPlants(st: Stage, prims: readonly Primitive[]): void {
  for (const c of [...st.plants.children]) { st.plants.remove(c); (c as Mesh).geometry.dispose(); }
  for (const p of prims) {
    let m: Mesh;
    if (p.shape === 'capsule') m = new Mesh(new CapsuleGeometry(p.size.x, p.size.y * 2, 6, 16), plantMat);
    else if (p.shape === 'ellipsoid') { m = new Mesh(new SphereGeometry(1, 24, 12), leafMat); m.scale.set(p.size.x, p.size.y, p.size.z); }
    else continue;
    m.position.set(p.pos.x, p.pos.y, p.pos.z);
    m.quaternion.copy(new Quaternion(p.rot.x, p.rot.y, p.rot.z, p.rot.w));
    m.castShadow = true; m.receiveShadow = true;
    st.plants.add(m);
  }
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

function groundMaterial(): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0 });
  const uSand = { value: 0 };
  m.userData.uSand = uSand;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSand = uSand;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(position, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
uniform float uSand;
float gh(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float gn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(gh(i), gh(i+vec2(1,0)), f.x), mix(gh(i+vec2(0,1)), gh(i+vec2(1,1)), f.x), f.y); }
float gfbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++){ s += a * gn(p); p *= 2.03; a *= 0.5; } return s; }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  { vec2 p = vGW.xz;
    float big = gfbm(p * 0.012), mid = gfbm(p * 0.18), g1 = gn(p * 3.1), g2 = gn(p * 8.3);
    vec3 soil = mix(vec3(0.16, 0.115, 0.08), vec3(0.42, 0.33, 0.24), clamp(big * 0.7 + mid * 0.5 - 0.15, 0.0, 1.0));
    soil *= 0.72 + 0.45 * g1 * (0.7 + 0.3 * g2);
    vec3 sand = vec3(0.58, 0.46, 0.27) * (0.85 + 0.2 * g1 * g2 + 0.1 * mid);
    diffuseColor.rgb = mix(soil, sand, uSand); }`);
  };
  m.customProgramCacheKey = () => 'demo-ground';
  return m;
}

export { Fog };
