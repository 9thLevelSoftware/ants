// look-pass-4 item 5: possession camera on slopes. For each pose (a slope of ~20 deg, a slope of 30+ deg, a vertical stem) the same
// pose is shot with camera.worldUpLock false ('Follow surface', the GDD default) and true ('Keep level').
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low&archetype=suburban-garden" --script tests/e2e/look4-slope.mjs --out test-output/look4/item5
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
  // candidate poses: ground slope by sampling the field height around the start, and vertical stems from the prims
  const cand = await g((sp0) => {
    const sp = Array.isArray(sp0) ? sp0 : [sp0.x, sp0.y, sp0.z];
    const gm = window.__game, w = gm.query.world(), H = (x, z) => gm.query.field(x, 0, z).height;
    const res = { slopes: [], stems: [] };
    for (let r = 100; r <= 4000; r += 60) for (let a = 0; a < 6.283; a += 0.1) {
      const x = sp[0] + r * Math.cos(a), z = sp[2] + r * Math.sin(a);
      if (x < 50 || z < 50 || x > w.size.x - 50 || z > w.size.z - 50) continue;
      const e = 12, gx = (H(x + e, z) - H(x - e, z)) / (2 * e), gz = (H(x, z + e) - H(x, z - e)) / (2 * e);
      res.slopes.push({ x, z, deg: Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI, y: H(x, z) });
    }
    const sim = window.__hud.game.session.sim;
    for (const p of sim.world.prims) {
      if (p.shape !== 'cylinder' && p.shape !== 'capsule') continue;
      const ay = 2 * (p.rot.x * p.rot.y) ; // |local y axis . world y| = 1 - 2(x^2+z^2)
      const up = Math.abs(1 - 2 * (p.rot.x * p.rot.x + p.rot.z * p.rot.z));
      if (up < 0.98 || p.size.y < 100 || p.size.x < 3 || p.size.x > 30) continue;
      const d = Math.hypot(p.pos.x - sp[0], p.pos.z - sp[2]);
      if (d < 2500) res.stems.push({ id: p.id, mat: p.material, d, x: p.pos.x, y: p.pos.y, z: p.pos.z, r: p.size.x, hh: p.size.y });
    }
    res.stems.sort((a, b) => a.d - b.d); res.stems = res.stems.slice(0, 40);
    // a flank at about 45 degrees: the nearest ellipsoid pebble or stone with radii of 15 mm or more, a point on it where the normal is 45 degrees from up
    res.flanks = [];
    for (const p of sim.world.prims) {
      if (p.shape !== 'ellipsoid' || p.size.x < 15 || p.size.y < 8) continue;
      const d = Math.hypot(p.pos.x - sp[0], p.pos.z - sp[2]);
      if (d < 2500) res.flanks.push({ id: p.id, d, x: p.pos.x + 0.707 * p.size.x * 0.707, y: p.pos.y + 0.707 * p.size.y, z: p.pos.z + 0.707 * p.size.x * 0.707, rx: p.size.x, ry: p.size.y });
    }
    res.flanks.sort((a, b) => b.rx - a.rx); res.flanks = res.flanks.slice(0, 5);
    return res;
  }, startPos);
  const sp = Array.isArray(startPos) ? startPos : [startPos.x, startPos.y, startPos.z];
  const pick = (lo, hi) => cand.slopes.filter((s) => s.deg >= lo && s.deg < hi).sort((a, b) => Math.hypot(a.x - sp[0], a.z - sp[2]) - Math.hypot(b.x - sp[0], b.z - sp[2]))[0];
  const maxs = cand.slopes.reduce((m, s) => (s.deg > m.deg ? s : m), { deg: 0 });
  log('flanks', JSON.stringify(cand.flanks), 'stems', JSON.stringify(cand.stems.filter((x) => x.mat === 'plant').slice(0, 3)));
  log('maxSlope', JSON.stringify(maxs), 'n>=20', cand.slopes.filter((s) => s.deg >= 20).length, 'n>=30', cand.slopes.filter((s) => s.deg >= 30).length, 'stems', JSON.stringify(cand.stems.slice(0, 3)));
  const poses = [];
  const s20 = pick(17, 26), s30 = pick(30, 90), s45 = pick(42, 90);
  if (s20) poses.push(['slope20', { x: s20.x, y: s20.y + 1, z: s20.z }, s20.deg]);
  if (s30) poses.push(['slope30', { x: s30.x, y: s30.y + 1, z: s30.z }, s30.deg]);
  if (s45 && s45 !== s30) poses.push(['slope45', { x: s45.x, y: s45.y + 1, z: s45.z }, s45.deg]);
  const fl = cand.flanks[0];
  if (!s45 && fl) poses.push(['flank45', { x: fl.x, y: fl.y + 1.5, z: fl.z }, 45]);
  const st = cand.stems.find((x) => x.mat === 'plant') ?? cand.stems[0];
  if (st) poses.push(['stem', { x: st.x + st.r + 1.2, y: st.y + 20, z: st.z }, 90]);
  for (const [name, pos, deg] of poses) {
    for (const lock of [false, true]) {
      await g((l) => window.__game.settings({ camera: { worldUpLock: l } }), lock);
      await g((p) => window.__game.teleport('possessed', p), pos);
      await g(() => window.__game.step(10));
      await g(() => window.__game.renderFrame({ settle: 2 }));
      const info = await g(() => { const p = window.__game.summary().possessed; return { up: p?.up, pos: p?.pos, medium: p?.medium }; });
      log(name, deg.toFixed(1), lock ? 'keep-level' : 'follow', JSON.stringify(info));
      await shot(`${name}-${lock ? 'keep-level' : 'follow'}`);
    }
  }
};
