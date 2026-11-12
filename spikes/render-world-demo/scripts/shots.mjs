// Harness script: the acceptance views of the world renderer (render-world task).
// node tools/harness/play.mjs --root spikes/render-world-demo --query "quality=high&t=1&hud=0" \
//   --script spikes/render-world-demo/scripts/shots.mjs --script-timeout 1200000 --timeout 180000 --out test-output/rw/high
// Optional query `shots=a,b,c` limits the list (names below).
export default async ({ page, shot, log, query }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const want = new URLSearchParams(query).get('shots')?.split(',') ?? null;
  const list = [
    ['lawn-midday', 'lawn', 13], ['lawn-golden', 'lawn', 19.2], ['lawn-night', 'lawn', 23.5],
    ['breach-midday', 'breach', 13],
    ['pavement-midday', 'pavement', 13], ['pavement-golden', 'pavement', 19.2], ['kerb-midday', 'kerb', 11],
    ['asphalt-midday', 'asphalt', 13], ['asphalt-night', 'asphalt', 1],
    ['sand-midday', 'sand', 13], ['sand-golden', 'sand', 5.0],
    ['interior-midday', 'interior', 13],
    ['prims-midday', 'prims', 15], ['forest-midday', 'forest', 13], ['sampler-midday', 'sampler', 13], ['wide-midday', 'wide', 13],
  ];
  const stats = {};
  for (const [name, view, hour] of list) {
    if (want && !want.includes(name)) continue;
    await demo(([v, h]) => { window.__demo.setHour(h); window.__demo.setView(v); }, [view, hour]);
    const s = await demo(() => window.__demo.render());
    stats[name] = { draws: s.drawCalls, tris: s.triangles };
    await shot(name);
    log(name, JSON.stringify(stats[name]));
  }
  return { stats, world: await demo(() => window.__demo.stats().world) };
};
