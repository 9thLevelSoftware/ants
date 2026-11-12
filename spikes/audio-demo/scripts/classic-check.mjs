// Checks the classic build (scripts/classic.mjs): served with --static and no public/ directory, every audio file
// must come from the embedded packs and decode, file-based cues must play their files, and an ambience state must
// render. Runs inside sandbox.html's <iframe sandbox="allow-scripts"> when the harness URL is sandbox.html.
//   node tools/harness/play.mjs --static --root test-output/audio-classic --script spikes/audio-demo/scripts/classic-check.mjs
//   node tools/harness/play.mjs --static --root test-output/audio-classic --url-path sandbox.html ... (see README)
export default async ({ page, shot, log }) => {
  const run = async (target) => {
    await target.waitForFunction(() => !!window.__audioDemo, null, { timeout: 30000 });
    const assets = await target.evaluate(() => window.__audioDemo.assetCheck());
    const cue = await target.evaluate(() => window.__audioDemo.renderCue({ kind: 'giant', id: 'footsteps' }));
    const crunch = await target.evaluate(() => window.__audioDemo.renderCue({ kind: 'cue', id: 'seed-crack' }));
    return {
      count: assets.count,
      backends: [...new Set(assets.rows.map((r) => r.backend))],
      undecodable: assets.rows.filter((r) => r.seconds < 0).map((r) => r.id),
      footsteps: { rmsDb: cue.analysis.rmsDb, sources: cue.log },
      seedCrack: { rmsDb: crunch.analysis.rmsDb, sources: crunch.log },
    };
  };
  const top = await run(page);
  log(`top-level: ${JSON.stringify(top)}`);
  // the same page inside an opaque-origin sandboxed iframe
  await page.goto(page.url().replace(/index\.html$|\/$/, '/sandbox.html'));
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 });
  const frame = page.frames().find((f) => f !== page.mainFrame());
  const framed = frame ? await run(frame) : { error: 'no iframe' };
  log(`sandboxed iframe: ${JSON.stringify(framed)}`);
  await shot('classic-sandboxed');
  return { top, framed };
};
