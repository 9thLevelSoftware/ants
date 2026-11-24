// app-seams-4 item 5 probe: an ASCII map of the open cells of the slice plane around the queen of a saved founding (APP4_SAVE), at the plane height the card shot uses.
import fs from 'node:fs';
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_SAVE, 'utf8'));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  const out = await g(() => {
    const sim = window.__hud.game.session.sim, bu = sim.world.bu;
    const q = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId).queenId);
    const rows = [];
    for (const dy of [0.5, 1.4, 2.5]) {
      const y = q.pos.y + dy;
      const step = 0.5, N = 20, lines = [];
      for (let k = -N; k <= N; k++) { let l = ''; for (let i = -N; i <= N; i++) { const v = sim.field.sampleXYZ(q.pos.x + i * step, y, q.pos.z + k * step); l += i === 0 && k === 0 ? '@' : v > 0 ? '#' : '.'; } lines.push(l); }
      rows.push({ dy, y: Math.round(y * 100) / 100, map: lines.join('\n') });
    }
    return { queen: q.pos, rows, chambers: sim.state.nests[0].chambers.map((c) => ({ c: c.center, r: c.radii, type: c.type })) };
  });
  log('probe', JSON.stringify({ queen: out.queen, chambers: out.chambers }));
  for (const r of out.rows) { log('plane dy', r.dy, 'y', r.y); for (const l of r.map.split('\n')) log(l); }
  return {};
};
