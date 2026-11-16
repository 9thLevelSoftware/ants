/**
 * Demo scenes: line-up of every creature at true scale beside a worker ant, locomotion styles, aphid herds on a
 * plant, the antlion pit, the bird event, comfort mode, and a crowd for cost measurements.
 */
import type { Vec3 } from '@/core/math/vec3';
import type { CreatureKind, Primitive } from '@/sim/types';
import { CREATURE_STATS } from '@/sim/balance/creatures';
import { CreatureFlag } from '@/sim/ecology/creatures/common';
import { TICKS_PER_SECOND } from '@/sim/time';
import type { DemoSource } from './demoSource';

export interface CamSpec { target: [number, number, number]; dist: number; az: number; el: number; fov?: number }
export interface SceneSetup { cam: CamSpec; labels: { text: string; at: [number, number, number] }[]; sand?: number; prims?: Primitive[]; items?: Record<string, CamSpec> }

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
const EAST = Math.PI / 2;

/** Line-up order (smallest first); `aphid` is a small herd on a twig, `antlion` sits in its own pit. */
export const LINEUP: { kind: CreatureKind | 'aphid'; variant?: string; label: string }[] = [
  { kind: 'mite', label: 'mite 0.5 mm' }, { kind: 'springtail', label: 'springtail 1.5 mm' }, { kind: 'aphid', label: 'aphids 2 mm' },
  { kind: 'fruit-fly', label: 'fruit fly 2.5 mm' }, { kind: 'phorid-fly', label: 'phorid fly 2.5 mm' }, { kind: 'ant-spider', label: 'ant-hunting spider 3 mm' },
  { kind: 'rove-beetle', label: 'rove beetle 5 mm' }, { kind: 'jumping-spider', label: 'jumping spider 6 mm' }, { kind: 'ladybird', label: 'ladybird 6.5 mm' },
  { kind: 'lacewing-larva', label: 'lacewing larva 7 mm' }, { kind: 'ladybird-larva', label: 'ladybird larva 8 mm' }, { kind: 'fly-larva', label: 'fly larva 8 mm' },
  { kind: 'caterpillar', label: 'caterpillar 10 mm' }, { kind: 'caterpillar', variant: 'hairy', label: 'hairy caterpillar 10 mm' },
  { kind: 'woodlouse', label: 'woodlouse 10 mm' }, { kind: 'wolf-spider', label: 'wolf spider 10 mm' }, { kind: 'antlion', label: 'antlion larva 10 mm (pit)' },
  { kind: 'snail', label: 'snail 20 mm' }, { kind: 'centipede', label: 'centipede 20 mm' }, { kind: 'caterpillar', variant: 'medium', label: 'caterpillar 22 mm' },
  { kind: 'millipede', label: 'millipede 30 mm' }, { kind: 'earthworm', label: 'earthworm 100 mm' },
];

const lenOf = (k: CreatureKind | 'aphid', variant?: string) => (k === 'aphid' ? 4 : k === 'caterpillar' && variant === 'medium' ? 22 : k === 'antlion' ? 40 : CREATURE_STATS[k].sizeMm);

function twig(src: DemoSource, at: Vec3, length: number, r: number, aphids: number): void {
  const prim = { shape: 'capsule' as const, pos: v(at.x, r, at.z), rot: { x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, size: v(r, length / 2, 0) };
  const id = src.plant([prim], [v(at.x, r * 2, at.z)]);
  src.herd(id, 0, aphids);
}

export function lineup(src: DemoSource): SceneSetup {
  let x = 0;
  const labels: SceneSetup['labels'] = [];
  const items: Record<string, CamSpec> = {};
  for (const e of LINEUP) {
    const L = lenOf(e.kind, e.variant);
    x += L / 2;
    const zAnt = -(Math.max(2.5, L * 0.18) + 3.5);
    if (e.kind === 'aphid') twig(src, v(x, 0, 0), 5, 0.5, 4);
    else if (e.kind === 'antlion') { const p = src.pit(v(x, 0, 0), 18, 13); src.creature('antlion', v(x, 0, 0), { heading: EAST + 2.4, state: 'wait', bb: { pit: p.id } }); }
    else src.creature(e.kind, v(x, 0, 0), { heading: EAST, variant: (e.variant ?? null) as never, flags: e.variant === 'hairy' ? CreatureFlag.HAIRY : 0 });
    src.ant(v(x, 0, zAnt), EAST);
    labels.push({ text: e.label, at: [x, Math.max(3, L * 0.35) + 2, 0] });
    items[`${e.kind}${e.variant ? '-' + e.variant : ''}`] = { target: [x, Math.min(L, 10) * 0.2, zAnt * 0.35], dist: Math.max(10, Math.min(L, 45) * 2.1 - zAnt), az: 28, el: e.kind === 'antlion' ? 50 : 22, fov: 30 };
    x += L / 2 + 8;
  }
  const mid = x / 2;
  return { cam: { target: [mid, 0, 0], dist: x * 1.25, az: 0, el: 24, fov: 30 }, labels, items, prims: src.world.prims.slice() };
}

/** Locomotion styles: walking, crawling, hopping (mid-arc), hovering, coiled / rolled / retracted, subdued and dead. */
export function styles(src: DemoSource): SceneSetup {
  const labels: SceneSetup['labels'] = [];
  const items: Record<string, CamSpec> = {};
  const at = (x: number, z: number, text: string, y = 7) => labels.push({ text, at: [x, y, z] });
  const group = (name: string, x: number, z: number, dist: number) => { items[name] = { target: [x, 1.5, z], dist, az: 25, el: 24, fov: 30 }; };
  // walk (8 and 30 legs)
  src.creature('wolf-spider', v(-12, 0, 0), { heading: EAST, script: 'walk', walkSpeed: 20, range: 26 }); at(-6, 0, 'walk: wolf spider');
  src.creature('centipede', v(-14, 0, 18), { heading: EAST, script: 'walk', walkSpeed: 30, range: 26 }); at(-4, 18, 'walk: centipede');
  src.ant(v(-2, 0, 9), EAST, 24); group('walk', 0, 9, 60);
  // crawl (peristaltic / looping waves)
  src.creature('earthworm', v(150, 0, 0), { heading: EAST, script: 'walk', walkSpeed: 2, range: 20 }); at(150, 0, 'crawl: earthworm', 9);
  src.creature('caterpillar', v(130, 0, 16), { heading: EAST, script: 'walk', walkSpeed: 3, range: 20 }); at(130, 16, 'crawl: caterpillar');
  src.creature('fly-larva', v(160, 0, 16), { heading: EAST, script: 'walk', walkSpeed: 1, range: 20 }); at(160, 16, 'crawl: fly larva');
  src.ant(v(145, 0, 26), EAST); group('crawl', 150, 10, 130);
  // hop (the sim re-places a springtail 30 mm: drawn as an arc) and hover (wings beating)
  src.creature('springtail', v(286, 0, 0), { heading: EAST, script: 'hop', hopMm: 14, hopEvery: 6, range: 30 }); at(292, 0, 'hop: springtail');
  src.creature('ladybird', v(300, 0, 16), { heading: EAST, flags: CreatureFlag.FLYING, state: 'fly-in' }); at(300, 16, 'hover: ladybird', 14);
  src.creature('fruit-fly', v(312, 0, 8), { heading: EAST, flags: CreatureFlag.FLYING, state: 'fly' }); at(312, 8, 'hover: fruit fly', 9);
  src.ant(v(296, 0, 6), EAST); group('hop-hover', 300, 8, 55);
  // coiled / rolled / retracted
  src.creature('millipede', v(-10, 0, 150), { heading: EAST, flags: CreatureFlag.CURLED, state: 'coil' }); at(-10, 150, 'coiled: millipede');
  src.creature('woodlouse', v(14, 0, 142), { heading: EAST, flags: CreatureFlag.CURLED, state: 'roll' }); at(14, 142, 'rolled: woodlouse');
  src.creature('snail', v(30, 0, 165), { heading: EAST, flags: CreatureFlag.CURLED, state: 'retract' }); at(30, 165, 'retracted: snail', 22);
  src.ant(v(2, 0, 136), EAST); group('coiled', 2, 155, 85);
  // subdued and dead
  src.creature('ladybird-larva', v(140, 0, 150), { heading: EAST, flags: CreatureFlag.SUBDUED, state: 'subdued' }); at(140, 150, 'subdued: ladybird larva');
  src.creature('caterpillar', v(160, 0, 158), { heading: EAST, flags: CreatureFlag.SUBDUED, state: 'subdued' }); at(160, 158, 'subdued: caterpillar');
  src.creature('rove-beetle', v(152, 0, 140), { heading: EAST, hp: 0 }); at(152, 140, 'dead: rove beetle (on its back)');
  src.ant(v(146, 0, 160), EAST); group('dead', 150, 150, 55);
  return { cam: { target: [150, 0, 80], dist: 520, az: 0, el: 40, fov: 32 }, labels, items };
}

/** A herb with a branch and leaves; herds of 12, 80 and 200 aphids on the stem, the branch and a leaf underside. */
export function herd(src: DemoSource): SceneSetup {
  const r = 1.2;
  const q = (ax: number, ay: number, az: number, a: number) => { const s = Math.sin(a / 2), l = Math.hypot(ax, ay, az); return { x: (ax / l) * s, y: (ay / l) * s, z: (az / l) * s, w: Math.cos(a / 2) }; };
  const stem = (y0: number, y1: number, x = 0) => ({ shape: 'capsule' as const, pos: v(x, (y0 + y1) / 2, 0), rot: q(0, 0, 1, 0), size: v(r, (y1 - y0) / 2, 0) });
  const branch = { shape: 'capsule' as const, pos: v(9, 40, 0), rot: q(0, 0, 1, -1.0), size: v(0.8, 11, 0) };
  const leafA = { shape: 'ellipsoid' as const, pos: v(-11, 48, 2), rot: q(0, 0, 1, 0.25), size: v(10, 0.35, 5.5) };
  const leafB = { shape: 'ellipsoid' as const, pos: v(4, 62, -8), rot: q(1, 0, 0, -0.3), size: v(5, 0.35, 9) };
  const prims = [stem(-1, 30), stem(30, 70), branch, leafA, leafB];
  const plant = src.plant(prims, [v(-r, 58, 0), v(9 + 0.8, 40.8, 0), v(-11, 47.6, 2), v(-r, 20, 0)]);
  src.herd(plant, 0, 320);  // upper stem: above the instance cap, the rest drawn in the density layer
  src.herd(plant, 1, 12);   // branch
  src.herd(plant, 2, 200);  // leaf underside
  src.herd(plant, 3, 40).kind = 'scale'; // lower stem: a (T3) scale herd
  src.creature('ladybird', v(r, 64, 0), { up: v(1, 0, 0), fwd: v(0, -1, 0), state: 'feed' });
  src.creature('lacewing-larva', v(0, 26, r), { up: v(0, 0, 1), fwd: v(0, 1, 0), state: 'feed' });
  src.ant(v(0, 52, -r), 0);
  const ant = src.state.ants[src.state.ants.length - 1]!; ant.up = v(0, 0, -1); ant.prevUp = { ...ant.up }; ant.fwd = v(0, 1, 0); ant.prevFwd = { ...ant.fwd };
  return {
    cam: { target: [0, 42, 0], dist: 95, az: 25, el: 8, fov: 30 }, labels: [], prims: src.world.prims.slice(),
    items: {
      stem: { target: [0, 56, 0], dist: 30, az: 20, el: 5, fov: 30 }, leaf: { target: [-10, 46, 2], dist: 32, az: 15, el: -28, fov: 30 },
      dense: { target: [0, 46, 0], dist: 48, az: 200, el: 6, fov: 30 }, scale: { target: [0, 20, 0], dist: 18, az: 30, el: 10, fov: 30 },
    },
  };
}

/** An antlion pit on dry sand with the antlion lurking at the bottom and ants around the rim. */
export function pit(src: DemoSource): SceneSetup {
  const p = src.pit(v(0, 0, 0), 22, 15);
  src.creature('antlion', v(0, 0, 0), { heading: 0.6, state: 'wait', bb: { pit: p.id } });
  src.ant(v(-26, 0, 10), EAST); src.ant(v(18, 0, 22), -2.2); src.ant(v(28, 0, -6), -1.2);
  return {
    cam: { target: [0, -4, 0], dist: 70, az: 20, el: 42, fov: 32 }, labels: [], sand: 1,
    items: { low: { target: [0, -2, 0], dist: 75, az: 15, el: 22, fov: 32 }, close: { target: [0, -12, 0], dist: 32, az: 10, el: 62, fov: 32 } },
  };
}

/** The bird event: a thrush landed among foragers; the beak striking at one of them (or the approach shadow). */
export function bird(src: DemoSource, phase: 'approach' | 'landed'): SceneSetup {
  const ants: Vec3[] = [];
  for (let i = 0; i < 18; i++) { const a = i * 2.4, r = 10 + (i % 6) * 9; ants.push(v(Math.cos(a) * r, 0, Math.sin(a) * r)); src.ant(ants[i]!, a + 1.5, 0); }
  const t = src.state.tick;
  const aim = ants[3]!;
  src.state.ecology.birdEvent = phase === 'approach'
    ? { variant: 'thrush', pos: v(0, 0, 0), phase: 'approach', startTick: t - 24, landTick: t + 6, endTick: -1, nextPeckTick: -1, peckAim: null }
    : { variant: 'thrush', pos: v(0, 0, 0), phase: 'landed', startTick: t - 120, landTick: t - 90, endTick: t + 200, nextPeckTick: t + 15 - 1, peckAim: { ...aim } };
  void TICKS_PER_SECOND;
  return { cam: { target: [0, 20, 0], dist: 230, az: 30, el: 22, fov: 34 }, labels: [], items: { low: { target: [aim.x, 12, aim.z], dist: 75, az: 200, el: 6, fov: 40 } } };
}

/** The three spiders (one in a strike wind-up) with ants, plus an opt-in mite and centipede. */
export function comfort(src: DemoSource): SceneSetup {
  const t = src.state.tick;
  src.creature('wolf-spider', v(-25, 0, 0), { heading: EAST, state: 'windup', stateTick: t - 3, bb: { strikeAt: t + 3 } });
  src.creature('jumping-spider', v(0, 0, 0), { heading: EAST, state: 'stalk' });
  src.creature('ant-spider', v(18, 0, 0), { heading: EAST, state: 'patrol' });
  src.creature('centipede', v(-5, 0, 22), { heading: EAST, state: 'prowl' });
  for (const x of [-12, 9, 25]) src.ant(v(x, 0, 6), -EAST);
  return { cam: { target: [-2, 0, 6], dist: 80, az: 15, el: 30, fov: 32 }, labels: [] };
}

/** Mixed crowd of n creatures (weights follow the catalogue caps) walking in circles; optional n ants. */
export function crowd(src: DemoSource, n: number, ants: number): SceneSetup {
  const kinds: CreatureKind[] = ['springtail', 'springtail', 'springtail', 'mite', 'fruit-fly', 'fly-larva', 'fly-larva', 'woodlouse', 'woodlouse', 'caterpillar',
    'ladybird', 'ladybird-larva', 'lacewing-larva', 'rove-beetle', 'millipede', 'snail', 'earthworm', 'wolf-spider', 'jumping-spider', 'ant-spider', 'centipede'];
  const side = Math.ceil(Math.sqrt(n));
  for (let i = 0; i < n; i++) {
    const k = kinds[i % kinds.length]!, gx = i % side, gz = Math.floor(i / side);
    const c = src.creature(k, v(gx * 14 - side * 7, 0, gz * 14 - side * 7), { heading: (i * 1.7) % 6.28, script: k === 'springtail' ? 'still' : 'circle', walkSpeed: Math.min(20, CREATURE_STATS[k].walkMmS), radius: 4 + (i % 5) });
    c.origin = { ...c.pos };
  }
  for (let i = 0; i < ants; i++) { const gx = i % side, gz = Math.floor(i / side); src.ant(v(gx * 14 - side * 7 + 6, 0, gz * 14 - side * 7 + 6), (i * 2.3) % 6.28, 24); }
  return { cam: { target: [0, 0, 0], dist: side * 14 * 1.1, az: 20, el: 35, fov: 40 }, labels: [] };
}
