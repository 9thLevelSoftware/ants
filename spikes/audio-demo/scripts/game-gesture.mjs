// The game's audio gesture rule and refusal handling (task AC3; GDD 08 App. E 15), against the real game page:
//   node tools/harness/play.mjs --root . --query "test=1&quality=low" --script spikes/audio-demo/scripts/game-gesture.mjs
// 1. test=1 (the harness page): no AudioContext is ever constructed, even after a click and a key; status 'off'.
// 2. No Web Audio at all (fresh page): a click gives 'unsupported', the title still works.
// 3. Normal mode (fresh page), no gesture for 10 s: no AudioContext. Then the constructor is made to throw: a click
//    gives 'blocked' and the game keeps working. Then the real constructor is restored: the next click retries and
//    the status becomes 'running' (or 'blocked' if the browser refuses), never an exception.
// The harness fails the run on any console error or page error, so "no console errors" is checked too.
const COUNT = `(() => {
  const mode = (new URLSearchParams(location.search)).get('audiomock') || '';
  window.__ctxCount = 0;
  const Real = window.AudioContext;
  window.__realAudioContext = Real;
  if (mode === 'missing') { delete window.AudioContext; delete window.webkitAudioContext; return; }
  window.__audioThrow = false;
  window.AudioContext = function (...a) {
    window.__ctxCount++;
    if (window.__audioThrow) throw new DOMException('refused by test', 'NotAllowedError');
    return new Real(...a);
  };
  window.AudioContext.prototype = Real.prototype;
})();`;

export default async ({ page, context, log, url, wait }) => {
  const base = url.replace(/[?#].*$/, '');
  const read = (p) => p.evaluate(() => ({ status: window.__foundressAudio?.status(), constructed: window.__ctxCount ?? 'n/a', mode: window.__game?.ui.screen() }));
  const fresh = async (q) => {
    const p = await context.newPage();
    await p.addInitScript(COUNT);
    await p.goto(`${base}?${q}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
    await p.waitForFunction(() => window.__ready === true, null, { timeout: 90000 });
    return p;
  };
  const out = {};

  // 1. test mode (harness page; count by wrapping now: the game constructs lazily, at gesture time)
  await page.evaluate(COUNT);
  await page.mouse.click(640, 360);
  await page.keyboard.press('KeyA');
  await wait(500);
  out.testMode = await read(page);
  log(`testMode ${JSON.stringify(out.testMode)}`);

  // 2. no Web Audio
  const p2 = await fresh('quality=low&audiomock=missing');
  await p2.mouse.click(640, 360);
  await wait(500);
  out.missing = await read(p2);
  log(`missing ${JSON.stringify(out.missing)}`);
  await p2.close();

  // 3. gesture rule, refusal, recovery
  const p3 = await fresh('quality=low');
  await wait(10000);
  out.noGesture10s = await read(p3);
  await p3.evaluate(() => { window.__audioThrow = true; });
  await p3.mouse.click(640, 360);
  await wait(300);
  out.refused = await read(p3);
  out.refusedUiOk = await p3.evaluate(() => { window.__foundressAudio?.ui('click'); return window.__game?.ui.screen(); });
  await p3.evaluate(() => { window.__audioThrow = false; });
  await p3.mouse.click(640, 360);
  await wait(1500);
  out.afterRetry = await read(p3);
  out.debug = await p3.evaluate(() => window.__foundressAudio?.debug());
  log(`noGesture ${JSON.stringify(out.noGesture10s)} refused ${JSON.stringify(out.refused)} afterRetry ${JSON.stringify(out.afterRetry)}`);
  await p3.close();

  const checks = {
    testModeOff: out.testMode.status === 'off' && out.testMode.constructed === 0,
    missingUnsupported: out.missing.status === 'unsupported' && out.missing.mode === 'title',
    noContextBeforeGesture: out.noGesture10s.constructed === 0 && out.noGesture10s.status === 'off',
    refusedBlocked: out.refused.status === 'blocked' && out.refusedUiOk === 'title',
    retryRunning: ['running', 'blocked'].includes(out.afterRetry.status) && out.afterRetry.constructed === 2,
  };
  if (!Object.values(checks).every(Boolean)) throw new Error(`audio gesture checks failed: ${JSON.stringify(checks)}`);
  return { checks, out };
};
