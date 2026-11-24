// app-seams-4 item 5 (and the founding-shot items): replay a real founding from its sealed save to the outcome card, at one quality tier.
//   APP4_SAVE=<sealed save> node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" \
//     --script tests/e2e/app4-card.mjs --out test-output/app4/card-s1 --script-timeout 3000000
// Saves: test-output/look6/s1-sealed.save (seed 1, phase 'lay' right after the seal). Pictures: <out>/<tag>-11-timelapse.png and -12-outcome-card.png.
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'card';
  const step = (n) => g((k) => window.__game.step(k), n);
  const phase = () => g(() => window.__founding?.view()?.phase ?? null);
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1.5 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 600000 });
    log('shot', name);
  };
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_SAVE, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await step(2);
  log('phase', await phase());
  const layBatch = async () => {
    const seq0 = await g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
    await g(() => window.__game.act('lay-egg'));
    await step(10);
    await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' }));
    for (let t = 0; t < 600; t += 5) {
      await step(5);
      if (await g((since) => window.__game.events(undefined, 80, since).some((e) => (e.type === 'action-completed' || e.type === 'action-failed') && e.action === 'lay-egg'), seq0)) break;
    }
    await step(5);
  };
  for (let b = 0; b < 4; b++) await layBatch();
  await g(() => document.querySelector('[data-testid="founding-tend"]')?.click());
  await step(1);
  for (let i = 0; i < 100; i++) {
    const t = await g(() => window.__founding?.view()?.timelapse ?? null);
    if (t && t.counters.larvae > 0) break;
    await step(50);
  }
  await pic('11-timelapse');
  await g(() => document.querySelector('[data-testid="founding-skip"]')?.click());
  await step(1);
  log('phase after skip', await phase());
  await pic('12-outcome-card');
  return { phase: await phase() };
};
