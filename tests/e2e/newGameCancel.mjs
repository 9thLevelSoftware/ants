// A newer newGame or an endGame cancels a load in progress (int-1A review finding 7), also while the renderers are
// building the world (the "Preparing the view" phase awaits texture loads), and the renderers end on the newest sim:
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1&quality=test" --script tests/e2e/newGameCancel.mjs
export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`newGameCancel: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  // starts a newGame without awaiting it; the outcome lands in window.__ngc[key]
  const start = (...runs) => g((list) => {
    window.__ngc = window.__ngc ?? {};
    for (const [key, seed] of list) {
      window.__ngc[key] = 'pending';
      window.__game.newGame({ seed }).then((s) => { window.__ngc[key] = `ok:${s.seed}`; }, (e) => { window.__ngc[key] = String(e); });
    }
  }, runs);
  const outcome = (key) => page.waitForFunction((k) => window.__ngc[k] !== 'pending', key, { timeout: 180000 }).then(() => g((k) => window.__ngc[k], key));
  // starts newGame(seed) under `key` and, once its loading phase is `label` (polled every microtask: in test mode
  // the phases advance without yielding to the event loop), runs `then` ('newGame:<seed>' or 'endGame') in the
  // same task, a few microtasks later so the first load is inside that phase's await
  const startThen = (key, seed, label, then, thenKey) => g(async ({ key, seed, label, then, thenKey }) => {
    const gm = window.__game;
    window.__ngc = window.__ngc ?? {};
    const track = (k, p) => { window.__ngc[k] = 'pending'; p.then((s) => { window.__ngc[k] = `ok:${s.seed}`; }, (e) => { window.__ngc[k] = String(e); }); };
    track(key, gm.newGame({ seed }));
    for (let i = 0; i < 100000; i++) {
      if (gm.ui.snapshot().loading?.phase === label) break;
      await Promise.resolve();
    }
    const seen = gm.ui.snapshot().loading?.phase ?? null;
    for (let i = 0; i < 3; i++) await Promise.resolve();
    if (then === 'endGame') gm.endGame();
    else track(thenKey, gm.newGame({ seed: Number(then.split(':')[1]) }));
    return seen;
  }, { key, seed, label, then, thenKey });
  const antsDrawn = async () => {
    await g(() => window.__game.renderFrame({ settle: 0 }));
    return (await g(() => window.__game.perf())).renderers.ants.ants;
  };

  // 1. two newGames in the same task: the first is cancelled at its first phase, the second plays
  await start(['a', 3], ['b', 2]);
  const a = await outcome('a'), b = await outcome('b');
  log('back to back', a, b);
  expect(a.includes('cancelled'), 'the first newGame should be cancelled', a);
  expect(b === 'ok:2', 'the second newGame should play seed 2', b);

  // 2. a newer newGame while the first one's renderers build the world
  const seenC = await startThen('c', 4, 'Preparing the view', 'newGame:5', 'd');
  log('superseded in phase', seenC);
  const c = await outcome('c'), d = await outcome('d');
  log('during render build', c, d);
  expect(c.includes('cancelled'), 'the newGame superseded while preparing the view should be cancelled', c);
  expect(d === 'ok:5', 'the newer newGame should play seed 5', d);
  let s = await g(() => window.__game.summary());
  expect(s.mode === 'playing' && s.seed === 5, 'not playing the newest game', { mode: s.mode, seed: s.seed });
  // the ant renderer reads the newest sim: cheat-spawned workers of this game are drawn
  const before = await antsDrawn();
  await g(() => window.__game.cheat.spawnAnts(5, 'worker'));
  const after = await antsDrawn();
  log('ants drawn', before, after);
  expect(after === before + 5, 'the ant renderer does not read the current sim', { before, after });
  const p = await g(() => window.__game.perf());
  expect(p.renderers.world.terrainTriangles > 0, 'the world renderer has no terrain', p.renderers.world);

  // 3. endGame during the render build: the load is cancelled, the title shows, a later game still works
  const seenE = await startThen('e', 6, 'Preparing the view', 'endGame');
  log('ended in phase', seenE);
  const e = await outcome('e');
  s = await g(() => window.__game.summary());
  log('endGame while loading', e, s.mode);
  expect(e.includes('cancelled'), 'endGame should cancel the load', e);
  expect(s.mode === 'title', 'endGame during the load should show the title', s.mode);
  await page.waitForTimeout(300); // a cancelled load must not start playing afterwards
  expect((await g(() => window.__game.summary())).mode === 'title', 'the cancelled load started playing');
  await start(['f', 1]);
  const f = await outcome('f');
  expect(f === 'ok:1', 'a new game after the cancelled one', f);
  await g(() => window.__game.possess('queen'));
  await g(() => window.__game.renderFrame({}));
  await shot('after-cancellations');
  return { a, b, c, d, e, f, seenC, seenE, antsDrawn: { before, after } };
};
