// Portable-build check, run by tools/build/verify-portable.mjs through the harness (one run per hosting situation):
//   PORTABLE_MODE=subpath  the build served from /games/foundress/v1/ (relative URLs only)
//   PORTABLE_MODE=iframe   the build inside <iframe sandbox="allow-scripts allow-pointer-lock"> (opaque origin)
// The page is booted with ?test=1&autostart=1&seed=1 (set by the caller). This script then
//   - checks where the page really runs (origin, one classic script, packs injected as <script src>),
//   - steps the simulation and renders, takes the world screenshot,
//   - loads the audio pack the way the asset loader does and checks the audio bytes (and decodes one file),
//   - starts the world-generation worker from a Blob URL built from the pack's worker source,
//   - returns to the title screen, screenshots it and checks the bundled fonts are loaded.
// Failed requests, console errors and blocked resources are caught by the harness itself (exit code 1); texture
// placeholder warnings are checked by the caller from the page console. Output: <out>/world.png, <out>/title.png.
export default async ({ page, shot, log, wait }) => {
  const mode = process.env.PORTABLE_MODE === 'iframe' ? 'iframe' : 'subpath';
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`portable[${mode}]: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const result = { mode };

  // the frame that holds the game: the page itself, or the single child frame of the host page
  let target = page;
  if (mode === 'iframe') {
    const deadline = Date.now() + 60000;
    while (!(target = page.frames().find((f) => f !== page.mainFrame() && f.url().includes('/game/'))) && Date.now() < deadline) await wait(200);
    expect(target, 'game frame not found');
    await target.waitForFunction(() => window.__ready === true, null, { timeout: 120000, polling: 100 });
  }
  const g = (fn, arg) => target.evaluate(fn, arg);

  // ---- where are we, and what was loaded how
  const env = await g(() => ({
    origin: String(window.origin), href: location.href, ready: window.__ready === true,
    scripts: [...document.scripts].map((s) => ({ src: s.getAttribute('src'), type: s.type, defer: s.defer, crossorigin: s.crossOrigin })),
    packScripts: [...document.querySelectorAll('script[src*="packs/"]')].map((s) => s.getAttribute('src')),
    index: window.__FOUNDRESS_ASSET_INDEX__ ? window.__FOUNDRESS_ASSET_INDEX__.packs.map((p) => ({ src: p.src, paths: p.paths.length })) : null,
    loaded: Object.keys(window.__FOUNDRESS_ASSETS__ || {}).length,
  }));
  result.env = env;
  if (mode === 'iframe') expect(env.origin === 'null', 'the frame is not opaque-origin', env.origin);
  else expect(new URL(env.href).pathname.startsWith('/games/foundress/v1/'), 'not served from the sub-path', env.href);
  const external = env.scripts.filter((s) => s.src && !s.src.startsWith('packs/')); // packs are injected later by the loader
  expect(external.length === 1 && external[0].type === '' && external[0].defer && !external[0].crossorigin,
    'expected exactly one deferred classic script', external);
  expect(env.index && env.index.length >= 2, 'no inlined pack index', env.index);
  expect(env.packScripts.length >= 1 && env.packScripts[0] === env.index[0].src, 'pack 0 was not injected by the loader', env.packScripts);
  expect(env.loaded > 20, 'too few assets registered by the packs', env.loaded);

  // ---- the game runs: step the simulation, render, screenshot
  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'game not playing after autostart', s0.mode);
  const st = await g(() => window.__game.step(300));
  expect(st.tick === s0.tick + 300, 'step(300) did not advance 300 ticks', st);
  const s1 = await g(() => window.__game.summary());
  result.summary = { mode: s1.mode, tick: s1.tick, renderers: s1.renderers, seed: s1.seed, species: s1.species };
  await g(() => window.__game.possess('queen'));
  await g(() => window.__game.step(10));
  await g(() => window.__game.renderFrame());
  await wait.frames(2);
  result.worldShot = await shot('world');

  // ---- audio bytes from the audio pack, loaded the way the asset loader loads packs (<script src> injection)
  result.audio = await g(async () => {
    const decodeB64 = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
    const manifest = JSON.parse(new TextDecoder().decode(decodeB64(window.__FOUNDRESS_ASSETS__['assets/manifest.json'])));
    const audio = manifest.assets.filter((a) => a.kind === 'audio');
    const pack = window.__FOUNDRESS_ASSET_INDEX__.packs.find((p) => p.paths.includes(audio[0].path));
    if (!pack) return { error: 'audio is in no pack', files: audio.length };
    const lazy = !window.__FOUNDRESS_ASSETS__[audio[0].path];
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = pack.src; s.async = true; s.onload = res; s.onerror = () => rej(new Error('audio pack failed to load'));
      document.head.appendChild(s);
    });
    const bytes = decodeB64(window.__FOUNDRESS_ASSETS__[audio[0].path]);
    const head = [...bytes.slice(0, 3)].map((b) => b.toString(16)).join(' ');
    const isMp3 = (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0);
    let decoded = null;
    try {
      const ctx = new OfflineAudioContext(1, 44100, 44100);
      const buf = await ctx.decodeAudioData(bytes.buffer.slice(0));
      decoded = { seconds: Math.round(buf.duration * 10) / 10, channels: buf.numberOfChannels };
    } catch (e) { decoded = { error: String(e && e.message || e) }; }
    return { files: audio.length, first: audio[0].id, lazyBefore: lazy, pack: pack.src, bytes: bytes.length, head, isMp3, decoded };
  });
  expect(!result.audio.error && result.audio.isMp3 && result.audio.bytes > 10000, 'audio bytes did not load from the pack', result.audio);
  expect(result.audio.decoded && !result.audio.decoded.error, 'audio did not decode (codec missing in this browser?)', result.audio.decoded);

  // ---- the worldgen worker from a Blob URL (no network, no module worker)
  result.worker = await g(async () => {
    const decodeB64 = (b64) => { const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
    const src = new TextDecoder().decode(decodeB64(window.__FOUNDRESS_ASSETS__['workers/worldgen.js']));
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    const w = new Worker(url);
    URL.revokeObjectURL(url);
    const ask = (params, ms) => new Promise((resolve) => {
      const t = setTimeout(() => { w.terminate(); resolve({ type: 'timeout' }); }, ms);
      w.addEventListener('message', (ev) => { if (ev.data.type === 'worldgen.progress') return; clearTimeout(t); resolve(ev.data); });
      w.addEventListener('error', (ev) => { clearTimeout(t); resolve({ type: 'error', message: String(ev.message) }); });
      w.postMessage({ type: 'worldgen.generate', id: 1, params });
    });
    const t0 = performance.now();
    const bad = await ask({ sizeClass: 'nonsense' }, 20000); // rejected by validation: proves the host answers
    const good = await ask({ generatorVersion: 2, seedText: '', seed: 7, speciesId: 'lasius-niger', archetype: 'suburban-garden', region: 'temperate-eu',
      sizeClass: 'compact', difficulty: 'naturalist', rivalCount: 0, incipientCount: 0, humanActivity: 'off' }, 170000);
    w.terminate();
    return { sourceBytes: src.length, badReply: bad.type, goodReply: good.type, fingerprint: good.world?.meta?.fingerprint ?? null,
      size: good.world?.size ?? null, ms: Math.round(performance.now() - t0), message: good.message ?? null };
  });
  expect(result.worker.badReply === 'worldgen.error', 'worker did not answer a bad request with worldgen.error', result.worker);
  expect(result.worker.goodReply === 'worldgen.done' && result.worker.fingerprint, 'worker did not generate a world', result.worker);

  // ---- title screen and fonts
  await g(() => window.__game.endGame());
  await target.waitForFunction(() => window.__game.ui.screen() === 'title', null, { timeout: 30000, polling: 100 });
  await wait(800);
  result.fonts = await g(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((f) => `${f.family}|${f.weight}|${f.style}|${f.status}`);
    const used = (el) => (el ? getComputedStyle(el).fontFamily : null);
    const heading = document.querySelector('#ui h1, #ui h2, #ui [class*="title"]');
    return { faces: faces.filter((f) => f.endsWith('|loaded')), allFaces: faces.length, headingFamily: used(heading), bodyFamily: used(document.querySelector('#ui')),
      interOk: document.fonts.check('16px "Inter Variable"'), serifOk: document.fonts.check('16px "Source Serif 4 Variable"') };
  });
  result.titleShot = await shot('title');
  const loadedFamilies = new Set(result.fonts.faces.map((f) => f.split('|')[0]));
  expect(result.fonts.allFaces >= 8, 'bundled @font-face rules are missing', result.fonts);
  expect(loadedFamilies.has('Inter Variable') || loadedFamilies.has('Source Serif 4 Variable'), 'no bundled UI font reached the loaded state', result.fonts);

  log(JSON.stringify(result));
  return result;
};
