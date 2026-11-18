export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(30));
  const r = await g(() => { let o2 = null; window.__hud.game.scene.traverse((o) => { if (!o2 && o.name?.startsWith('decor:draped')) o2 = o; });
    const u = o2.material.userData, tex = {};
    const sh = o2.material; return { keys: Object.keys(sh), ud: Object.keys(u), prog: sh.customProgramCacheKey?.() };
  });
  log(JSON.stringify(r));
};
