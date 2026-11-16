// Sealing is a property of every founding site (task viab-founding work item 1, FOUNDRESS_LONG=1): on generated
// worlds, at the queen's start AND at the nearest good map cell, the passive path (cheat.completeFounding: the
// template carved where she stands, the guided seal) and the scripted-player path (the browser founding.mjs player:
// dig-bite, then ONE press of E anywhere in the cell) both reach `sealed`, stay sealed for SEAL_HOLD_TICKS, and the
// player never gets a `no-target` refusal from seal-entrance. Player cases where the scripted digger got no bite in
// (the cheat's template carved instead) are listed apart: they prove the seal, not the dig.
//   FOUNDRESS_LONG=1 FOUNDRESS_ARCH=woodland-edge FOUNDRESS_SEEDS=1 npx vitest run src/sim/colony/founding/seal.sweep.long.test.ts
// One world per process is the intended use (a generated world plus four cases is about 1-2 GB); without
// FOUNDRESS_ARCH / FOUNDRESS_SEEDS it walks all five Tier 1 archetypes x seeds 1-3 in this process, one world at a
// time. FOUNDRESS_NO_FLOOD=1 leaves out the nest flood system (weather-fix2's dry-weather drowning, L12) while it
// still reproduces. Rows go to stderr.
import { describe, expect, it } from 'vitest';
import type { ArchetypeId } from '@/sim/types';
import { TIER1_ARCHETYPES, generatedWorld, goodSite, passiveCase, playerCase, sweepSim, type SweepResult } from './sweepKit';
import { queen } from './testkit';

const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;
const LONG = !!env?.env.FOUNDRESS_LONG;
const ARCHS = (env?.env.FOUNDRESS_ARCH ? env.env.FOUNDRESS_ARCH.split(',') : TIER1_ARCHETYPES) as ArchetypeId[];
const SEEDS = (env?.env.FOUNDRESS_SEEDS ?? '1,2,3').split(',').map(Number);
const NO_FLOOD = !!env?.env.FOUNDRESS_NO_FLOOD;
const log = (s: string) => env?.stderr.write(`[seal.sweep] ${s}\n`);

function row(arch: string, seed: number, site: string, path: string, r: SweepResult): string {
  return `${arch} #${seed} ${site} ${path}: ${r.ok ? 'sealed' : `FAIL at ${r.stage} (${r.phase})`} after ${r.sealTicks} ticks, ${r.plugs} plugs, `
    + `refusals [${r.refusals.join(',')}]${path === 'passive' ? `, site moved ${r.movedBu.toFixed(1)} BU` : ''}${r.note ? `, ${r.note}` : ''}`;
}

describe.skipIf(!LONG)('sealing on generated worlds: start site and nearest good site, passive and player paths', () => {
  it(`${ARCHS.join('/')} x seeds ${SEEDS.join(',')}: every case seals and stays sealed, no no-target refusal`, () => {
    const bad: string[] = [];
    const templated: string[] = [];
    for (const arch of ARCHS) for (const seed of SEEDS) {
      const { world, config } = generatedWorld(arch, seed);
      for (const site of ['start', 'good'] as const) for (const path of ['passive', 'player'] as const) {
        const sim = sweepSim(world, config, { noFlood: NO_FLOOD });
        if (site === 'good') {
          const at = goodSite(sim, 300);
          {
            // both paths start AT the site (walking there is locomotion's, not part of the seal property)
            sim.enqueue({ type: 'cheat.teleport', antId: queen(sim).id, pos: { x: at.x, y: at.y + 0.5 * sim.world.bu, z: at.z } });
            sim.tick();
          }
        }
        const r = path === 'passive' ? passiveCase(sim) : playerCase(sim, null);
        const line = row(arch, seed, site, path, r);
        log(line);
        if (!r.ok || r.refusals.includes('no-target')) bad.push(line);
        if (r.template) templated.push(line);
      }
    }
    // a player case whose dig was carved by the cheat's template proves the seal only: counted apart, never hidden
    log(`player cases dug by template (seal proven, dig not): ${templated.length}`);
    for (const t of templated) log(`  ${t}`);
    expect(bad).toEqual([]);
  }, 7_200_000);
});
