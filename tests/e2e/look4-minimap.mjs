// look-pass-4 item 4: the minimap before (the old nearest-cell plate, drawn here from the same data) and after (the real widget), same state.
// Staging by cheat: the opening completed (completeFounding), then the possessed worker moved next to the nearest structure and the nearest water
// body so the window shows both; scent view on. Run with --dpr 2 for a 352 px plate.
//   node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=test" --script tests/e2e/look4-minimap.mjs --dpr 2 --out test-output/look4/minimap
import { writeFileSync } from 'node:fs';
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(90));
  await g(() => window.__game.cheat.completeFounding(20));
  for (let i = 0; i < 80; i++) {
    const done = await g(() => { const op = window.__game.query.player().opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
    if (done) break;
    await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  const startPos = await g(() => window.__game.query.world().queenStart.pos);
  await g((p) => window.__game.cheat.spawnAnts(12, 'worker', null, p), startPos);
  await g(() => window.__game.step(100));
  await g(() => window.__hud.game.setSettings({ gameplay: { minimap: 'always', focusLine: 'never' } }));
  // where: a spot 150 mm beside the nearest structure footprint (a fence run or a wall) within 2 m of the start
  const spot = await g((p) => {
    const w = window.__hud.game.session.sim.world;
    let best = null;
    for (const o of w.objects) {
      if (!o.tags.includes('structure')) continue;
      const pr = w.prims[o.primStart];
      const d = Math.hypot(pr.pos.x - p.x, pr.pos.z - p.z);
      if (!best || d < best.d) best = { d, x: pr.pos.x, y: pr.pos.y, z: pr.pos.z, tpl: o.templateId };
    }
    return best;
  }, startPos);
  log('structure', JSON.stringify(spot));
  await g((s) => window.__game.teleport('possessed', { x: s.x + 150, y: s.y, z: s.z + 150 }), spot);
  await g(() => window.__game.step(5));
  await page.keyboard.press('KeyV');
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await page.waitForTimeout(600);
  const box = page.locator('[data-testid="minimap"] .fd-minimap-box');
  await box.screenshot({ path: `${out}/after-minimap.png`, timeout: 120000 });
  // the old painter: the nearest zone cell per pixel, from the same plate and window
  const before = await g(() => {
    const sim = window.__hud.game.session.sim, w = sim.world, zone = w.maps.zone;
    const el = document.querySelector('[data-testid="minimap"] canvas');
    const size = el.width, f = window.__hud.game.minimap ? window.__hud.game.minimap(true) : null;
    const rect = document.querySelector('[data-testid="minimap"] .fd-minimap-box').getBoundingClientRect();
    return { size, hasFrame: !!f, rect: [rect.left, rect.top, rect.width, rect.height] };
  });
  log('canvas', JSON.stringify(before));
  const res = await g(() => {
    const sim = window.__hud.game.session.sim, w = sim.world, zone = w.maps.zone;
    const tint = { forest: [58, 82, 52], lawn: [88, 116, 60], 'garden-bed': [92, 70, 48], pavement: [132, 130, 122], asphalt: [66, 68, 72], sand: [166, 146, 98], rubber: [118, 62, 56], interior: [150, 126, 100] };
    const typeById = []; for (const z of w.zones) typeById[z.id] = z.type;
    const cv = document.querySelector('[data-testid="minimap"] canvas'), size = cv.width;
    // window centre: the possessed ant's position is the camera target in possession
    const a = window.__game.summary().possessed.pos, win = 256 * w.bu, x0 = a[0] - win / 2, z0 = a[2] - win / 2, step = win / size;
    const c2 = document.createElement('canvas'); c2.width = c2.height = size;
    const ctx = c2.getContext('2d'), img = ctx.createImageData(size, size);
    let i = 0;
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++, i += 4) {
      const ix = Math.floor((x0 + (px + 0.5) * step) / zone.cell), iz = Math.floor((z0 + (py + 0.5) * step) / zone.cell);
      const t = tint[typeById[zone.data[iz * zone.nx + ix]]] ?? [96, 96, 96];
      img.data[i] = t[0]; img.data[i + 1] = t[1]; img.data[i + 2] = t[2]; img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c2.toDataURL('image/png');
  });
  writeFileSync(`${out}/before-plate-nearest.png`, Buffer.from(res.split(',')[1], 'base64'));
  await page.screenshot({ path: `${out}/after-frame.png`, timeout: 120000 });
  // repaint cost: the frame build + paint through the bridge, minimum of 30 repaints (ms)
  const cost = await g(async () => {
    const t = []; const cv = document.querySelector('[data-testid="minimap"] canvas');
    for (let i = 0; i < 30; i++) { const t0 = performance.now(); window.dispatchEvent(new Event('resize')); await new Promise((r) => setTimeout(r, 0)); t.push(performance.now() - t0); }
    return { min: Math.min(...t), canvas: cv.width };
  });
  log('repaint-ish', JSON.stringify(cost));
};
