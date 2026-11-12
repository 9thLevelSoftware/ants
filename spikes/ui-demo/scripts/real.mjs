// Drives the shell on the real Game (spikes/ui-demo/game.html): title -> New colony -> Begin -> loading -> playing,
// then Esc opens the pause menu, Settings opens over it, Esc steps back out, Resume continues.
//   node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/real.mjs --query screen=title --timeout 150000
export default async ({ page, shot, log, url }) => {
  const base = url.split('?')[0];
  await page.goto(`${base}game.html?test=1&quality=test&seed=7`);
  await page.waitForFunction('window.__ready === true', null, { timeout: 60000 });
  await page.waitForSelector('.ui-title');
  log('title is up');
  await shot('real-title');
  await page.locator('[data-testid=menu-new]').click();
  await page.waitForSelector('.ui-newgame');
  await page.locator('[data-testid=seed-field]').fill('0000-0007');
  await shot('real-newgame');
  await page.locator('[data-testid=begin]').click();
  // generation is quick in test mode: the loading screen may only flash by, so wait for the mode instead
  await page.waitForFunction(`window.__game.ui.screen() === 'playing'`, null, { timeout: 120000 });
  const left = await page.evaluate(`document.querySelector('.ui-newgame, .ui-loading, .ui-title') === null`);
  if (!left) throw new Error('title / new game / loading screens are still drawn while playing');
  log('playing, no menu screen left over');
  await shot('real-playing');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ui-pausecard', { timeout: 10000 });
  await page.waitForTimeout(700);
  await shot('real-pause');
  await page.locator('[data-testid=pause-settings]').click();
  await page.waitForSelector('.ui-book');
  await page.waitForTimeout(700);
  await shot('real-settings');
  await page.keyboard.press('Escape');
  await page.waitForSelector('.ui-book', { state: 'detached' });
  const stillPaused = await page.evaluate(`!!document.querySelector('.ui-pausecard')`);
  if (!stillPaused) throw new Error('Esc on Settings also resumed the game');
  await page.locator('[data-testid=pause-resume]').click();
  await page.waitForSelector('.ui-pausecard', { state: 'detached' });
  log('resumed');
  return { ok: true };
};
