// Screenshots of every acceptance view. Usage (from the project root):
//   node tools/harness/play.mjs --root spikes/render-nest-demo --query "test=1" --script spikes/render-nest-demo/scripts/shots.mjs \
//        --out test-output/render-nest --width 1280 --height 720 --script-timeout 900000
// Optional env NEST_SHOTS=entrance,tunnel to take a subset.
const ALL = [
  ['01-entrance', 'entrance', 'off'],
  ['02-shaft-down', 'shaft', 'off'],
  ['03-tunnel', 'tunnel', 'off'],
  ['04-chamber', 'chamber', 'off'],
  ['05-wood-gallery', 'wood', 'off'],
  ['06-log-outside', 'log', 'off'],
  ['07-slice', 'colony', 'slice'],
  ['08-section', 'side', 'section'],
  ['09-xray', 'colony', 'xray'],
];

export default async ({ page, shot, log }) => {
  const only = (process.env.NEST_SHOTS ?? '').split(',').filter(Boolean);
  const result = {};
  for (const [name, view, cut] of ALL) {
    if (only.length && !only.some((o) => name.includes(o))) continue;
    const info = await page.evaluate(([v, c]) => {
      window.__demo.setView(v); // the view first: a vertical section follows the camera yaw
      window.__demo.setGhosts(c !== 'off');
      window.__demo.setCutaway(c);
      const ms = window.__demo.sync();
      const s = window.__demo.stats();
      return { ms: Math.round(ms), draws: s.frame.drawCalls, tris: s.frame.triangles, nestTris: s.nest.triangles, under: s.look.under, ev: +s.exposureEV.toFixed(2) };
    }, [view, cut]);
    log(name, JSON.stringify(info));
    await shot(name);
    result[name] = info;
  }
  return result;
};
