// Demo scene built from the same analytic field the camera collides with (src/render/camera/testing/demoField):
// textured ground, the climbing wall, the corridor block, boulders, a stand-in ant, sun and sky.
import {
  BoxGeometry, BufferAttribute, Color, DirectionalLight, Fog, Group, HemisphereLight, Matrix4, Mesh, MeshStandardMaterial, PlaneGeometry, Scene,
  SphereGeometry, type BufferGeometry, type Texture,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { AssetLoader } from '@/render/assets';
import { BLOCK, BOULDERS, CHANNEL, DEMO_BU, WALL } from '@/render/camera/testing/demoField';

/** Haze / sky colour (GDD 08 11.2 day haze #D9DEE2). */
export const SKY = new Color('#cfd6dc');

/** Planar UVs from world position along the dominant normal axis, `tile` mm per texture repeat. */
function worldUV(geo: BufferGeometry, tile: number, offset: Matrix4 | null = null): BufferGeometry {
  if (offset) geo.applyMatrix4(offset);
  const p = geo.getAttribute('position'), n = geo.getAttribute('normal');
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const [u, v] = ay >= ax && ay >= az ? [x, z] : ax >= az ? [z, y] : [x, y];
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new BufferAttribute(uv, 2));
  return geo;
}

/** Sphere UVs scaled so one texture repeat covers about `tile` mm of surface. */
function sphereUV(geo: BufferGeometry, r: number, tile: number): BufferGeometry {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * 2 * Math.PI * r) / tile, (uv.getY(i) * Math.PI * r) / tile);
  return geo;
}

function texturedMaterial(assets: AssetLoader, id: string, extra: Partial<{ color: string; roughness: number }> = {}): MeshStandardMaterial {
  const map = (k: string): Texture => assets.texture(id, k);
  return new MeshStandardMaterial({
    map: map('albedo'), normalMap: map('normal'), roughnessMap: map('rough'), roughness: extra.roughness ?? 1, metalness: 0,
    color: extra.color ?? '#ffffff',
  });
}

export interface DemoScene {
  scene: Scene;
  sun: DirectionalLight;
  ant: Group;
  antMaterial: MeshStandardMaterial;
  /** Materials the demo asked for, so the harness can check none fell back to a placeholder. */
  materialIds: string[];
}

export function buildScene(assets: AssetLoader): DemoScene {
  const scene = new Scene();
  scene.background = SKY;
  scene.fog = new Fog(SKY, 120, 1400);

  const ground = new Mesh(worldUV(new PlaneGeometry(900, 900, 1, 1).rotateX(-Math.PI / 2).translate(140, 0, 0), 160), texturedMaterial(assets, 'soil_garden'));
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = texturedMaterial(assets, 'brick', { color: '#e8ddd6' });
  const wall = new Mesh(worldUV(new BoxGeometry(WALL.x1 - WALL.x0, WALL.h, 2 * WALL.z).translate((WALL.x0 + WALL.x1) / 2, WALL.h / 2, 0), 260), wallMat);
  wall.castShadow = wall.receiveShadow = true;
  scene.add(wall);

  // corridor block = two side walls + a roof over the 2 BU channel
  const len = BLOCK.x1 - BLOCK.x0, cx = (BLOCK.x0 + BLOCK.x1) / 2, side = BLOCK.z - CHANNEL.halfW;
  const parts = [
    new BoxGeometry(len, BLOCK.h, side).translate(cx, BLOCK.h / 2, -(CHANNEL.halfW + side / 2)),
    new BoxGeometry(len, BLOCK.h, side).translate(cx, BLOCK.h / 2, CHANNEL.halfW + side / 2),
    new BoxGeometry(len, BLOCK.h - CHANNEL.h, 2 * CHANNEL.halfW).translate(cx, CHANNEL.h + (BLOCK.h - CHANNEL.h) / 2, 0),
  ];
  const block = new Mesh(worldUV(mergeGeometries(parts.map((g) => g.toNonIndexed()))!, 220), texturedMaterial(assets, 'concrete_paving'));
  block.castShadow = block.receiveShadow = true;
  scene.add(block);

  const rockMat = texturedMaterial(assets, 'moss');
  for (const b of BOULDERS) {
    const m = new Mesh(sphereUV(new SphereGeometry(b.r, 32, 16), b.r, 90).translate(b.c.x, b.c.y, b.c.z), rockMat);
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // stand-in ant: gaster, mesosoma, head (4 mm long, BU = 4 mm), feet at y = 0 in its own frame, heading +X
  const antMaterial = new MeshStandardMaterial({ color: '#2a1c14', roughness: 0.35, metalness: 0.1, transparent: true });
  const antGeo = mergeGeometries([
    new SphereGeometry(1, 16, 10).scale(1.0, 0.75, 0.75).translate(-1.3, 0.85, 0),
    new SphereGeometry(1, 16, 10).scale(0.8, 0.45, 0.45).translate(0.1, 0.8, 0),
    new SphereGeometry(1, 16, 10).scale(0.55, 0.5, 0.5).translate(1.4, 0.85, 0),
  ].map((g) => g.scale(DEMO_BU / 4, DEMO_BU / 4, DEMO_BU / 4)))!;
  const ant = new Group();
  const body = new Mesh(antGeo, antMaterial);
  body.castShadow = true;
  ant.add(body);
  scene.add(ant);

  scene.add(new HemisphereLight('#9db4cc', '#5b4632', 1.1));
  const sun = new DirectionalLight('#fff4e5', 2.6);
  scene.add(sun, sun.target);
  return { scene, sun, ant, antMaterial, materialIds: ['soil_garden', 'brick', 'concrete_paving', 'moss'] };
}
