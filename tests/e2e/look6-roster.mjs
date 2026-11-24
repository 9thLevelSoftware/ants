// look-pass-6 item 4: the roster's "Where" column (look5 firstplay/seed1-continue/18-roster.png: "Nursery ..." and "Royal 5740"). The staged colony of look2-stage.mjs, the
// Roster opened with L: picture <out>/roster.png and the Where texts of the rows in <out>/roster.json.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/look6-roster.mjs --out test-output/look6/roster
import fs from 'node:fs';
import { stage } from './lib/look2-stage.mjs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const S = await stage(page, log, { seed: 1 });
  await S.nestWorker();
  await g(() => window.__game.step(200));
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await page.keyboard.press('l');
  await page.waitForSelector('[data-testid="roster-body"]', { timeout: 60000 });
  await g(() => window.__game.renderFrame({ settle: 0.5 }));
  await page.waitForTimeout(800);
  const rows = await page.$$eval('[data-testid="roster-row"]', (els) => els.map((e) => e.innerText.replace(/\s+/g, ' ').trim()));
  fs.writeFileSync(`${out}/roster.json`, JSON.stringify(rows, null, 1));
  log('roster rows', rows.length, JSON.stringify(rows.slice(0, 6)));
  await page.screenshot({ path: `${out}/roster.png`, timeout: 300000 });
};
