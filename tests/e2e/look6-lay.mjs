// look-pass-6 (integrator ruling 1): the lay-egg prompt line in both states. Replays the real founding at beat 08 (L6_SAVE_IN, see look6-cell.mjs), seals the entrance, then:
//   <out>/lay-1-ready.png     the queen in the cell, nothing running: "Lay egg" (available)
//   <out>/lay-2-busy.png      the batch wound up and running: "Lay egg — busy", greyed
//   <out>/lay-3-after.png     the batch ended: "Lay egg" again
// and <out>/lay.json with the texts read from the DOM (data-testid prompt-line) and the sim's events of the presses.
//   L6_SAVE_IN=test-output/look6/s1-cell.save node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look6-lay.mjs --out test-output/look6/lay
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const step = (n) => g((k) => window.__game.step(k), n);
  const phase = () => g(() => window.__founding?.view()?.phase ?? null);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await step(2);
  await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
  await step(20);
  await g(() => window.__game.act('seal-entrance'));
  for (let t = 0; t < 3000 && (await phase()) === 'seal'; t += 50) await step(50);
  for (let i = 0; i < 5 && (await phase()) === 'seal'; i++) await step(20);
  log('phase after seal', await phase());
  const lines = () => page.$$eval('[data-testid="prompt-line"]', (els) => els.map((e) => ({ text: e.innerText.replace(/\s+/g, ' ').trim(), disabled: e.getAttribute('aria-disabled') === 'true' })));
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 600000 });
    const l = await lines();
    log(name, JSON.stringify(l));
    return l;
  };
  const res = {};
  res.ready = await pic('lay-1-ready');
  const seq0 = await g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
  await g(() => window.__game.act('lay-egg'));
  await step(10);
  await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' }));
  await step(10);
  res.busy = await pic('lay-2-busy');
  // a second press while it runs: refused, as the sim says
  await g(() => window.__game.act('lay-egg'));
  await step(2);
  await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' }));
  for (let t = 0; t < 600; t += 5) {
    await step(5);
    const ended = await g((since) => window.__game.events(undefined, 80, since).some((e) => e.type === 'action-completed' && e.action === 'lay-egg'), seq0);
    if (ended) break;
  }
  await step(10);
  res.after = await pic('lay-3-after');
  res.events = await g((since) => window.__game.events(undefined, 80, since).filter((e) => /action-/.test(e.type) && e.action === 'lay-egg').map((e) => `${e.type}:${e.reason ?? e.result ?? ''}`), seq0);
  fs.writeFileSync(`${out}/lay.json`, JSON.stringify(res, null, 1));
  return res;
};
