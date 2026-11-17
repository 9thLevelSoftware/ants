// SCRATCH probe (colony-life round 3): what happens to springtails put 3 BU ahead of outbound foragers. Delete after use.
import { describe, it } from 'vitest';
import { spawnCreatureOfKind } from '@/sim/ecology';
import type { PreyPatch } from '@/sim/types';
import { zoneAt } from '@/sim/world';
import { announce, forageScenario, run } from './testkit';
import { K, PHASE } from './keys';

describe('probe', () => {
  it('hunt conversion', () => {
    const { sim, col, sources } = forageScenario({
      workers: 24, stores: { c: 1, p: 0 }, sources: [{ kind: 'nectar', variant: 'flower', distBu: 70, bearingDeg: 0, units: 50 }],
      holdNeeds: { needC: 1, needP: 1, sP: 0.9 },
    });
    const src = sources[0];
    announce(sim, col, src);
    const bu = sim.world.bu;
    const patch: PreyPatch = { id: sim.state.nextId++, center: { x: src.pos.x, y: src.pos.y, z: src.pos.z + 200 * bu }, radius: 10 * bu, kind: 'springtail', count: 100, k: 100 };
    sim.state.ecology.preyPatches.push(patch);
    const rec = new Map<number, { t0: number; ant: number; jumps: number; esc: number; chased: boolean; minD: number; end: string; trace: string[] }>();
    sim.events.on('prey-escaped', (e) => { const r = rec.get(e.creatureId); if (r) { r.esc++; r.trace.push(`${sim.state.tick - r.t0}:esc`); } });
    sim.events.on('prey-subdued', (e) => { const r = rec.get(e.creatureId); if (r) r.end = 'subdued'; });
    sim.events.on('creature-despawned', (e) => { const r = rec.get(e.id); if (r && !r.end) r.end = `despawn:${e.cause}`; });
    sim.events.on('creature-died', (e) => { const r = rec.get(e.id); if (r && !r.end) r.end = `died:${e.cause}`; });
    let tries = 0, cur = -1, last = { x: 0, z: 0 };
    console.log('zone', zoneAt(sim.world, src.pos.x, src.pos.z), sim.field.materialAt({ x: src.pos.x, y: src.pos.y - 1, z: src.pos.z }));
    for (let t = 0; t < 30000 && tries < 30; t++) {
      run(sim, 1);
      const c = cur >= 0 ? sim.stores.creatures.get(cur) : undefined;
      const r = rec.get(cur);
      if (c && c.alive && r) {
        const dx = c.pos.x - last.x, dz = c.pos.z - last.z;
        if (dx * dx + dz * dz > 900) { r.jumps++; r.trace.push(`${sim.state.tick - r.t0}:jump`); }
        last = { x: c.pos.x, z: c.pos.z };
        const a = sim.stores.ants.get(r.ant)!;
        if (a.bb[K.phase] === PHASE.hunt && a.bb[K.prey] === cur) { if (!r.chased) r.trace.push(`${sim.state.tick - r.t0}:chase`); r.chased = true; }
        const d = Math.hypot(a.pos.x - c.pos.x, a.pos.z - c.pos.z) / bu;
        r.minD = Math.min(r.minD, d);
        if ((sim.state.tick - r.t0) % 10 === 0) r.trace.push(`${sim.state.tick - r.t0}:${a.state}/${a.action?.id ?? '-'}/d${d.toFixed(1)}`);
        continue;
      }
      if (r && !r.end) r.end = 'gone?';
      cur = -1;
      const f = sim.stores.ants.list.find((a) => a.alive && a.colony === col.id && a.task === 'forage' && a.nestId < 0
        && a.bb[K.phase] === PHASE.outbound && a.carry.kind === 'none');
      if (!f) continue;
      const x = f.pos.x + f.fwd.x * 3 * bu, z = f.pos.z + f.fwd.z * 3 * bu;
      const s = spawnCreatureOfKind(sim, 'springtail', { x, y: sim.field.height(x, z), z }, { state: 'graze', bb: { patch: patch.id, contact: sim.state.tick } });
      if (!s) continue;
      cur = s.id; last = { x: s.pos.x, z: s.pos.z };
      rec.set(s.id, { t0: sim.state.tick, ant: f.id, jumps: 0, esc: 0, chased: false, minD: Infinity, end: '', trace: [] });
      tries++;
    }
    const sum: Record<string, number> = {};
    for (const r of rec.values()) { const k = `${r.chased ? 'chased' : 'not-chased'} ${r.end}`; sum[k] = (sum[k] ?? 0) + 1; }
    console.log(JSON.stringify(sum));
    for (const [id, r] of rec) console.log(id, r.end, 'jumps', r.jumps, 'esc', r.esc, 'minD', r.minD.toFixed(2), r.trace.slice(0, 40).join(' '));
  }, 300_000);
});
