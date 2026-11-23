// look-pass-5 item 6: the possession camera on a 45 degree slope (the flank of the biggest stone near the start, a 45 degree point on it) and in the nest
// shaft and chamber of the colony (a worker teleported into free space along the line from the entrance to the chamber). Each pose is shot with
// camera.worldUpLock false ('Follow surface', the GDD default) and true ('Keep level').
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look5-camera.mjs --out <dir> --script-timeout 1800000
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await g(() => window.__game.cheat.completeFounding(20));
  for (let i = 0; i < 80; i++) {
    const done = await g(() => { const op = window.__game.query.player().opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
    if (done) break;
    await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  const click = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); if (e) e.click(); return !!e; }, id);
  const vis = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return !!e && e.getBoundingClientRect().width > 0; }, id);
  for (let i = 0; i < 6; i++) { if (await vis('founding-continue')) { await click('founding-continue'); await g(() => window.__game.step(2)); break; } await g(() => window.__game.step(30)); }
  if (await vis('founding-worker')) { await click('founding-worker'); await g(() => window.__game.step(2)); } else await g(() => window.__game.release());
  const startPos = await g(() => window.__game.query.world().queenStart.pos);
  await g((p) => window.__game.cheat.spawnAnts(4, 'worker', null, p), startPos);
  await g(() => window.__game.step(60));
  const worker = await g(() => { const gm = window.__game; return gm.query.ants().find((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id)?.id ?? -1; });
  await g((id) => window.__game.possess(id), worker);
  await g(() => window.__game.step(2));
  const sp = Array.isArray(startPos) ? startPos : [startPos.x, startPos.y, startPos.z];
  const cand = await g((sp) => {
    const sim = window.__hud.game.session.sim, gm = window.__game, w = gm.query.world(), H = (x, z) => gm.query.field(x, 0, z).height;
    // steepest ground within 4 m (for the record), the biggest stones for a 45 degree flank
    let max = { deg: 0 };
    for (let r = 100; r <= 4000; r += 80) for (let a = 0; a < 6.283; a += 0.12) {
      const x = sp[0] + r * Math.cos(a), z = sp[2] + r * Math.sin(a);
      if (x < 50 || z < 50 || x > w.size.x - 50 || z > w.size.z - 50) continue;
      const e = 12, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      const deg = Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
      if (deg > max.deg) max = { x, z, deg, y: H(x, z) };
    }
    const flanks = [];
    for (const p of sim.world.prims) {
      if (p.shape !== 'ellipsoid' || p.size.x < 15 || p.size.y < 8) continue;
      const d = Math.hypot(p.pos.x - sp[0], p.pos.z - sp[2]);
      if (d < 3000) flanks.push({ id: p.id, d, mat: p.material, x: p.pos.x + 0.5 * p.size.x, y: p.pos.y + 0.707 * p.size.y, z: p.pos.z + 0.5 * p.size.x, rx: p.size.x, ry: p.size.y });
    }
    flanks.sort((a, b) => b.rx - a.rx);
    // the nest: entrance and chamber of the player's colony
    const col = sim.state.player.colonyId, nest = sim.state.nests.find((n) => n.colony === col);
    const ch = nest.chambers[0];
    const f = (x, y, z) => gm.query.field(x, y, z);
    return { max, flanks: flanks.slice(0, 4), origin: nest.origin, chamber: ch ? { center: ch.center, radii: ch.radii } : null, probe: typeof f };
  }, sp);
  log('max slope', JSON.stringify(cand.max), 'flanks', JSON.stringify(cand.flanks), 'nest', JSON.stringify({ o: cand.origin, c: cand.chamber }));
  const poses = [];
  if (cand.max.deg > 10) poses.push([`slope${Math.round(cand.max.deg)}`, { x: cand.max.x, y: cand.max.y + 1, z: cand.max.z }]);
  const fl = cand.flanks[0];
  if (fl) poses.push(['flank45', { x: fl.x, y: fl.y + 1.5, z: fl.z }]);
  // the shaft: free points on the straight line entrance -> chamber centre at 25, 50 and 75 % (field >= 1.5 mm), the chamber floor
  if (cand.chamber) {
    const o = cand.origin, c = cand.chamber.center;
    for (const t of [0.3, 0.55, 0.8]) {
      const base = { x: o.x + (c.x - o.x) * t, y: o.y + (c.y - o.y) * t, z: o.z + (c.z - o.z) * t };
      const free = await g((b) => {
        const gm = window.__game; let best = null;
        for (let dx = -6; dx <= 6; dx += 1.5) for (let dy = -6; dy <= 6; dy += 1.5) for (let dz = -6; dz <= 6; dz += 1.5) {
          const v = gm.query.field(b.x + dx, b.y + dy, b.z + dz);
          const fv = typeof v === 'number' ? v : v.f ?? v.value ?? v.field;
          if (fv >= 1.4 && (!best || Math.abs(dx) + Math.abs(dy) + Math.abs(dz) < best.d)) best = { x: b.x + dx, y: b.y + dy, z: b.z + dz, d: Math.abs(dx) + Math.abs(dy) + Math.abs(dz), f: fv };
        }
        return best;
      }, base);
      if (free) poses.push([`shaft${Math.round(t * 100)}`, free]);
    }
    poses.push(['chamber', { x: c.x, y: c.y - cand.chamber.radii.y * 0.6, z: c.z }]);
  }
  for (const [name, pos] of poses) {
    for (const lock of [false, true]) {
      await g((l) => window.__game.settings({ camera: { worldUpLock: l } }), lock);
      await g((p) => window.__game.teleport('possessed', p), pos);
      await g(() => window.__game.step(10));
      await g(() => window.__game.renderFrame({ settle: 2 }));
      const info = await g(() => { const gm = window.__game, p = gm.summary().possessed; return { up: p?.up, pos: p?.pos, medium: p?.medium, state: gm.camera.state(), clear: gm.camera.clearance() }; });
      log(name, lock ? 'keep-level' : 'follow', JSON.stringify(info));
      await shot(`${name}-${lock ? 'keep-level' : 'follow'}`);
    }
  }
};
