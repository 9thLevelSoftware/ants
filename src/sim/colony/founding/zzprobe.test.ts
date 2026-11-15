import { it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { validatePlan } from '@/sim/nest';
import { nestOf, phase, pinTemperature, searchingSim, stepUntil } from './testkit';
import { act, readyInRampCell, walkTo } from './verifyKit';
import { plugInnerFace } from './reopen';
import { cavityEntrances } from './dig';

it('probe', async () => {
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
  console.log('phase', phase(sim), 'entr', JSON.stringify(nest.entrances.map((e) => [e.id, e.status, e.pos])), 'cav', cavityEntrances(sim, nest).map((e) => e.id));
  for (const e of nest.entrances) {
    const face = plugInnerFace(sim, nest, e);
    console.log('face', e.id, JSON.stringify(face));
    if (face) for (const src of ['founding', 'player'] as const) console.log('tunnel', src, JSON.stringify(validatePlan(sim, { nestId: nest.id, kind: 'tunnel', anchor: { pos: face, normal: { x: 0, y: 1, z: 0 } }, end: e.pos, priority: 'urgent', confirmWarnings: true }, src)).slice(0, 200));
    if (face) console.log('validate', JSON.stringify(validatePlan(sim, { nestId: nest.id, kind: 'entrance', anchor: { pos: face, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: e.pos, priority: 'urgent', confirmWarnings: true }, 'founding')).slice(0, 300));
  }
  for (const p of nest.digPlans) console.log('plan', JSON.stringify({ id: p.id, w: p.window, slots: p.slots, sph: p.spheres, tv: p.targetVolume, front: (p as unknown as { frontier: unknown }).frontier, spoil: p.spoilPoint }).slice(0, 900));
  { const { slotInReach } = await import('@/sim/nest'); void slotInReach; }
  for (let i = 0; i < 3; i++) {
    stepUntil(sim, () => false, TICKS_PER_DAY / 8);
    const ws = sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
    console.log((i + 1) / 8, 'plans', JSON.stringify(nest.digPlans.map((p) => [p.id, p.kind, p.status, p.slots.map((s) => s.antId), p.blockedReason])), 'entr', nest.entrances.map((e) => e.status + ':' + e.plugVoxelCount).join(','),
      'workers', ws.map((a) => `${a.task}/${a.state}/${a.nav.status}`).slice(0, 6).join(' '));
  }
}, 300000);
