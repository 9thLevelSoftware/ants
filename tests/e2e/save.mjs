// Persistence checks (task save, acceptance 2, 3, 4, 5). Run through the harness:
//   node tools/harness/play.mjs --root . --query "test=1&seed=7" --script tests/e2e/save.mjs --script-timeout 600000 --timeout 120000
//
// The Game does not call the persistence layer by itself yet (integration is one line in main.ts), so this script
// installs it from inside the page the way main.ts will:  installPersistence(facade.value).
//
// A. real IndexedDB: new game -> advance -> save -> reload the page -> load: stateHash() equal. Then export as a
//    real file download -> import through a file input -> equal; export as text -> import -> equal; corrupt and
//    foreign imports are rejected in words. Settings and profile survive a reload. Autosave of 1,500 ants is timed.
// B. IndexedDB + localStorage forced to throw: the game starts and plays, the save layer says `unavailable`, a
//    session-only save still works, export works, no console error, no unhandled rejection.
// C. only IndexedDB broken: profile falls back to localStorage.
// D. (not test mode) a real thumbnail is captured from the canvas and looked at.
import fs from 'node:fs';
import path from 'node:path';

const INSTALL = async (opts) => {
  const store = await import('/src/ui/store.ts');
  const inst = await import('/src/game/save/install.ts');
  const p = await inst.installPersistence(store.facade.value, { ...(opts ?? {}) });
  return { save: p.manager.status(), profile: p.profile.status(), settings: p.settings.status() };
};

/** What the world renderers hold right now (a loaded game must end up with what the original had). */
const RENDER_COUNTS = () => { const w = window.__game.perf().renderers; return { terrain: w.world.terrainTriangles, nestChunks: w.nest.chunks }; };

const TRACK_REJECTIONS = () => {
  window.__rejections = [];
  window.addEventListener('unhandledrejection', (e) => { window.__rejections.push(String(e.reason && e.reason.stack || e.reason)); });
};

function expect(cond, msg, data) {
  if (!cond) throw new Error(`save e2e: ${msg}${data === undefined ? '' : ' ' + JSON.stringify(data)}`);
}

// SAVE_E2E_PHASES=BCD runs only those phases (A is the slow one: real worldgen several times).
const PHASES = process.env.SAVE_E2E_PHASES || 'ABCD';

export default async ({ page, log, wait, shot, url, context, out }) => {
  const ev = (fn, arg) => page.evaluate(fn, arg);
  let r;
  const result = {};
  const timeline = [];
  const stamp = (name, t0) => timeline.push(`${name}: ${Date.now() - t0} ms`);

  const ready = async (pg) => { await pg.waitForFunction(() => window.__ready === true, null, { timeout: 120000, polling: 100 }); };
  const reload = async () => {
    await ev(() => window.__game.dispose()); // free the GL context first (software GL backlog)
    await page.reload();
    await ready(page);
    await ev(TRACK_REJECTIONS);
  };

  await page.addInitScript(TRACK_REJECTIONS);
  await ev(TRACK_REJECTIONS);

  // =============================================================== A. real IndexedDB
  if (PHASES.includes('A')) {
    let t = Date.now();
    const st0 = await ev(INSTALL);
    expect(st0.save.availability === 'ok' && st0.save.backend === 'indexeddb' && st0.save.persistent, 'A: IndexedDB should be available', st0.save);
    expect(st0.settings.available, 'A: localStorage should be available', st0.settings);
    await ev(() => window.__game.newGame({ seed: 7 }));
    stamp('newGame (real worldgen)', t);
    await ev(() => window.__game.step(200));
    const hash0 = await ev(() => window.__game.stateHash());
    const sum0 = await ev(() => window.__game.summary());
    log('state at save', { tick: sum0.tick, hash: hash0, pop: sum0.colony?.N });
    await ev(() => window.__game.renderFrame());
    const builtBefore = await ev(RENDER_COUNTS);

    // --- save to a slot and the quick slot, list them
    r = await ev(() => window.__game.saves.save('slot-1'));
    expect(r.ok && r.status === 'ok' && !r.volatile, 'A: save to slot-1', r);
    r = await ev(() => window.__persistence.game.save('quick')); // the Game's own entry point (SaveHooks bodies replaced)
    expect(r.ok === true && r.status === 'ok', 'A: Game.save("quick") goes through the manager', r);
    const hashAfterSave = await ev(() => window.__game.stateHash());
    expect(hashAfterSave === hash0, 'A: saving must not change the state', { hash0, hashAfterSave });
    let list = await ev(() => window.__game.saves.list());
    expect(list.map((s) => s.slot).join() === 'quick,slot-1', 'A: list', list.map((s) => s.slot));
    const card = list.find((s) => s.slot === 'slot-1');
    expect(card.species === 'lasius-niger' && /^[0-9A-F]{4}-[0-9A-F]{4}$/.test(card.seedCode) && card.colonyDay === 0 && /Year 1/.test(card.dateLabel), 'A: slot card meta', card);
    log('slot card', { title: card.label, date: card.dateLabel, pop: card.workers, seed: card.seedCode, version: card.version });

    // --- advance, then reload the whole page and load: the hash is the saved one
    await ev(() => window.__game.step(60));
    expect((await ev(() => window.__game.stateHash())) !== hash0, 'A: state moved on after the save');
    t = Date.now();
    await reload();
    const st1 = await ev(INSTALL);
    expect(st1.save.availability === 'ok', 'A: after reload', st1.save);
    list = await ev(() => window.__game.saves.list());
    expect(list.map((s) => s.slot).join() === 'quick,slot-1', 'A: slots survive a page reload', list.map((s) => s.slot));
    t = Date.now();
    r = await ev(() => window.__game.saves.load('slot-1'));
    stamp('load after reload (world rebuild + fingerprint)', t);
    expect(r.ok, 'A: load slot-1 after reload', r);
    const hashLoaded = await ev(() => window.__game.stateHash());
    expect(hashLoaded === hash0, 'A: stateHash after reload + load equals the hash at save time', { hash0, hashLoaded });
    const sumL = await ev(() => window.__game.summary());
    expect(sumL.tick === sum0.tick && sumL.mode === 'playing' && sumL.view === sum0.view, 'A: summary after load', { tick: sumL.tick, mode: sumL.mode, view: sumL.view, was: sum0.view });
    result.reloadLoad = { hash: hashLoaded, tick: sumL.tick, view: sumL.view };
    await ev(() => window.__game.renderFrame());
    // A loaded game must be drawn: the renderers build its world (regression: adopt() once skipped onGameStart, which
    // left only sky, HUD and the possessed ant on screen while the state hash was right).
    const built = await ev(RENDER_COUNTS);
    expect(built.terrain > 0 && built.terrain === builtBefore.terrain && built.nestChunks === builtBefore.nestChunks,
      'A: after reload + load the world renderers have built the same terrain and nest meshes as the original game', { built, builtBefore });
    result.afterLoadRenderers = built;
    await shot('after-load');
    // the loaded game keeps running deterministically: 40 more ticks give the same hash as continuing the original did
    await ev(() => window.__game.step(40));
    const hashAfter40 = await ev(() => window.__game.stateHash());
    r = await ev(() => window.__game.saves.load('slot-1'));
    await ev(() => window.__game.step(40));
    expect((await ev(() => window.__game.stateHash())) === hashAfter40, 'A: two runs from the same save agree after 40 ticks');
    r = await ev(() => window.__game.saves.load('quick'));
    expect(r.ok, 'A: load quick', r);

    // --- export as a real file download -> import through a file input
    r = await ev(() => window.__game.saves.load('slot-1'));
    await ev(() => window.__game.step(15)); // move on, so equality afterwards means something
    const dlPromise = page.waitForEvent('download', { timeout: 20000 }).catch(() => null);
    const exp = await ev(() => window.__game.saves.export('slot-1', 'auto'));
    const dl = await dlPromise;
    let filePath = null;
    if (exp.method === 'download' && dl) {
      filePath = path.join(out, dl.suggestedFilename());
      await dl.saveAs(filePath);
      log('downloaded', { file: dl.suggestedFilename(), bytes: fs.statSync(filePath).size });
    } else {
      // downloads are blocked in this browser context: that is the case the text fallback exists for
      log('download not delivered; method', exp.method);
      expect(exp.method === 'text' && exp.text && exp.text.startsWith('FOUNDRESS1:'), 'A: export falls back to text', { method: exp.method });
      const b = await ev(() => window.__game.saves.export('slot-1', 'bytes'));
      filePath = path.join(out, b.filename);
      fs.writeFileSync(filePath, Buffer.from(b.base64, 'base64'));
    }
    expect(/\.foundress$/.test(filePath), 'A: .foundress file', filePath);
    const sel = await ev(() => window.__game.saves.addFileInput());
    await page.setInputFiles(sel, filePath);
    t = Date.now();
    r = await ev((s) => window.__game.saves.importFromInput(s, 'now'), sel);
    stamp('import file -> load now', t);
    expect(r.ok, 'A: import from the file input', r);
    expect((await ev(() => window.__game.stateHash())) === hash0, 'A: export -> import: hash equals the hash at save time');
    result.fileRoundTrip = { file: path.basename(filePath), bytes: fs.statSync(filePath).size };

    // --- import into a slot (not "load now"), then load it
    await ev(() => window.__game.step(12));
    await page.setInputFiles(sel, filePath);
    r = await ev((s) => window.__game.saves.importFromInput(s, 'slot-4'), sel);
    expect(r.ok, 'A: import into slot-4', r);
    r = await ev(() => window.__game.saves.load('slot-4'));
    expect(r.ok && (await ev(() => window.__game.stateHash())) === hash0, 'A: loading the imported slot', r);

    // --- text fallback
    await ev(() => window.__game.step(9));
    const tx = await ev(() => window.__game.saves.export('slot-1', 'text'));
    expect(tx.ok && tx.method === 'text' && /^FOUNDRESS1:[A-Za-z0-9+/=]+:[0-9a-f]{8}$/.test(tx.text), 'A: text export format', { method: tx.method, head: (tx.text || '').slice(0, 40) });
    log('text export', { chars: tx.text.length, kb: Math.round(tx.sizeBytes / 1024) });
    r = await ev((text) => window.__game.saves.importText(text, 'now'), tx.text);
    expect(r.ok, 'A: import the text', r);
    expect((await ev(() => window.__game.stateHash())) === hash0, 'A: text fallback round trip: hash equals the hash at save time');
    result.textRoundTrip = { chars: tx.text.length };

    // --- corrupt and foreign imports are rejected in plain words and change nothing
    await ev(() => window.__game.step(3));
    const before = await ev(() => window.__game.stateHash());
    const bad = [];
    bad.push(await ev((t0) => window.__game.saves.importText(t0.slice(0, 400), 'now'), tx.text));
    bad.push(await ev((t0) => window.__game.saves.importText(t0.slice(0, t0.length - 10) + '0123456789', 'now'), tx.text));
    bad.push(await ev(() => window.__game.saves.importText('hello, this is not a save', 'now')));
    bad.push(await ev(() => window.__game.saves.importText('FOUNDRESS1:@@@@:00000000', 'slot-5')));
    bad.push(await ev(() => window.__game.saves.importBase64('H4sIAAAAAAAAAytJLS4BAAx+f9gEAAAA', 'now'))); // gzip of "test": foreign
    for (const b of bad) expect(!b.ok && ['corrupt', 'foreign'].includes(b.code) && b.message.length > 10, 'A: rejected import', b);
    expect((await ev(() => window.__game.stateHash())) === before, 'A: a rejected import leaves the game alone');
    list = await ev(() => window.__game.saves.list());
    expect(!list.some((s) => s.slot === 'slot-5'), 'A: a rejected import writes no slot');
    result.rejected = bad.map((b) => `${b.code}: ${b.message}`);

    // --- delete
    r = await ev(() => window.__game.saves.remove('slot-4'));
    expect(r.ok, 'A: delete slot-4', r);

    // --- settings and profile survive a reload
    await ev(() => window.__game.saves.settings.set({ audio: { master: 0.35 }, accessibility: { uiScale: 120 }, gameplay: { autosaveMin: 10 } }));
    await ev(() => {
      window.__game.saves.profile.recordHintUse('hint-move', 1);
      return window.__game.saves.profile.flush();
    });
    await ev(() => window.__game.saves.settings.flush());
    await reload();
    await ev(INSTALL);
    const s2 = await ev(() => window.__game.saves.settings.get());
    expect(s2.audio.master === 0.35 && s2.accessibility.uiScale === 120 && s2.gameplay.autosaveMin === 10, 'A: settings survive a reload', { audio: s2.audio.master, ui: s2.accessibility.uiScale });
    const hints = await ev(() => window.__game.saves.profile.hints());
    expect(hints['hint-move'] && hints['hint-move'].state === 'learned', 'A: profile hints survive a reload', hints);
    const pst = await ev(() => window.__game.saves.status());
    expect(pst.profile.backend === 'indexeddb' && pst.profile.persistent, 'A: profile lives in IndexedDB', pst.profile);
    await ev(() => window.__game.saves.profile.resetHints());
    expect(Object.keys(await ev(() => window.__game.saves.profile.hints())).length === 0, 'A: resetHints');
    result.settingsProfile = 'ok';

    // --- autosave of 1,500 ants: timing of the synchronous part (real IndexedDB + structured clone)
    await ev(() => window.__game.newGame({ seed: 7 }));
    await ev(() => window.__game.step(620)); // past the intro-card window (autosave is blocked while the game is that young)
    const spawned = await ev(() => window.__game.cheat.spawnAnts(1500, 'worker', null));
    expect(spawned.ok, 'perf: spawn 1,500 ants', spawned);
    await ev(() => window.__game.step(5));
    const nAnts = await ev(() => window.__game.summary().counts.ants);
    const perf = await ev(async () => {
      const p = window.__persistence;
      const syncMs = [], totalMs = [];
      for (let i = 0; i < 7; i++) {
        window.__game.step(1);
        const t0 = performance.now();
        const pending = p.manager.autosave('interval');
        syncMs.push(performance.now() - t0);
        const res = await pending;
        totalMs.push(performance.now() - t0);
        if (!res.ok) return { error: res };
      }
      return { syncMs, totalMs };
    });
    expect(!perf.error, 'perf: autosave worked', perf.error);
    const min = (a) => Math.round(Math.min(...a) * 10) / 10;
    result.autosave1500 = { ants: nAnts, syncMsMin: min(perf.syncMs), syncMsAll: perf.syncMs.map((x) => Math.round(x)), totalMsMin: min(perf.totalMs) };
    log('autosave of', nAnts, 'ants: main thread blocked (min of 7)', min(perf.syncMs), 'ms; until committed', min(perf.totalMs), 'ms; all', perf.syncMs.map((x) => Math.round(x)));
    // a manual save of the same state must not be blocked by the intro-card rule and must load back exactly
    const hBig = await ev(() => window.__game.stateHash());
    r = await ev(() => window.__game.saves.save('slot-2'));
    expect(r.ok, 'perf: manual save of 1,500 ants', r);
    r = await ev(() => window.__game.saves.load('slot-2'));
    expect(r.ok, 'perf: load of 1,500 ants', r);
    expect((await ev(() => window.__game.stateHash())) === hBig, 'perf: 1,500-ant state round trips through IndexedDB');
    result.bigRoundTrip = 'ok';

    // --- rejections in A
    const rej = await ev(() => window.__rejections);
    expect(rej.length === 0, 'A: no unhandled promise rejections', rej);
    await ev(() => window.__game.dispose());

  }

  // =============================================================== B. IndexedDB and localStorage throw
  if (PHASES.includes('B')) {
  const errors = [];
  const pageB = await context.newPage();
  pageB.on('console', (m) => { if (m.type() === 'error') errors.push(`console.error: ${m.text()}`); });
  pageB.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await pageB.addInitScript(TRACK_REJECTIONS);
  await pageB.addInitScript(() => {
    const boom = () => { throw new DOMException('Access is denied for this document.', 'SecurityError'); };
    Object.defineProperty(window, 'indexedDB', { get: boom, configurable: true });
    Object.defineProperty(window, 'localStorage', { get: boom, configurable: true });
  });
  await pageB.goto(`${url}?test=1&seed=7`, { waitUntil: 'load' });
  await ready(pageB);
  const evB = (fn, arg) => pageB.evaluate(fn, arg);
  const stB = await evB(INSTALL);
  log('B status', stB);
  expect(stB.save.availability === 'unavailable' && stB.save.backend === 'memory' && !stB.save.persistent, 'B: save layer reports unavailable', stB.save);
  expect(stB.save.diagnostic === 'bad', 'B: diag-storage bad', stB.save);
  expect(!stB.settings.available && /cannot be stored/.test(stB.settings.notice), 'B: settings notice', stB.settings);
  expect(stB.profile.backend === 'memory' && !stB.profile.persistent, 'B: profile in memory', stB.profile);
  const toastsB = await evB(() => window.__game.ui.snapshot().toasts.map((x) => x.text));
  expect(toastsB.filter((x) => /not available here/i.test(x)).length === 1, 'B: exactly one storage-unavailable notice', toastsB);
  await evB(() => window.__game.newGame({ seed: 7 }));
  await evB(() => window.__game.step(120));
  const hB = await evB(() => window.__game.stateHash());
  const sumB = await evB(() => window.__game.summary());
  expect(sumB.mode === 'playing' && sumB.tick === 120, 'B: the game starts and plays', { mode: sumB.mode, tick: sumB.tick });
  r = await evB(() => window.__game.saves.save('quick'));
  expect(r.ok && r.status === 'unavailable' && r.volatile, 'B: a session-only save works and says unavailable', r);
  r = await evB(() => window.__persistence.game.save('slot-1'));
  expect(r.ok && r.status === 'unavailable', 'B: Game.save reports unavailable', r);
  await evB(() => window.__game.step(30));
  r = await evB(() => window.__game.saves.load('quick'));
  expect(r.ok && (await evB(() => window.__game.stateHash())) === hB, 'B: session-only load', r);
  const exB = await evB(() => window.__game.saves.export('current', 'text'));
  expect(exB.ok && exB.text.startsWith('FOUNDRESS1:'), 'B: export works without storage', { ok: exB.ok, msg: exB.message });
  r = await evB((text) => window.__game.saves.importText(text, 'now'), exB.text);
  expect(r.ok && (await evB(() => window.__game.stateHash())) === hB, 'B: import works without storage', r);
  const afB = await evB(() => window.__game.saves.autosave('interval'));
  await evB(() => window.__game.saves.frame(400));
  const wrB = await evB(() => window.__game.saves.written());
  expect(wrB.length === 0, 'B: autosave is skipped silently while storage is unavailable', wrB);
  await evB(() => window.__game.step(20));
  const rejB = await evB(() => window.__rejections);
  expect(rejB.length === 0, 'B: no unhandled rejections', rejB);
  expect(errors.length === 0, 'B: no console errors / page errors', errors);
  result.unavailable = { availability: stB.save.availability, quickSave: 'volatile ok', notice: toastsB[0] };
  void afB;
  await evB(() => window.__game.dispose());
  await pageB.close();

  }

  // =============================================================== C. only IndexedDB broken: profile falls back to localStorage
  if (PHASES.includes('C')) {
  const errorsC = [];
  const pageC = await context.newPage();
  pageC.on('console', (m) => { if (m.type() === 'error') errorsC.push(`console.error: ${m.text()}`); });
  pageC.on('pageerror', (e) => errorsC.push(`pageerror: ${e.message}`));
  await pageC.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new DOMException('blocked', 'SecurityError'); }, configurable: true });
  });
  await pageC.goto(`${url}?test=1&seed=7`, { waitUntil: 'load' });
  await ready(pageC);
  const stC = await pageC.evaluate(INSTALL);
  expect(stC.save.availability === 'unavailable' && stC.settings.available && stC.profile.backend === 'localstorage', 'C: IDB broken, localStorage fine', stC);
  await pageC.evaluate(async () => { window.__game.saves.profile.recordHintUse('hint-look', 1); await window.__game.saves.profile.flush(); });
  await pageC.reload();
  await ready(pageC);
  await pageC.evaluate(INSTALL);
  const hC = await pageC.evaluate(() => window.__game.saves.profile.hints());
  expect(hC['hint-look']?.state === 'learned', 'C: profile survives through the localStorage fallback', hC);
  expect(errorsC.length === 0, 'C: no console errors', errorsC);
  result.idbOnlyBroken = 'ok';
  await pageC.evaluate(() => window.__game.dispose());
  await pageC.close();

  }

  // =============================================================== D. thumbnail from a real canvas (not test mode)
  if (PHASES.includes('D')) {
  const errorsD = [];
  const pageD = await context.newPage();
  pageD.on('console', (m) => { if (m.type() === 'error') errorsD.push(`console.error: ${m.text()}`); });
  pageD.on('pageerror', (e) => errorsD.push(`pageerror: ${e.message}`));
  await pageD.goto(`${url}?quality=test&seed=7`, { waitUntil: 'load' });
  await ready(pageD);
  await pageD.evaluate(INSTALL, { expose: true });
  await pageD.evaluate(() => window.__game.newGame({ seed: 7, testWorld: { nest: 'small', workers: 12 } }));
  const thumbInfo = await pageD.evaluate(() => {
    const p = window.__persistence;
    const url0 = p.manager.captureThumbnail();
    return url0 ? { chars: url0.length, prefix: url0.slice(0, 23), url: url0 } : null;
  });
  expect(thumbInfo && thumbInfo.prefix === 'data:image/jpeg;base64,' && thumbInfo.chars > 500, 'D: a JPEG thumbnail is captured from the canvas', thumbInfo && { chars: thumbInfo.chars });
  const dim = await pageD.evaluate((u) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.src = u; }), thumbInfo.url);
  expect(dim[0] === 160 && dim[1] === 90, 'D: thumbnail is 160x90', dim);
  // write the JPEG itself, to look at it
  const thumbShot = path.join(out, 'thumbnail.jpg');
  fs.writeFileSync(thumbShot, Buffer.from(thumbInfo.url.slice('data:image/jpeg;base64,'.length), 'base64'));
  const rD = await pageD.evaluate(() => window.__persistence.manager.saveTo('slot-3').then((o) => ({ ok: o.ok, thumb: !!o.value.thumbnail })));
  expect(rD.ok && rD.thumb, 'D: a manual save stores the thumbnail', rD);
  const listD = await pageD.evaluate(() => window.__persistence.manager.list().then((l) => l.value.map((s) => ({ slot: s.slot, thumb: s.meta.thumbnail ? s.meta.thumbnail.length : 0 }))));
  expect(listD.find((x) => x.slot === 'slot-3')?.thumb > 500, 'D: the listing carries the thumbnail', listD);
  expect(errorsD.length === 0, 'D: no console errors', errorsD);
  result.thumbnail = { chars: thumbInfo.chars, size: dim, screenshot: thumbShot };
  await pageD.evaluate(() => window.__game.dispose());
  await pageD.close();

  }

  result.timeline = timeline;
  return result;
};
