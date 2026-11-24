// look-pass-6 item 5: reduced motion and the light of the founding shot, in the real game (staging of look2-stage.mjs).
//
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look6-rm.mjs \
//        --out test-output/look6/rm --timeout 300000 --script-timeout 1800000
//
// 1. Light: the world is lit as at a fixed hour behind the founding shot (FrameInfo.lightHour). At 22:30 the shot starts and ends by a cut of the
//    light source; the mean luminance of the frame is read after every frame of 0.1 s (renderFrame({dt})) and must change by small steps
//    (LIGHT_SWITCH_S): the first frame after the cut must not carry the whole jump.
// 2. Reduced motion: the shot is a still retaken every FSHOT_STILL_S with a crossfade (the dip of the camera transition, now drawn as the canvas
//    opacity): a picture at the darkest moment of the crossfade, and the opacity series.
// Pictures: <out>/rm-crossfade.png (darkest frame of the crossfade), <out>/rm-shot-on.png, <out>/rm-shot-off.png. Numbers: <out>/rm.json.
import fs from 'node:fs';
import { stage, at, SUMMER_DAY } from './lib/look2-stage.mjs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const S = await stage(page, log, { seed: 1 });
  const bu = S.bu;
  await g(() => window.__game.settings({ accessibility: { reducedMotion: 'on' } }));
  await g((t) => window.__game.cheat.setTime(t), at(SUMMER_DAY, 22.5));
  await g(() => window.__game.cheat.setWeather('clear'));
  await S.surfaceWorker('surface');
  // the shot looks at the first chamber of the player's nest, as the founding flow does at the lapse
  const ch = S.nest0.chambers?.[0];
  const c = ch?.center ?? S.start.pos;
  const subject = { x: c.x, y: c.y, z: c.z, radius: 6 * bu, cutY: c.y + 1.5 * bu };
  await g(() => window.__game.renderFrame({ settle: 1 }));
  const luma = () => g(async () => {
    const cv = document.getElementById('view');
    const im = new Image(); im.src = cv.toDataURL('image/png'); await im.decode();
    const w = 160, h = 90, t = document.createElement('canvas'); t.width = w; t.height = h;
    const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
    const d = x.getImageData(0, 0, w, h).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
    return Math.round((s / (d.length / 4)) * 1000) / 1000;
  });
  const frames = async (n, dt) => {
    const r = [];
    for (let i = 0; i < n; i++) {
      await g((d) => window.__game.renderFrame({ dt: d }), dt);
      r.push({ luma: await luma(), opacity: Number(await g(() => getComputedStyle(document.getElementById('view')).opacity)) });
    }
    return r;
  };
  const res = {};
  res.before = (await frames(2, 0.1)).map((f) => f.luma);
  await g((s) => { window.__hud.game.session.views.setFoundingShot(() => s); }, subject);
  res.on = await frames(16, 0.1);
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await page.screenshot({ path: `${out}/rm-shot-on.png`, timeout: 300000 });
  await g(() => window.__hud.game.session.views.setFoundingShot(null));
  res.off = await frames(16, 0.1);
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await page.screenshot({ path: `${out}/rm-shot-off.png`, timeout: 300000 });
  // reduced motion: the still is retaken every 3 s with a crossfade; frames of 0.1 s until it comes (and goes)
  await g((s) => { window.__hud.game.session.views.setFoundingShot(() => s); }, subject);
  await frames(3, 0.1);
  res.xfade = [];
  let shot = false, minOp = 1;
  for (let i = 0; i < 60; i++) {
    const f = (await frames(1, 0.1))[0];
    res.xfade.push(f.opacity);
    if (f.opacity < minOp - 0.01) { minOp = f.opacity; shot = false; }
    if (f.opacity < 0.9 && !shot && f.opacity <= minOp) { await page.screenshot({ path: `${out}/rm-crossfade.png`, timeout: 300000 }); shot = true; }
  }
  const steps = (a) => Math.max(...a.slice(1).map((v, i) => Math.abs(v - a[i])));
  const onL = res.on.map((f) => f.luma), offL = res.off.map((f) => f.luma);
  res.summary = {
    lumaBefore: res.before.at(-1), lumaShotOn: onL.at(-1), lumaShotOff: offL.at(-1),
    jump: Math.abs(onL.at(-1) - res.before.at(-1)),
    maxStepOn: steps([res.before.at(-1), ...onL]), maxStepOff: steps([onL.at(-1), ...offL]),
    minOpacity: minOp,
  };
  log('rm summary', JSON.stringify(res.summary));
  fs.writeFileSync(`${out}/rm.json`, JSON.stringify(res, null, 1));
  return res.summary;
};
