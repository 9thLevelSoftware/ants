// look-pass-6 helper: the field's values along a line through the founding cell wall (why the cut edge band is wide).
import fs from 'node:fs';
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g(() => {
    const sim = window.__hud.game.session.sim, col = sim.state.player.colonyId, nest = sim.state.nests.find((n) => n.colony === col);
    const ch = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0], c = ch.center;
    const out = [];
    for (let x = 0; x <= 24; x += 1) out.push([x, Math.round(sim.field.sampleXYZ(c.x + x, c.y, c.z) * 100) / 100]);
    return { voxel: sim.world.voxel ?? null, out };
  });
  log('field line', JSON.stringify(r));
};
