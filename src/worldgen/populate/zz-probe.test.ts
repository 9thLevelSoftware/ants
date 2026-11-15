// TEMPORARY probe (deleted before handing in).
import { it, vi } from 'vitest';
import type { ArchetypeId } from '@/sim/types';
import { generated } from './testkit';
vi.setConfig({ testTimeout: 900_000 });
it('probe', () => {
  const out: string[] = [];
  for (const [a, s] of [['woodland-edge', 101], ['woodland-edge', 102], ['woodland-edge', 104], ['suburban-garden', 100], ['suburban-garden', 108], ['car-park-verge', 100], ['kitchen-door', 101]] as [ArchetypeId, number][]) {
    const { report } = generated(a, s, 'standard', 'lasius-niger', false);
    out.push(`${a}#${s}: attempts=${report.attempts} ` + report.retries.map((r) => r.details.join(';')).join(' || '));
  }
  throw new Error('PROBE\n' + out.join('\n'));
});
