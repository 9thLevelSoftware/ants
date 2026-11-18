// debug: which compiled programs carry WR_BOARDS
export default async ({ page, log }) => {
  const r = await page.evaluate(() => {
    const game = window.__hud.game, gl = game.app.renderer.getContext();
    const out = [];
    for (const p of game.app.renderer.info.programs ?? []) {
      const shaders = gl.getAttachedShaders(p.program) ?? [];
      for (const sh of shaders) {
        const src = gl.getShaderSource(sh) ?? '';
        if (src.includes('WR_BOARDS')) out.push({ cache: String(p.cacheKey).slice(0, 120), defined: /#define WR_BOARDS/.test(src), hasBlock: src.includes('bfw'), type: gl.getShaderParameter(sh, gl.SHADER_TYPE) === gl.FRAGMENT_SHADER ? 'frag' : 'vert' });
      }
    }
    return out;
  });
  log('programs', JSON.stringify(r));
};
