// look-pass-4 acceptance 4: draw calls and triangles at the opening pose (possession camera at ant height), seed 1, per quality (the query).
// Minimum and maximum over 4 frames (the counts differ a little between frames: streaming, dithering). Prints one JSON line to the log.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look4-cost.mjs --out test-output/look4/cost/<name>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  const rows = [];
  for (let i = 0; i < 4; i++) {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    const p = await g(() => window.__game.perf());
    rows.push({ draws: p.drawCalls, tris: p.triangles, cpu: p.renderCpuMs });
  }
  const r = (k, f) => f(...rows.map((x) => x[k]));
  const res = { draws: [r('draws', Math.min), r('draws', Math.max)], tris: [r('tris', Math.min), r('tris', Math.max)], renderCpuMsMin: +r('cpu', Math.min).toFixed(1) };
  log('COST ' + JSON.stringify(res));
  await page.screenshot({ path: `${out}/pose.png`, timeout: 600000 });
};
