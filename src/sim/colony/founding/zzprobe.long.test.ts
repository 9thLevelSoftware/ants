import { it } from 'vitest';
import { defaultGameConfig } from '@/sim/createGame';
import { generateWorld } from '@/worldgen';
import { goodSite, playerCase, setSweepDebug, sweepSim } from './sweepKit';
import { SG } from './sealGuide';
import { nestOf, phase, queen } from './testkit';
import { cavityEntrances } from './dig';
import { cellReachesAir, planSeal, queenInCavity } from './sealPlan';
import { passageLayers } from './leak';
const w = (s: string) => process.stderr.write(s + '\n');
it('probe', () => {
  const seed = Number(process.env.PSEED ?? 3);
  const cfg = { ...defaultGameConfig('lasius-niger', seed), cheats: true };
  const world = generateWorld(cfg.world);
  const sim = sweepSim(world, cfg);
  const site = goodSite(sim, 120);
  const q = queen(sim), bu = sim.world.bu;
  setSweepDebug(w);
  let n = 0;
  const off = sim.events.on('action-started', (e) => { if (e.antId === q.id && e.action === 'seal-entrance') w(`  plug start t${sim.state.tick} strat ${q.bb[SG.strategy]}`); });
  const orig = sim.tick.bind(sim);
  (sim as any).tick = () => {
    orig();
    if (phase(sim) === 'seal' && n++ % 100 === 0) {
      const nest = nestOf(sim);
      const e = cavityEntrances(sim, nest);
      const p = planSeal(sim, nest, q, [], 0, ['narrow', 'below', 'deep', 'near', 'mouth'][(q.bb[SG.strategy] ?? 0) % 5] as any);
      w(`t${sim.state.tick} st ${q.bb[SG.state]} strat ${q.bb[SG.strategy]} ch ${q.bb[SG.changes]} plugs ${q.bb[SG.total]} carry ${q.carry.kind} in ${queenInCavity(sim, nest, q)} air ${cellReachesAir(sim, nest)} ents ${e.map((x) => `${x.kind}:${x.status}:r${(x.radius / bu).toFixed(1)}:d${(Math.hypot(q.pos.x - x.pos.x, q.pos.y - x.pos.y, q.pos.z - x.pos.z) / bu).toFixed(1)}`).join(',')} layers ${e[0] ? [...passageLayers(sim, e[0]).values()].map((l) => l.length).join('/') : ''} plan ${p ? `here ${p.here.ok} stand ${p.stand ? 'y' : 'n'} aimd ${(Math.hypot(p.aim.x - (e[0]?.pos.x ?? 0), p.aim.y - (e[0]?.pos.y ?? 0), p.aim.z - (e[0]?.pos.z ?? 0)) / bu).toFixed(1)}` : 'null'}`);
    }
  };
  const r = playerCase(sim, site);
  off();
  w(JSON.stringify(r));
}, 3000000);
