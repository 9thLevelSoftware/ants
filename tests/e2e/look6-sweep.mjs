// look-pass-6 item 1: the possession camera in the founding cell, swept: the queen teleported to free points of the cell (its middle and
// near the wall at four azimuths), the orbit turned to three yaws, one picture each. Starts from the game saved by look6-cell.mjs (L6_SAVE_IN).
//   L6_SAVE_IN=test-output/look6/s1-cell.save node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" \
//     --script tests/e2e/look6-sweep.mjs --out test-output/look6/sweep-before
// Environment: L6_TAG (file name prefix), L6_YAWS (comma list, default 0,120,240), L6_WHO (queen | worker; worker = a worker spawned in the cell).
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.L6_TAG ?? 'sw';
  const yaws = (process.env.L6_YAWS ?? '0,120,240').split(',').map(Number);
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.L6_SAVE_IN, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  if (process.env.L6_WHO === 'worker') {
    await g(() => { window.__founding?.skipLapse?.(); });
  }
  const cell = await g(() => {
    const sim = window.__hud.game.session.sim, col = sim.state.player.colonyId, nest = sim.state.nests.find((n) => n.colony === col);
    const ch = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
    const f = (x, y, z) => { const v = window.__game.query.field(x, y, z); return typeof v === 'number' ? v : v.f; };
    const c = ch.center, rad = ch.radii, pts = [];
    for (let x = -rad.x - 3; x <= rad.x + 3; x += 0.5) for (let y = -rad.y - 3; y <= rad.y + 3; y += 0.5) for (let z = -rad.z - 3; z <= rad.z + 3; z += 0.5) {
      const p = { x: c.x + x, y: c.y + y, z: c.z + z }, v = f(p.x, p.y, p.z);
      if (v > 0.9) pts.push({ ...p, f: v });
    }
    return { c, rad, free: pts.length, pts, bu: sim.world.bu };
  });
  log('cell', JSON.stringify({ c: cell.c, rad: cell.rad, free: cell.free, bu: cell.bu }));
  // the middle (highest field), and the free point nearest each azimuth that is within 1.3 mm of the wall (field 0.9-1.3)
  cell.pts.sort((a, b) => b.f - a.f);
  const poses = [['mid', cell.pts[0]]];
  for (const az of [0, 90, 180, 270]) {
    const dirx = Math.cos((az * Math.PI) / 180), dirz = Math.sin((az * Math.PI) / 180);
    let best = null;
    for (const p of cell.pts) {
      const dx = p.x - cell.c.x, dz = p.z - cell.c.z, d = Math.hypot(dx, dz);
      if (d < 1e-6 || p.f > 1.4) continue;
      const cosA = (dx * dirx + dz * dirz) / d, score = cosA * 10 + d;
      if (!best || score > best.score) best = { ...p, score };
    }
    if (best) poses.push([`wall${az}`, best]);
  }
  if (process.env.L6_CELLCAM === '0') await g(() => window.__game.views.cellCam(false));
  await g(() => window.__game.possess('queen'));
  await g(() => window.__game.step(2));
  for (const [name, p] of poses) {
    for (const yaw of yaws) {
      if (process.env.L6_EDGE) await g((e) => { globalThis.__L6_EDGE = e; }, Number(process.env.L6_EDGE));
      await g((q) => window.__game.teleport('possessed', q), { x: p.x, y: p.y, z: p.z });
      await g(() => window.__game.step(10));
      await g(({ y }) => { window.__game.camera.recentre?.(); window.__game.camera.orbit(y, 0); }, { y: yaw });
      await g(() => window.__game.renderFrame({ settle: 2 }));
      await page.waitForTimeout(200);
      const info = await g(() => {
        const gm = window.__game, s = gm.summary().possessed, pose = gm.camera.pose(), a = gm.query.ant(s.id), L = a.lengthBu * gm.query.world().bu;
        const d = Math.hypot(pose.pos.x - s.pos[0], pose.pos.y - s.pos[1], pose.pos.z - s.pos[2]);
        return { state: gm.camera.state(), distL: Math.round((d / L) * 100) / 100, L, up: s.up.map((v) => Math.round(v * 100) / 100), possession: gm.views.possession(), pose: gm.camera.pose() };
      });
      log(name, yaw, JSON.stringify({ ...info, possession: { ...info.possession, pos: undefined } }));
      await page.screenshot({ path: `${out}/${tag}-${name}-y${yaw}.png`, timeout: 600000 });
    }
  }
};
