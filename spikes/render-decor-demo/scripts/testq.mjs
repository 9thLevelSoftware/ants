// Harness script: the `test` preset draws no decor (GDD 04 §9: test 0); water surfaces are world state and stay.
// node tools/harness/play.mjs --root spikes/render-decor-demo --query "quality=test&t=2" --script spikes/render-decor-demo/scripts/testq.mjs
export default async ({ page, shot, log }) => {
  const out = {};
  for (const v of ['lawn', 'forest', 'puddle']) {
    const s = await page.evaluate((view) => { window.__demo.setSeason('autumn'); window.__demo.setView(view); return window.__demo.render(); }, v);
    out[v] = { draws: s.frame.drawCalls, tris: s.frame.triangles, blocks: s.decor.blocks, blades: s.decor.blades, draped: s.decor.draped, water: s.decor.waterSurfaces };
    log(v, JSON.stringify(out[v]));
    await shot(`test-${v}`);
  }
  return out;
};
