/**
 * Cost of 300 creatures vs 300 ants vs the empty stage, same layout and camera (crowd scene), synchronous frames
 * ending in readPixels. Repeated `REPS` times (env, default 3); the minimum is reported.
 *   node tools/harness/play.mjs --root spikes/render-creatures-demo --query "quality=test&scene=crowd&n=0" \
 *        --script spikes/render-creatures-demo/bench.mjs --out test-output/creatures-render/bench --width 1280 --height 720 --script-timeout 900000
 */
export default async ({ page, log }) => {
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
  const reps = Number(process.env.REPS || 3);
  const cases = { empty: { n: '0', ants: '0' }, creatures300: { n: '300', ants: '0' }, ants300: { n: '0', ants: '300' } };
  const out = {};
  for (let r = 0; r < reps; r++) {
    for (const [name, p] of Object.entries(cases)) {
      await D('setScene', 'crowd', { ...p, n: p.n, ants: p.ants });
      // same camera for every case (the crowd scene frames by n): the 300-grid camera
      await D('setCamera', { target: [0, 0, 0], dist: 18 * 14 * 1.1, az: 20, el: 35, fov: 40 });
      const b = await D('bench', 5, 2);
      const prev = out[name];
      if (!prev || b.ms < prev.ms) out[name] = { ms: b.ms, creatureCpuMs: b.creatureCpuMs, antCpuMs: b.antCpuMs, tris: b.info.frame.triangles, calls: b.info.frame.calls, drawn: b.info.creatures.drawn };
      log(name, JSON.stringify(out[name]));
    }
  }
  out.perCreatureMs = +((out.creatures300.ms - out.empty.ms) / 300).toFixed(3);
  out.perAntMs = +((out.ants300.ms - out.empty.ms) / 300).toFixed(3);
  return out;
};
