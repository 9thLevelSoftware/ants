// Harness script for the pack fixture (make-pack-fixture.mjs): the demo inside <iframe sandbox="allow-scripts">.
// node tools/harness/play.mjs --static --no-ready --root test-output/appshell-pack-fixture \
//   --ignore "Blocked pointer lock" --script spikes/appshell-demo/scripts/sandboxed.mjs --out test-output/appshell/sandboxed
// (Chromium itself logs the refused lock as a console error; the script checks that the demo handles it.)
export default async ({ page, shot, log, wait }) => {
  const frame = page.frames().find((f) => f.url().includes('/game/'));
  if (!frame) throw new Error('game frame not found');
  await frame.waitForFunction(() => window.__ready === true, null, { timeout: 60000, polling: 100 });
  const info = await frame.evaluate(() => ({
    origin: String(window.origin),
    placeholders: window.__demo.placeholders(),
    warnings: window.__demo.warnings(),
    packsLoaded: [...document.querySelectorAll('script[src*="packs/"]')].map((s) => s.getAttribute('src')),
  }));
  // pointer lock inside a sandbox without allow-pointer-lock: must be refused quietly, drag stays the mode
  await frame.click('canvas', { position: { x: 640, y: 400 } }); // focus the frame
  await page.keyboard.press('F8'); // mouse look: captured
  await wait(200);
  await frame.click('canvas', { position: { x: 640, y: 400 } }); // the gesture that requests the lock
  await wait(500);
  info.input = await frame.evaluate(() => window.__demo.input());
  if (!info.input.lockWasRefused || info.input.pointer !== 'drag') throw new Error('pointer lock refusal not seen: ' + JSON.stringify(info.input));
  log(JSON.stringify(info));
  await shot('sandboxed');
  if (info.placeholders.length) throw new Error('textures fell back to placeholders: ' + info.placeholders.join(','));
  if (info.origin !== 'null') throw new Error('frame is not opaque-origin: ' + info.origin);
  await frame.evaluate(() => window.__demo.dispose());
  return info;
};
