import { describe, it } from 'vitest';
import { begin } from '@/sim/ants';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';
import { throatCase } from './sealKit';
import { SG } from './sealGuide';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('probe2', () => {
  it('detail', () => {
    const c = throatCase({ pitchDeg: Number(env.env.P ?? 45), widthBu: Number(env.env.W ?? 2.1), soil: 'loam' });
    const sim = c.sim; pinTemperature(sim, 22);
    const q = queen(sim), bu = sim.world.bu;
    sim.events.on('action-failed', (e) => { if (e.antId === q.id) log('fail', sim.state.tick, e.action, e.reason); });
    sim.events.on('action-completed', (e) => { if (e.antId === q.id) log('done', sim.state.tick, e.action); });
    sim.events.on('entrance-state-changed', (e) => log('ent', sim.state.tick, e.prev, '>', e.status, 'carry', q.carry.kind, 'action', q.action?.id ?? '-', 'phase', phase(sim), 'fstate', nestOf(sim).founding?.state));
    sim.events.on('pellet-created', (e) => { if (e.antId === q.id) log('pellet', sim.state.tick); });
    begin(sim, q, 'seal-entrance', null);
    const f = (x: number) => (x / bu).toFixed(2);
    for (let i = 0; i < 30 && phase(sim) === 'seal'; i++) {
      stepUntil(sim, () => false, 10);
      const e = nestOf(sim).entrances[0];
      log('t', sim.state.tick, 'sg', q.bb[SG.state], 'pos', f(q.pos.x), f(q.pos.y), f(q.pos.z), 'stand', f(q.bb[SG.sx] ?? 0), f(q.bb[SG.sy] ?? 0), f(q.bb[SG.sz] ?? 0),
        'nav', q.nav.status, q.nav.mode, 'action', q.action?.id ?? '-', 'carry', q.carry.kind, 'ent', e.status, e.plugVoxelCount, 'd', f(Math.hypot(q.pos.x - e.pos.x, q.pos.y - e.pos.y, q.pos.z - e.pos.z)), 'replans', q.bb[SG.replans], 'plugs', q.bb[SG.total], 'fwd', q.fwd.x.toFixed(2), q.fwd.y.toFixed(2), q.fwd.z.toFixed(2), 'T', f(q.bb[SG.tx] ?? 0), f(q.bb[SG.ty] ?? 0), f(q.bb[SG.tz] ?? 0));
    }
  }, 600_000);
});
