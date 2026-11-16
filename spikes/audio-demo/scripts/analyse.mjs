// Harness script for the audio demo: offline renders of every cue / ambience state / loop boundary, the CPU bench
// on the live context (a real click is the user gesture), one screenshot of the read-out table, JSON next to it.
//   node tools/harness/play.mjs --root spikes/audio-demo --script spikes/audio-demo/scripts/analyse.mjs --out test-output/audio-demo
//   extras (query): ?skip=bench,loops   to run less (skip=loops also leaves out the loop-boundary renders; skip=all is loops only)
import fs from 'node:fs';
import path from 'node:path';

export default async ({ page, shot, log, out, query }) => {
  const skip = new Set((new URLSearchParams(query || '').get('skip') || '').split(',').filter(Boolean));
  const res = {};
  res.assets = await page.evaluate(() => window.__audioDemo.assetCheck());
  log(`audio assets: ${res.assets.count}, backends ${[...new Set(res.assets.rows.map((r) => r.backend))].join(',')}, undecodable ${res.assets.rows.filter((r) => r.seconds < 0).length}`);
  if (!skip.has('bench')) {
    await page.getByRole('button', { name: 'Start audio' }).click(); // trusted gesture
    res.bench = await page.evaluate(() => window.__audioDemo.runBench());
    log(`bench: ${JSON.stringify(res.bench && { ...res.bench, runs: undefined, state: res.bench.runs?.[0]?.ctxState, voicesAvg: res.bench.runs?.map((r) => r.voicesAvg), startsPerFrame: res.bench.runs?.map((r) => r.startsPerFrame) })}`);
  }
  const t0 = Date.now();
  res.all = skip.has('all') ? { cues: [], ambience: [], loops: await page.evaluate(() => window.__audioDemo.runLoops()) }
    : skip.has('loops') ? { cues: await page.evaluate(() => window.__audioDemo.runCues()), ambience: await page.evaluate(() => window.__audioDemo.runAmbience()), loops: [] }
      : await page.evaluate(() => window.__audioDemo.runAll());
  log(`offline analysis ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  const bad = [...res.all.cues, ...res.all.ambience].filter((r) => r.problems.length);
  for (const b of bad) log(`PROBLEM ${b.name}: ${b.problems.join('; ')}`);
  for (const l of res.all.loops) log(`loop ${l.file}: ${l.ok ? 'ok' : 'DISCONTINUITY'} crossfade ${JSON.stringify(l.crossfade)} control ${JSON.stringify(l.control)} naive ${JSON.stringify(l.naive)} naiveControl ${JSON.stringify(l.naiveControl)} naiveFlagged ${l.naiveFlagged}`);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('audio-demo');
  fs.writeFileSync(path.join(out, 'audio-analysis.json'), JSON.stringify(res, null, 1));
  return {
    cues: res.all.cues.length, ambience: res.all.ambience.length, problems: bad.map((b) => `${b.name}: ${b.problems.join('; ')}`),
    loops: res.all.loops.map((l) => ({ f: l.file.split('/').pop(), ok: l.ok, cf: l.crossfade, ctl: l.control, naive: l.naive, naiveFlagged: l.naiveFlagged })), bench: res.bench && { ...res.bench, runs: undefined },
  };
};
