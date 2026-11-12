// Step 1b (last): footpaths as polylines (GDD 04 §1.4): connect 2-3 human nodes (door or patio, gates on map
// edges, a bench), routed by A* on a 250 mm grid with cost noise around the other built zones, then smoothed by
// Chaikin x2.

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import { fbm2 } from '@/core/math/noise';
import type { ArchetypeId } from '@/sim/types';
import { BUILT_SIZE } from '../tuning/archetypes';
import { MinHeap } from '../kit/heap';
import type { BuiltPlan } from './built';
import type { HumanNode, Point2, Rect, Side } from './types';
import { fromSide, inRect, SIDES } from './geom';

export interface PathPlan { line: Point2[]; width: number; nodes: HumanNode[] }

const range = (rng: RngState, lo: number, hi: number) => lo + rngFloat(rng) * (hi - lo);

function gate(rng: RngState, side: Side, L: number): HumanNode {
  const p = fromSide(side, 0, range(rng, 0.15 * L, 0.85 * L), L);
  return { kind: 'gate', x: p.x, z: p.z };
}

/** Human nodes the path joins, per archetype. */
function pathNodes(rng: RngState, arch: ArchetypeId, plan: BuiltPlan, L: number, blocked: (x: number, z: number) => boolean): HumanNode[] {
  const freeSides = SIDES.filter((s) => s !== plan.facadeSide && !plan.roadSides.includes(s));
  const sides = freeSides.length > 0 ? freeSides : [...SIDES];
  const sideA = sides[rngInt(rng, 0, sides.length - 1)];
  const others = sides.filter((s) => s !== sideA);
  const sideB = others.length > 0 ? others[rngInt(rng, 0, others.length - 1)] : sideA;
  const bench = (): HumanNode => {
    for (let t = 0; t < 32; t++) {
      const x = range(rng, 0.2 * L, 0.8 * L), z = range(rng, 0.2 * L, 0.8 * L);
      if (!blocked(x, z)) return { kind: 'bench', x, z };
    }
    return { kind: 'bench', x: L / 2, z: L / 2 };
  };
  const patio = plan.rects.find((r) => r.kind === 'patio')?.rect;
  const home = (): HumanNode | null => {
    const door = plan.nodes.find((n) => n.kind === 'door');
    if (door) return door;
    if (patio) return { kind: 'door', x: (patio.x0 + patio.x1) / 2, z: (patio.z0 + patio.z1) / 2 };
    return null;
  };
  // the last play node is the rubber surface (passable); the sand pit centre itself is not
  const play = [...plan.nodes].reverse().find((n) => n.kind === 'play');
  const withBench = rngFloat(rng) < 0.5;
  switch (arch) {
    case 'suburban-garden': case 'kitchen-door': {
      const h = home();
      const g = gate(rng, sideA, L);
      return h ? (withBench ? [h, bench(), g] : [h, g]) : [bench(), g];
    }
    case 'playground-park':
      return play ? (withBench ? [gate(rng, sideA, L), play, gate(rng, sideB, L)] : [gate(rng, sideA, L), play]) : [gate(rng, sideA, L), bench()];
    default:
      return [gate(rng, sideA, L), bench(), gate(rng, sideB, L)];
  }
}

export function routePath(rng: RngState, arch: ArchetypeId, plan: BuiltPlan, L: number, seed: number): PathPlan | null {
  const g = BUILT_SIZE.pathGrid;
  const n = Math.ceil(L / g);
  const passable = (r: { kind: string }) => r.kind === 'patio' || r.kind === 'sidewalk' || r.kind === 'rubber';
  const hard: Rect[] = plan.rects.filter((r) => !passable(r)).map((r) => r.rect);
  const blocked = (x: number, z: number) => hard.some((r) => inRect(r, x, z));
  const width = range(rng, BUILT_SIZE.pathWidth[0], BUILT_SIZE.pathWidth[1]);
  const nodes = pathNodes(rng, arch, plan, L, blocked);
  if (nodes.length < 2) return null;
  const cost = new Float32Array(n * n);
  const inv = 1 / BUILT_SIZE.pathNoiseWavelength;
  for (let k = 0; k < n; k++) for (let i = 0; i < n; i++) {
    const x = (i + 0.5) * g, z = (k + 0.5) * g;
    cost[k * n + i] = blocked(x, z) ? -1 : 1 + BUILT_SIZE.pathNoise * (0.5 + 0.5 * fbm2(x * inv, z * inv, seed ^ 0x7a7, 2));
  }
  const cellOf = (p: Point2) => Math.min(n - 1, Math.max(0, Math.floor(p.z / g))) * n + Math.min(n - 1, Math.max(0, Math.floor(p.x / g)));
  const cells: number[] = [];
  for (let s = 0; s + 1 < nodes.length; s++) {
    // a blocked leg (node boxed in by built zones) is routed again ignoring the blocks
    const leg = astar(cost, n, cellOf(nodes[s]), cellOf(nodes[s + 1])) ?? astar(cost.map(Math.abs), n, cellOf(nodes[s]), cellOf(nodes[s + 1]));
    if (!leg) return null;
    if (cells.length > 0) leg.shift();
    cells.push(...leg);
  }
  let line: Point2[] = cells.map((c) => ({ x: ((c % n) + 0.5) * g, z: (Math.floor(c / n) + 0.5) * g }));
  line[0] = { x: nodes[0].x, z: nodes[0].z };
  line[line.length - 1] = { x: nodes[nodes.length - 1].x, z: nodes[nodes.length - 1].z };
  for (let i = 0; i < BUILT_SIZE.pathChaikin; i++) line = chaikin(line);
  return { line, width, nodes };
}

/** 8-neighbour A* over a cost grid (cost < 0 = blocked; start and goal are always enterable). */
function astar(cost: Float32Array, n: number, start: number, goal: number): number[] | null {
  const g = new Float64Array(n * n).fill(Infinity);
  const from = new Int32Array(n * n).fill(-1);
  const heap = new MinHeap(256);
  const gx = goal % n, gz = Math.floor(goal / n);
  const h = (c: number) => { const dx = (c % n) - gx, dz = Math.floor(c / n) - gz; return Math.sqrt(dx * dx + dz * dz); };
  g[start] = 0;
  heap.push(h(start), 0, start);
  while (heap.size > 0) {
    const c = heap.topValue();
    const f = heap.topKey();
    heap.pop();
    if (c === goal) break;
    if (f - h(c) > g[c] + 1e-9) continue;
    const cx = c % n, cz = Math.floor(c / n);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const x = cx + dx, z = cz + dz;
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const j = z * n + x;
      const cj = j === goal ? 1 : cost[j];
      if (cj < 0) continue;
      const ng = g[c] + cj * (dx && dz ? Math.SQRT2 : 1);
      if (ng < g[j] - 1e-12) { g[j] = ng; from[j] = c; heap.push(ng + h(j), 0, j); }
    }
  }
  if (!(g[goal] < Infinity)) return null;
  const out: number[] = [];
  for (let c = goal; c !== -1; c = from[c]) out.push(c);
  return out.reverse();
}

/** One Chaikin corner-cutting pass (end points kept). */
function chaikin(p: Point2[]): Point2[] {
  if (p.length < 3) return p;
  const out: Point2[] = [p[0]];
  for (let i = 0; i + 1 < p.length; i++) {
    const a = p[i], b = p[i + 1];
    out.push({ x: 0.75 * a.x + 0.25 * b.x, z: 0.75 * a.z + 0.25 * b.z }, { x: 0.25 * a.x + 0.75 * b.x, z: 0.25 * a.z + 0.75 * b.z });
  }
  out.push(p[p.length - 1]);
  return out;
}
