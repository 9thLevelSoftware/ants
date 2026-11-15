// Runtime quality switch against a fresh boot (gate 1B: the EffectComposer left renderer.autoClear off after the post
// chain was disposed, so a High -> Low switch drew over the old frame). Two runs with the same seed, ticks and camera:
//   1. reference: boot at the target preset and capture
//        QS_ROLE=ref node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=2&quality=low" \
//          --script tests/e2e/qualitySwitch.mjs --out test-output/qswitch/ref
//   2. switch: boot at High, capture, switch High -> Low (capture, RMSE against the reference), Low -> High (capture,
//      RMSE against the High boot)
//        QS_REF=test-output/qswitch/ref/boot.png node tools/harness/play.mjs --root . \
//          --query "test=1&autostart=1&seed=2&quality=high" --script tests/e2e/qualitySwitch.mjs --out test-output/qswitch/sw
// The RMSE (0..255 per channel, mean over the frame) must stay under QS_MAX_RMSE (default 4).
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const setup = async () => {
    await g(() => window.__game.command({ type: 'openingSkipIntro' }));
    await g(() => window.__game.step(100));
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    await g(() => { const gm = window.__game, w = gm.query.world(), p = w.queenStart.pos, bu = w.bu; gm.camera.setPose({ x: p.x + 14 * bu, y: p.y + 6 * bu, z: p.z + 10 * bu }, p); });
  };
  const capture = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await g(() => window.__game.renderFrame({ settle: 1 }));
    const file = `${out}/${name}.png`;
    await page.screenshot({ path: file, timeout: 300000 });
    return file;
  };
  /** Mean RMSE of two PNG files, decoded in the page. */
  const rmse = (a, b) => g(async ([da, db]) => {
    const load = (b64) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = `data:image/png;base64,${b64}`; });
    const [ia, ib] = await Promise.all([load(da), load(db)]);
    const px = (im) => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0); return x.getImageData(0, 0, im.width, im.height).data; };
    const pa = px(ia), pb = px(ib);
    let s = 0, n = 0;
    for (let i = 0; i < pa.length; i += 4) for (let k = 0; k < 3; k++) { const d = pa[i + k] - pb[i + k]; s += d * d; n++; }
    return Math.sqrt(s / n);
  }, [fs.readFileSync(a).toString('base64'), fs.readFileSync(b).toString('base64')]);

  // the HUD would differ between the runs (toasts, clock): hide the UI layer for the captures
  await page.addStyleTag({ content: '#ui{visibility:hidden !important}' });
  await setup();
  if (process.env.QS_ROLE === 'ref') {
    const f = await capture('boot');
    log('reference', f, JSON.stringify(await g(() => window.__game.quality())));
    return { reference: f };
  }
  const max = Number(process.env.QS_MAX_RMSE ?? 4);
  const highBoot = await capture('high-boot');
  await g(() => window.__game.quality('low'));
  const lowSwitch = await capture('low-switched');
  await g(() => window.__game.quality('high'));
  const highSwitch = await capture('high-switched');
  const result = {
    lowVsBoot: process.env.QS_REF ? +(await rmse(lowSwitch, process.env.QS_REF)).toFixed(3) : null,
    highVsBoot: +(await rmse(highSwitch, highBoot)).toFixed(3),
    highVsLow: +(await rmse(highBoot, lowSwitch)).toFixed(3),
  };
  log('rmse', JSON.stringify(result));
  if (result.lowVsBoot !== null && result.lowVsBoot > max) throw new Error(`High -> Low differs from a Low boot: RMSE ${result.lowVsBoot}`);
  if (result.highVsBoot > max) throw new Error(`Low -> High differs from the High boot: RMSE ${result.highVsBoot}`);
  return result;
};
