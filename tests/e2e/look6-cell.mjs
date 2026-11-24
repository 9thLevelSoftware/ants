// look-pass-6 item 1: the possession camera in the founding shaft and cell (beats 07-10 of firstplay.mjs) at one quality tier.
//
// Two modes, one picture set:
//   record  (L6_SAVE_OUT=<file>): runs the real founding by firstplay.mjs up to beat 08 (the cell is ready), writes the game
//           exported at that moment to the file, then goes on to seal and lay.
//   replay  (L6_SAVE_IN=<file>): starts any game with ?autostart=1, imports the file (the real founding at beat 08) and goes on.
// Then: seal (beat 09), first clutch (beat 10), and shots of the shaft on the way. Pictures: <out>/<tag>-07..10.png.
//   FIRSTPLAY_SEED=00000001 FIRSTPLAY_UNTIL=08 L6_SAVE_OUT=test-output/look6/s1-cell.save node tools/harness/play.mjs --root . \
//     --query "test=1&quality=low" --script tests/e2e/look6-cell.mjs --out test-output/look6/before --script-timeout 3000000
//   L6_SAVE_IN=test-output/look6/s1-cell.save node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=medium" \
//     --script tests/e2e/look6-cell.mjs --out test-output/look6/after
import fs from 'node:fs';
import firstplay from './firstplay.mjs';

export default async (ctx) => {
  const { page, log, out } = ctx;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.L6_TAG ?? 'cell';
  const step = (n) => g((k) => window.__game.step(k), n);
  const phase = () => g(() => window.__founding?.view()?.phase ?? null);
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1.5 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 600000 });
    log('shot', name, JSON.stringify(await g(() => {
      const gm = window.__game, q = gm.summary().possessed, f = (x, y, z) => { const v = gm.query.field(x, y, z); return Math.round((typeof v === 'number' ? v : v.f) * 100) / 100; };
      const cs = gm.views.possession().cell, s = cs.subject;
      const above = []; for (let h = 0; h <= 6; h += 0.5) above.push(f(q.pos[0], q.pos[1] + h, q.pos[2]));
      return { state: gm.camera.state(), cell: { ...cs, subject: undefined }, subject: s, queen: { pos: q.pos.map((v) => Math.round(v * 100) / 100), up: q.up }, fAbove: above, fAtPlane: f(s.x, s.cutY, s.z), pose: gm.camera.pose() };
    })));
  };

  if (process.env.L6_SAVE_IN) {
    await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
    const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
    log('import', JSON.stringify(r));
    await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
    await step(2);
  } else {
    const result = await firstplay(ctx);
    log('firstplay beats', JSON.stringify(result.beats));
    if (process.env.L6_SAVE_OUT) {
      const x = await g(() => window.__game.saves.export('current', 'text'));
      if (x?.ok && typeof x.text === 'string') { fs.writeFileSync(process.env.L6_SAVE_OUT, x.text); log('save written', process.env.L6_SAVE_OUT); }
      else log('export failed', JSON.stringify(x).slice(0, 300));
    }
  }
  // L6_CELLCAM=0: the possession camera as it was before look pass 6 (the cell camera off), for the before pictures
  if (process.env.L6_CELLCAM === '0') await g(() => window.__game.views.cellCam(false));
  log('phase', await phase());
  await pic('08-chamber');

  // beat 09: sealed (the seal action walks her to the throat)
  await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
  await step(20);
  await g(() => window.__game.act('seal-entrance'));
  for (let t = 0; t < 3000 && (await phase()) === 'seal'; t += 50) await step(50);
  for (let i = 0; i < 5 && (await phase()) === 'seal'; i++) await step(20);
  log('phase after seal', await phase());
  await pic('09-sealed');

  // beat 10: the first clutch
  const layBatch = async () => { await g(() => window.__game.act('lay-egg')); await step(50); await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' })); await step(5); };
  for (let b = 0; b < 4; b++) await layBatch();
  await g(() => window.__game.camera.orbit(160, 15));
  await g(() => window.__game.camera.zoom(1.3));
  await pic('10-first-clutch');
  return { phase: await phase() };
};
