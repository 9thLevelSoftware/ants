// Meshes of the human-event actors, in millimetres, origin at the contact point (the underside centre), +X forward,
// +Y up. Only what an ant can perceive (GDD 08 §11.7-11.8, GDD 04 §15): a shoe with its lugged sole and a trouser
// hem that fades out well below the knee, a dog's paw, broom bristles, a vacuum nozzle, a towel, falling food, a
// pour, a bait station, a toy scoop (the mower, the car and the sprinkler are in machines.ts).
// No faces, no hands, no bodies.

import {
  BoxGeometry, BufferAttribute, CircleGeometry, CylinderGeometry, ExtrudeGeometry, Group, IcosahedronGeometry, Mesh, PlaneGeometry,
  Shape, SphereGeometry, TorusGeometry, type BufferGeometry, type Material,
} from 'three';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import type { HumanMaterials } from './materials';

/** Seeded jitter for lugs and bristles (no Math.random in deterministic screenshots). */
function jitter(i: number, s: number): number {
  const h = Math.imul((i + 1) * 2654435761, (s + 7) * 40503) >>> 0;
  return (h % 10000) / 10000 - 0.5;
}

/** Vertex colours white with alpha 1 below y0 falling to 0 at y1 (geometry in its final local frame). */
export function fadeUp(g: BufferGeometry, y0: number, y1: number): BufferGeometry {
  const p = g.getAttribute('position');
  const c = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = y <= y0 ? 1 : y >= y1 ? 0 : 1 - (y - y0) / (y1 - y0);
    c[i * 4] = c[i * 4 + 1] = c[i * 4 + 2] = 1;
    c[i * 4 + 3] = a * a;
  }
  g.setAttribute('color', new BufferAttribute(c, 4));
  return g;
}

function mesh(g: BufferGeometry, m: Material, shadow = true): Mesh {
  const o = new Mesh(g, m);
  o.castShadow = shadow;
  o.receiveShadow = true;
  return o;
}

/** Shoe outline in the XZ plane (x forward from the heel at -L/2; width varies heel - waist - ball - toe). */
function soleShape(L: number, W: number): Shape {
  const s = new Shape();
  const n = 20;
  const half = (u: number): number => {
    // u: 0 heel .. 1 toe
    const heel = 0.36 + 0.14 * Math.sin(Math.min(1, u / 0.2) * Math.PI / 2);
    const waist = u > 0.25 && u < 0.55 ? -0.07 * Math.sin(((u - 0.25) / 0.3) * Math.PI) : 0;
    const toe = u > 0.82 ? Math.sqrt(Math.max(0, 1 - ((u - 0.82) / 0.18) ** 2)) : 1;
    return (W / 2) * Math.min(1, heel + 0.5 * Math.min(1, u * 1.6) + waist) * toe * 0.98;
  };
  // points cluster at the heel and the toe, where the outline turns (the same point count reads rounder)
  const at = (i: number): number => 0.5 - 0.5 * Math.cos((Math.PI * i) / n);
  for (let i = 0; i <= n; i++) { const u = at(i); const x = -L / 2 + u * L; i === 0 ? s.moveTo(x, -half(u)) : s.lineTo(x, -half(u)); }
  for (let i = n; i >= 0; i--) { const u = at(i); s.lineTo(-L / 2 + u * L, half(u)); }
  return s;
}

/** A shoe sized by its sole (adult 280 x 100, child 200 x 80). `upper` / `trouser` materials vary. */
export function buildShoe(mt: HumanMaterials, L: number, W: number, child: boolean): Group {
  const g = new Group();
  const shape = soleShape(L, W);
  const soleH = L * 0.1;
  // the outsole: dark rubber with a rounded edge; ExtrudeGeometry is not indexed, so the normals are rebuilt with a
  // crease angle (smooth round corners, a sharp edge only where the outline really turns), never one flat facet per quad
  const sole = new ExtrudeGeometry(shape, { depth: soleH, bevelEnabled: true, bevelThickness: 5, bevelSize: 4, bevelSegments: 3, curveSegments: 4 });
  sole.rotateX(Math.PI / 2); // shape XY -> XZ, extrusion down (-Y)
  sole.translate(0, soleH + 4, 0);
  g.add(mesh(toCreasedNormals(sole, 0.9), mt.rubber));
  // the midsole welt: a paler, rounded band that runs round the whole sole edge where the upper meets it
  const weltH = L * 0.035;
  const welt = new ExtrudeGeometry(soleShape(L * 1.0, W * 1.04), { depth: weltH, bevelEnabled: true, bevelThickness: 2.5, bevelSize: 2.5, bevelSegments: 2, curveSegments: 4 });
  welt.rotateX(Math.PI / 2);
  welt.translate(0, soleH + 4 + weltH + 3, 0);
  g.add(mesh(toCreasedNormals(welt, 0.9), mt.midsole));
  // lugs under the sole: what the ant sees coming down
  const lugs: BufferGeometry[] = [];
  const lx = L / 16, lz = W / 7;
  let i = 0;
  for (let x = -L / 2 + lx; x < L / 2 - lx * 0.5; x += lx * 1.15) {
    for (let z = -W / 2 + lz * 0.8; z < W / 2 - lz * 0.4; z += lz * 1.2) {
      const u = (x + L / 2) / L;
      const lim = (W / 2) * (u < 0.15 || u > 0.9 ? 0.6 : 0.85);
      if (Math.abs(z) > lim) continue;
      const b = new BoxGeometry(lx * 0.75, 5, lz * 0.72);
      b.rotateY(0.35 * (i % 2 ? 1 : -1) + jitter(i, 3) * 0.1);
      b.translate(x, 2.5, z);
      lugs.push(b);
      i++;
    }
  }
  g.add(mesh(mergeGeometries(lugs), mt.rubberTread));
  // the upper: the sole outline extruded upward, high at the heel and low at the toe, tapering to the top
  const upperMat = child ? mt.childCanvas : mt.canvas;
  const height = (x: number): number => {
    const u = (x + L / 2) / L;
    const k = Math.min(1, Math.max(0, (u - 0.35) / 0.6));
    return L * (0.3 - 0.19 * k * k * (3 - 2 * k));
  };
  const up = new ExtrudeGeometry(soleShape(L * 0.97, W * 0.94), { depth: 1, bevelEnabled: true, bevelThickness: 0.35, bevelSize: W * 0.06, bevelSegments: 4, curveSegments: 4 });
  up.rotateX(-Math.PI / 2);
  const pu = up.getAttribute('position');
  for (let v = 0; v < pu.count; v++) {
    const x = pu.getX(v), t = pu.getY(v) + 0.35; // 0 .. 1.7 through the bevels
    const top = Math.min(1, Math.max(0, t / 1.7));
    pu.setY(v, soleH + 2 + top * height(x));
    pu.setZ(v, pu.getZ(v) * (1 - 0.3 * top * top));
  }
  g.add(mesh(toCreasedNormals(up, 1.1), upperMat));
  // heel collar (the opening) and laces down the instep
  const ux = -L * 0.2;
  const collar = new TorusGeometry(W * 0.3, W * 0.06, 10, 28);
  collar.rotateX(Math.PI / 2);
  collar.scale(1.25, 1, 1);
  collar.translate(ux, soleH + height(ux) + 2, 0);
  g.add(mesh(collar, mt.leather));
  const laces: BufferGeometry[] = [];
  for (let k = 0; k < 5; k++) {
    const x = -L * 0.02 + k * L * 0.06;
    const b = new BoxGeometry(5, 4, W * 0.42);
    b.translate(x, soleH + height(x) + 3, 0);
    laces.push(b);
  }
  g.add(mesh(mergeGeometries(laces), mt.lace));
  // trouser leg: a loose fabric tube, matte, with folds, fading out a short way up (the rest of the person is out of
  // the ant's sight and out of focus)
  const hemY = soleH + L * 0.28;
  const trouser = buildTrouserLeg(W * 0.62, W * 0.7, L * 1.4);
  trouser.translate(-L * 0.2, hemY, 0);
  fadeFolds(trouser, hemY + L * 0.15, hemY + L * 1.25);
  g.add(mesh(trouser, mt.trouser, false));
  // the turned-up cuff, a thicker ring of cloth where the hem is
  const cuff = new TorusGeometry(W * 0.66, W * 0.045, 5, 20);
  cuff.rotateX(Math.PI / 2);
  cuff.translate(-L * 0.2, hemY + 4, 0);
  g.add(mesh(cuff, mt.trouserCuff, false));
  return g;
}

/**
 * A trouser leg of height `h` standing on y = 0 (hem) with radius `r0` at the hem and `r1` at the top: an open tube
 * whose cloth hangs in vertical folds (a few broad pleats plus finer wrinkles that grow towards the hem, where the
 * cloth gathers and breaks over the shoe), with horizontal creases near the hem. Vertex colour rgb darkens inside the
 * folds (the cloth self-shadows in a way the lighting cannot show at this size); alpha is set by fadeFolds().
 */
export function buildTrouserLeg(r0: number, r1: number, h: number): BufferGeometry {
  const radial = 32, rows = 7;
  const g = new CylinderGeometry(r1, r0, h, radial, rows, true);
  g.translate(0, h / 2, 0);
  const p = g.getAttribute('position');
  const rgba = new Float32Array(p.count * 4);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const a = Math.atan2(z, x), t = y / h; // 0 hem .. 1 top
    const gather = (1 - t) * (1 - t);
    const broad = Math.sin(a * 5 + 0.7 + t * 1.6) * 0.045;
    const fine = Math.sin(a * 13 + t * 5.0) * 0.022 * (0.4 + gather * 1.6);
    const crease = Math.max(0, Math.sin(y * 0.11 + Math.sin(a * 3) * 1.3)) * 0.05 * gather;
    const k = 1 + broad + fine - crease;
    p.setX(i, x * k); p.setZ(i, z * k);
    const fold = broad + fine - crease; // negative: inside a fold
    const shade = Math.min(1, Math.max(0.55, 0.92 + fold * 4.5));
    rgba[i * 4] = rgba[i * 4 + 1] = rgba[i * 4 + 2] = shade; rgba[i * 4 + 3] = 1;
  }
  g.setAttribute('color', new BufferAttribute(rgba, 4));
  return toCreasedNormals(g, 1.4);
}

/** Alpha of a vertex-coloured (rgba) mesh: 1 below y0 falling to 0 at y1, keeping its rgb (folds). */
export function fadeFolds(g: BufferGeometry, y0: number, y1: number): BufferGeometry {
  const p = g.getAttribute('position'), c = g.getAttribute('color');
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const a = y <= y0 ? 1 : y >= y1 ? 0 : 1 - (y - y0) / (y1 - y0);
    c.setW(i, a * a * (3 - 2 * a));
  }
  return g;
}

/** A dog's paw: a main pad and four toe pads under a fur column that fades upward. */
export function buildPaw(mt: HumanMaterials): Group {
  const g = new Group();
  const pads: BufferGeometry[] = [];
  const main = new SphereGeometry(1, 16, 10); main.scale(20, 9, 22); main.translate(-6, 9, 0); pads.push(main);
  for (let k = 0; k < 4; k++) {
    const t = new SphereGeometry(1, 12, 8); t.scale(8, 7, 8);
    const a = -0.9 + k * 0.6;
    t.translate(16 + Math.cos(a) * 6, 7, Math.sin(a) * 18);
    pads.push(t);
  }
  g.add(mesh(mergeGeometries(pads), mt.pad));
  const leg = new CylinderGeometry(24, 30, 420, 20, 6);
  leg.translate(0, 220, 0);
  fadeUp(leg, 80, 400);
  g.add(mesh(leg, mt.fur, false));
  return g;
}

/** Broom: a wooden head with a dense fringe of straw bristles, a handle fading upward. */
export function buildBroom(mt: HumanMaterials, L: number, W: number): Group {
  const g = new Group();
  const head = new BoxGeometry(W * 0.35, 45, L);
  head.translate(0, 90 + 22, 0);
  g.add(mesh(head, mt.wood));
  fadeUp(head, 1000, 1001);
  const bristles: BufferGeometry[] = [];
  let i = 0;
  for (let z = -L / 2 + 6; z <= L / 2 - 6; z += 9) {
    for (let x = -W * 0.15; x <= W * 0.15; x += 9) {
      const b = new BoxGeometry(3, 92, 3);
      b.translate(0, 46, 0);
      b.rotateZ(jitter(i, 1) * 0.25 + 0.18);
      b.rotateX(jitter(i, 2) * 0.2);
      b.translate(x + jitter(i, 3) * 4, 0, z + jitter(i, 4) * 4);
      bristles.push(b);
      i++;
    }
  }
  g.add(mesh(mergeGeometries(bristles), mt.straw));
  const handle = new CylinderGeometry(12, 12, 1300, 12);
  handle.translate(0, 650, 0);
  handle.rotateZ(-0.6);
  handle.translate(0, 135, 0);
  fadeUp(handle, 400, 1000);
  g.add(mesh(handle, mt.wood, false));
  return g;
}

/** Vacuum floor nozzle: a wide grey head with a rubber lip and a brush strip, the neck tube fading upward. */
export function buildNozzle(mt: HumanMaterials, width: number): Group {
  const g = new Group();
  const head = new BoxGeometry(90, 38, width);
  head.translate(0, 8 + 19, 0);
  fadeUp(head, 1000, 1001);
  g.add(mesh(head, mt.greyPlastic));
  const lip = new BoxGeometry(96, 8, width + 6);
  lip.translate(0, 4, 0);
  g.add(mesh(lip, mt.rubber));
  const brush = new BoxGeometry(10, 10, width - 20);
  brush.translate(30, 5, 0);
  g.add(mesh(brush, mt.straw));
  const neck = new CylinderGeometry(20, 22, 1100, 16, 4);
  neck.translate(0, 550, 0);
  neck.rotateZ(-0.7);
  neck.translate(-10, 50, 0);
  fadeUp(neck, 300, 900);
  g.add(mesh(neck, mt.greyPlastic, false));
  return g;
}

/**
 * A kitchen towel bunched under a hand (the hand is not drawn): a checked cloth, raised and folded in the middle,
 * its edges and hems trailing flat on the worktop, a few loose threads at the hem.
 */
export function buildCloth(mt: HumanMaterials): Group {
  const g = new Group();
  const L = 300, W = 220;
  const c = new PlaneGeometry(L, W, 36, 26);
  c.rotateX(-Math.PI / 2);
  const p = c.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    // 1 in the bunched middle, 0 at the edges
    const m = Math.max(0, 1 - Math.hypot(x / (L * 0.42), z / (W * 0.46)));
    const folds = Math.abs(Math.sin(x * 0.045 + z * 0.012)) * 9 + Math.abs(Math.sin(z * 0.07 - x * 0.01)) * 5;
    p.setY(i, 1.5 + m * m * (34 + folds) + jitter(i, 9) * 1.2);
  }
  c.computeVertexNormals();
  g.add(mesh(c, mt.towel));
  const hems: BufferGeometry[] = [];
  for (const s of [-1, 1]) {
    const h = new BoxGeometry(12, 2.4, W);
    h.translate(s * (L / 2 - 6), 1.6, 0);
    hems.push(h);
    for (let k = 0; k < 9; k++) {
      const th = new BoxGeometry(12 + jitter(k, s + 3) * 8, 0.5, 0.6);
      th.rotateY(jitter(k, s + 5) * 0.6);
      th.translate(s * (L / 2 + 8), 0.6, -W / 2 + 12 + k * (W - 24) / 8);
      hems.push(th);
    }
  }
  g.add(mesh(mergeGeometries(hems), mt.lace));
  return g;
}

/** The wet streak a wiped worktop keeps for a moment (a thin glossy film, unit length along +X behind the cloth). */
export function buildWetStreak(mt: HumanMaterials): Mesh {
  const s = new PlaneGeometry(1, 1, 8, 1);
  s.rotateX(-Math.PI / 2);
  s.translate(-0.5, 0.3, 0);
  const m = new Mesh(s, mt.wetFilm);
  m.renderOrder = 2;
  return m;
}

export function buildCrumb(mt: HumanMaterials, kibble: boolean): Group {
  const g = new Group();
  const c = new IcosahedronGeometry(1, 1);
  const p = c.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const k = 1 + jitter(i, kibble ? 5 : 6) * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.75 + 0.75, p.getZ(i) * k);
  }
  c.computeVertexNormals();
  g.add(mesh(c, kibble ? mt.kibble : mt.crumb));
  return g;
}

/**
 * A pour: a thick wavering stream (unit height, scaled by the renderer), a splash crown where it lands and the
 * spreading glossy film with an irregular rim (unit radius, scaled by the renderer).
 */
export function buildPour(mt: HumanMaterials, water: boolean): { group: Group; stream: Mesh; film: Mesh; crown: Mesh } {
  const g = new Group();
  const liquid = water ? mt.water : mt.syrup;
  const s = new CylinderGeometry(1, 1.5, 1, 14, 24, true);
  s.translate(0, 0.5, 0);
  const sp = s.getAttribute('position');
  for (let i = 0; i < sp.count; i++) {
    const y = sp.getY(i), k = 1 + 0.28 * Math.sin(y * 31) + 0.12 * Math.sin(y * 73 + 1.3);
    sp.setX(i, sp.getX(i) * k + Math.sin(y * 9) * 0.25);
    sp.setZ(i, sp.getZ(i) * k);
  }
  s.computeVertexNormals();
  const stream = mesh(s, liquid, false);
  g.add(stream);
  const crown: BufferGeometry[] = [];
  for (let k = 0; k < 14; k++) {
    const a = (k / 14) * Math.PI * 2, r = 1.8 + jitter(k, 31) * 0.5;
    const d = new SphereGeometry(0.28 + jitter(k, 32) * 0.1, 8, 6);
    d.scale(1, 1.6, 1);
    d.translate(Math.cos(a) * r, 0.6 + Math.abs(jitter(k, 33)) * 1.4, Math.sin(a) * r);
    crown.push(d);
  }
  const crownMesh = mesh(mergeGeometries(crown), liquid, false);
  g.add(crownMesh);
  const f = new CircleGeometry(1, 64, 0, Math.PI * 2);
  f.rotateX(-Math.PI / 2);
  const fp = f.getAttribute('position');
  for (let i = 1; i < fp.count; i++) {
    const x = fp.getX(i), z = fp.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.16 * Math.sin(a * 3 + 0.4) + 0.09 * Math.sin(a * 7 + 2.1) + 0.05 * Math.sin(a * 13);
    fp.setX(i, x * k); fp.setZ(i, z * k);
  }
  // a shallow lens: thicker in the middle, so the gloss catches the light
  f.translate(0, 0.6, 0);
  fp.setY(0, 1.6);
  f.computeVertexNormals();
  const film = mesh(f, liquid, false);
  g.add(film);
  return { group: g, stream, film, crown: crownMesh };
}

/** Bait station: an off-white rounded box with four dark entrance slots. */
export function buildStation(mt: HumanMaterials): Group {
  const g = new Group();
  const b = new BoxGeometry(60, 12, 60, 2, 1, 2);
  b.translate(0, 6, 0);
  g.add(mesh(b, mt.plastic));
  const slots: BufferGeometry[] = [];
  for (const [x, z, rot] of [[30.5, 0, 0], [-30.5, 0, 0], [0, 30.5, 1], [0, -30.5, 1]]) {
    const s = new BoxGeometry(1, 4, 10);
    if (rot) s.rotateY(Math.PI / 2);
    s.translate(x, 3, z);
    slots.push(s);
  }
  g.add(mesh(mergeGeometries(slots), mt.chassis));
  return g;
}

/** A toy scoop: a plastic shell and a short handle fading upward. */
export function buildScoop(mt: HumanMaterials): Group {
  const g = new Group();
  const shell = new SphereGeometry(70, 20, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  shell.scale(1, 0.6, 0.8);
  shell.translate(0, 42, 0);
  fadeUp(shell, 1000, 1001);
  g.add(mesh(shell, mt.toyPlastic));
  const handle = new CylinderGeometry(12, 12, 360, 10);
  handle.translate(0, 180, 0);
  handle.rotateZ(-0.9);
  handle.translate(-40, 40, 0);
  fadeUp(handle, 120, 330);
  g.add(mesh(handle, mt.toyPlastic, false));
  return g;
}

/** A unit ground quad for blob shadows (scaled per actor). */
export function buildShadowQuad(mt: HumanMaterials): Mesh {
  const q = new CircleGeometry(1, 24);
  q.rotateX(-Math.PI / 2);
  const m = new Mesh(q, mt.shadow);
  m.renderOrder = 1;
  return m;
}
