// All look-dev screenshots used by docs/research/spike-look.md:
//   node tools/harness/play.mjs --root spikes/look --query "t=2&ui=0&quality=high" --script spikes/look/shots.mjs \
//        --script-timeout 3000000 --timeout 120000 --out docs/research/spike-look-img
// Query extras: only=midday,golden (variants at the start quality only, skip the rest of the set)
export default async ({ page, shot, log, query }) => {
  const params = new URLSearchParams(query || '');
  const startQ = params.get('quality') || 'high';
  const only = params.get('only');
  const out = {};
  const S = (fn, arg) => page.evaluate(fn, arg);
  await S(() => window.__spike.pause());
  const variants = only ? only.split(',') : await S(() => window.__spike.variants);
  // 1. every variant at the start quality
  for (const v of variants) {
    const ms = await S((name) => { window.__spike.setVariant(name); window.__spike.renderSync(); return window.__spike.renderSync(); }, v);
    const info = await S(() => window.__spike.info());
    log(v, Math.round(ms) + ' ms', JSON.stringify({ calls: info.calls, tris: info.tris }));
    await shot(`${startQ}-${v}`);
    out[`${startQ}-${v}`] = { ms: Math.round(ms), calls: info.calls, tris: info.tris };
  }
  if (only) return out;
  // 2. grass parting / fading around the line of sight: camera turned into the lawn
  await S(() => { const s = window.__spike; s.setVariant('midday'); s.setCamera(-0.55, 0.28, 22, 4); });
  for (const on of [true, false]) {
    await S((on) => { window.__spike.setGrassParting(on); window.__spike.renderSync(); window.__spike.renderSync(); }, on);
    await shot(`grass-parting-${on ? 'on' : 'off'}`);
  }
  await S(() => window.__spike.setGrassParting(true));
  // 3. wind: same frame at two times (vertex-shader sway), golden hour back-light, wide view of the lawn edge
  await S(() => { const s = window.__spike; s.setVariant('golden'); s.setCamera(-0.75, 0.16, 120, 25); });
  for (const t of [2.0, 3.2]) {
    await S((t) => { window.__spike.setTime(t); window.__spike.renderSync(); window.__spike.renderSync(); }, t);
    await shot(`wind-t${String(t).replace('.', '_')}`);
  }
  await S(() => { const s = window.__spike; s.setTime(2); s.setCamera(0.32, 0.3, 18, 4.5); s.setVariant('midday'); });
  // 4. quality presets, midday + underground
  for (const q of ['low', 'medium', 'high', 'ultra']) {
    await S((q) => window.__spike.setQuality(q), q);
    for (const v of ['midday', 'underground']) {
      const ms = await S((v) => { window.__spike.setVariant(v); window.__spike.renderSync(); return window.__spike.renderSync(); }, v);
      await shot(`quality-${q}-${v}`);
      log('quality', q, v, Math.round(ms));
      out[`quality-${q}-${v}`] = Math.round(ms);
    }
  }
  return out;
};
