// look pass 3: is the render deterministic for an identical camera? Renders the possession frame several times (back to back, after
// real time passes, after a step of zero sim time) and counts the pixels that differ from the first frame.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/look3-det.mjs --out test-output/look3/det --width 960 --height 540 --timeout 400000 --script-timeout 900000
export default async ({ page, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(8));
  await g(() => window.__game.setSpeed(2));
  await g(() => { window.__game.renderFrame(); });
  const grab = (tag) => g((t) => {
    const c = document.getElementById('view');
    window.__game.renderFrame();
    const w = c.width, h = c.height, k = document.createElement('canvas'); k.width = w; k.height = h;
    const x = k.getContext('2d', { willReadFrequently: true }); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, w, h).data;
    const prev = window.__det;
    let n = 0, mx = 0;
    if (prev) for (let i = 0; i < d.length; i += 4) { const m = Math.max(Math.abs(d[i] - prev[i]), Math.abs(d[i + 1] - prev[i + 1]), Math.abs(d[i + 2] - prev[i + 2])); if (m) { n++; if (m > mx) mx = m; } }
    if (!prev) window.__det = d;
    return { tag: t, diffPx: prev ? n : null, max: mx, cam: window.__game.camera.pose().pos.x };
  }, tag);
  log('first', JSON.stringify(await grab('first')));
  log('again', JSON.stringify(await grab('again')));
  log('again2', JSON.stringify(await grab('again2')));
  await g(() => window.__game.realtime(true)); await wait(2500); await g(() => window.__game.realtime(false));
  log('after-realtime', JSON.stringify(await grab('after-realtime')));
  log('after-realtime2', JSON.stringify(await grab('after-realtime2')));
  await wait(1500);
  log('after-wait', JSON.stringify(await grab('after-wait')));
  return { ok: true };
};
