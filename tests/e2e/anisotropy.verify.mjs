// Independent review (int-1B-app): the quality preset's anisotropy must reach the textures the asset loader serves
// (scanned texture sets of primitives, mounds, decor). Game.ts creates the loader without `anisotropy` and nothing
// calls AssetLoader.setAnisotropy on a quality change, so at High (preset 8) every loader texture samples with 1.
// Fails until that wiring exists.
//
//   node tools/harness/play.mjs --root . --query "test=1&quality=high&autostart=1&seed=1" \
//        --script tests/e2e/anisotropy.verify.mjs --out test-output/aniso --script-timeout 800000
export default async ({ page, log }) => {
  await page.waitForFunction(() => window.__game && window.__game.summary().mode === 'playing', null, { timeout: 600000 });
  const r = await page.evaluate(() => {
    const game = window.__hud?.game;
    if (!game) return { err: 'no game handle (window.__hud.game)' };
    const byAniso = {};
    for (const v of game.assets.textures?.values?.() ?? []) byAniso[v.tex.anisotropy] = (byAniso[v.tex.anisotropy] ?? 0) + 1;
    return { quality: game.app.quality.id, presetAnisotropy: game.app.quality.anisotropy, loaderTexturesByAnisotropy: byAniso };
  });
  log('anisotropy', JSON.stringify(r));
  if (r.err) throw new Error(r.err);
  const wrong = Object.entries(r.loaderTexturesByAnisotropy).filter(([a]) => Number(a) !== r.presetAnisotropy);
  if (wrong.length) throw new Error(`loader textures do not follow the preset anisotropy ${r.presetAnisotropy}: ${JSON.stringify(r.loaderTexturesByAnisotropy)}`);
  return r;
};
