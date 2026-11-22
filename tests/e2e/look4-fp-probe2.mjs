import fp from './firstplay.mjs';
export default async (ctx) => {
  process.env.FIRSTPLAY_UNTIL = '05';
  await fp(ctx);
  const r = await ctx.page.evaluate(() => {
    const w = window.__hud.game.session.sim.world, q = window.__game.summary().possessed.pos;
    const out = [];
    for (const p of w.prims) {
      const d = Math.hypot(p.pos.x - q[0], p.pos.z - q[2]);
      const area = Math.max(p.size.x, p.size.z) * 2 * p.size.y * 2;
      if (d < 25000 && p.size.y > 300 && Math.max(p.size.x, p.size.z) > 400) out.push({ id: p.id, mat: p.material, sh: p.shape, d: Math.round(d), dx: Math.round(p.pos.x - q[0]), dz: Math.round(p.pos.z - q[2]), size: [p.size.x, p.size.y, p.size.z].map(Math.round), round: p.round, obj: p.objectId, area });
    }
    return out.sort((a, b) => b.area - a.area).slice(0, 12);
  });
  ctx.log(JSON.stringify(r));
};
