// look-pass-6 item 1: the possession camera after the seal (the queen in the throat / shaft), from the game saved by look6-cell.mjs
// (L6_SEAL_SAVE_OUT). Pictures: <out>/<tag>-<yaw>.png plus the camera / cell read-out in the log.
//   L6_SAVE_IN=test-output/look6/s1-sealed.save node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" \
//     --script tests/e2e/look6-sealed.mjs --out test-output/look6/sealed-a
// Environment: L6_TAG, L6_YAWS (default 0,120,240), L6_CELLCAM=0 (cell camera off), L6_LAY=1 (lay a clutch first).
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.L6_TAG ?? 'sl';
  const yaws = (process.env.L6_YAWS ?? '0,120,240').split(',').map(Number);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  if (process.env.L6_CELLCAM === '0') await g(() => window.__game.views.cellCam(false));
  if (process.env.L6_LAY === '1') {
    for (let b = 0; b < 4; b++) { await g(() => window.__game.act('lay-egg')); await g(() => window.__game.step(50)); await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' })); await g(() => window.__game.step(5)); }
  }
  for (const yaw of yaws) {
    await g(({ y }) => { window.__game.camera.orbit(y, 0); }, { y: yaw });
    await g(() => window.__game.step(6));
    await g(() => window.__game.renderFrame({ settle: 2 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-yaw${yaw}.png`, timeout: 600000 });
    log('shot', yaw, JSON.stringify(await g(() => {
      const gm = window.__game, q = gm.summary().possessed, c = gm.views.possession(), s = c.cell?.subject;
      const f = (x, y, z) => { const v = gm.query.field(x, y, z); return Math.round((typeof v === 'number' ? v : v.f) * 100) / 100; };
      const above = []; for (let h = 0; h <= 8; h += 1) above.push(f(q.pos[0], q.pos[1] + h, q.pos[2]));
      return { rig: gm.camera.state(), cell: { ...c.cell, subject: undefined }, subject: s, queen: { pos: q.pos.map((v) => Math.round(v * 100) / 100), up: q.up, fwd: q.fwd }, fAbove: above, pose: gm.camera.pose() };
    })));
  }
  return {};
};
