import { describe, it } from 'vitest';
import { begin } from '@/sim/ants';
import { nestOf, phase, pinTemperature, queen, stepUntil } from './testkit';
import { throatCase } from './sealKit';
import { entranceToSeal, inSealReach, planSeal } from './sealPlan';
import { SG } from './sealGuide';
import { predictPlug } from './plugPredict';
import { floodCavity, floodStart, keyPos, throatPassageSet } from './leak';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('probe3', () => {
  it('stuck', () => {
    const c = throatCase({ pitchDeg: Number(env.env.P ?? 30), widthBu: 3, soil: (env.env.S ?? 'loam') as 'loam' });
    const sim = c.sim; pinTemperature(sim, 22);
    const q = queen(sim), bu = sim.world.bu;
    sim.enqueue({ type: 'possess', antId: q.id }); sim.tick(); sim.enqueue({ type: 'action', actionId: 'seal-entrance', phase: 'start' });
    stepUntil(sim, () => q.bb[SG.state] === 3 || phase(sim) !== 'seal', 3000);
    const nest = nestOf(sim), e = entranceToSeal(sim, nest)!;
    const f = (x: number) => (x / bu).toFixed(2);
    const pass = throatPassageSet(sim, e);
    const p = { x: 0, y: 0, z: 0 };
    log('tick', sim.state.tick, 'sg', q.bb[SG.state], 'plugs', q.bb[SG.total], 'e', f(e.pos.x), f(e.pos.y), f(e.pos.z), 'r', f(e.radius), 'passage', pass.length);
    log('passage pts', pass.slice(0, 200).map((k) => { keyPos(sim, k, p); return `${f(p.x)},${f(p.y)},${f(p.z)}`; }).join(' '));
    const cav = floodCavity(sim, floodStart(nest)).cavity;
    let inReach = 0;
    for (const k of cav.keys()) { keyPos(sim, k, p); if (inSealReach(sim, e, p, 0.25 * bu) && sim.field.substrateXYZ(p.x, p.y, p.z) < 0) { inReach++;
      for (const aim of [e.pos]) { const u = { x: aim.x - p.x, y: aim.y - p.y, z: aim.z - p.z }; const l = Math.hypot(u.x, u.y, u.z); const sp = predictPlug(sim, e, p, { x: u.x / l, y: u.y / l, z: u.z / l }, q.lengthBu * bu, []);
        log('cand', f(p.x), f(p.y), f(p.z), sp ? `${f(sp.c.x)},${f(sp.c.y)},${f(sp.c.z)} r ${f(sp.r)}` : 'null'); } } }
    log('cavity', cav.size, 'reach samples', inReach, 'plan', JSON.stringify(planSeal(sim, nest, q)?.stand ?? null), 'qpos', f(q.pos.x), f(q.pos.y), f(q.pos.z));
  }, 600_000);
});
