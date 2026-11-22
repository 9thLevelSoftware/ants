// look-pass-4 scratch: run firstplay up to beat 05, then hide scene parts by name prefix (HIDE=prefix list) and shoot.
import fp from './firstplay.mjs';
export default async (ctx) => {
  process.env.FIRSTPLAY_UNTIL = process.env.FIRSTPLAY_UNTIL ?? '05';
  await fp(ctx);
  const { page, out, log } = ctx;
  const names = await page.evaluate(() => { const r = {}; window.__hud.game.scene.traverse((o) => { if (o.isMesh) r[o.name || o.type] = (r[o.name || o.type] || 0) + 1; }); return r; });
  log(JSON.stringify(names));
  for (const h of (process.env.HIDE ?? '').split(',').filter(Boolean)) {
    await page.evaluate((n) => { window.__hud.game.scene.traverse((o) => { if (o.isMesh) o.layers.set(o.name.startsWith(n) ? 5 : 0); }); window.__game.renderFrame({ settle: 1 }); }, h);
    await page.screenshot({ path: `${out}/hide-${h.replace(/[^a-z0-9]/gi, '_')}.png`, timeout: 300000 });
  }
};
