// look-pass-6 fix, finding 6: the reduced-motion camera crossfade is a blend of two images (the still of the last frame fading out over the new picture),
// not a dip to dark.
//
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look6-xfade.mjs --out test-output/look6/xfade --timeout 300000 --script-timeout 900000
//
// Stages the real game, reduced motion on; observer view -> colony view; renders frames of 0.04 s and reads the veil (the aria-hidden canvas after #view) and
// the canvas opacity after each. Pictures: <out>/xf-0-before.png (observer), xf-1-mid.png (halfway: both images), xf-2-after.png (colony). Numbers: xfade.json.
// Also: quitting to the title during a crossfade leaves no veil and no canvas opacity.
import fs from 'node:fs';
import { stage } from './lib/look2-stage.mjs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const S = await stage(page, log, { seed: 1 });
  await g(() => window.__game.settings({ accessibility: { reducedMotion: 'on' } }));
  await S.observerAt(60, 80);
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await g(() => window.__game.renderFrame({ dt: 0.016 })); // a frame whose end the still is copied from
  await page.screenshot({ path: `${out}/xf-0-before.png`, timeout: 300000 });
  const veilState = () => g(() => {
    const cv = document.getElementById('view'), v = cv.nextElementSibling;
    return { veil: v && v.tagName === 'CANVAS' ? { display: v.style.display, opacity: v.style.opacity, w: v.width, h: v.height } : null, canvasOpacity: cv.style.opacity };
  });
  const res = { series: [] };
  await g(() => window.__game.camera.set('colony'));
  // the app's own loop also renders (test mode: on demand, with real dt) between two calls from here, so the whole crossfade is stepped inside ONE call, frame by
  // frame, and the picture at the first frame under 65 % is composed from the two canvases in the same task (the drawing buffer is cleared after it)
  const run = await g(() => {
    const cv = document.getElementById('view'), v = cv.nextElementSibling, series = [];
    let mid = null;
    for (let i = 0; i < 8; i++) {
      window.__game.renderFrame({ dt: 0.04 });
      const st = { display: v.style.display, opacity: Number(v.style.opacity), canvasOpacity: cv.style.opacity };
      series.push(st);
      if (!mid && st.display === 'block' && st.opacity < 0.65) {
        const t = document.createElement('canvas'); t.width = cv.width; t.height = cv.height;
        const x = t.getContext('2d'); x.drawImage(cv, 0, 0); x.globalAlpha = st.opacity; x.drawImage(v, 0, 0);
        mid = t.toDataURL('image/png');
      }
    }
    return { series, mid };
  });
  res.series = run.series;
  const shot = !!run.mid;
  if (shot) { fs.writeFileSync(`${out}/xf-1-mid.png`, Buffer.from(run.mid.split(',')[1], 'base64')); res.midOpacity = run.series.find((f) => f.display === 'block' && f.opacity < 0.65)?.opacity; }
  await g(() => window.__game.renderFrame({ settle: 1 }));
  res.after = await veilState();
  await page.screenshot({ path: `${out}/xf-2-after.png`, timeout: 300000 });
  // leaving the game mid-crossfade
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.renderFrame({ dt: 0.04 }));
  res.beforeQuit = await veilState();
  await g(() => window.__hud.game.quitToTitle());
  res.afterQuit = await veilState();
  fs.writeFileSync(`${out}/xfade.json`, JSON.stringify(res, null, 1));
  log('xfade', JSON.stringify({ mid: res.midOpacity, after: res.after, beforeQuit: res.beforeQuit, afterQuit: res.afterQuit }));
  if (!shot) throw new Error('the veil was never shown at a mid-crossfade opacity: ' + JSON.stringify(res.series));
  if (res.after.veil.display !== 'none' || res.after.canvasOpacity !== '') throw new Error('veil or canvas opacity left on after the crossfade');
  if (res.afterQuit.veil.display !== 'none' || res.afterQuit.canvasOpacity !== '') throw new Error('veil or canvas opacity left on after quitting to the title');
  return { ok: true, mid: res.midOpacity };
};
