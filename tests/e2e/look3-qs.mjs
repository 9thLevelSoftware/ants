// Look pass 3: the stage1a check "GPU resources grew across quality switches" (textures <= before + 4) isolated: the founding cheat, one
// colony view and back (the colony view draws without depth of field since look pass 3), then the same quality switches as stage1a.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/look3-qs.mjs --out test-output/look3/qs --script-timeout 900000
// Counts after the first cycle (the warm-up) must stay flat over the five switches; m0 (before any switch) is reported too.
// LOOK3_QS_COLONY=0 skips the colony view.
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.cheat.completeFounding(10));
  await g(() => window.__game.step(40));
  const mem = async () => (await g(() => window.__game.perf())).memory;
  const render = (s = 0.25) => g((x) => window.__game.renderFrame({ settle: x }), s);
  if (process.env.LOOK3_QS_COLONY !== '0') {
    await g(() => window.__game.camera.set('colony'));
    await render(0.5);
    await g(() => window.__game.camera.set('observer'));
    await render(0.5);
  }
  const m0 = await mem();
  // The first visit to a preset uploads what that preset draws for the first time (material textures, shadow map) and
  // three keeps uploaded textures until they are disposed, so the figure to hold flat is the one after a warm-up cycle.
  for (const q of ['low', 'high', 'test']) { await g((id) => window.__game.quality(id), q); await render(0.25); }
  const mw = await mem();
  const rows = [];
  for (const q of ['low', 'high', 'test', 'low', 'test']) {
    await g((id) => window.__game.quality(id), q);
    await render(0.25);
    rows.push({ q, ...(await mem()) });
  }
  const m1 = await mem();
  log('quality switches', JSON.stringify({ m0, mw, rows, m1 }));
  const grew = ['geometries', 'textures', 'programs'].filter((k) => m1[k] > mw[k] + 2);
  if (grew.length) throw new Error(`look3-qs: ${grew.join(', ')} grew over five quality switches after the warm-up: ${JSON.stringify({ mw, m1 })}`);
  return { m0, mw, m1 };
};
