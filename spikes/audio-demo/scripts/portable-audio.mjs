// Audio inside the portable (classic single-file) build: every shipped audio file comes from the embedded packs and
// decodes, an offline render of decoded files inside the page has signal, and in the running game the ambience beds and
// effect cues play FILES (not synth fallbacks). Serve the build statically:
//   npm run build:portable
//   node tools/harness/play.mjs --static --root dist-portable --query "test=1&audio=on&autostart=1&seed=1&quality=low" \
//        --script spikes/audio-demo/scripts/portable-audio.mjs --out test-output/audio-pass --script-timeout 600000 --timeout 240000
import fs from 'node:fs';
import path from 'node:path';

export default async ({ page, log, wait, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const result = {};
  // ---- the shipped audio files: embedded, decodable, an offline render has signal ---------------------------------
  result.files = await g(async () => {
    const assets = window.__hud.game.assets;
    await assets.init?.();
    const list = [...assets.manifest.assets.values()].filter((a) => a.kind === 'audio');
    const off = new OfflineAudioContext(2, 48000, 48000);
    const rows = [];
    const buffers = [];
    for (const a of list) {
      let seconds = -1;
      try {
        const b = await off.decodeAudioData(await assets.audioData(a.id));
        seconds = Math.round(b.duration * 100) / 100;
        buffers.push(b);
      } catch { /* undecodable */ }
      rows.push({ id: a.id, backend: assets.backendFor(a.path), seconds });
    }
    // offline render inside the classic page: the first decoded files mixed for one second
    const r = new OfflineAudioContext(2, 48000, 48000);
    for (const b of buffers.slice(0, 6)) { const s = r.createBufferSource(); s.buffer = b; s.connect(r.destination); s.start(0); }
    const buf = await r.startRendering();
    let peak = 0;
    for (const c of [0, 1]) for (const v of buf.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
    return { count: rows.length, backends: [...new Set(rows.map((x) => x.backend))], undecodable: rows.filter((x) => x.seconds < 0).map((x) => x.id), renderPeak: Math.round(peak * 1000) / 1000 };
  });
  log('files', JSON.stringify(result.files));
  // ---- the running game plays files ---------------------------------------------------------------------------
  const before = await g(() => window.__foundressAudio.status());
  await page.mouse.click(640, 360);
  for (let i = 0; i < 40 && (await g(() => window.__foundressAudio.status())) !== 'running'; i++) await wait(250);
  result.status = { before, after: await g(() => window.__foundressAudio.status()) };
  await g(() => window.__game.cheat.setWeatherClass('rain', 'shower'));
  await g(() => window.__game.cheat.triggerEvent('footsteps', null, 0));
  for (let i = 0; i < 12; i++) { await g(() => window.__game.step(10)); await wait.frames(2); }
  await wait(3000); // beds decode on demand
  const dbg = await g(() => window.__foundressAudio.debug());
  const log50 = await g(() => window.__foundressAudio.cueLog());
  result.ambienceSources = dbg.ambience?.sources ?? null;
  result.missing = dbg.missing ?? null;
  result.fileCues = log50.filter((e) => String(e.source).includes('file:')).map((e) => `${e.cue}:${e.source}`).slice(-6);
  log('ambience sources', JSON.stringify(result.ambienceSources), 'missing', JSON.stringify(result.missing), 'file cues', JSON.stringify(result.fileCues));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'portable-audio.json'), JSON.stringify(result, null, 1));
  const ok = result.files.count > 0 && result.files.undecodable.length === 0 && result.files.backends.every((b) => b === 'embedded') && result.files.renderPeak > 0.01
    && result.status.after === 'running' && Array.isArray(result.missing) && result.missing.length === 0
    && Object.values(result.ambienceSources ?? {}).some((s) => String(s).startsWith('file:'));
  if (!ok) throw new Error(`portable audio check failed: ${JSON.stringify(result)}`);
  return result;
};
