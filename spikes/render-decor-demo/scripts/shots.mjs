// Harness script: the acceptance views of the decor renderer (render-decor task).
// node tools/harness/play.mjs --root spikes/render-decor-demo --query "quality=high&t=2&hud=0" \
//   --script spikes/render-decor-demo/scripts/shots.mjs --script-timeout 1500000 --timeout 240000 --out test-output/decor/high
// Optional query `shots=a,b` limits the list. Entries: [name, view, hour, season, extra]
export default async ({ page, shot, log, query }) => {
  const want = new URLSearchParams(query).get('shots')?.split(',') ?? null;
  const list = [
    ['lawn-midday', 'lawn', 13, 'summer'],
    ['lawn-wide', 'lawn-wide', 13, 'summer'],
    ['forest-summer', 'forest', 13, 'summer'],
    ['forest-autumn', 'forest', 13, 'autumn'],
    ['forest-wide-autumn', 'forest-wide', 14, 'autumn'],
    ['joints-moss', 'joints', 11, 'summer'],
    ['puddle', 'puddle', 15, 'summer'],
    ['bowl', 'bowl', 13, 'summer'],
    ['lawn-golden', 'lawn', 19.6, 'summer'],
    ['lawn-dawn-dew', 'lawn', 6.2, 'summer', { dew: 1 }],
    ['patio-spring-petals', 'petals', 12, 'spring'],
    ['overview', 'overview', 13, 'autumn'],
  ];
  const stats = {};
  for (const [name, view, hour, season, extra] of list) {
    if (want && !want.includes(name)) continue;
    const s = await page.evaluate(([v, h, se, ex]) => {
      const d = window.__demo;
      d.setDew(ex?.dew ?? 0);
      d.setHour(h); d.setSeason(se); d.setView(v);
      return d.render();
    }, [view, hour, season, extra ?? null]);
    stats[name] = { draws: s.frame.drawCalls, tris: s.frame.triangles, decor: s.decor };
    await shot(name);
    log(name, JSON.stringify({ draws: s.frame.drawCalls, tris: s.frame.triangles, blades: s.decor.blades, draped: s.decor.draped, drops: s.decor.drops }));
  }
  return stats;
};
