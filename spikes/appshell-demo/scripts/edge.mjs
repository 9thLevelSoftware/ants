// Harness script: pointer-lock refusal, WebGL context loss + restore, a missing asset. The harness fails the run on
// any uncaught error or console error, so "ok": true means none of these produced one.
// node tools/harness/play.mjs --root spikes/appshell-demo --query "test=1&quality=low&t=2&missing=1" \
//   --script spikes/appshell-demo/scripts/edge.mjs --out test-output/appshell/edge
export default async ({ page, shot, log, wait }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const result = {};

  // --- 1. pointer lock: ask for it (F8), click the canvas (user gesture). First see what this browser does, then
  // force a refusal the way a sandboxed iframe without allow-pointer-lock would (rejected promise).
  await page.mouse.move(640, 400);
  await page.keyboard.press('F8');
  await wait.frames(2);
  await page.mouse.click(640, 400);
  await wait(300);
  result.nativeLockAttempt = await demo(() => window.__demo.input().pointer);
  await page.evaluate(() => { if (document.pointerLockElement) document.exitPointerLock(); });
  await wait(1200); // past the swallowed-Esc window; a real loss also lands here
  await page.evaluate(() => {
    HTMLCanvasElement.prototype.requestPointerLock = function () { return Promise.reject(new DOMException('Pointer lock refused by the host frame', 'NotAllowedError')); };
  });
  await wait(5200); // a refusal earlier in this run would hold retries for 5 s
  await page.mouse.click(640, 400);
  await wait(300);
  result.afterRefusal = await demo(() => window.__demo.input());
  if (!result.afterRefusal.lockWasRefused || result.afterRefusal.pointer !== 'drag') throw new Error('refusal not handled: ' + JSON.stringify(result.afterRefusal));
  // drag orbit still works without the lock: RMB drag 120 px to the right
  const before = await demo(() => window.__demo.camera().debug.yawDeg);
  await page.mouse.move(600, 400);
  await page.mouse.down({ button: 'right' });
  for (let i = 1; i <= 6; i++) { await page.mouse.move(600 + i * 20, 400); await wait.frames(1); }
  await page.mouse.up({ button: 'right' });
  await wait.frames(3);
  const after = await demo(() => window.__demo.camera().debug.yawDeg);
  result.dragOrbitDeltaDeg = after - before;
  if (Math.abs(result.dragOrbitDeltaDeg) < 5) throw new Error(`drag orbit did not turn the camera (${result.dragOrbitDeltaDeg})`);
  await shot('after-refusal-drag');

  // --- 2. lost WebGL context: rendering pauses without errors, then restores and draws again
  await demo(() => window.__demo.loseContext());
  await wait(() => window.__demo.contextLost() === true);
  result.renderWhileLost = await demo(() => window.__demo.renderFrame());
  await wait(300);
  await demo(() => window.__demo.restoreContext());
  await wait(() => window.__demo.contextLost() === false);
  await demo(() => window.__demo.setTime(window.__demo.times.open));
  result.renderAfterRestore = await demo(() => window.__demo.renderFrame());
  await wait.frames(2);
  await shot('after-context-restore');
  if (result.renderWhileLost !== false || result.renderAfterRestore !== true) throw new Error('context loss handling: ' + JSON.stringify(result));

  // --- 3. a missing asset: placeholder + exactly one warning per missing texture, no exception
  result.missingIsPlaceholder = await demo(() => window.__demo.requestMissing());
  result.missingAgain = await demo(() => window.__demo.requestMissing());
  result.warnings = await demo(() => window.__demo.warnings());
  if (!result.missingIsPlaceholder) throw new Error('missing texture did not become a placeholder');
  log(JSON.stringify(result));
  await demo(() => window.__demo.dispose());
  return result;
};
