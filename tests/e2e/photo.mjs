// Photo mode end to end (task photo):
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/photo.mjs \
//        --out test-output/photo --width 960 --height 540 --timeout 400000 --script-timeout 1500000
// The classic single-file build (dist-portable, served with --static) runs the same script:
//   node tools/harness/play.mjs --static --root dist-portable --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/photo.mjs ...
// The possessed queen stands on open ground; photo mode opens from the possession view with time frozen; the lens (focal length,
// aperture, focus) is changed; captures are taken at the canvas size and at 2x and analysed: exposure (mean luminance,
// clipping), depth of field (the sharpness of the subject against the background changes with the aperture) and no
// interface (the captured PNG is the canvas; the page screenshot shows the panel and no HUD). Then the same capture with
// every download route refused (an anchor click that throws, no new tabs, no clipboard): the preview card must still
// carry the image. Leaving restores view, possession, speed, time and the picture. The keyboard path (F2, H, Enter) is
// exercised too. Every PNG under <out> must be looked at.
// PHOTO_MODE=iframe: the build runs inside <iframe sandbox="allow-scripts allow-pointer-lock"> (opaque origin, no
// downloads, no popups; --static --root <host dir with game/ and index.html> --no-ready), as tools/build/verify-portable.mjs
// sets it up; the keys are sent to the frame.
// PHOTO_QUICK=1 skips the 2x capture and the look / exposure sweep (classic-build check on a loaded machine).
import fs from 'node:fs';
import path from 'node:path';

export default async ({ page, shot, log, wait, out, context }) => {
  // the frame that holds the game: the page itself, or the single child frame of a host page
  let target = page;
  if (process.env.PHOTO_MODE === 'iframe') {
    const deadline = Date.now() + 120000;
    while (!(target = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/game/'))) && Date.now() < deadline) await wait(200);
    if (!target) throw new Error('photo: game frame not found');
    await target.waitForFunction(() => window.__ready === true, null, { timeout: 300000, polling: 200 });
    await page.mouse.click(5, 5); // focus into the frame so key presses reach the game
  }
  const g = (fn, arg) => target.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`photo: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const quick = !!process.env.PHOTO_QUICK;
  const result = { checks: {} };
  const ok = (name, data) => { result.checks[name] = data ?? 'ok'; log('OK', name, data === undefined ? '' : JSON.stringify(data)); };
  const dir = out || 'test-output/photo';
  fs.mkdirSync(dir, { recursive: true });
  const save = (name, b64) => { const f = path.join(dir, name); fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f; };
  const photo = (fn, arg) => g(fn, arg);

  // ---- pixel analysis of a captured PNG (runs in the page: it decodes with the browser's own decoder)
  const analyse = (b64, box) => g(async ([data, region]) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('PNG did not decode')); img.src = `data:image/png;base64,${data}`; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const cx = c.getContext('2d', { willReadFrequently: true });
    cx.drawImage(img, 0, 0);
    const W = img.width, H = img.height, px = cx.getImageData(0, 0, W, H).data;
    const luma = new Float32Array(W * H);
    let sum = 0, hi = 0, lo = 0, satSum = 0;
    for (let i = 0; i < W * H; i++) {
      const r = px[i * 4] / 255, gg = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
      const y = 0.2126 * r + 0.7152 * gg + 0.0722 * b;
      luma[i] = y; sum += y;
      if (y > 0.98) hi++;
      if (y < 0.02) lo++;
      const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
      satSum += mx > 0 ? (mx - mn) / mx : 0;
    }
    // mean absolute Laplacian over a region (fractions of the image): high where there is fine detail, low where it is blurred
    const sharp = (x0, y0, x1, y1) => {
      const ax = Math.max(1, Math.floor(x0 * W)), bx = Math.min(W - 2, Math.ceil(x1 * W)), ay = Math.max(1, Math.floor(y0 * H)), by = Math.min(H - 2, Math.ceil(y1 * H));
      let s = 0, n = 0;
      for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
        const i = y * W + x;
        s += Math.abs(4 * luma[i] - luma[i - 1] - luma[i + 1] - luma[i - W] - luma[i + W]); n++;
      }
      return n ? s / n : 0;
    };
    const res = { width: W, height: H, meanLuma: sum / (W * H), clipHigh: hi / (W * H), clipLow: lo / (W * H), meanSat: satSum / (W * H) };
    if (region) { res.subject = sharp(...region.subject); res.background = sharp(...region.background); res.near = sharp(...region.near); }
    return res;
  }, [b64, box ?? null]);

  const capture = async (name, o = {}) => {
    const r = await photo((opts) => window.__game.views.photo.capture(opts), { scale: o.scale ?? 1, data: true });
    expect(r.ok, `capture ${name} failed`, r);
    const file = save(`${name}.png`, r.data);
    const { data, ...info } = r;
    return { ...info, file, data };
  };

  const hashOf = `(s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }`;

  // ---- 0. the queen on open ground
  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(5));
  // (the opening is another module's and its cheats leave the queen in the nest: the queen is photographed where she starts, on open ground)
  const setup = await g(() => {
    const gm = window.__game, w = gm.query.world(), q = gm.summary().possessed;
    return { start: w.queenStart.pos, bu: w.bu, worker: q.id };
  });
  await g(() => window.__game.step(3));
  await g(() => window.__game.setSpeed(2));
  await g(() => window.__game.renderFrame());
  const before = await g((hs) => {
    const hash = eval(hs);
    const gm = window.__game, s = gm.summary();
    const c = document.getElementById('view');
    gm.renderFrame();
    const png = c.toDataURL('image/png');
    window.__photoBeforePng = png; // look pass 3: kept so a mismatch after leaving can be looked at (written below)
    return { view: s.view, possessed: s.possessed.id, tick: s.tick, speed: s.time.speed, cam: gm.camera.pose(), frame: hash(png), hud: !!document.querySelector('[data-testid="hud-root"]') };
  }, hashOf);
  expect(before.view === 'possess' && before.possessed === setup.worker, 'queen not possessed', before);
  expect(before.hud, 'HUD should be on in the possession view');
  await shot('00-possession');

  // ---- 1. enter photo mode: time frozen, HUD hidden, panel shown, subject = the possessed worker
  const speed4 = before.speed;
  expect(speed4 === 2, 'speed should be 2x before photo mode (the opening caps it)', before.speed);
  const view = await g(() => window.__game.camera.set('photo'));
  expect(view === 'photo', 'did not enter photo mode', view);
  const t0 = await g(() => window.__game.summary().tick);
  expect(t0 === before.tick, 'entering photo mode ticked the sim', { before: before.tick, t0 });
  await g(() => window.__game.realtime(true)); // real time passes: frozen time must hold at 2x anyway
  await wait(1500);
  const frozen = await g(() => window.__game.summary());
  await g(() => window.__game.realtime(false));
  expect(frozen.tick === t0, 'time advanced in photo mode', { t0, now: frozen.tick });
  let st = await photo(() => window.__game.views.photo.state());
  expect(st && st.active && /Queen #\d+/.test(st.subject || ''), 'the possessed queen is not the subject', st);
  expect(st.focusMode === 'subject', 'focus should start on the subject', st.focusMode);
  await wait.frames(3);
  const dom1 = await g(() => ({
    panel: !!document.querySelector('[data-testid="photo-panel"]'), hud: !!document.querySelector('[data-testid="hud-root"]'),
    sliders: document.querySelectorAll('[data-testid="photo-panel"] [role="slider"]').length, capture: !!document.querySelector('[data-testid="photo-capture"]'),
    noDof: !!document.querySelector('[data-testid="photo-no-dof"]'),
  }));
  expect(dom1.panel && !dom1.hud, 'panel missing or HUD still shown', dom1);
  expect(dom1.sliders >= 5 && dom1.capture, 'panel controls missing', dom1);
  expect(!dom1.noDof, 'the high quality preset has a post chain: no "no depth of field" note expected', dom1);
  // the hint line names the keys that are bound (Space / C fly up and down), never keys that do nothing in photo mode
  const hint = await g(() => [...document.querySelectorAll('[data-testid="photo-hint"] kbd')].map((k) => k.textContent).join(' ') + ' | ' + (document.querySelector('[data-testid="photo-hint"]')?.innerText ?? ''));
  expect(/^Space C\b/.test(hint) && !/\b[QE]\b/.test(hint.split('|')[1]) && /right-drag/.test(hint), 'the on-screen hint does not match the photo-mode bindings', hint);
  ok('enter', { speed4, tick: t0, dom: dom1, subject: st.subject, hint });

  // ---- 2. frame the subject: camera low and close, looking along the ground so the background recedes
  const sub = await photo(() => window.__game.views.photo.pose().subject);
  expect(sub && sub.pos, 'no subject position', sub);
  // fly forward with the rig's own collision, then aim at the subject (the camera starts behind the worker)
  for (let i = 0; i < 12; i++) await photo(() => window.__game.views.photo.fly({ move: { x: 0, y: 1 }, seconds: 0.25 }));
  await photo((p) => window.__game.views.photo.aimAt(p), sub.pos);
  await photo(() => window.__game.views.photo.set({ focalMm: 85, fNumber: 1.4, focusMode: 'subject', hideMarkers: true }));
  await g(() => window.__game.renderFrame());
  st = await photo(() => window.__game.views.photo.state());
  expect(Math.abs(st.lens.focalMm - 85) < 0.01 && Math.abs(st.lens.fNumber - 1.4) < 0.01, 'lens values not applied', st.lens);
  const pose = await photo(() => window.__game.views.photo.pose());
  const dist = Math.hypot(pose.pos.x - sub.pos.x, pose.pos.y - sub.pos.y, pose.pos.z - sub.pos.z);
  expect(Math.abs(pose.focusMm - dist) < 0.5 || pose.focusMm === 200 * setup.bu, 'focus is not on the subject', { focusMm: pose.focusMm, dist });
  const scr = await g((p) => window.__game.views.project(p), sub.pos);
  expect(scr, 'subject is not in front of the camera');
  const cv = await g(() => { const c = document.getElementById('view'); return { w: c.clientWidth, h: c.clientHeight }; });
  const fx = scr.x / cv.w, fy = scr.y / cv.h;
  expect(fx > 0.35 && fx < 0.65 && fy > 0.3 && fy < 0.7, 'subject is not near the centre of the frame', { fx, fy });
  const rad = 0.09;
  const box = {
    subject: [fx - rad, fy - rad, fx + rad, fy + rad],
    background: [0.05, 0.02, 0.95, 0.22], // the top band: the far ground / haze / sky line
    near: [0.05, 0.86, 0.95, 0.99], // the bottom band: ground in front of the subject
  };
  await shot('01-photo-panel'); // page screenshot: the panel, the guides off, no HUD
  ok('framing', { dist: +dist.toFixed(1), fx: +fx.toFixed(2), fy: +fy.toFixed(2), focusBu: st.lens.focusBu });

  // ---- 3. capture at f/1.4 and at f/22: depth of field
  const a14 = await capture('02-f1.4-focus-subject');
  const an14 = await analyse(a14.data, box);
  expect(a14.width === cv.w && a14.height === cv.h, 'capture is not at the canvas size', { a14: [a14.width, a14.height], cv });
  await photo(() => window.__game.views.photo.set({ fNumber: 22 }));
  const a22 = await capture('03-f22-focus-subject');
  const an22 = await analyse(a22.data, box);
  log('sharpness f/1.4', JSON.stringify(an14), 'f/22', JSON.stringify(an22));
  result.sharpness = { f14: an14, f22: an22 };
  // wide open: the subject is sharper than the far background; stopped down the background gains detail
  expect(an14.subject > 1.25 * an14.background, 'f/1.4: the subject is not sharper than the far background', { an14 });
  expect(an22.background > 1.3 * an14.background, 'stopping down did not sharpen the far background (no depth of field)', { an14, an22 });
  ok('depth-of-field', { subjectOverBackground14: +(an14.subject / an14.background).toFixed(2), backgroundGain22over14: +(an22.background / an14.background).toFixed(2) });
  // exposure of the normal capture: neither dark nor blown
  expect(an14.meanLuma > 0.12 && an14.meanLuma < 0.8, 'f/1.4 capture is badly exposed', an14);
  expect(an14.clipHigh < 0.08 && an14.clipLow < 0.08, 'capture clips', an14);
  ok('exposure-normal', { mean: +an14.meanLuma.toFixed(3), clipHigh: +an14.clipHigh.toFixed(4), clipLow: +an14.clipLow.toFixed(4) });
  await photo(() => window.__game.views.photo.set({ fNumber: 2.8 }));

  if (!quick) {
    // ---- 4. exposure compensation and looks
    await photo(() => window.__game.views.photo.set({ exposureEV: -2 }));
    const dark = await analyse((await capture('04-ev-minus2')).data);
    await photo(() => window.__game.views.photo.set({ exposureEV: 2 }));
    const bright = await analyse((await capture('05-ev-plus2')).data);
    await photo(() => window.__game.views.photo.set({ exposureEV: 0 }));
    expect(dark.meanLuma < an14.meanLuma - 0.04 && bright.meanLuma > an14.meanLuma + 0.04, 'exposure compensation does not change the picture', { dark: dark.meanLuma, normal: an14.meanLuma, bright: bright.meanLuma });
    ok('exposure-compensation', { minus2: +dark.meanLuma.toFixed(3), zero: +an14.meanLuma.toFixed(3), plus2: +bright.meanLuma.toFixed(3) });
    await photo(() => window.__game.views.photo.set({ look: 'plate' }));
    const plate = await analyse((await capture('06-look-plate')).data);
    await photo(() => window.__game.views.photo.set({ look: 'natural' }));
    expect(plate.meanSat < 0.7 * an14.meanSat, 'Plate is not desaturated', { plate: plate.meanSat, natural: an14.meanSat });
    ok('look-plate', { sat: +plate.meanSat.toFixed(3), natural: +an14.meanSat.toFixed(3) });

    // ---- 5. a 2x capture
    const c2 = await capture('07-scale2', { scale: 2 });
    expect(c2.scale === 2 && c2.width === 2 * cv.w && c2.height === 2 * cv.h, '2x capture has the wrong size', { c2: [c2.scale, c2.width, c2.height], cv });
    const after2 = await photo(() => window.__game.views.photo.state());
    const dec = await analyse(c2.data);
    expect(dec.width === c2.width && dec.height === c2.height, 'the 2x PNG does not decode at the stated size', dec);
    ok('capture-2x', { w: c2.width, h: c2.height, method: c2.method });
    // the canvas is back at its normal size afterwards
    const cvAfter = await g(() => { const c = document.getElementById('view'); return { w: c.width, h: c.height }; });
    expect(cvAfter.w === a14.width && cvAfter.h === a14.height, 'drawing buffer was not restored after the 2x capture', { cvAfter, a14: [a14.width, a14.height] });
    expect(after2.caps.maxScale === 2, 'panel should offer 2x on this GPU', after2.caps);
  }

  // ---- 6. click to focus, orbit, guides
  const far = await g(() => window.__game.views.project({ x: 0, y: 0, z: 0 }));
  const clickGround = await photo(([w, h]) => window.__game.views.photo.clickFocus(w * 0.9, h * 0.12), [cv.w, cv.h]);
  expect(clickGround.surface && clickGround.state.focusMode === 'manual', 'click on the ground did not set manual focus', clickGround);
  expect(clickGround.focusMm > dist * 1.05, 'focus did not move to the farther ground', { focus: clickGround.focusMm, dist });
  const clickAnt = await photo(([x, y]) => window.__game.views.photo.clickFocus(x, y), [scr.x, scr.y]);
  expect(clickAnt.hit && clickAnt.hit.kind === 'ant' && clickAnt.state.focusMode === 'subject', 'click on the ant did not pick it as the subject', clickAnt.hit);
  const orbitBefore = await photo(() => window.__game.views.photo.pose());
  // frame the subject off-centre first (turn the view a little to the left): orbiting must not pull it back to the middle
  const offYaw = await photo(() => window.__game.views.photo.turnView(9, 0));
  await g(() => window.__game.renderFrame());
  const scrOff = await g((p) => window.__game.views.project(p), sub.pos);
  const orb = await photo(() => window.__game.views.photo.orbit(35, 4));
  await g(() => window.__game.renderFrame());
  const scrOrbit = await g((p) => window.__game.views.project(p), sub.pos);
  const orbitAfter = orb.pose;
  expect(scrOff && scrOrbit && Math.hypot((scrOrbit.x - scrOff.x) / cv.w, (scrOrbit.y - scrOff.y) / cv.h) < 0.06, // a 85 mm lens: 0.06 of the frame is under a degree; the old snap moved it by 0.3 or more
     'orbiting moved the subject within the frame', { scrOff, scrOrbit, offYaw });
  const d0 = Math.hypot(orbitBefore.pos.x - sub.pos.x, orbitBefore.pos.y - sub.pos.y, orbitBefore.pos.z - sub.pos.z);
  const d1 = Math.hypot(orbitAfter.pos.x - sub.pos.x, orbitAfter.pos.y - sub.pos.y, orbitAfter.pos.z - sub.pos.z);
  expect(Math.abs(d1 - d0) < 0.05 * d0 + 0.5 && Math.hypot(orbitAfter.pos.x - orbitBefore.pos.x, orbitAfter.pos.z - orbitBefore.pos.z) > 0.2 * d0, 'orbit did not circle the subject', { d0, d1 });
  ok('click-focus-and-orbit', { groundFocusMm: +clickGround.focusMm.toFixed(1), antPicked: clickAnt.hit.id, orbit: [+d0.toFixed(1), +d1.toFixed(1)] });
  await photo(() => window.__game.views.photo.set({ guides: 'thirds' }));
  await wait.frames(3);
  const guides = await g(() => document.querySelector('[data-testid="photo-guides"]')?.getAttribute('data-guides'));
  expect(guides === 'thirds', 'guides overlay not drawn', guides);
  await g(() => window.__game.renderFrame());
  await shot('08-guides-thirds');
  const withGuides = await capture('09-capture-with-guides-on');
  await photo(() => window.__game.views.photo.set({ guides: 'off' }));
  const noGuides = await capture('10-capture-with-guides-off');
  expect(withGuides.bytes === noGuides.bytes || Math.abs(withGuides.bytes - noGuides.bytes) / noGuides.bytes < 0.02, 'guides must not be captured', { a: withGuides.bytes, b: noGuides.bytes });
  ok('guides-not-captured');

  // ---- 6b. Open in new tab with the browser's own window.open (nothing stubbed): it opens and says so, or, in a frame that
  // cannot open tabs (opaque origin), the button is disabled with its reason and nothing is logged
  const real = await photo(() => window.__game.views.photo.capture({ scale: 1, data: false }));
  expect(real.ok, 'capture for the open-in-tab check failed', real);
  await wait.frames(3);
  const framed = await g(() => window.origin === 'null');
  const popups = [];
  const onPage = (p) => popups.push(p);
  context.on('page', onPage);
  const tabBtn = await g(() => { const b = document.querySelector('[data-testid="photo-open"]'); return { disabled: b?.disabled || b?.getAttribute('aria-disabled') === 'true' }; });
  if (framed) {
    expect(tabBtn.disabled, 'Open in new tab should be disabled where new tabs cannot work', tabBtn);
    await g(() => { document.querySelector('[data-testid="photo-open"]').click(); }); // a click on a disabled button does nothing (and logs nothing)
    await wait(300);
    expect(popups.length === 0, 'a tab opened from a frame that cannot', popups.length);
    ok('open-in-tab-frame', { disabled: true });
  } else {
    expect(!tabBtn.disabled, 'Open in new tab should be enabled on a normal page', tabBtn);
    await g(() => { document.querySelector('[data-testid="photo-open"]').click(); });
    await wait(800);
    const msg = await g(() => document.querySelector('[data-testid="photo-preview-message"]')?.textContent ?? null);
    expect(msg === 'Opened in a new tab.', 'the tab opened but the card did not say so', { msg, popups: popups.length });
    expect(popups.length >= 1, 'no tab opened', popups.length);
    ok('open-in-tab', { message: msg, popups: popups.length });
  }
  context.off('page', onPage);
  for (const p of popups) await p.close().catch(() => {});

  // ---- 7. every download route refused: the preview card still carries the image, nothing throws
  await g(() => {
    window.__errs = [];
    window.addEventListener('error', (e) => window.__errs.push(String(e.message)));
    window.addEventListener('unhandledrejection', (e) => window.__errs.push(String(e.reason)));
    HTMLAnchorElement.prototype.click = function () { throw new DOMException('Downloads are blocked in this frame', 'SecurityError'); };
    window.open = () => null;
    const refuse = () => Promise.reject(new DOMException('Clipboard access is blocked', 'NotAllowedError'));
    try { Object.defineProperty(navigator, 'clipboard', { value: { write: refuse, writeText: refuse }, configurable: true }); } catch { /* keep the real one */ }
  });
  const blocked = await photo(() => window.__game.views.photo.capture({ scale: 1, data: false }));
  expect(blocked.ok && blocked.download === 'failed', 'a throwing anchor click should be reported as a failed download', blocked);
  await wait.frames(3);
  const prev = await g(async () => {
    const img = document.querySelector('[data-testid="photo-preview-img"]');
    if (img && !img.complete) await new Promise((r) => { img.onload = r; img.onerror = r; setTimeout(r, 4000); });
    return {
      card: !!document.querySelector('[data-testid="photo-preview"]'), download: document.querySelector('[data-testid="photo-preview"]')?.getAttribute('data-download'),
      img: !!img, natural: img ? [img.naturalWidth, img.naturalHeight] : null, note: document.querySelector('[data-testid="photo-preview-note"]')?.textContent,
      buttons: ['photo-save', 'photo-open', 'photo-copy', 'photo-preview-close'].map((t) => !!document.querySelector(`[data-testid="${t}"]`)),
    };
  });
  expect(prev.card && prev.img && prev.natural && prev.natural[0] === blocked.width, 'preview card does not show the image when downloads are blocked', prev);
  expect(prev.download === 'failed' && /Right-click/.test(prev.note || ''), 'preview should explain the blocked download', prev);
  expect(prev.buttons.every(Boolean), 'preview buttons missing', prev);
  await shot('11-preview-downloads-blocked');
  await g(() => { document.querySelector('[data-testid="photo-open"]').click(); });
  await wait(300);
  await g(() => { document.querySelector('[data-testid="photo-copy"]').click(); });
  await wait(600);
  await g(() => { document.querySelector('[data-testid="photo-save"]').click(); });
  await wait(300);
  const msgs = await g(() => ({ message: document.querySelector('[data-testid="photo-preview-message"]')?.textContent ?? null, note: document.querySelector('[data-testid="photo-preview-note"]')?.textContent, errs: window.__errs }));
  expect(/Right-click|clipboard|copy/i.test(msgs.message || ''), 'the refused copy was not explained', msgs);
  expect(msgs.errs.length === 0, 'errors escaped from the blocked routes', msgs.errs);
  ok('downloads-blocked', { download: blocked.download, note: msgs.note, message: msgs.message });
  // Esc closes the preview first (and does not leave photo mode)
  await page.keyboard.press('Escape');
  await wait.frames(3);
  const afterEsc = await g(() => ({ preview: !!document.querySelector('[data-testid="photo-preview"]'), view: window.__game.camera.view() }));
  expect(!afterEsc.preview && afterEsc.view === 'photo', 'Esc should close the preview and stay in photo mode', afterEsc);

  // ---- 8. the keyboard path: H toggles guides, Enter captures
  await page.keyboard.press('KeyH');
  await wait.frames(3);
  const guidesKey = await photo(() => window.__game.views.photo.state().guides);
  expect(guidesKey === 'thirds', 'H did not toggle the guides', guidesKey);
  await page.keyboard.press('KeyH');
  await wait.frames(2);
  await page.keyboard.press('Enter');
  const deadline = Date.now() + 240000;
  let last = null;
  while (Date.now() < deadline) {
    await wait.frames(2);
    last = await photo(() => window.__game.views.photo.lastCapture());
    if (last && last.download === 'failed' && (await photo(() => !!window.__game.views.photo.state().preview))) break;
  }
  const keyed = await photo(() => window.__game.views.photo.state());
  expect(keyed.guides === 'off' && keyed.preview, 'Enter did not capture (or H did not toggle back)', { guides: keyed.guides, preview: !!keyed.preview });
  ok('keyboard', { guidesToggled: true, enterCaptured: last && last.filename });
  await g(() => document.querySelector('[data-testid="photo-preview-close"]')?.click());

  // ---- 9. leave: F2 restores view, possession, speed, time and the picture
  await page.keyboard.press('F2');
  await target.waitForSelector('[data-testid="hud-root"]', { timeout: 60000 }); // the HUD follows the next UI snapshot
  await wait.frames(2);
  const afterExit = await g((hs) => {
    const hash = eval(hs);
    const gm = window.__game, s = gm.summary(), c = document.getElementById('view');
    gm.renderFrame();
    const png = c.toDataURL('image/png');
    window.__photoAfterPng = png; // look pass 3: the dump must be of the frame that was hashed (a second toDataURL reads a cleared buffer)
    return {
      view: s.view, possessed: s.possessed && s.possessed.id, tick: s.tick, speed: s.time.speed, paused: s.time.paused, cam: gm.camera.pose(), frame: hash(png),
      hud: !!document.querySelector('[data-testid="hud-root"]'), panel: !!document.querySelector('[data-testid="photo-panel"]'),
    };
  }, hashOf);
  expect(afterExit.view === 'possess' && afterExit.possessed === before.possessed, 'view or possession not restored', afterExit);
  expect(afterExit.tick === before.tick && afterExit.speed === speed4 && !afterExit.paused, 'tick or speed changed by photo mode', { before: before.tick, after: afterExit.tick, speed: afterExit.speed });
  expect(afterExit.hud && !afterExit.panel, 'HUD not back or panel still shown', afterExit);
  const dpos = Math.hypot(afterExit.cam.pos.x - before.cam.pos.x, afterExit.cam.pos.y - before.cam.pos.y, afterExit.cam.pos.z - before.cam.pos.z);
  expect(dpos < 0.05 && Math.abs(afterExit.cam.fov - before.cam.fov) < 0.01, 'camera pose not restored', { dpos, fov: [before.cam.fov, afterExit.cam.fov] });
  if (afterExit.frame !== before.frame) {
    // look pass 3: write both frames so the difference can be seen (and measured) instead of only hashed
    const fs = await import('node:fs');
    const dumps = await g(() => ({ before: window.__photoBeforePng, after: window.__photoAfterPng }));
    for (const [k, v] of Object.entries(dumps)) fs.writeFileSync(`${out}/exit-mismatch-${k}.png`, Buffer.from(v.split(',')[1], 'base64'));
    log('exit mismatch frames written', out);
  }
  expect(afterExit.frame === before.frame, 'the picture after leaving differs from the one before (exposure / look / depth of field not restored)', { before: before.frame, after: afterExit.frame });
  await shot('12-after-exit'); // before time runs again: software GL must not be left with a backlog of frames
  await g(() => window.__game.realtime(true));
  await wait(700);
  const resumed = await g(() => window.__game.summary().tick);
  expect(resumed > afterExit.tick, 'time did not resume after leaving photo mode', { resumed, at: afterExit.tick });
  await g(() => window.__game.realtime(false));
  ok('exit-restores', { dpos: +dpos.toFixed(4), speed: afterExit.speed, tickBefore: before.tick, tickAfter: afterExit.tick, resumedTicks: resumed - afterExit.tick });

  result.files = fs.readdirSync(dir).filter((f) => f.endsWith('.png'));
  return result;
};
