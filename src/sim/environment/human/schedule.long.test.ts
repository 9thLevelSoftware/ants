// Long sweep (FOUNDRESS_LONG=1): every archetype x 4 seeds x 3 presets, a 28-day year each — per-kind counts match
// the table within sampling error, no event uses a zone its map lacks, no disabled kind is ever drawn.

import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { DifficultyId } from '@/sim/types';
import { ARCHETYPES, HUMAN_EVENT_KINDS } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { DIFFICULTY_PARAMS } from '@/sim/balance';
import { daysPerYear } from '@/sim/time';
import { humanEventsSystem } from './index';
import { dayContext, drawDayEvents } from './schedule';
import { expectedDay } from './testkit';
import { humanSites } from './sites';

const nodeProcess = (globalThis as { process?: { env: Record<string, string | undefined>; stderr: { write(s: string): void } } }).process;

describe.skipIf(!nodeProcess?.env.FOUNDRESS_LONG)('human schedule sweep (long)', () => {
  it('all archetypes, seeds 1-4, three presets', () => {
    const rows: string[] = [];
    for (const arch of ARCHETYPES) {
      for (let seed = 1; seed <= 4; seed++) {
        const cfg = defaultGameConfig('lasius-niger', seed);
        cfg.world = { ...cfg.world, archetype: arch };
        const g = createNewGame(cfg);
        const sim = createSim(g.state, g.world, { systems: [humanEventsSystem] });
        const sites = humanSites(sim.world).list;
        const zoneIds = new Set(sim.world.zones.map((z) => z.id));
        for (const preset of ['gentle', 'naturalist', 'harsh'] as DifficultyId[]) {
          sim.state.config.difficulty.preset = preset;
          sim.state.config.difficulty.params = { ...DIFFICULTY_PARAMS[preset] };
          const rng = rngFork(seed * 31 + preset.length, 'long');
          const got: Record<string, number> = {}, exp: Record<string, { m: number; v: number }> = {};
          for (let d = 0; d < daysPerYear(sim.state.config); d++) {
            const ctx = { ...dayContext(sim, d), heat: false };
            for (const [k, x] of Object.entries(expectedDay(sim, ctx))) {
              const e = exp[k] ??= { m: 0, v: 0 };
              e.m += x.mean; e.v += x.var;
            }
            for (const e of drawDayEvents(sim, ctx, rng)) {
              const site = sites[e.siteId];
              expect(sim.world.meta.disabledEvents).not.toContain(e.kind);
              for (const z of site.zoneIds) expect(zoneIds.has(z)).toBe(true);
              // the quiet-hour extras (night cars, one interior pass) are outside the table
              if ((e.kind === 'car' || e.kind === 'footsteps') && (e.hour >= 22 || e.hour < 6)) continue;
              got[e.kind] = (got[e.kind] ?? 0) + 1;
            }
          }
          const line: string[] = [];
          for (const k of HUMAN_EVENT_KINDS) {
            const e = exp[k] ?? { m: 0, v: 0 }, n = got[k] ?? 0;
            expect(Math.abs(n - e.m), `${arch} s${seed} ${preset} ${k}: ${n} vs ${e.m.toFixed(1)}`).toBeLessThanOrEqual(4 * Math.sqrt(e.v) + 1);
            if (e.m > 0) line.push(`${k} ${n}/${e.m.toFixed(1)}`);
          }
          rows.push(`${arch} s${seed} ${preset}: ${line.join(', ')}`);
        }
      }
    }
    nodeProcess?.stderr.write(`${rows.join('\n')}\n`);
  }, 3_600_000);
});
