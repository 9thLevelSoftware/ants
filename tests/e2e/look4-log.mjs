// Reviewer probe: thick wooden cylinders (fallen logs, stumps) after look-pass-4 face detail (WR_BOARDS on rounded instanced prims).
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  const start = await g(() => window.__game.query.world().queenStart.pos);
  const cands = await g((st) => {
    const w = window.__hud.game.session.sim.world;
    return w.prims.filter((p) => p.shape === 'cylinder' && p.material.startsWith('wood') && p.size.x >= 125 && p.size.y >= 125)
      .map((p) => ({ pos: p.pos, r: p.size.x, h: p.size.y, rot: p.rot, mat: p.material, d: Math.hypot(p.pos.x - st.x, p.pos.z - st.z) }))
      .sort((a, b) => a.d - b.d).slice(0, 6);
  }, start);
  log('cands', JSON.stringify(cands));
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  let k = 0;
  for (const c of cands.slice(0, 3)) {
    // look from the side: perpendicular to the log axis on the ground plane (the axis is local y rotated by rot)
    const q = c.rot; const ax = [2 * (q.x * q.y - q.w * q.z), 1 - 2 * (q.x * q.x + q.z * q.z), 2 * (q.y * q.z + q.w * q.x)];
    let sx = -ax[2], sz = ax[0]; const l = Math.hypot(sx, sz); if (l < 0.3) { sx = 1; sz = 0; } else { sx /= l; sz /= l; }
    for (const dist of [900, 2500]) {
      const cx = c.pos.x + sx * (c.r + dist), cz = c.pos.z + sz * (c.r + dist);
      const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, { x: cx, z: cz });
      await g((a) => window.__game.camera.setPose({ x: a.cx, y: a.gy + 80, z: a.cz }, { x: a.p.x, y: a.p.y, z: a.p.z }), { cx, cz, gy, p: c.pos });
      await g(() => window.__game.renderFrame({ settle: 1 }));
      await shot(`log${k}-${c.mat}-r${Math.round(c.r)}-${dist}`);
    }
    k++;
  }
  return cands;
};
