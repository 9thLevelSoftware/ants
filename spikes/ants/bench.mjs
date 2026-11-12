/**
 * Frame time vs instance count for the ants spike (headless software GL: RELATIVE numbers only).
 *   node tools/harness/play.mjs --root spikes/ants --query "post=0&msaa=0&shadows=1&scene=crowd&n=0" --script spikes/ants/bench.mjs --script-timeout 1200000
 * Each row: setScene('crowd', n), fixed camera, 2 warm-up + N measured frames rendered synchronously (window.__spike.bench),
 * every frame ends with a 1-pixel readPixels so the GPU work is included. cpuMs = per-frame LOD bucketing + buffer fill.
 * Env: N=5 frames, CAMS="low,overview", ONLY=auto|0|1|2|3 (subset of rows)
 */
export default async ({ page, log }) => {
  const N = Number(process.env.N || 5);
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  const cams = (process.env.CAMS || 'low,overview').split(',');
  const rows = [];
  const plan = [
    ...[0, 250, 500, 1000, 2000, 4000].map((n) => ({ n, force: null })),
    ...[250, 500, 1000].map((n) => ({ n, force: 0 })),
    ...[500, 1000, 2000, 4000].map((n) => ({ n, force: 1 })),
    ...[1000, 2000, 4000].map((n) => ({ n, force: 2 })),
    ...[1000, 2000, 4000].map((n) => ({ n, force: 3 })),
  ];
  const only = process.env.ONLY; // e.g. ONLY=auto
  for (const cam of cams) {
    for (const { n, force } of plan.filter((p) => !only || (only === 'auto' ? p.force === null : String(p.force) === only))) {
      if (cam === 'overview' && force === 0 && n > 500) continue; // minutes per frame in software GL
      await S('setScene', 'crowd', { n, seed: 7 });
      const bound = Math.max(40, Math.sqrt(Math.max(n, 1)) * 6.5);
      if (cam === 'low') await S('setCamera', { target: [0, 0, 60], dist: 150, az: 20, el: 20, fov: 40 });
      else await S('setCamera', { target: [0, 0, 0], dist: bound * 3.0, az: 20, el: 60, fov: 40 });
      await S('setLod', { force });
      const r = await S('bench', N, 2, true);
      const row = { cam, n, lod: force === null ? 'auto' : `LOD${force}`, ms: r.ms, cpuMs: r.cpuMs, perLod: r.info.lod?.lod, culled: r.info.lod?.culled, tris: r.info.submittedTris, calls: r.info.calls };
      rows.push(row); log(JSON.stringify(row));
    }
  }
  log('\n| camera | ants | LOD | ms/frame | cpu ms | visible per LOD (0/1/2/3) | culled | tris submitted |\n|---|---|---|---|---|---|---|---|\n' +
    rows.map((r) => `| ${r.cam} | ${r.n} | ${r.lod} | ${r.ms} | ${r.cpuMs} | ${(r.perLod ?? []).join(' / ')} | ${r.culled ?? 0} | ${r.tris ?? 0} |`).join('\n'));
  return rows;
};
