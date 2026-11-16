// Level of every ambience layer alone (tuning aid for LAYER_TRIM_DB).
//   node tools/harness/play.mjs --root spikes/audio-demo --script spikes/audio-demo/scripts/layers.mjs --out test-output/audio-pass
export default async ({ page, log }) => {
  const rows = await page.evaluate(() => window.__audioDemo.runLayerLevels());
  for (const r of rows) log(`${String(r.layer).padEnd(20)}${String(r.integratedLufs).padEnd(8)} ${r.source}`);
  return rows.map((r) => [r.layer, r.integratedLufs]);
};
