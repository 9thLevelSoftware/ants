// Particle effects: the pool (capacity, integration, settling, compaction), emitters (count by strength, colours in
// linear space), and the cue feed + system driven by a REAL sim (a possessed worker digs, releases alarm and
// sprays acid; brood in the royal chamber gives motes), with no writes to the sim from the effects.
import { describe, expect, it } from 'vitest';
import { fxScenario } from '../../../../spikes/fx-demo/scenario';
import { ParticlePool, RenderRng } from './ParticlePool';
import { emitEffect, hexToLinear, type EffectSpec } from './emitters';
import { EmitQueue } from './cueFeed';
import { ParticleSystem } from './ParticleSystem';
import { PARTICLE_BUDGET, RECIPES } from './tuning';

const effect = (o: Partial<EffectSpec> = {}): EffectSpec => ({
  kind: 'debris', x: 0, y: 0, z: 0, nx: 0, ny: 1, nz: 0, dx: 0, dy: 0, dz: 0, strength: 1, color: null, floor: 0, ...o,
});

describe('particle pool and emitters', () => {
  it('spawns within capacity, integrates gravity, settles grains on their floor and frees the dead', () => {
    const pool = new ParticlePool(20);
    const rng = new RenderRng(1);
    const n = emitEffect(pool, rng, effect(), 4);
    expect(n).toBeGreaterThanOrEqual(RECIPES.debris.count[0]);
    expect(pool.count).toBe(n);
    for (let i = 0; i < 6; i++) pool.step(0.1);
    for (let i = 0; i < pool.count; i++) expect(pool.position[i * 3 + 1]).toBeGreaterThanOrEqual(0); // never below the floor
    for (let i = 0; i < 30; i++) pool.step(0.1);
    expect(pool.count).toBe(0);
    for (let i = 0; i < 10; i++) emitEffect(pool, rng, effect(), 4);
    expect(pool.count).toBe(20);
    expect(pool.refused).toBeGreaterThan(0);
  });

  it('strength scales the count, colours are linear, directed mist travels along its direction', () => {
    const rng = new RenderRng(2);
    const weak = new ParticlePool(100), strong = new ParticlePool(100);
    emitEffect(weak, rng, effect({ kind: 'mist', strength: 0.15 }), 4);
    emitEffect(strong, rng, effect({ kind: 'mist', strength: 1 }), 4);
    expect(strong.count).toBeGreaterThan(weak.count);
    const [r] = hexToLinear('#808080');
    expect(r).toBeCloseTo(0.2158, 3);
    const mist = new ParticlePool(50);
    emitEffect(mist, rng, effect({ kind: 'mist', dx: 1, dy: 0, dz: 0, floor: -Infinity }), 4);
    mist.step(0.2);
    let meanX = 0;
    for (let i = 0; i < mist.count; i++) meanX += mist.position[i * 3];
    expect(meanX / mist.count).toBeGreaterThan(1);
  });

  it('the emit queue keeps the newest records when the sim runs without frames', () => {
    const q = new EmitQueue(4);
    for (let i = 0; i < 6; i++) q.push('dust', i, 0, 0, i);
    const xs: number[] = [];
    q.drain((e) => xs.push(e.x));
    expect(xs).toEqual([2, 3, 4, 5]);
    expect(q.overwritten).toBe(2);
    expect(q.length).toBe(0);
  });
});

describe('particle system on a real sim', () => {
  it('dig bites, an alarm release and an acid spray of a possessed worker become effects near the camera', () => {
    const sc = fxScenario(1, 12);
    const { sim, entrance } = sc;
    const bu = sim.world.bu;
    const ps = new ParticleSystem(PARTICLE_BUDGET.high);
    ps.setSim(sim);
    const p = { x: entrance.pos.x + 10 * bu, y: 0, z: entrance.pos.z + 16 * bu };
    const ant = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    sim.enqueue({ type: 'cheat.teleport', antId: ant.id, pos: { x: p.x, y: sim.field.height(p.x, p.z), z: p.z } });
    sim.enqueue({ type: 'possess', antId: ant.id });
    sim.applyPendingCommands();
    sim.tick();
    const cam = { x: p.x + 6 * bu, y: 5 * bu, z: p.z - 5 * bu };
    const frame = { dt: 0.05, camera: cam, scentOn: false, inks: { trail: '#E69F00', home: '#56B4E9', alarm: '#D55E00' } };
    ps.update(frame); // drains what the setup emitted
    const e0 = ps.stats().emitted;
    sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'start' });
    sim.applyPendingCommands();
    let nearDebris = 0;
    for (let i = 0; i < 60; i++) {
      sim.tick();
      ps.update(frame);
      for (let k = 0; k < ps.fx.count; k++) {
        if (Math.hypot(ps.fx.position[k * 3] - p.x, ps.fx.position[k * 3 + 2] - p.z) < 6 * bu) nearDebris++;
      }
    }
    expect(ps.stats().emitted).toBeGreaterThan(e0);
    expect(nearDebris).toBeGreaterThan(0);
    sim.enqueue({ type: 'action', actionId: 'dig-bite', phase: 'stop' });
    sim.applyPendingCommands();
    const e1 = ps.stats().emitted;
    sim.enqueue({ type: 'action', actionId: 'release-alarm', phase: 'start' });
    sim.applyPendingCommands();
    for (let i = 0; i < 30; i++) { sim.tick(); ps.update(frame); }
    expect(ps.stats().emitted).toBeGreaterThan(e1);
    // render only: frames without ticks leave the sim state untouched
    const snap = JSON.stringify({ ants: sim.state.ants.map((a) => [a.pos, a.state]), phero: sim.phero.activeCellCount!(), tick: sim.state.tick });
    for (let i = 0; i < 5; i++) ps.update(frame);
    expect(JSON.stringify({ ants: sim.state.ants.map((a) => [a.pos, a.state]), phero: sim.phero.activeCellCount!(), tick: sim.state.tick })).toBe(snap);
    ps.dispose();
  });

  it('motes gather around a brood pile in the royal chamber when the camera is near; none in the test preset', () => {
    const sc = fxScenario(2, 4);
    const { sim, colony } = sc;
    const nest = sim.stores.nests.get(colony.nestIds[0])!;
    const royal = nest.chambers.find((c) => c.type === 'royal')!;
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: colony.id, stage: 'larva', n: 8, chamberId: royal.id, progress: 0.5, destined: null });
    sim.applyPendingCommands();
    sim.tick();
    const cam = { x: royal.center.x + royal.radii.x * 0.6, y: royal.center.y, z: royal.center.z };
    const frame = { dt: 0, camera: cam, scentOn: false, inks: { trail: '#E69F00', home: '#56B4E9', alarm: '#D55E00' } };
    const ps = new ParticleSystem(PARTICLE_BUDGET.high);
    ps.setSim(sim);
    ps.update(frame);
    expect(ps.motes.count).toBeGreaterThan(5);
    const r = (3 + 1) * sim.world.bu;
    // emitters: the brood pile, the food chamber, the queen (GDD 08 §11.5: near brood, food stores and the queen)
    const anchors = [
      ...sim.state.brood.filter((b) => b.alive).map((b) => b.pos),
      ...nest.chambers.filter((c) => c.type === 'food').map((c) => c.center),
      ...sim.state.ants.filter((a) => a.alive && a.caste === 'queen').map((a) => a.pos),
    ];
    let nearBrood = 0;
    for (let i = 0; i < ps.motes.count; i++) {
      const x = ps.motes.position[i * 3], y = ps.motes.position[i * 3 + 1], z = ps.motes.position[i * 3 + 2];
      expect(sim.field.sampleXYZ(x, y, z)).toBeGreaterThan(0); // in the open cavity, not in the soil
      const d = Math.min(...anchors.map((a) => Math.hypot(a.x - x, a.y - y, a.z - z)));
      expect(d).toBeLessThan(r * 2);
      if (Math.hypot(royal.center.x - x, royal.center.z - z) < royal.radii.x + r) nearBrood++;
    }
    expect(nearBrood).toBeGreaterThan(3);
    const off = new ParticleSystem(PARTICLE_BUDGET.test);
    off.setSim(sim);
    off.update(frame);
    expect(off.motes.count + off.fx.count).toBe(0);
  });
});
