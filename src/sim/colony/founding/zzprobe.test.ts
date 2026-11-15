import { it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { canDigAt } from '@/sim/nest';
import { nestOf, phase, pinTemperature, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { cavityEntrances } from './dig';
import { plugRemnants } from './reopen';
const log = (...a: unknown[]) => (globalThis as unknown as { process: { stderr: { write(s: string): void } } }).process.stderr.write(a.join(' ') + '\n');

it('reopen probe', () => {
  const sim = searchingSim({ seed: 2 });
  pinTemperature(sim, 28);
  const r = readyInRampCell(sim);
  act(sim, 'dig-bite');
  walkTo(sim, r.rampAt(1.5), 0.5);
  act(sim, 'seal-entrance');
  stepUntil(sim, () => phase(sim) === 'lay', 20);
  walkTo(sim, r.floor, 0.8);
  for (let i = 0; i < 3; i++) act(sim, 'lay-egg');
  sim.tick();
  sim.enqueue({ type: 'openingBeginTimelapse' });
  stepUntil(sim, () => phase(sim) === 'handover' || phase(sim) === 'failed', 40_000);
  const nest = nestOf(sim);
  const t0 = sim.state.tick;
  const ev: string[] = [];
  sim.events.on('plan-created', (e) => ev.push(((sim.state.tick - t0) / 6000).toFixed(3) + ':' + e.kind));
  sim.events.on('entrance-state-changed', (e) => ev.push(((sim.state.tick - t0) / 6000).toFixed(3) + ':' + e.prev + '>' + e.status));
  const fails: Record<string, number> = {};
  sim.events.on('action-failed', (e) => { fails[`${e.action}:${e.reason}`] = (fails[`${e.action}:${e.reason}`] ?? 0) + 1; });
  for (let i = 0; i < 30; i++) {
    stepUntil(sim, () => false, 300);
    for (const p of nest.digPlans) if (p.source === 'founding' && p.status !== 'complete' && p.status !== 'cancelled') {
      log('t', ((sim.state.tick - t0) / 6000).toFixed(3), 'plan', p.id, p.status, 'rv', p.removedVolume.toFixed(2), 'slots', JSON.stringify(p.slots.map((s) => s.antId)),
        sim.state.ants.filter((a) => a.alive && a.bb.planId === p.id).map((a) => `${a.id}:${a.state}:${a.nav.status}:${a.action?.id ?? '-'}@${a.pos.x.toFixed(0)},${a.pos.y.toFixed(0)},${a.pos.z.toFixed(0)}`).join(' '));
    }
  }
  log('fails', JSON.stringify(fails));
  log('events', ev.join(' '));
  for (const e of cavityEntrances(sim, nest)) {
    const rem = plugRemnants(sim, e);
    log('entr', e.id, e.status, e.plugVoxelCount, 'rem', rem.length, JSON.stringify(rem.slice(0, 3)), 'epos', JSON.stringify(e.pos));
    for (const p of rem.slice(0, 3)) {
      log(' dig', canDigAt(sim, 'lasius-niger', p), ' field', sim.field.sample(p).toFixed(2), 'sub', sim.field.substrate(p).toFixed(2), 'comp', sim.nestNav.componentAt(p));
    }
  }
  for (const p of nest.digPlans) if (p.source === 'founding') {
    log('fplan', JSON.stringify({ a: p.anchor.pos, geom: p.geom, sph: p.spheres, win: p.window, slots: p.slots, tv: p.targetVolume, rv: p.removedVolume }));
    for (const s of p.slots) { const a = sim.stores.ants.get(s.antId); if (a) log(' slotant', a.id, a.state, a.nav.status, JSON.stringify(a.pos), a.action?.id); }
  }
  log('plans', JSON.stringify(nest.digPlans.map((p) => [p.kind, p.source, p.status, p.blockedReason])));
}, 600000);
