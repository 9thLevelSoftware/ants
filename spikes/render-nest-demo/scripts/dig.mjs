// Live digging: 50 scripted bites (GDD 03 bite: 0.6 BU sphere) at a chamber wall, (a) all between two frames,
// (b) one bite per frame. Frames are rendered, so the render call's CPU time (buffer uploads of the rebuilt chunk
// ranges included) is recorded next to the re-meshing time; per frame: ms/chunks built/stages[*committed](longest
// stage: index and ms).
// Records the frames until the new space is visible, with before/after screenshots. Usage:
//   node tools/harness/play.mjs --root spikes/render-nest-demo --query "test=1&view=dig" --script spikes/render-nest-demo/scripts/dig.mjs \
//        --out test-output/render-nest-dig --width 960 --height 540 --script-timeout 900000
export default async ({ page, shot, log }) => {
  const q = new URL(page.url()).searchParams.get('quality') ?? 'test';
  await page.evaluate(() => { window.__demo.setView('dig'); window.__demo.sync(); });
  await shot(`dig-0-before-${q}`);
  // warm-up (JIT of the build path on fresh geometry; not reported)
  await page.evaluate(() => window.__demo.dig(3, true, true));
  const burst = await page.evaluate(() => window.__demo.dig(50, false, true));
  await page.evaluate(() => window.__demo.sync());
  await shot(`dig-1-after-50-bites-${q}`);
  const cont = await page.evaluate(() => window.__demo.dig(50, true, true));
  await page.evaluate(() => window.__demo.sync());
  await shot(`dig-2-after-100-bites-${q}`);
  const summarise = (r) => {
    const ms = r.frames.map((f) => f.ms).sort((a, b) => a - b);
    const extra = r.frames.map((f) => Math.max(0, f.renderMs - r.baseRenderMs));
    return {
      frames: r.frames.length, budgetMs: r.budgetMs, framesToVisible: r.framesToVisible,
      maxMs: ms[ms.length - 1], p90Ms: ms[Math.floor(ms.length * 0.9)], meanMs: +(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(3),
      overBudgetFrames: r.frames.filter((f) => f.ms > r.budgetMs).length,
      chunksBuilt: r.frames.reduce((s, f) => s + f.built, 0),
      baseRenderMs: r.baseRenderMs, maxRenderExtraMs: +Math.max(...extra).toFixed(2), meanRenderExtraMs: +(extra.reduce((s, v) => s + v, 0) / extra.length).toFixed(2),
      perFrame: r.frames.map((f) => `${f.ms}/${f.built}/${f.steps}${f.committed ? '*' : ''}(s${f.maxStep}:${f.maxStepMs})`).join(' '),
      maxStepMs: Math.max(...r.frames.map((f) => f.maxStepMs)),
      renderPerFrame: r.frames.map((f) => f.renderMs).join(' '),
    };
  };
  const result = { quality: q, burst: summarise(burst), continuous: summarise(cont), stats: await page.evaluate(() => window.__demo.stats().nest) };
  log(JSON.stringify(result));
  return result;
};
