// The machines an ant meets (GDD 04 §15, GDD 08 §11.7), seen from the ground: the mower's deck housing with its
// rolled edge, the dark cavity under it and the spinning blade bar, lugged wheels and the engine above; a car's
// underbody (floor pan, tank, exhaust, subframes, arches) over four treaded tyres; a sprinkler head and a hose
// nozzle. Millimetres, origin at the ground contact, +X forward, +Y up. No people.

import {
  BoxGeometry, CircleGeometry, CylinderGeometry, Group, Mesh, TorusGeometry, type BufferGeometry, type Material,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HumanMaterials } from './materials';

function mesh(g: BufferGeometry, m: Material, shadow = true): Mesh {
  const o = new Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/**
 * A wheel lying along Z (axis Z), centred at the origin: a rubber core with `lugs` tread blocks in `rows` rows around
 * the circumference (what rolls over an ant), a bulging sidewall ring on each face.
 */
function treadedWheel(r: number, w: number, lugs: number, rows: number, lugDepth: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const core = new CylinderGeometry(r - lugDepth, r - lugDepth, w, 40);
  core.rotateX(Math.PI / 2);
  parts.push(core);
  const rowW = w / rows;
  for (let i = 0; i < lugs; i++) {
    for (let k = 0; k < rows; k++) {
      const a = ((i + (k % 2) * 0.5) / lugs) * Math.PI * 2;
      const b = new BoxGeometry(lugDepth * 1.6, ((Math.PI * 2 * r) / lugs) * 0.62, rowW * 0.82);
      // chevron: alternate rows lean the other way
      b.rotateX((k % 2 ? 1 : -1) * 0.25);
      b.translate(r - lugDepth * 0.6, 0, -w / 2 + rowW * (k + 0.5));
      b.rotateZ(a);
      parts.push(b);
    }
  }
  for (const side of [-1, 1]) {
    const wall = new TorusGeometry(r - lugDepth - r * 0.12, r * 0.1, 8, 40);
    wall.scale(1, 1, 0.45);
    wall.translate(0, 0, side * (w / 2 - r * 0.02));
    parts.push(wall);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** A hub or rim on a wheel lying along Z: a disc with `spokes` raised spokes and a centre cap on both faces. */
function rim(r: number, w: number, spokes: number): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const disc = new CylinderGeometry(r, r, w, 28);
  disc.rotateX(Math.PI / 2);
  parts.push(disc);
  for (const side of [-1, 1]) {
    for (let i = 0; i < spokes; i++) {
      const s = new BoxGeometry(r * 0.9, r * 0.16, r * 0.08);
      s.translate(r * 0.45, 0, side * (w / 2 + r * 0.04));
      s.rotateZ((i / spokes) * Math.PI * 2);
      parts.push(s);
    }
    const cap = new CylinderGeometry(r * 0.22, r * 0.26, r * 0.14, 16);
    cap.rotateX(Math.PI / 2);
    cap.translate(0, 0, side * (w / 2 + r * 0.07));
    parts.push(cap);
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/**
 * Mower: a painted steel deck (rolled bottom edge ~40 mm above the ground, a sloped shoulder with stiffening ribs,
 * the black engine block above), the dark cavity under it, a steel blade bar with lifted tips spinning just above the
 * cut height (and a faint blur disc), a rear rubber flap, four lugged wheels at the corners.
 */
export function buildMower(mt: HumanMaterials, deck: number, wheelD: number, wheelW: number): { group: Group; wheels: Mesh[]; blade: Mesh } {
  const g = new Group();
  const R = deck / 2, rimY = 40, skirtH = 62, topY = rimY + skirtH;
  const skirt = new CylinderGeometry(R * 0.98, R + 3, skirtH, 56, 1, true);
  skirt.translate(0, rimY + skirtH / 2, 0);
  g.add(mesh(skirt, mt.paint));
  const inner = new CylinderGeometry(R * 0.96, R, skirtH - 4, 56, 1, true);
  inner.translate(0, rimY + skirtH / 2, 0);
  g.add(mesh(inner, mt.deckInner, false));
  const ceiling = new CircleGeometry(R * 0.97, 56);
  ceiling.rotateX(Math.PI / 2); // faces down
  ceiling.translate(0, topY - 3, 0);
  g.add(mesh(ceiling, mt.deckInner, false));
  const edge = new TorusGeometry(R + 2, 7, 10, 64);
  edge.rotateX(Math.PI / 2);
  edge.translate(0, rimY, 0);
  g.add(mesh(edge, mt.paint));
  const shoulder = new CylinderGeometry(R * 0.5, R * 0.98, 46, 56);
  shoulder.translate(0, topY + 23, 0);
  g.add(mesh(shoulder, mt.paint));
  const ribs: BufferGeometry[] = [];
  for (let i = 0; i < 12; i++) {
    const b = new BoxGeometry(R * 0.5, 10, 12);
    b.rotateZ(-0.55);
    b.translate(R * 0.72, topY + 26, 0);
    b.rotateY((i / 12) * Math.PI * 2);
    ribs.push(b);
  }
  g.add(mesh(mergeGeometries(ribs), mt.paint));
  // engine: block, cooling fins, the round starter housing on top
  const block = new BoxGeometry(170, 110, 160);
  block.translate(-R * 0.08, topY + 46 + 55, 0);
  g.add(mesh(block, mt.engine));
  const fins: BufferGeometry[] = [];
  for (let k = 0; k < 6; k++) { const f = new BoxGeometry(186, 4, 176); f.translate(-R * 0.08, topY + 60 + k * 16, 0); fins.push(f); }
  g.add(mesh(mergeGeometries(fins), mt.engine));
  const starter = new CylinderGeometry(95, 100, 70, 32);
  starter.translate(-R * 0.08, topY + 46 + 110 + 35, 0);
  g.add(mesh(starter, mt.engine));
  // rear flap (grass guard)
  const flap = new BoxGeometry(6, skirtH + 20, R * 1.1);
  flap.translate(-R - 6, rimY + skirtH / 2 - 14, 0);
  g.add(mesh(flap, mt.rubber));
  // blade bar with lifted sail tips, and the blur of its sweep
  const bar = new BoxGeometry(R * 1.84, 4, 46);
  const tips: BufferGeometry[] = [bar];
  for (const s of [-1, 1]) {
    const tip = new BoxGeometry(R * 0.3, 3, 34);
    tip.rotateX(s * 0.45);
    tip.translate(s * R * 0.78, 9, s * 10);
    tips.push(tip);
  }
  const bladeGeo = mergeGeometries(tips.map((t) => t.toNonIndexed()));
  bladeGeo.translate(0, rimY + 10, 0);
  const blade = mesh(bladeGeo, mt.steel, false);
  const blur = new CircleGeometry(R * 0.93, 48);
  blur.rotateX(Math.PI / 2);
  blur.translate(0, rimY + 8, 0);
  blade.add(mesh(blur, mt.blade, false));
  g.add(blade);
  const wheels: Mesh[] = [];
  const wheelGeo = treadedWheel(wheelD / 2, wheelW, 22, 2, 7);
  const hubGeo = rim(wheelD * 0.22, wheelW + 4, 5);
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const m = mesh(wheelGeo, mt.rubber);
    m.position.set(u * R * 0.8, wheelD / 2, v * (R + wheelW * 0.15));
    m.add(mesh(hubGeo, mt.metal));
    g.add(m);
    wheels.push(m);
  }
  return { group: g, wheels, blade };
}

/**
 * A car from below: the painted body, the dark floor pan with its tunnel, front and rear subframes, the oil sump,
 * fuel tank, exhaust pipe and silencer, bumpers and wheel arches, and four treaded tyres on spoked rims.
 */
export function buildCar(mt: HumanMaterials, body: { hl: number; hw: number; hh: number; clear: number },
  tyre: { r: number; w: number; track: number; base: number }): { group: Group; tyres: Mesh[] } {
  const g = new Group();
  const c = body.clear;
  const shell = new BoxGeometry(body.hl * 2, body.hh * 2 - 80, body.hw * 2, 4, 2, 4);
  shell.translate(0, c + 80 + body.hh - 40, 0);
  g.add(mesh(shell, mt.carPaint));
  const under: BufferGeometry[] = [];
  const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => { const b = new BoxGeometry(sx, sy, sz); b.translate(x, y, z); under.push(b); };
  box(body.hl * 1.95, 40, body.hw * 1.9, 0, c + 60, 0); // floor pan
  box(body.hl * 1.1, 70, 220, -body.hl * 0.1, c + 30, 0); // transmission tunnel
  for (const x of [tyre.base / 2, -tyre.base / 2]) box(260, 60, tyre.track * 0.9, x * 0.85, c + 20, 0); // subframes
  box(420, 90, 380, body.hl * 0.62, c + 5, 0); // sump and gearbox
  box(700, 200, body.hw * 1.2, -body.hl * 0.42, c + 60, -60); // fuel tank
  for (const s of [-1, 1]) box(150, 140, body.hw * 2.04, s * (body.hl - 40), c + 40, 0); // bumpers
  for (let i = -3; i <= 3; i++) box(40, 20, body.hw * 1.7, i * body.hl * 0.25, c + 34, 0); // floor ribs
  g.add(mesh(mergeGeometries(under), mt.chassis));
  const pipe = new CylinderGeometry(25, 25, body.hl * 1.7, 14);
  pipe.rotateZ(Math.PI / 2);
  pipe.translate(-body.hl * 0.05, c + 20, body.hw * 0.42);
  const silencer = new CylinderGeometry(90, 90, 520, 20);
  silencer.rotateZ(Math.PI / 2);
  silencer.translate(-body.hl * 0.7, c + 45, body.hw * 0.42);
  g.add(mesh(mergeGeometries([pipe, silencer]), mt.metal));
  // wheel arches: half shells over each tyre
  const arches: BufferGeometry[] = [];
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const a = new CylinderGeometry(tyre.r + 50, tyre.r + 50, tyre.w + 60, 24, 1, true, -Math.PI / 2, Math.PI);
    a.rotateX(Math.PI / 2);
    a.translate((u * tyre.base) / 2, tyre.r, (v * tyre.track) / 2);
    arches.push(a);
  }
  g.add(mesh(mergeGeometries(arches), mt.deckInner));
  const tyres: Mesh[] = [];
  const tyreGeo = treadedWheel(tyre.r, tyre.w, 56, 4, 11);
  const rimGeo = rim(tyre.r * 0.58, tyre.w * 0.86, 5);
  for (const [u, v] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const m = mesh(tyreGeo, mt.rubber);
    m.position.set((u * tyre.base) / 2, tyre.r, (v * tyre.track) / 2);
    m.add(mesh(rimGeo, mt.metal));
    g.add(m);
    tyres.push(m);
  }
  return { group: g, tyres };
}

/** An impact sprinkler on its riser: a black plastic stem, the brass body, the angled nozzle and the swinging arm. */
export function buildSprinkler(mt: HumanMaterials): Group {
  const g = new Group();
  const base = new CylinderGeometry(55, 70, 20, 24);
  base.translate(0, 10, 0);
  const riser = new CylinderGeometry(14, 16, 170, 16);
  riser.translate(0, 105, 0);
  g.add(mesh(mergeGeometries([base, riser]), mt.engine));
  const bodyG = new CylinderGeometry(20, 24, 40, 16);
  bodyG.translate(0, 210, 0);
  const nozzle = new CylinderGeometry(6, 9, 90, 12);
  nozzle.rotateZ(-0.9);
  nozzle.translate(34, 236, 0);
  const arm = new BoxGeometry(110, 6, 10);
  arm.translate(20, 252, 14);
  const spring = new TorusGeometry(14, 3, 6, 16);
  spring.rotateX(Math.PI / 2);
  spring.translate(0, 240, 0);
  g.add(mesh(mergeGeometries([bodyG, nozzle, arm, spring].map((x) => x.toNonIndexed())), mt.brass));
  return g;
}

/** A hose's spray nozzle (seen held above): a metal pistol tip on a short dark hose that fades upward. */
export function buildHoseNozzle(mt: HumanMaterials): Group {
  const g = new Group();
  const tip = new CylinderGeometry(10, 16, 120, 16);
  tip.rotateZ(Math.PI / 2 - 0.5);
  g.add(mesh(tip, mt.brass));
  const hose = new CylinderGeometry(14, 14, 500, 12);
  hose.translate(0, 250, 0);
  hose.rotateZ(0.6);
  hose.translate(-60, 0, 0);
  g.add(mesh(hose, mt.engine, false));
  return g;
}
