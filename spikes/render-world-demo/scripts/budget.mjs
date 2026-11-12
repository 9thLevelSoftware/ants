// Harness script: architecture section 6 budget (< 350 draw calls, < 1.5 M triangles at High) on a standard-density
// world. Run with &scatter=16000 (GDD 04 PRIM_BUDGET_TOTAL):
// node tools/harness/play.mjs --root spikes/render-world-demo --query "quality=high&post=0&t=1&hud=1&scatter=16000" \
//   --script spikes/render-world-demo/scripts/budget.mjs --script-timeout 600000 --timeout 180000 --out test-output/rw/budget
export default async ({ page, shot, log }) => {
  const out = {};
  for (const view of ['lawn', 'wide', 'pavement', 'sampler']) {
    await page.evaluate((v) => { window.__demo.setHour(13); window.__demo.setView(v); }, view);
    const s = await page.evaluate(() => window.__demo.render());
    const w = await page.evaluate(() => window.__demo.stats().world.prims);
    out[view] = { draws: s.drawCalls, tris: s.triangles, prims: w };
    log(view, JSON.stringify(out[view]));
    await shot(`budget-${view}`);
  }
  return out;
};
