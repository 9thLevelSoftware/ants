import { it } from 'vitest';
import { generateWorldReport } from './pipeline';
import { paramsFor } from './testing/fixtures';
import { evaluateMicro, usefulInteriorAccess } from './validate/micro';
it('probe', () => {
  generateWorldReport(paramsFor('kitchen-door', 1, 'compact'), { modules: [{ placers: [{ id: 'p', step: 'start', order: 1000, run: (ctx) => {
    evaluateMicro(ctx);
    const { cell, cells } = ctx.dims; const lay = ctx.layout;
    const zt = (x: number, z: number) => lay.zones[lay.cells[Math.floor(z / cell) * cells + Math.floor(x / cell)]];
    for (const m of ctx.world.micro) console.log(m.kind, m.useful, m.reason, m.posA, zt(m.posA.x, m.posA.z), m.posB, zt(m.posB.x, m.posB.z));
    console.log(lay.house, usefulInteriorAccess(ctx));
  } }] }] });
});
