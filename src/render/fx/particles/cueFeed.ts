// Simulation events -> pending effects. The sim emits cue events and a few entity events during its ticks; this
// feed turns each into a small record in a bounded ring (oldest overwritten), drained by the particle renderer on
// its next frame (records older than EMIT_MAX_AGE_TICKS are dropped: a time-lapse leaves no burst behind).
// Read-only: nothing here writes sim state.
import type { Sim, SimEvent } from '@/sim/types';
import { harvestForm } from '@/sim/ecology/sources/harvest';
import { EMIT_QUEUE, MATERIAL_GRAIN, type EffectKind } from './tuning';

export interface PendingEmit {
  kind: EffectKind;
  x: number; y: number; z: number;
  /** Direction (unit) for directed effects, else 0. */
  dx: number; dy: number; dz: number;
  strength: number;
  color: string | null;
  tick: number;
}

export class EmitQueue {
  private readonly ring: PendingEmit[];
  private head = 0;
  private size = 0;
  /** Records overwritten before they were drained. */
  overwritten = 0;

  constructor(readonly capacity = EMIT_QUEUE) {
    this.ring = Array.from({ length: capacity }, () => ({ kind: 'debris' as EffectKind, x: 0, y: 0, z: 0, dx: 0, dy: 0, dz: 0, strength: 1, color: null, tick: 0 }));
  }

  get length(): number { return this.size; }

  push(kind: EffectKind, x: number, y: number, z: number, tick: number, strength = 1, color: string | null = null, dx = 0, dy = 0, dz = 0): void {
    const i = (this.head + this.size) % this.capacity;
    if (this.size === this.capacity) { this.head = (this.head + 1) % this.capacity; this.overwritten++; } else this.size++;
    const e = this.ring[i];
    e.kind = kind; e.x = x; e.y = y; e.z = z; e.dx = dx; e.dy = dy; e.dz = dz; e.strength = strength; e.color = color; e.tick = tick;
  }

  /** Calls fn for every pending record in order and empties the queue. */
  drain(fn: (e: PendingEmit) => void): void {
    for (let k = 0; k < this.size; k++) fn(this.ring[(this.head + k) % this.capacity]);
    this.head = 0;
    this.size = 0;
  }

  clear(): void { this.head = 0; this.size = 0; }
}

/** Food kinds whose harvesting tears pieces off (crumbs fly). */
const TORN = new Set(['carrion', 'prey', 'crumb', 'fruit', 'pet-food', 'seed']);
const FOOD_CRUMB: Record<string, string> = {
  carrion: '#6D5A3F', prey: '#6D5A3F', crumb: '#D9C08A', fruit: '#B0482E', 'pet-food': '#7A5232', seed: '#A88A5C',
};

/** The effect of one sim event, pushed onto q (null: no effect). Exported for tests. */
export function feedEvent(sim: Sim, q: EmitQueue, ev: SimEvent): void {
  const t = sim.state.tick;
  switch (ev.type) {
    case 'cue': {
      const p = ev.pos;
      if (!p) return;
      const c = ev.cue;
      // the bite itself (carve grid: hit point and material); the action's bare 'dig-bite' cue duplicates it
      if (c.startsWith('dig-bite.')) {
        const mat = c.slice(9);
        q.push('debris', p.x, p.y, p.z, t, 1, MATERIAL_GRAIN[mat as keyof typeof MATERIAL_GRAIN] ?? null);
      } else if (c === 'wood-chew') q.push('debris', p.x, p.y, p.z, t, 0.8, MATERIAL_GRAIN['wood-sound']!);
      else if (c === 'pellet-drop' || c === 'frass-drop') q.push('pellet', p.x, p.y, p.z, t, 0.6, null);
      else if (c === 'raindrop-hit' || c === 'flood') q.push('splash', p.x, p.y, p.z, t, c === 'flood' ? 1 : Math.max(0.4, ev.strength), null);
      else if (c === 'drip' || c === 'water-trickle') q.push('drip', p.x, p.y, p.z, t, 1, null);
      else if (c === 'alarm-burst') q.push('puff', p.x, p.y, p.z, t, Math.max(0.5, ev.strength), null);
      else if (c === 'antlion-flick' || c === 'collapse' || c === 'mound-slump') q.push('debris', p.x, p.y, p.z, t, 1, MATERIAL_GRAIN.sand!);
      else if (c === 'acid-spray') {
        const ant = sprayer(sim, p);
        q.push('mist', p.x, p.y, p.z, t, 1, null, ant?.fwd.x ?? 0, ant?.fwd.y ?? 0, ant?.fwd.z ?? 0);
      }
      return;
    }
    case 'pellet-created':
      q.push('debris', ev.pos.x, ev.pos.y, ev.pos.z, t, 0.5, MATERIAL_GRAIN[ev.material] ?? null);
      return;
    case 'pellet-expelled':
      q.push('pellet', ev.pos.x, ev.pos.y, ev.pos.z, t, 1, MATERIAL_GRAIN[ev.material] ?? null);
      q.push('dust', ev.pos.x, ev.pos.y, ev.pos.z, t, 1, null);
      return;
    case 'ant-submerged':
      q.push('splash', ev.pos.x, ev.pos.y, ev.pos.z, t, 0.8, null);
      return;
    case 'action-started': {
      if (ev.action !== 'pick-up' || !ev.target || ev.target.kind !== 'source') return;
      const s = sim.stores.sources.get(ev.target.id);
      if (!s || !(TORN.has(s.kind) || harvestForm(sim, s) === 'tear')) return;
      q.push('crumbs', s.pos.x, s.pos.y, s.pos.z, t, 1, FOOD_CRUMB[s.kind] ?? null);
      return;
    }
    default:
  }
}

const _ids: number[] = [];
/** The ant whose position the cue was emitted at (cue pos = ant.pos). */
function sprayer(sim: Sim, p: { x: number; y: number; z: number }) {
  sim.index.queryAnts(p, 0.5, _ids);
  for (const id of _ids) {
    const a = sim.stores.ants.get(id);
    if (a && Math.abs(a.pos.x - p.x) + Math.abs(a.pos.y - p.y) + Math.abs(a.pos.z - p.z) < 1e-3) return a;
  }
  return sim.stores.ants.get(_ids[0] ?? -1);
}

const FED: readonly SimEvent['type'][] = ['cue', 'pellet-created', 'pellet-expelled', 'ant-submerged', 'action-started'];

/** Subscribes the queue to the sim's events; returns the unsubscribe function. */
export function subscribeEffects(sim: Sim, q: EmitQueue): () => void {
  const offs = FED.map((type) => sim.events.on(type as never, ((e: SimEvent) => feedEvent(sim, q, e)) as never));
  return () => { for (const off of offs) off(); };
}
