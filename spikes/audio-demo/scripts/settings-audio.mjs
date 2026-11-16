// Settings > Audio from the title screen, before any gesture: the status line says the sound is waiting for a click and
// offers "Click to enable sound"; a real click on that button starts the sound and the line turns to "Sound running";
// a Test button then logs its cue. Screenshots before and after (looked at by hand).
//   node tools/harness/play.mjs --root . --query "test=1&audio=on&quality=low" --script spikes/audio-demo/scripts/settings-audio.mjs --out test-output/audio-pass
export default async ({ page, log, wait, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const line = () => g(() => { const el = document.querySelector('[data-testid="audio-status"]'); return el ? { text: el.textContent, status: el.getAttribute('data-status'), button: !!el.querySelector('[data-testid="audio-enable"]') } : null; });
  const snap = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 180000 });
  const result = {};
  result.status0 = await g(() => window.__foundressAudio.status());
  const settings = page.getByRole('button', { name: /settings/i });
  for (let i = 0; i < 40 && !(await settings.count()); i++) await wait(250);
  // opened by script clicks (untrusted events: not a user gesture), so the sound is still waiting
  await settings.first().evaluate((el) => el.click());
  await wait(800);
  await page.getByRole('tab', { name: 'Audio' }).first().evaluate((el) => el.click());
  await wait(500);
  result.afterOpen = await line();
  log('status line after opening settings:', JSON.stringify(result.afterOpen), 'context', await g(() => window.__foundressAudio.status()));
  await snap('settings-audio-title');
  result.contextBefore = await g(() => window.__foundressAudio.status());
  await page.locator('[data-testid="audio-enable"]').first().click(); // a real click: the user gesture
  for (let i = 0; i < 20 && (await g(() => window.__foundressAudio.status())) !== 'running'; i++) await wait(250);
  await wait(1500);
  result.afterEnable = await line();
  await snap('settings-audio-enabled');
  await page.locator('[data-testid="audio-test-ui"]').first().click();
  await wait(600);
  result.testCue = await g(() => window.__foundressAudio.cueLog().map((e) => e.cue).slice(-3));
  result.statusEnd = await line();
  log('result', JSON.stringify(result));
  return result;
};
