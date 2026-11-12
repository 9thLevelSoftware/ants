import { it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { walkerStep } from '@/sim/locomotion/walker';
import { report } from '../../testing/fixtures';
import { kernelFor, walkerAt } from './testkit';
it('dbg', () => {
  const out: string[] = [];
  const w = report('kitchen-door', 1).world;
  const k = kernelFor(w);
  const objs = new Map(w.objects.map((o) => [o.id, o]));
  const r = w.climbRoutes.find((x) => objs.get(x.objectId)?.templateId === 'houseplant')!;
  const o = objs.get(r.objectId)!;
  out.push('obj ' + JSON.stringify(o.pos) + JSON.stringify(o.rot));
  out.push(JSON.stringify(r.points.slice(0, 7).map((p) => [p.x.toFixed(1), p.y.toFixed(1), p.z.toFixed(1)])));
  const kin = walkerAt(k, r.points[0])!;
  let i = 1;
  for (let s = 0; s < 200 && i < 8; s++) {
    const t = r.points[i];
    const dx = t.x - kin.pos.x, dy = t.y - kin.pos.y, dz = t.z - kin.pos.z, l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (l < 3) { i++; out.push('reached ' + (i - 1)); continue; }
    const st = walkerStep(k.field, kin, { x: dx / l, y: dy / l, z: dz / l }, 24, 0.1, k.walker);
    if (s % 3 === 0) out.push(`${s} ${st} pos ${kin.pos.x.toFixed(2)},${kin.pos.y.toFixed(2)},${kin.pos.z.toFixed(2)} up ${kin.up.x.toFixed(2)},${kin.up.y.toFixed(2)},${kin.up.z.toFixed(2)} l ${l.toFixed(2)} prim ${w.objects.find((q) => q.id === k.field.primAt(kin.pos, 3)?.objectId)?.templateId} ${k.field.primAt(kin.pos, 3)?.material}`);
  }
  writeFileSync('/home/user/foundress/test-output/dbg.txt', out.join('\n'));
}, 300000);
