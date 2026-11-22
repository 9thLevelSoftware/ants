// Reviewer probe: a house facade (house-wall, brick outer leaf split into bands by partition()) seen from ant height in daylight.
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  const info = await g(() => {
    const w = window.__hud.game.session.sim.world;
    const o = w.objects.find((x) => x.tags.includes('facade'));
    if (!o) return null;
    const prims = w.prims.slice(o.primStart, o.primStart + o.primCount).filter((p) => p.material === 'brick');
    const bands = prims.map((p) => ({ x: p.pos.x, y: p.pos.y, z: p.pos.z, sx: p.size.x, sy: p.size.y, sz: p.size.z, rot: p.rot }));
    // the biggest brick prim: its thin axis is the facade normal
    const big = prims.slice().sort((a, b) => b.size.x * b.size.y * b.size.z - a.size.x * a.size.y * a.size.z)[0];
    return { n: prims.length, big: { pos: big.pos, size: big.size, rot: big.rot }, bands: bands.slice(0, 40) };
  });
  log('facade', JSON.stringify(info));
  if (!info) return { error: 'no facade' };
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  const b = info.big, q = b.rot;
  // local axis of the thin side, rotated by the quaternion
  const thinX = b.size.x < b.size.z;
  const rotv = (v) => { const [x, y, z] = v, { x: qx, y: qy, z: qz, w: qw } = q; const ix = qw * x + qy * z - qz * y, iy = qw * y + qz * x - qx * z, iz = qw * z + qx * y - qy * x, iw = -qx * x - qy * y - qz * z; return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; };
  const nrm = rotv(thinX ? [1, 0, 0] : [0, 0, 1]);
  const res = {};
  for (const [tag, sgn, dist, h, lookH] of [["sill", 1, 1500, 1050, 1050], ["low", 1, 1500, 250, 300], ["mid", 1, 3500, 600, 900]]) {
    const tz = 3000, cx = b.pos.x + sgn * nrm[0] * dist, cz = tz + sgn * nrm[2] * dist;
    const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, { x: cx, z: cz });
    const pose = await g((a) => window.__game.camera.setPose({ x: a.cx, y: a.gy + a.h, z: a.cz }, { x: a.bx, y: a.gy + a.lookH, z: a.bz }), { cx, cz, gy, h, lookH, bx: b.pos.x, bz: tz });
    res[tag] = pose;
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await shot(`facade-${tag}`);
  }
  return res;
};
