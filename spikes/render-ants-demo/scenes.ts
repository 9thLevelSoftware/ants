/**
 * Scripted demo scenes. Each fills the DemoSim and returns a camera and labels. Units mm.
 */
import { POSES, AntFlag, type Caste, type ItemKind } from '@/sim/types';
import type { ColonyView } from '@/render/ants';
import { DemoSim, type DemoAnt } from './demoSim';
import { WALL } from './stage';

export interface CamSpec { target: [number, number, number]; dist: number; az: number; el: number; fov?: number; follow?: number }
export interface SceneSetup { cam: CamSpec; labels: { text: string; at: [number, number, number] }[]; stage: { wall?: boolean; grains?: boolean; fogFar?: number } }

type Species = ColonyView['species'];
export const SPECIES: Species[] = ['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'];
const BU: Record<string, number> = { 'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7 };
/** Mean length (BU) per caste (GDD 07 §5.x.1). */
const LEN: Record<string, Partial<Record<Caste | 'small-media', number>>> = {
  'lasius-niger': { worker: 1, queen: 2.1, gyne: 2.1, male: 0.95 },
  'camponotus-pennsylvanicus': { minor: 0.78, media: 1.1, major: 1.5, queen: 2.1, gyne: 2.0, male: 1.1 },
  'messor-barbarus': { minor: 0.7, media: 1.05, major: 1.55, queen: 2.3, gyne: 2.3, male: 1.3 },
  'atta-texana': { minor: 0.35, 'small-media': 0.7, media: 1.0, major: 1.8, queen: 2.6, gyne: 2.6, male: 1.9 },
};
export const CASTES: Record<string, (Caste | 'small-media')[]> = {
  'lasius-niger': ['worker', 'queen', 'gyne', 'male'],
  'camponotus-pennsylvanicus': ['minor', 'media', 'major', 'queen', 'gyne', 'male'],
  'messor-barbarus': ['minor', 'media', 'major', 'queen', 'gyne', 'male'],
  'atta-texana': ['minor', 'small-media', 'media', 'major', 'queen', 'gyne', 'male'],
};
export const pose = (id: string): number => Math.max(0, (POSES as readonly string[]).indexOf(id));
const standard = (sp: string): Caste => (sp === 'lasius-niger' ? 'worker' : 'media');
const lenMm = (sp: string, c: string) => (LEN[sp]![c as Caste] ?? 1) * BU[sp]!;

function addAnt(sim: DemoSim, col: number, sp: string, c: Caste | 'small-media', o: Parameters<DemoSim['ant']>[2] = {}): DemoAnt {
  const caste: Caste = c === 'small-media' ? 'media' : c;
  return sim.ant(col, caste, { lengthBu: LEN[sp]![c as Caste] ?? 1, sizeClass: c === 'small-media' ? 'small-media' : null, ...o });
}

export function buildScene(sim: DemoSim, name: string, p: URLSearchParams | Record<string, string>): SceneSetup {
  const get = (k: string, d: string) => (p instanceof URLSearchParams ? p.get(k) : p[k]) ?? d;
  sim.clear();
  const sp = get('species', 'lasius-niger') as Species;
  const L = (c: string) => lenMm(sp, c);
  const none: SceneSetup['stage'] = { grains: true };
  switch (name) {
    case 'hero': {
      const c = get('caste', standard(sp)) as Caste;
      const col = sim.colony(sp); addAnt(sim, col, sp, c, { heading: 0 });
      const l = L(c);
      return { cam: { target: [0, l * 0.12, 0], dist: l * 2.6, az: 40, el: 24, fov: 30 }, labels: [], stage: none };
    }
    case 'queen': {
      const col = sim.colony(sp); const q = L('queen'), w = L(standard(sp));
      addAnt(sim, col, sp, 'queen', { heading: 0.25 });
      addAnt(sim, col, sp, standard(sp), { pos: { x: q * 1.0, y: 0, z: q * 0.18 }, heading: -0.35 });
      return {
        cam: { target: [q * 0.5, q * 0.14, q * 0.06], dist: q * 2.9, az: 30, el: 28, fov: 30 },
        labels: [{ text: `queen ${q.toFixed(1)} mm`, at: [0, q * 0.4, 0] }, { text: `worker ${w.toFixed(1)} mm`, at: [q, w * 0.45, q * 0.18] }], stage: none,
      };
    }
    case 'poly': {
      // a major and a minor side by side (default Messor)
      const s = (get('species', 'messor-barbarus') as Species);
      const col = sim.colony(s); const M = lenMm(s, 'major'), m = lenMm(s, 'minor');
      addAnt(sim, col, s, 'major', { heading: 0.5 });
      addAnt(sim, col, s, 'minor', { pos: { x: M * 0.85, y: 0, z: M * 0.1 }, heading: 0.1 });
      return {
        cam: { target: [M * 0.45, M * 0.1, M * 0.05], dist: M * 2.1, az: 62, el: 22, fov: 30 },
        labels: [{ text: `major ${M.toFixed(1)} mm`, at: [0, M * 0.45, 0] }, { text: `minor ${m.toFixed(1)} mm`, at: [M * 0.85, m * 0.6, M * 0.1] }], stage: none,
      };
    }
    case 'carry': {
      const col = sim.colony(sp); const c = standard(sp); const l = L(c);
      const a = addAnt(sim, col, sp, c, { heading: 0 });
      const b = sim.brood(col, 'pupa', 'worker', { x: 0, y: 0, z: 0 }, { lengthBu: 1 });
      sim.give(a, b);
      return { cam: { target: [0, l * 0.15, l * 0.4], dist: l * 3.6, az: 52, el: 22, fov: 30 }, labels: [], stage: none };
    }
    case 'wall': {
      // one ant walking up the wall (up = -X), one on the ceiling under the overhang (up = -Y), one on the ground
      const col = sim.colony('lasius-niger'); const s = 6;
      sim.ant(col, 'worker', { pos: { x: WALL.x, y: 10, z: -6 }, up: { x: -1, y: 0, z: 0 }, fwd: { x: 0, y: 1, z: 0 }, speed: s });
      sim.ant(col, 'worker', { pos: { x: WALL.ceilingX0 + 18, y: WALL.ceilingY, z: 4 }, up: { x: 0, y: -1, z: 0 }, fwd: { x: 0, y: 0, z: 1 }, speed: s });
      sim.ant(col, 'worker', { pos: { x: WALL.x - 14, y: 0, z: 12 }, heading: Math.PI / 2, speed: s });
      return { cam: { target: [WALL.x - 18, 14, 2], dist: 48, az: -58, el: 10, fov: 38 }, labels: [], stage: { wall: true, grains: false } };
    }
    case 'crowd': return crowd(sim, Number(get('n', '2000')), sp);
    case 'brood': return broodPile(sim, sp);
    case 'poses': return poses(sim);
    case 'items': return items(sim);
    case 'lineup': return lineup(sim, get('species', 'all'));
    case 'gait': {
      const col = sim.colony('lasius-niger');
      sim.ant(col, 'worker', { heading: 0, speed: 24 });
      return { cam: { target: [0, 0.45, 0], dist: 13, az: 90, el: 3, fov: 30, follow: 0 }, labels: [], stage: none };
    }
    default: throw new Error(`unknown scene ${name}`);
  }
}

function crowd(sim: DemoSim, n: number, sp: Species): SceneSetup {
  const col = sim.colony(sp); const r = sim.rnd; const bu = BU[sp]!;
  sim.bound = Math.max(40, Math.sqrt(Math.max(n, 1)) * 1.6 * bu);
  const kinds: ItemKind[] = ['soil-pellet', 'food-piece', 'seed', 'leaf-fragment', 'corpse'];
  for (let i = 0; i < n; i++) {
    const rad = Math.sqrt(r()) * sim.bound, ang = r() * Math.PI * 2;
    const len = 0.9 + 0.25 * r();
    const roll = r();
    const a = sim.ant(col, standard(sp), { lengthBu: len, pos: { x: Math.cos(ang) * rad, y: 0, z: Math.sin(ang) * rad }, heading: r() * Math.PI * 2, script: 'wander' });
    if (roll < 0.78) { a.targetSpeed = 6 * len * bu * (0.6 + 0.6 * r()); a.speed = a.targetSpeed; }
    else if (roll < 0.88) { /* idle */ }
    else if (roll < 0.95) {
      if (r() < 0.4) sim.give(a, sim.brood(col, r() < 0.5 ? 'pupa' : 'larva', 'worker', a.pos, { progress: r() }));
      else sim.give(a, sim.item(kinds[Math.floor(r() * kinds.length)]!, a.pos, { species: sp }));
      a.targetSpeed = 4.5 * bu; a.speed = a.targetSpeed;
    } else if (roll < 0.98) { a.flags |= AntFlag.ALARMED; a.alarmLevel = 1; a.targetSpeed = 9 * bu; a.speed = a.targetSpeed; }
    else { a.cropC = 1; a.targetSpeed = 4 * bu; a.speed = a.targetSpeed; }
  }
  if (sim.state.ants[0]) sim.state.player.possessedAntId = sim.state.ants[0].id;
  return { cam: { target: [0, 1, sim.bound * 0.1], dist: sim.bound * 0.28, az: 20, el: 13, fov: 45 }, labels: [], stage: { grains: false, fogFar: 5000 } };
}

function broodPile(sim: DemoSim, sp: Species): SceneSetup {
  const col = sim.colony(sp); const bu = BU[sp]!; const r = sim.rnd;
  const at = (x: number, z: number) => ({ x: x * bu, y: 0, z: z * bu });
  for (let i = 0; i < 26; i++) sim.brood(col, 'egg', 'worker', at(-2.2, 0.2));
  for (let i = 0; i < 14; i++) sim.brood(col, 'larva', 'worker', at(-0.2 + (r() - 0.5) * 0.4, 0.4 + (r() - 0.5) * 0.4), { progress: i / 13 });
  for (let i = 0; i < 9; i++) sim.brood(col, 'pupa', 'worker', at(2.3, 0.3));
  const mes = sim.colony('messor-barbarus');
  for (let i = 0; i < 6; i++) sim.brood(mes, 'pupa', 'media', { x: 0.6 * bu + i * 1.2, y: 0, z: -2.6 * bu }, { lengthBu: 1 });
  const nurse = sim.ant(col, standard(sp), { pos: at(-0.6, 2.2), heading: Math.PI * 0.85, pose: pose('feed') });
  void nurse;
  sim.ant(col, standard(sp), { pos: at(3.6, -0.8), heading: -1.8, pose: pose('groom-other') });
  return {
    cam: { target: [0.2 * bu, 0, 0], dist: 7.2 * bu, az: 18, el: 40, fov: 32 },
    labels: [{ text: 'eggs', at: [-2.2 * bu, 0.7 * bu, 0.2 * bu] }, { text: 'larvae', at: [-0.2 * bu, 0.6 * bu, 0.4 * bu] }, { text: 'cocoons (Lasius)', at: [2.3 * bu, 0.7 * bu, 0.3 * bu] }, { text: 'naked pupae (Messor)', at: [0.6 * bu + 3, 0.6 * bu, -2.6 * bu] }],
    stage: { grains: false },
  };
}

export const POSE_ROW: [label: string, poseId: string, extra?: (a: DemoAnt, sim: DemoSim) => void][] = [
  ['idle', 'walk'], ['walking', 'walk', (a) => { a.speed = 24; a.targetSpeed = 24; a.script = 'walk'; }],
  ['carrying', 'walk', (a, s) => s.give(a, s.item('soil-pellet', a.pos))], ['digging', 'dig'], ['feeding', 'feed'],
  ['trophallaxis', 'troph-give'], ['alarm', 'alarm'], ['grooming', 'groom-self'], ['spraying', 'spray'],
  ['replete', 'walk', (a) => { a.cropC = 1; }],
];

function poses(sim: DemoSim): SceneSetup {
  const col = sim.colony('lasius-niger'); const labels: SceneSetup['labels'] = [];
  POSE_ROW.forEach(([lbl, pid, extra], i) => {
    const x = -i * 7.5;
    const a = sim.ant(col, 'worker', { pos: { x, y: 0, z: 0 }, heading: Math.PI / 2 - 0.35, pose: pose(pid) });
    a.alarmLevel = pid === 'alarm' ? 1 : 0;
    extra?.(a, sim);
    labels.push({ text: lbl, at: [x, 2.8, 0] });
  });
  const x = -POSE_ROW.length * 7.5;
  sim.item('corpse', { x, y: 0, z: 0 }, { species: 'lasius-niger', lengthMm: 4 });
  labels.push({ text: 'dead', at: [x, 2.8, 0] });
  // trophallaxis partner
  sim.ant(col, 'worker', { pos: { x: -5 * 7.5 - 2.0, y: 0, z: 3.6 }, heading: Math.PI / 2 - 0.35 + Math.PI - 0.5, pose: pose('troph-beg') });
  return { cam: { target: [x / 2, 0.9, 0.6], dist: 62, az: 0, el: 16, fov: 34 }, labels, stage: { grains: false } };
}

function items(sim: DemoSim): SceneSetup {
  const col = sim.colony('lasius-niger'); const labels: SceneSetup['labels'] = [];
  const kinds: ItemKind[] = ['soil-pellet', 'frass', 'chaff', 'pebble', 'food-piece', 'seed', 'seed-paste', 'leaf-fragment', 'leaf-pulp', 'staphylae', 'fungus-piece', 'garden-waste', 'carcass', 'live-aphid', 'corpse'];
  kinds.forEach((k, i) => {
    const x = -i * 6;
    sim.item(k, { x: x - 2, y: 0, z: 5 }, { species: 'lasius-niger' });
    const a = sim.ant(col, 'worker', { pos: { x, y: 0, z: 0 }, heading: Math.PI / 2 - 0.75 });
    sim.give(a, sim.item(k, a.pos, { species: 'lasius-niger' }));
    labels.push({ text: k, at: [x, 3.4, 0] });
  });
  return { cam: { target: [-42, 0.8, 2.5], dist: 72, az: 0, el: 30, fov: 36 }, labels, stage: { grains: false } };
}

function lineup(sim: DemoSim, which: string): SceneSetup {
  const list = which === 'all' ? SPECIES : [which as Species];
  const labels: SceneSetup['labels'] = [];
  let z = 0, maxX = 0;
  for (const sp of list) {
    const col = sim.colony(sp); let x = 0; let rowH = 0;
    for (const c of CASTES[sp]!) {
      const l = lenMm(sp, c); x -= l * 0.6;
      addAnt(sim, col, sp, c, { pos: { x, y: 0, z }, heading: Math.PI / 2 });
      labels.push({ text: `${c} ${l.toFixed(1)}`, at: [x, l * 0.42 + 1.2, z] });
      x -= l * 0.6 + 2; rowH = Math.max(rowH, l);
    }
    maxX = Math.min(maxX, x);
    z -= rowH * 0.9 + 6;
  }
  return { cam: { target: [maxX / 2, 2, z / 2], dist: Math.max(40, -maxX * 1.05), az: 0, el: 28, fov: 34 }, labels, stage: { grains: false } };
}
