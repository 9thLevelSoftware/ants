import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { generateWorld } from './index';
import { paramsFor } from './testing/fixtures';
it('probe', () => {
  const w = generateWorld(paramsFor('kitchen-door', 1, 'compact'));
  const o = w.objects.find((x) => x.tags.includes('facade'))!;
  const lines: string[] = [`object ${o.id} prims ${o.primCount}`];
  for (let i = o.primStart; i < o.primStart + o.primCount; i++) {
    const p = w.prims[i];
    const y0 = p.pos.y - p.size.y, y1 = p.pos.y + p.size.y;
    if (y0 > 700) continue;
    lines.push(`#${i} ${p.material} kind=${p.kind} x${(p.pos.x - p.size.x).toFixed(0)}..${(p.pos.x + p.size.x).toFixed(0)} y${y0.toFixed(0)}..${y1.toFixed(0)} z${(p.pos.z - p.size.z).toFixed(0)}..${(p.pos.z + p.size.z).toFixed(0)} flags=${p.flags}`);
  }
  // other objects touching the facade foot region
  for (const q of w.objects) {
    if (q === o) continue;
    for (let i = q.primStart; i < q.primStart + q.primCount; i++) {
      const p = w.prims[i];
      if (p.pos.y - p.size.y < 300 && Math.abs(p.pos.x - o.pos.x) < 4000 && Math.abs(p.pos.z - o.pos.z) < 700) lines.push(`other ${q.tags.join('/')} #${i} ${p.material} x${(p.pos.x - p.size.x).toFixed(0)}..${(p.pos.x + p.size.x).toFixed(0)} y${(p.pos.y - p.size.y).toFixed(0)}..${(p.pos.y + p.size.y).toFixed(0)} z${(p.pos.z - p.size.z).toFixed(0)}..${(p.pos.z + p.size.z).toFixed(0)}`);
    }
  }
  writeFileSync('/tmp/claude-0/probe/facade-foot.txt', lines.join('\n'));
});
