// Harness script: architecture §6 budget at High (< 350 draw calls, < 1.5 M triangles, all passes) on the densest
// decor views, with and without decor (?decor=0 in a second run gives the baseline), plus the revisit check.
// node tools/harness/play.mjs --root spikes/render-decor-demo --query "quality=high&t=2&hud=1" \
//   --script spikes/render-decor-demo/scripts/budget.mjs --script-timeout 900000 --timeout 300000 --out test-output/decor/budget
export default async ({ page, shot, log }) => {
  const out = {};
  for (const [view, season, hour] of [['lawn', 'summer', 13], ['lawn-wide', 'summer', 13], ['forest-wide', 'autumn', 13], ['overview', 'autumn', 13]]) {
    const s = await page.evaluate(([v, se, h]) => { const d = window.__demo; d.setHour(h); d.setSeason(se); d.setView(v); return d.render(); }, [view, season, hour]);
    out[view] = { draws: s.frame.drawCalls, tris: s.frame.triangles, decorDraws: s.decor.drawsSubmitted, decorTris: s.decor.trianglesSubmitted, blades: s.decor.blades, draped: s.decor.draped, blocks: s.decor.blocks };
    log(view, JSON.stringify(out[view]));
    await shot(`budget-${view}`);
  }
  await page.evaluate(() => window.__demo.setView('forest'));
  out.revisit = await page.evaluate(() => { const r = window.__demo.revisit(); return { same: r.same, blocks: Object.keys(r.before).length, mismatches: r.mismatches }; });
  log('revisit', JSON.stringify(out.revisit));
  return out;
};
