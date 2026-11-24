// app-seams-4 item 5 on the real foundings of seeds 1-3: import the game exported right after the hand-over (firstplay FIRSTPLAY_CHECKPOINT), let the camera settle, take the outcome card.
//   APP4_SAVE=test-output/app4/s2-handover.save APP4_TAG=s2 node tools/harness/play.mjs --root . --query "test=1&quality=low" --script tests/e2e/app4-card2.mjs --out test-output/app4/cards
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'card';
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_SAVE, 'utf8'));
  log('import', JSON.stringify(r).slice(0, 200));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  const ph = await g(() => window.__founding?.view()?.phase ?? null);
  const card = await g(() => !!document.querySelector('[data-testid="founding-outcome"]'));
  log('phase', ph, 'card', card);
  log('subject', JSON.stringify(await g(() => { const v = window.__hud.game.session.views; return v.shotSource ? v.shotSource() : null; })).slice(0, 700));
  for (const s of [0.5, 4]) {
    await g((k) => window.__game.renderFrame({ settle: k }), s);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}-card-settle${s}.png`, timeout: 600000 });
    log('shot', s);
  }
  return { phase: ph, card };
};
