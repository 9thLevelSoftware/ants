// Camera surface -> down the entrance shaft -> chamber -> back up, at 10 frames per second of real time; records
// exposure / fog / underground factor every frame and screenshots a series (only the shot frames are drawn).
//   node tools/harness/play.mjs --root spikes/render-nest-demo --query "test=1" --script spikes/render-nest-demo/scripts/transition.mjs \
//        --out test-output/render-nest-transition --width 640 --height 360 --script-timeout 900000
export default async ({ page, shot, log }) => {
  const N = 60, dt = 0.1, SHOTS = new Set([0, 10, 14, 18, 24, 30, 36, 42, 46, 52, 59]);
  const series = [];
  for (let i = 0; i < N; i++) {
    const draw = SHOTS.has(i);
    const r = await page.evaluate(([t, d, w]) => window.__demo.transition(t, d, w), [i / (N - 1), dt, draw]);
    series.push({ i, t: +r.t.toFixed(3), under: +r.under.toFixed(3), underground: r.underground, ev: +r.exposureEV.toFixed(3), fog: +r.fogDensity.toFixed(5) });
    if (draw) {
      await page.evaluate(() => window.__demo.sync());
      await shot(`tr-${String(i).padStart(2, '0')}`);
    }
  }
  let maxJump = 0;
  for (let i = 1; i < series.length; i++) maxJump = Math.max(maxJump, Math.abs(series[i].ev - series[i - 1].ev));
  const result = { maxEvStepPerFrame: +maxJump.toFixed(3), series: series.map((s) => `${s.i}:${s.underground ? 'U' : 'S'} ev=${s.ev} under=${s.under}`).join(' | ') };
  log(JSON.stringify(result));
  return result;
};
