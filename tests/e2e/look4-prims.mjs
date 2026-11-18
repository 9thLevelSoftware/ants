export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  const r = await g(() => { const w = window.__hud.game.session.sim.world; const c = {}; for (const o of w.objects) c[o.templateId] = (c[o.templateId] || 0) + 1;
    const p = w.prims[0]; return { c, prim: JSON.stringify(p), water: w.waterBodies.length, wk: w.waterBodies[0]?.kind, zoneCell: w.maps.zone.cell, nx: w.maps.zone.nx, tags: [...new Set(w.objects.flatMap((o) => o.tags))].slice(0, 40) }; });
  log(JSON.stringify(r));
};
