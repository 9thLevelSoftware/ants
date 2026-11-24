// app-seams-4 item 4: flood water in a founding cell. Imports the real seed-2 founding (test-output/look6/s2-cell.save: the cell at beat 08, rain
// seeping in) and takes: the cell camera (possession) view, the colony view with the slice cut, and (APP4_PUDDLE=1) an outdoor puddle for comparison.
//   L6_SAVE_IN=test-output/look6/s2-cell.save APP4_TAG=after node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=low" \
//     --script tests/e2e/app4-water.mjs --out test-output/app4/water --script-timeout 1800000
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'w';
  const step = (n) => g((k) => window.__game.step(k), n);
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1.5 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 600000 });
    log('shot', name, JSON.stringify(await g(() => { const p = window.__game.perf?.(); return { renderer: p?.renderers?.weather ?? null, frame: p?.frame ?? p?.info ?? null }; })));
  };
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await step(2);
  const flood = await g(() => {
    const sim = window.__hud.game.session.sim, n = sim.state.nests.find((x) => x.colony === sim.state.player.colonyId);
    return { water: n.flood.water, level: n.flood.level, phase: window.__founding?.view()?.phase ?? null };
  });
  log('flood', JSON.stringify(flood));
  await pic('08-cell-camera');
  // the colony view: the slice through the cell, looking at it from above and from a low angle
  const c = await g(() => {
    const gm = window.__game, bu = gm.query.world().bu, q = gm.query.ants().find((a) => a.caste === 'queen');
    return { x: q.pos[0] ?? q.pos.x, y: q.pos[1] ?? q.pos.y, z: q.pos[2] ?? q.pos.z, bu };
  });
  await g(() => window.__game.camera.set('colony'));
  await step(1);
  await g((o) => window.__game.views.colonyCamera(o), { x: c.x, z: c.z, distBu: 9, pitchDeg: 62, yawDeg: 20, cutaway: 'slice', planeYBu: c.y / c.bu + 0.7, radiusBu: 30 });
  await pic('colony-view-high');
  await g((o) => window.__game.views.colonyCamera(o), { x: c.x, z: c.z, distBu: 8, pitchDeg: 22, yawDeg: 20, cutaway: 'slice', planeYBu: c.y / c.bu + 0.7, radiusBu: 30 });
  await pic('colony-view-low');
  if (process.env.APP4_PUDDLE) {
    // outdoors: a downpour until a puddle forms, the camera 12 BU above it (stage2.mjs's rain beat)
    await g(() => window.__game.camera.set('observer'));
    await g(() => window.__game.cheat.setWeatherClass('rain', 'downpour'));
    const ent = await g(() => { const e = window.__game.query.nest()[0].entrances[0]; return e.pos; });
    let wx = null;
    for (let i = 0; i < 12; i++) {
      await step(300);
      wx = await g((p) => window.__game.query.weather({ x: p.x, z: p.z }), ent);
      if (wx?.puddle && wx.surfaceWet > 0.3) break;
    }
    log('puddle', JSON.stringify(wx?.puddle ?? null));
    const at = wx?.puddle ?? { x: ent.x + 40, y: ent.y, z: ent.z };
    await g(({ a, l }) => window.__game.camera.setPose(a, l), { a: { x: at.x + 60, y: at.y + 30, z: at.z + 60 }, l: at });
    await pic('outdoor-puddle');
  }
  return { flood };
};
