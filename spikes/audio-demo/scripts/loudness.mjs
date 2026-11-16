// Loudness of the offline scene renders (design directions §K) with the BS.1770 estimator, plus the quiet foley
// against the calm bed. Prints a table; exits non-zero when a target is missed. No live AudioContext is needed.
//   node tools/harness/play.mjs --root spikes/audio-demo --query label=before --script spikes/audio-demo/scripts/loudness.mjs --out test-output/audio-pass
import fs from 'node:fs';
import path from 'node:path';

export default async ({ page, shot, log, out, query }) => {
  const t0 = Date.now();
  const only = (new URLSearchParams(query || '').get('only') || '').split(',').filter(Boolean);
  const res = await page.evaluate((o) => window.__audioDemo.runLoudness(o.length ? o : null), only);
  log(`loudness renders ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const pad = (s, n) => String(s).padEnd(n);
  log(`${pad('scene', 22)}${pad('integrated', 12)}${pad('short-max', 11)}${pad('true peak', 11)}${pad('target', 12)}check`);
  for (const r of res.scenes) log(`${pad(r.id, 22)}${pad(r.integratedLufs, 12)}${pad(r.shortTermMaxLufs, 11)}${pad(r.truePeakDb, 11)}${pad(`${r.targetLufs}±${r.tol}`, 12)}${r.ok ? 'ok' : r.problems.join('; ')}`);
  log(`${pad('foley', 22)}${pad('short-term', 12)}${pad('bed', 11)}${pad('delta', 11)}${pad('peak', 9)}check`);
  for (const r of res.foley) log(`${pad(r.id, 22)}${pad(r.shortTermLufs, 12)}${pad(r.bedLufs, 11)}${pad(r.deltaLu, 11)}${pad(r.peakDb, 9)}${r.ok ? 'ok' : 'OUTSIDE 8 LU'}`);
  fs.mkdirSync(out, { recursive: true });
  const name = new URLSearchParams(query || '').get('label') || 'loudness';
  fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(res, null, 1));
  await shot('loudness');
  const bad = res.scenes.filter((r) => !r.ok).length + res.foley.filter((r) => !r.ok).length;
  return { problems: bad, scenes: res.scenes.map((r) => ({ id: r.id, lufs: r.measuredLufs, tp: r.truePeakDb, ok: r.ok })), foley: res.foley.map((r) => ({ id: r.id, d: r.deltaLu, ok: r.ok })) };
};
