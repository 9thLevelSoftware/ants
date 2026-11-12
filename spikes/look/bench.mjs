// Frame-time cost per quality preset and per stage (delta method), headless SwiftShader.
//   node tools/harness/play.mjs --root spikes/look --query "t=2&ui=0&quality=low" --script spikes/look/bench.mjs --script-timeout 3000000 --timeout 120000
// Writes the JSON result (stdout last line, `result`). Do not run other heavy harness jobs at the same time.
export default async ({ page, log, query }) => {
  const p = new URLSearchParams(query || '');
  const qualities = (p.get('qualities') || 'low,medium,high,ultra').split(',');
  const n = Number(p.get('n') || 3), warm = Number(p.get('warm') || 1), rounds = Number(p.get('rounds') || 2);
  const out = { stages: {}, variants: {}, underground: {} };
  await page.evaluate(() => window.__spike.pause());
  for (const q of qualities) {
    await page.evaluate((q) => window.__spike.setQuality(q), q);
    await page.evaluate(() => window.__spike.setVariant('midday'));
    const r = await page.evaluate(([n, w, r]) => window.__spike.stageBench(n, w, r), [n, warm, rounds]);
    log(q, JSON.stringify(r));
    out.stages[q] = r;
    out.variants[q] = {};
    for (const v of ['golden', 'overcast', 'night', 'underground']) {
      const ms = await page.evaluate(([v, n, w]) => { window.__spike.setVariant(v); return window.__spike.bench(n, w); }, [v, n, warm]);
      out.variants[q][v] = Math.round(ms);
      log(q, v, Math.round(ms));
    }
    out.underground[q] = await page.evaluate(([n, w, r]) => window.__spike.stageBench(n, w, r), [n, warm, rounds]);
    log(q, 'ug', JSON.stringify(out.underground[q]));
    await page.evaluate(() => window.__spike.setVariant('midday'));
  }
  return out;
};
