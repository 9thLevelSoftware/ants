import { it } from 'vitest';
import { commandsSystem } from '@/sim/systems';
import { carveTemplateNest, createFoundingNest } from './index';
import { nestSim } from './nestTestKit';
import { nestSystem } from './system';
import { detectNestChambers, nestOpenVolume } from './chambers/upkeep';
import { detectRegions, nestSampleBox } from './chambers/detect';
import { regionStats } from './chambers/registry';
import { nestComponents } from './entrances';

it('profile', async () => {
  const BU = 4;
  const sim = nestSim({ systems: [commandsSystem, nestSystem] });
  const nest = createFoundingNest(sim, sim.state.colonies[0].id, { x: sim.world.size / 2 + 40 * BU, y: 0, z: sim.world.size / 2 });
  carveTemplateNest(sim, nest.id, { chambers: [
    { type: 'nursery', size: 'm', depthBu: 14 }, { type: 'food', size: 's', depthBu: 22 }, { type: 'rest', size: 'm', depthBu: 30 },
    { type: 'general', size: 'l', depthBu: 40 }, { type: 'rest', size: 'l', depthBu: 52 }, { type: 'nursery', size: 'm', depthBu: 62 }] });
  const time = (name: string, f: () => unknown) => { let best = Infinity; for (let r = 0; r < 5; r++) { const t0 = performance.now(); f(); best = Math.min(best, performance.now() - t0); } console.log(name, best.toFixed(2)); };
  time('full', () => detectNestChambers(sim, nest));
  time('openVol', () => nestOpenVolume(sim, nest));
  time('comps', () => nestComponents(sim, nest));
  const box = nestSampleBox(sim, nest);
  console.log('box', box, 'chunks', sim.carve.data.keys.length);
  time('regions', () => detectRegions(sim, box));
  const regions = detectRegions(sim, box);
  time('stats', () => regions.map((r) => regionStats(sim, r.keys, r.core)));
  console.log('regions', regions.map((r) => r.keys.length).join(','));
  console.log('sig', regions.map((r) => `${r.keys.reduce((a, b) => (a * 31 + b) % 1e9, 7)}/${r.core.reduce((a, b) => (a * 31 + b) % 1e9, 7)}`).join(','));
  const v = sim.carve.voxel;
  const { sampleI, sampleJ, sampleK } = await import('./voxelKey');
  time('compAt', () => regions.map((r) => sim.nestNav.componentAt({ x: sampleI(r.core[0]) * v, y: sampleJ(r.core[0]) * v, z: sampleK(r.core[0]) * v })));
  const { applyDetection } = await import('./chambers/registry');
  time('apply', () => applyDetection(sim, nest, regions));
  let ev = 0; sim.events.on('chamber-changed', () => ev++);
  const { nestRuntime } = await import('./runtime');
  time('regionsCached', () => detectRegions(sim, box, nestRuntime(sim).coreByChunk));
  (globalThis as any).__T = {}; detectRegions(sim, box, nestRuntime(sim).coreByChunk); console.log('T', JSON.stringify((globalThis as any).__T));
  time('full2', () => detectNestChambers(sim, nest));
  time('full3', () => detectNestChambers(sim, nest));
  console.log('chambers', nest.chambers.length, nest.chambers.map((c) => c.volume.toFixed(1)).join(','));
});
