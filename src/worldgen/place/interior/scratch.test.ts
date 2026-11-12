import { it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { defaultWorldParams, generateWorldReport } from '@/worldgen';
const LOG = '/home/user/foundress/test-output/interior-progress.log';
it('smoke', () => {
  writeFileSync(LOG, '');
  const log = (s: string) => appendFileSync(LOG, s + '\n');
  for (const seed of [1, 2, 3]) {
    const t0 = Date.now();
    const r = generateWorldReport({ ...defaultWorldParams('lasius-niger', seed), archetype: 'kitchen-door' }, {
      onProgress: (p) => log(`  ${p.attempt} ${p.step} ${Date.now() - t0}`),
    });
    const w = r.world;
    const counts: Record<string, number> = {};
    for (const o of w.objects) counts[o.templateId] = (counts[o.templateId] ?? 0) + 1;
    log(`seed ${seed} ms ${Date.now() - t0} attempts ${r.attempts} repairs ${r.repairs} prims ${w.prims.length}`);
    log(JSON.stringify(counts));
    log(r.checks.map((c) => `${c.id}:${c.status}:${c.detail}`).join('\n'));
    log('micro ' + w.micro.map((m) => `${m.kind}:${m.gapMm.toFixed(1)}:${m.useful}:${m.reason}`).join(' | '));
    log(`routes ${w.climbRoutes.length} pois ${w.pois.length} notes ${r.notes.filter((n) => n.includes('interior'))}`);
  }
}, 600000);
