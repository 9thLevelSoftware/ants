// Harness script: wetness (WorldRenderer.setWetness), weather looks and the underground dimming flag.
// node tools/harness/play.mjs --root spikes/render-world-demo --query "quality=high&t=1&hud=0" \
//   --script spikes/render-world-demo/scripts/extras.mjs --script-timeout 900000 --timeout 180000 --out test-output/rw/extras
export default async ({ page, shot, log }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const res = {};
  await demo(() => { window.__demo.setHour(13); window.__demo.setView('lawn'); });
  await demo(() => { window.__demo.setWeather('overcast'); window.__demo.setWet(1); });
  await shot('lawn-overcast-wet');
  res.overcast = await demo(() => window.__demo.stats().lighting);
  await demo(() => window.__demo.setView('pavement'));
  await shot('pavement-overcast-wet');
  await demo(() => { window.__demo.setWeather('clear'); window.__demo.setWet(0); window.__demo.setView('breach'); });
  await demo(() => window.__demo.setUnderground(true));
  await shot('breach-underground-flag');
  res.underground = await demo(() => window.__demo.stats().lighting);
  await demo(() => window.__demo.setUnderground(false));
  log(JSON.stringify(res));
  return res;
};
