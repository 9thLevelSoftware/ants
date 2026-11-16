// Main-thread cost of the audio engine: 32 positional voices + a full ambience (layers, rain grains, crowd texture) +
// the loudness monitor, per frame, on a live AudioContext (a real click is the user gesture). Three runs of 240
// frames; the minimum is the number to report (the machine is shared and noisy). Prints the load average.
//   node tools/harness/play.mjs --root spikes/audio-demo --script spikes/audio-demo/scripts/bench.mjs --out test-output/audio-pass
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export default async ({ page, log, out }) => {
  await page.getByRole('button', { name: 'Start audio' }).click();
  const load0 = os.loadavg()[0];
  const res = await page.evaluate(() => window.__audioDemo.runBench());
  const load1 = os.loadavg()[0];
  const summary = {
    bestMedianMs: res.bestMedianMs, bestP95Ms: res.bestP95Ms, bestUpdateMedianMs: res.bestUpdateMedianMs, bestUpdateP95Ms: res.bestUpdateP95Ms, bestStartMs: res.bestStartMs,
    voicesAvg: res.runs.map((r) => r.voicesAvg), ctx: res.runs[0].ctxState, loadAvgBefore: Math.round(load0 * 10) / 10, loadAvgAfter: Math.round(load1 * 10) / 10, cores: os.cpus().length,
  };
  log('bench', JSON.stringify(summary));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'bench.json'), JSON.stringify({ summary, runs: res.runs }, null, 1));
  return summary;
};
