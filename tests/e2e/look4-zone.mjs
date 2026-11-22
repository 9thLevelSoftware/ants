// look-pass-4 scratch: zone map resolution vs minimap window
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  const r = await g(() => { const w = window.__hud.game.session.sim.world, z = w.maps.zone; return { cell: z.cell, nx: z.nx, bu: w.bu, size: w.size, terrainCell: w.terrain.cell, windowCells: 256 * w.bu / z.cell }; });
  log(JSON.stringify(r));
};
