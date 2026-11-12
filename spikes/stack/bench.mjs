/**
 * Frame-time matrix for the stack spike under headless software rendering.
 *   node tools/harness/play.mjs --root spikes/stack --script spikes/stack/bench.mjs
 * Env: SIZES="1280x720,640x360"  N=10 (measured frames per config)  WARM=3  ANTS=5000
 * Method: window.__bench(n, warm) renders synchronously and ends every frame with a 1px readPixels, so the number is
 * true render+GPU time per frame (the rAF-interval number from window.__perf() is distorted by the GPU backlog under
 * software GL; see docs/research/tech-stack.md). Prints a markdown table; raw rows go to summary.result.
 */
export default async ({ page, log, url, shot }) => {
  const sizes = (process.env.SIZES || '1280x720,640x360').split(',').map((s) => s.split('x').map(Number));
  const n = Number(process.env.N || 10), warm = Number(process.env.WARM || 3);
  const ants = process.env.ANTS || '5000';
  const rows = [];
  for (const [w, h] of sizes) {
    for (const post of [1, 0]) {
      for (const shadows of [1, 0]) {
        await page.evaluate(() => window.__dispose?.());
        await page.setViewportSize({ width: w, height: h });
        await page.goto(`${url}?t=3&post=${post}&shadows=${shadows}&ants=${ants}`, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
        const ms = await page.evaluate(([n, warm]) => window.__bench(n, warm), [n, warm]);
        const info = await page.evaluate(() => window.__info());
        const row = { size: `${w}x${h}`, post, shadows, ms: +ms.toFixed(1), fps: +(1000 / ms).toFixed(1), tris: info.triangles, calls: info.calls };
        rows.push(row);
        log(JSON.stringify(row));
        await shot(`bench-${w}x${h}-post${post}-shadows${shadows}`); // loop is stopped, so this is quick
      }
    }
  }
  log('\n| size | post | shadows | ms/frame | fps |\n|---|---|---|---|---|\n' + rows.map((r) => `| ${r.size} | ${r.post ? 'on' : 'off'} | ${r.shadows ? 'on' : 'off'} | ${r.ms} | ${r.fps} |`).join('\n'));
  return rows;
};
