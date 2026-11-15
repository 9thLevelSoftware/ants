import { describe, it } from 'vitest';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { generateWorld } from '@/worldgen';
import { nestOf, phase, queen, stepUntil } from './testkit';
import { SG } from './sealGuide';
import { entranceToSeal, inSealReach, queenInCavity } from './sealPlan';
import { cavityEntrances } from './dig';
const env = (globalThis as any).process;
const log = (...a: unknown[]) => env.stderr.write(`[probe] ${a.join(' ')}\n`);
describe('gen', () => {
  it('seal on generated', () => {
    const cfg = { ...defaultGameConfig('lasius-niger', Number(env.env.SEED ?? 3)), cheats: true };
    const world = generateWorld(cfg.world);
    const sim = createSim(createNewGame(cfg, world).state, world);
    const q = queen(sim), bu = sim.world.bu;
    sim.events.on('action-failed', (e) => { if (e.antId === q.id) log('fail', sim.state.tick, e.action, e.reason); });
    sim.events.on('opening.phase', (e) => log('phase', sim.state.tick, e.from, '>', e.to));
    sim.enqueue({ type: 'cheat.completeFounding', workers: 10 });
    stepUntil(sim, () => phase(sim) === 'seal', 3000);
    const n = nestOf(sim);
    log('ents', JSON.stringify(n.entrances.map((e) => ({ id: e.id, st: e.status, r: (e.radius / bu).toFixed(2), pos: [e.pos.x / bu, e.pos.y / bu, e.pos.z / bu].map((x) => x.toFixed(1)) }))), 'cav', cavityEntrances(sim, n).map((e) => e.id).join());
    for (let i = 0; i < 20 && phase(sim) === 'seal'; i++) {
      stepUntil(sim, () => phase(sim) !== 'seal', 100);
      const e = entranceToSeal(sim, n);
      log('t', sim.state.tick, 'sg', q.bb[SG.state], 'plugs', q.bb[SG.total], 'poss', sim.state.player.possessedAntId === q.id, 'pos', (q.pos.x / bu).toFixed(1), (q.pos.y / bu).toFixed(1), (q.pos.z / bu).toFixed(1), 'reach', e ? inSealReach(sim, e, q.pos) : '-', 'inCav', queenInCavity(sim, n, q), 'carry', q.carry.kind, 'e', e?.id, e?.status);
    }
    log('end', phase(sim));
  }, 600_000);
});
