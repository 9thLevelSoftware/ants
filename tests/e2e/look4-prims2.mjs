// look-pass-4 scratch: list the biggest prims within view of the opening camera (material ids, sizes)
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  const r = await g(() => {
    const w = window.__hud.game.session.sim.world, q = window.__game.summary().possessed.pos;
    const out = [];
    for (const p of w.prims) {
      const d = Math.hypot(p.pos.x - q[0], p.pos.z - q[2]);
      const big = Math.max(p.size.x, p.size.z) * 2;
      if (d < 6000 && big > 800) out.push({ id: p.id, mat: p.material, sh: p.shape, d: Math.round(d), pos: [p.pos.x, p.pos.y, p.pos.z].map(Math.round), size: [p.size.x, p.size.y, p.size.z].map(Math.round), round: p.round });
    }
    return { q, cam: window.__game.camera ? 1 : 0, out: out.sort((a, b) => a.d - b.d).slice(0, 25) };
  });
  log(JSON.stringify(r));
};
