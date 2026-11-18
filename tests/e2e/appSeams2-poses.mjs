// app-seams-2 item 12 (last bullet): same-pose pictures for the two camera fixes of look pass 3 that had unit tests only.
//   POSE_TAG=after node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/appSeams2-poses.mjs \
//        --out test-output/app-seams-2/poses-after --timeout 600000 --script-timeout 1500000
// Run it on the tree before look pass 3 (git archive 5c5fe19, --root that folder) for the "before" pair.
//  A. leaving the colony view for the observer while the followed ant is underground: the observer must be free over the nest (not orbiting the ant in the soil).
//  B. the possession camera climbing a slope: the steepest ground of the world (found by scanning the heightfield), the queen put at its
//     foot and walked up it; the picture shows how much of the slope and of the sky the camera sees.
// Staging: the colony is handed over by `cheat.completeFounding` (the observer view needs a colony); the queen is teleported to the slope.
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 600000 });
  const render = (s = 1) => g((x) => window.__game.renderFrame({ settle: x }), s);
  await g(() => window.__game.cheat.completeFounding(10));
  await g(() => window.__game.step(40));
  await page.keyboard.press('KeyH'); // the HUD off
  const res = {};

  // A. leaving the colony view with the followed ant underground: the observer must stay free over the nest, not orbit the ant in the soil
  const w = await g(() => {
    const s = window.__hud.game.session, sim = s.sim, nest = sim.state.nests[0];
    const ch = nest.chambers.find((c) => c.type !== 'founding') ?? nest.chambers[0];
    const ant = sim.state.ants.find((x) => x.alive && x.caste === 'worker');
    window.__game.teleport(ant.id, ch.center);
    return { id: ant.id, at: { ...ch.center }, type: ch.type };
  });
  log('underground worker', JSON.stringify(w));
  await g(() => window.__game.step(2));
  await g(() => window.__game.camera.set('observer'));
  await g((id) => { const s = window.__hud.game.session; s.followId = id; }, w.id);
  await render(1);
  await shot('A1-observer-following-underground-ant');
  await g(() => window.__game.camera.set('colony'));
  await render(1);
  await shot('A2-colony-view');
  await g(() => window.__game.camera.set('observer'));
  await render(1);
  const after = await g(() => ({ followId: window.__hud.game.session.followId, clearance: window.__game.camera.clearance(), pose: window.__game.camera.pose() }));
  await shot('A3-observer-after-colony');
  res.observer = after;
  log('observer after colony', JSON.stringify({ followId: after.followId, f: after.clearance?.f, y: after.pose.pos.y }));

  // B. the slope
  const slope = await g(() => {
    const s = window.__hud.game.session.sim, t = s.world.terrain, bu = s.world.bu;
    let best = null;
    const ent = s.state.nests[0].entrances[0].pos;
    for (let iz = 4; iz < t.nz - 4; iz += 2) for (let ix = 4; ix < t.nx - 4; ix += 2) {
      const h = (a, b) => t.data[b * t.nx + a];
      const gx = (h(ix + 1, iz) - h(ix - 1, iz)) / (2 * t.cell), gz = (h(ix, iz + 1) - h(ix, iz - 1)) / (2 * t.cell);
      const sl = Math.hypot(gx, gz), deg = Math.atan(sl) * 180 / Math.PI;
      if (deg < 14 || deg > 32) continue; // steep enough to matter, not a cliff the walker would wrap round
      const x = ix * t.cell, z = iz * t.cell, dist = Math.hypot(x - ent.x, z - ent.z);
      if (!best || dist < best.dist) best = { x, z, y: h(ix, iz), gx: gx / sl, gz: gz / sl, deg, dist: dist / bu };
    }
    return best;
  });
  log('slope', JSON.stringify(slope));
  res.slope = slope;
  if (slope) {
    const start = await g((sl) => { const s = window.__hud.game.session.sim, bu = s.world.bu; const x = sl.x - sl.gx * 12 * bu, z = sl.z - sl.gz * 12 * bu; return { x, z }; }, slope);
    const y = await g((p) => window.__hud.game.session.sim.field.height(p.x, p.z) + 3, start);
    await g(() => window.__game.camera.set('possess'));
    await g((p) => window.__game.teleport('possessed', p), { x: start.x, y, z: start.z });
    await g(() => window.__game.step(2));
    await g((sl) => window.__game.views.walk(60, { dir: { x: sl.gx, y: 0.5, z: sl.gz } }), slope);
    await render(1);
    res.slopeView = await g(() => ({ state: window.__game.camera.state(), pose: window.__game.camera.pose() }));
    await shot('B1-slope-climb');
    await g((sl) => window.__game.views.walk(60, { dir: { x: sl.gx, y: 0.5, z: sl.gz } }), slope);
    await render(1);
    await shot('B2-slope-climb-later');
  }
  return res;
};
