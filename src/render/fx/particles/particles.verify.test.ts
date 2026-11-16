// Reviewer tests (scent-fx review): the cue feed's event mapping and the system's drop rules, on a real sim.
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@/sim/types';
import { fxScenario } from '../../../../spikes/fx-demo/scenario';
import { EmitQueue, feedEvent, type PendingEmit } from './cueFeed';
import { ParticlePool } from './ParticlePool';
import { ParticleSystem } from './ParticleSystem';
import { EMIT_MAX_AGE_TICKS, MATERIAL_GRAIN, PARTICLE_BUDGET } from './tuning';

const sc = fxScenario(1, 4);
const sim = sc.sim;
const pos = { x: sc.entrance.pos.x + 20, y: sc.entrance.pos.y, z: sc.entrance.pos.z + 20 };

function fed(ev: SimEvent): PendingEmit[] {
  const q = new EmitQueue(16);
  feedEvent(sim, q, ev);
  const out: PendingEmit[] = [];
  q.drain((e) => out.push({ ...e }));
  return out;
}

describe('cue feed (review)', () => {
  it('maps cues to effects once per bite, ignores cues without a position', () => {
    expect(fed({ type: 'cue', cue: 'dig-bite', pos, strength: 1 } as SimEvent)).toHaveLength(0);
    const bite = fed({ type: 'cue', cue: 'dig-bite.loam', pos, strength: 1 } as SimEvent);
    expect(bite.map((e) => [e.kind, e.color])).toEqual([['debris', MATERIAL_GRAIN.loam]]);
    expect(fed({ type: 'cue', cue: 'alarm-burst', pos: null, strength: 1 } as SimEvent)).toHaveLength(0);
    expect(fed({ type: 'cue', cue: 'raindrop-hit', pos, strength: 0 } as SimEvent)[0].strength).toBeGreaterThan(0);
    const expelled = fed({ type: 'pellet-expelled', antId: 1, itemId: 2, volume: 1, material: 'sand', pos, moundId: -1 } as SimEvent);
    expect(expelled.map((e) => e.kind)).toEqual(['pellet', 'dust']);
    // an unknown material falls back to the recipe colour instead of failing
    expect(fed({ type: 'cue', cue: 'dig-bite.unobtainium', pos, strength: 1 } as SimEvent)[0].color).toBeNull();
  });

  it('drops stale records (time-lapse) and far ones; a zero-capacity budget spawns nothing', () => {
    const ps = new ParticleSystem(PARTICLE_BUDGET.high);
    ps.setSim(sim);
    const cam = { x: pos.x, y: pos.y + 20, z: pos.z };
    const frame = { dt: 0.05, camera: cam, scentOn: false, inks: { trail: '#E69F00', home: '#56B4E9', alarm: '#D55E00' } };
    ps.queue.push('debris', pos.x, pos.y, pos.z, sim.state.tick - EMIT_MAX_AGE_TICKS - 1);
    ps.queue.push('debris', pos.x + 1e6, pos.y, pos.z, sim.state.tick);
    ps.update(frame);
    expect(ps.fx.count).toBe(0);
    expect(ps.stats().dropped).toBe(2);
    ps.queue.push('debris', pos.x, pos.y, pos.z, sim.state.tick);
    ps.update(frame);
    expect(ps.fx.count).toBeGreaterThan(0);
    ps.dispose();
    const off = new ParticleSystem(PARTICLE_BUDGET.test);
    off.setSim(sim);
    off.queue.push('debris', pos.x, pos.y, pos.z, sim.state.tick);
    off.update(frame);
    expect(off.fx.count + off.motes.count).toBe(0);
    off.dispose();
  });

  it('pool: a huge dt kills everything, NaN / zero / negative dt changes nothing', () => {
    const p = new ParticlePool(4);
    const spec = { x: 0, y: 1, z: 0, vx: 1, vy: 0, vz: 0, life: 1, size: 1, grow: 1, r: 1, g: 1, b: 1, alpha: 1, gravity: 0, drag: 0, floor: -Infinity };
    p.spawn(spec); p.spawn(spec);
    for (const dt of [0, -1, Number.NaN]) { p.step(dt); expect(p.position[0]).toBe(0); }
    p.step(1e6);
    expect(p.count).toBe(0);
  });
});
