// look-pass-5 item 4: moulded plastic props at ant height (and a little closer than the usual pose). For each template in TEMPLATES the first object of
// that template is framed from DIST mm away at 14 mm up, once from two sides.
//   TEMPLATES=slide,spring-rider,bench,picnic-table node tools/harness/play.mjs --root . --query "test=1&seed=1&archetype=playground-park&size=compact&autostart=1&quality=medium" \
//     --script tests/e2e/look5-props.mjs --out <dir>
export default async ({ page, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  const want = (process.env.TEMPLATES ?? 'slide,spring-rider').split(',');
  const dist = Number(process.env.DIST ?? 260);
  const found = await g((ts) => {
    const w = window.__hud.game.session.sim.world;
    const all = {};
    for (const t of ts) {
      const os = w.objects.filter((o) => o.templateId === t);
      all[t] = os.map((o) => {
        const prims = w.prims.slice(o.primStart, o.primStart + o.primCount);
        const lo = { x: 1e9, y: 1e9, z: 1e9 }, hi = { x: -1e9, y: -1e9, z: -1e9 };
        for (const p of prims) for (const k of ['x', 'y', 'z']) { lo[k] = Math.min(lo[k], p.pos[k] - p.size[k]); hi[k] = Math.max(hi[k], p.pos[k] + p.size[k]); }
        return { id: o.id, lo, hi, mats: [...new Set(prims.map((p) => p.material))] };
      });
    }
    return all;
  }, want);
  log('found', JSON.stringify(Object.fromEntries(Object.entries(found).map(([k, v]) => [k, v.length]))));
  for (const t of want) {
    const list = found[t];
    if (!list.length) { log('none', t); continue; }
    // prefer an object with plastic
    const o = list.find((x) => x.mats.includes('plastic')) ?? list[0];
    const c = { x: (o.lo.x + o.hi.x) / 2, y: (o.lo.y + o.hi.y) / 2, z: (o.lo.z + o.hi.z) / 2 };
    const r = Math.max(o.hi.x - o.lo.x, o.hi.z - o.lo.z) / 2;
    for (const [i, ang] of [0.6, 2.9].entries()) {
      const d = Math.max(dist, r * 2.2);
      const cam = { x: c.x + Math.cos(ang) * d, z: c.z + Math.sin(ang) * d };
      const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, cam);
      await g((a) => window.__game.camera.setPose({ x: a.cam.x, y: a.gy + 14, z: a.cam.z }, { x: a.c.x, y: a.c.y, z: a.c.z }), { cam, gy, c });
      await g(() => window.__game.renderFrame({ settle: 1 }));
      await wait.frames(2);
      await shot(`${t}-${i}`);
    }
    log(t, JSON.stringify({ id: o.id, mats: o.mats, size: [o.hi.x - o.lo.x, o.hi.y - o.lo.y, o.hi.z - o.lo.z].map(Math.round) }));
  }
  return found;
};
