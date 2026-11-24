// look-pass-6 probe: free horizontal room round the possessed queen in 12 directions, from a saved game (L6_SAVE_IN).
import fs from 'node:fs';
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  const r = await g(() => {
    const gm = window.__game, q = gm.summary().possessed, f = (x, y, z) => { const v = gm.query.field(x, y, z); return typeof v === 'number' ? v : v.f; };
    const L = 8.556, up = q.up, c = [q.pos[0] + up[0] * 0.2 * L, q.pos[1] + up[1] * 0.2 * L, q.pos[2] + up[2] * 0.2 * L];
    const rows = [];
    for (let k = 0; k < 12; k++) {
      const az = (k / 12) * 2 * Math.PI, sa = Math.sin(az), ca = Math.cos(az), prof = [];
      for (let x = 0; x <= 14; x += 1) prof.push(Math.round(f(c[0] + sa * x, c[1], c[2] + ca * x) * 10) / 10);
      rows.push({ az: Math.round((az * 180) / Math.PI), prof });
    }
    const col = []; for (let h = -6; h <= 10; h += 1) col.push(Math.round(f(c[0], c[1] + h, c[2]) * 10) / 10);
    return { q, c, rows, col };
  });
  log('probe', JSON.stringify(r));
  const tl = [];
  for (let i = 0; i < 24; i++) {
    await g(() => window.__game.step(1));
    await g(() => window.__game.renderFrame({ settle: 0.1 }));
    tl.push(await g(() => { const c = window.__game.views.possession().cell; return [Math.round(c.azimuthDeg), Math.round(c.aimedDeg), Math.round(c.freeMm * 10) / 10, c.side, Math.round(c.weight * 100) / 100]; }));
  }
  log('timeline', JSON.stringify(tl));
  return {};
};
