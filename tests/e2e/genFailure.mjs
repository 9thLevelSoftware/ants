// A failed world generation shows the loading error panel (attempt counter, Back) and no uncaught-error overlay;
// the debug API's newGame rejects so scripts notice:
//   node tools/harness/play.mjs --root . --query "test=1" --script tests/e2e/genFailure.mjs
export default async ({ page, shot }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`genFailure: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const r = await g(() => window.__game.newGame({ failGenerationForTest: 'injected failure' }).then(() => 'resolved', (e) => String(e)));
  expect(r.includes('injected failure'), 'debug newGame should reject', r);
  await page.waitForTimeout(200);
  const snap = await g(() => window.__game.ui.snapshot());
  expect(snap.mode === 'loading' && snap.loading && snap.loading.error === 'injected failure', 'loading error panel', snap.loading);
  expect(snap.error === null, 'no uncaught-error overlay over the panel', snap.error);
  await shot('gen-failed');
  return { mode: snap.mode, loading: snap.loading };
};
