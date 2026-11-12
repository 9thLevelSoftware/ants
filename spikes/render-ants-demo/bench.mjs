/**
 * Cost of 2000 ants vs an empty scene (headless software GL: RELATIVE numbers only; do not run two benches at once).
 *   node tools/harness/play.mjs --root spikes/render-ants-demo --query "quality=test&scene=crowd&n=0" \
 *        --script spikes/render-ants-demo/bench.mjs --width 1280 --height 720 --script-timeout 1200000
 * Cameras as in spikes/ants/bench.mjs: low (target 60 mm in, 150 mm away, 20 deg elevation, fov 40) and overview.
 */
export default async ({ page, log }) => {
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
  const N = Number(process.env.N || 6);
  const rows = [];
  for (const cam of ['low', 'overview']) {
    for (const n of (process.env.COUNTS || '0,500,1000,2000').split(',').map(Number)) {
      await D('setScene', 'crowd', { n: String(n), species: 'lasius-niger' });
      const bound = Math.max(40, Math.sqrt(Math.max(n, 1)) * 6.4);
      if (cam === 'low') await D('setCamera', { target: [0, 0, 60], dist: 150, az: 20, el: 20, fov: 40 });
      else await D('setCamera', { target: [0, 0, 0], dist: bound * 3.0, az: 20, el: 60, fov: 40 });
      const r = await D('bench', N, 2, true);
      const a = r.info.ants;
      const row = { cam, n, ms: r.ms, cpuMs: r.cpuMs, sampleMs: +a.sampleMs.toFixed(3), uploadMs: +a.uploadMs.toFixed(3), lod: a.visible, culled: a.culled, dropped: a.dropped, antTris: a.triangles, antCalls: a.drawCalls, calls: r.info.frame.calls };
      rows.push(row); log(JSON.stringify(row));
    }
  }
  return rows;
};
