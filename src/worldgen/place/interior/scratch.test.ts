import { it } from 'vitest';
import { defaultWorldParams, generateWorldReport } from '@/worldgen';
it('smoke', () => {
  for (const seed of [1, 2, 3]) {
    const t0 = Date.now();
    const r = generateWorldReport({ ...defaultWorldParams('lasius-niger', seed), archetype: 'kitchen-door' });
    const w = r.world;
    const counts: Record<string, number> = {};
    for (const o of w.objects) counts[o.templateId] = (counts[o.templateId] ?? 0) + 1;
    console.log('seed', seed, 'ms', Date.now() - t0, 'attempts', r.attempts, 'repairs', r.repairs, 'prims', w.prims.length);
    console.log(JSON.stringify(counts));
    console.log(r.checks.map((c) => `${c.id}:${c.status}:${c.detail}`).join('\n'));
    console.log('micro', w.micro.map((m) => `${m.kind}:${m.gapMm.toFixed(1)}:${m.useful}:${m.reason}`).join(' | '));
    console.log('routes', w.climbRoutes.length, 'pois', w.pois.length, 'notes', r.notes.filter((n) => n.includes('interior')));
  }
}, 300000);
