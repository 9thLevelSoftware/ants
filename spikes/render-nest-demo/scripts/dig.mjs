// Live digging: 50 scripted bites (GDD 03 bite: 0.6 BU sphere) at a chamber wall, (a) all between two frames,
// (b) one bite per frame (per frame: ms/chunks built, * = committed with the commit ms); records the per-frame re-meshing time against the per-frame budget and the number of
// frames until the new space is visible, with before/after screenshots. Usage:
//   node tools/harness/play.mjs --root spikes/render-nest-demo --query "test=1&view=dig" --script spikes/render-nest-demo/scripts/dig.mjs \
//        --out test-output/render-nest-dig --width 960 --height 540 --script-timeout 900000
export default async ({ page, shot, log }) => {
  const q = new URL(page.url()).searchParams.get('quality') ?? 'test';
  await page.evaluate(() => { window.__demo.setView('dig'); window.__demo.sync(); });
  await shot(`dig-0-before-${q}`);
  const burst = await page.evaluate(() => window.__demo.dig(50, false, false));
  await page.evaluate(() => window.__demo.sync());
  await shot(`dig-1-after-50-bites-${q}`);
  const cont = await page.evaluate(() => window.__demo.dig(50, true, false));
  await page.evaluate(() => window.__demo.sync());
  await shot(`dig-2-after-100-bites-${q}`);
  const summarise = (r) => ({
    frames: r.frames.length, budgetMs: r.budgetMs, framesToVisible: r.framesToVisible,
    maxMs: Math.max(...r.frames.map((f) => f.ms)), meanMs: +(r.frames.reduce((s, f) => s + f.ms, 0) / r.frames.length).toFixed(3),
    chunksBuilt: r.frames.reduce((s, f) => s + f.built, 0), overBudgetFrames: r.frames.filter((f) => f.ms > r.budgetMs * 1.5).length,
    perFrame: r.frames.map((f) => `${f.ms}/${f.built}${f.committed ? `*${f.commitMs}` : ''}`).join(' '),
  });
  const result = { quality: q, burst: summarise(burst), continuous: summarise(cont), stats: await page.evaluate(() => window.__demo.stats().nest) };
  log(JSON.stringify(result));
  return result;
};
