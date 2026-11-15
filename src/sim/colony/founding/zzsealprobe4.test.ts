import { describe, it } from 'vitest';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';
import { throatCase } from './sealKit';
import { entranceToSeal, inSealReach } from './sealPlan';
import { SG } from './sealGuide';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('probe4', () => {
  it('refusals', () => {
    const c = throatCase({ pitchDeg: 85, widthBu: 3, soil: 'sand' });
    const sim = c.sim; pinTemperature(sim, 22);
    const q = queen(sim), bu = sim.world.bu;
    sim.enqueue({ type: 'possess', antId: q.id }); sim.tick();
    sim.events.on('action-failed', (e) => {
      if (e.antId !== q.id) return;
      const en = entranceToSeal(sim, nestOf(sim));
      log('fail', sim.state.tick, e.action, e.reason, 'sg', q.bb[SG.state], 'carry', q.carry.kind, sim.stores.items.get(q.carry.id)?.kind, 'reach', en ? inSealReach(sim, en, q.pos) : null, 'd', en ? (Math.hypot(q.pos.x - en.pos.x, q.pos.y - en.pos.y, q.pos.z - en.pos.z) / bu).toFixed(2) : '-', 'ents', nestOf(sim).entrances.map((x) => x.id + ':' + x.status).join());
    });
    sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    for (let i = 0; i < 30 && phase(sim) === 'seal'; i++) {
      stepUntil(sim, () => false, 50);
      const en = entranceToSeal(sim, nestOf(sim));
      log('t', sim.state.tick, 'sg', q.bb[SG.state], 'speed', (q.speed / bu).toFixed(2), 'medium', q.medium, 'reach', en ? inSealReach(sim, en, q.pos, 0.1 * bu) : null, 'carry', q.carry.kind, 'plugs', q.bb[SG.total], 'pos', (q.pos.y / bu).toFixed(2));
    }
    log('end', phase(sim));
  }, 600_000);
});
