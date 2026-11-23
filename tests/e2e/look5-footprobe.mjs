// look-pass-5 item 3 probe: the kitchen-door wall foot at ant height (facade-tiers "near" pose, corrected for this world's wall), with scene groups hidden one at a time.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&archetype=kitchen-door&size=compact&autostart=1&quality=low" --script tests/e2e/look5-footprobe.mjs --out <dir>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const clip = { x: 300, y: 380, width: 600, height: 140 };
  const shot = (n, full = false) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000, ...(full ? {} : { clip }) });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(20));
  await g(() => { const s = window.__hud.game.session.sim.state; const tpd = 6000; const ct = s.env.calendar.startTick + s.tick; window.__game.command({ type: 'cheat.setTime', tick: Math.floor(ct / tpd) * tpd + 0.55 * tpd }); window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }); });
  await g(() => window.__game.step(2));
  const info = await g(() => {
    const w = window.__hud.game.session.sim.world;
    const o = w.objects.find((x) => x.tags.includes('facade'));
    const prims = w.prims.slice(o.primStart, o.primStart + o.primCount).filter((p) => p.material === 'brick');
    const big = prims.slice().sort((a, b) => b.size.x * b.size.y * b.size.z - a.size.x * a.size.y * a.size.z)[0];
    return { big: { pos: big.pos, size: big.size } };
  });
  const b = info.big; // wall along x, thin axis z: the garden face is at z = pos.z - size.z, the camera stands on the garden side (smaller z)
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.step(2));
  const cx = b.pos.x, cz = b.pos.z - b.size.z - 1500;
  const gy = await g((p) => window.__game.query.field(p.x, 0, p.z).height, { x: cx, z: cz });
  await g((a) => window.__game.camera.setPose({ x: a.cx, y: a.gy + 250, z: a.cz }, { x: a.cx, y: a.gy + 300, z: a.cz + 1500 }), { cx, cz, gy });
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await shot('full', true);
  await shot('base');
  const names = await g(() => window.__hud.game.scene.children.map((c, i) => `${i}:${c.name || c.type}:${c.children.length}`));
  log('scene', JSON.stringify(names));
  const hide = (process.env.HIDE ?? '').split(',').filter(Boolean);
  for (const h of hide) {
    await g((n) => { for (const c of window.__hud.game.scene.children) c.visible = !(c.name || c.type).includes(n); }, h);
    await g(() => window.__game.renderFrame({ settle: 0 }));
    await shot(`hide-${h}`);
    await g(() => { for (const c of window.__hud.game.scene.children) c.visible = true; });
  }
  for (const combo of (process.env.SHOWP ?? '').split(';').filter(Boolean)) {
    // only these children of world:primitives (indices, comma separated) stay visible; everything else in the world except sky/lights/terrain hidden too if ONLYPRIM
    const keep = combo.split(',').map(Number);
    await g((k) => { window.__hud.game.scene.children[0].children[3].children.forEach((c, j) => { c.visible = k.includes(j); }); }, keep);
    await g(() => window.__game.renderFrame({ settle: 0 }));
    await shot(`showp-${combo.replace(/,/g, '_')}`);
    await g(() => { window.__hud.game.scene.children[0].children[3].children.forEach((c) => { c.visible = true; }); });
  }
  if (process.env.HIDEP) {
    const pn = await g(() => window.__hud.game.scene.children[0].children[3].children.map((c, i) => `${i}:${c.name}:${c.type}:${c.count ?? ''}`));
    log('prim children', JSON.stringify(pn));
    for (let i = 0; i < pn.length; i++) {
      await g((k) => { window.__hud.game.scene.children[0].children[3].children.forEach((c, j) => { c.visible = j !== k; }); }, i);
      await g(() => window.__game.renderFrame({ settle: 0 }));
      await shot(`hidep-${i}`);
    }
    await g(() => { window.__hud.game.scene.children[0].children[3].children.forEach((c) => { c.visible = true; }); });
  }
  if (process.env.HIDEW) {
    const wn = await g(() => window.__hud.game.scene.children[0].children.map((c, i) => `${i}:${c.name || c.type}:${c.children.length}:${c.type}`));
    log('world children', JSON.stringify(wn));
    for (let i = 0; i < wn.length; i++) {
      await g((k) => { window.__hud.game.scene.children[0].children.forEach((c, j) => { c.visible = j !== k; }); }, i);
      await g(() => window.__game.renderFrame({ settle: 0 }));
      await shot(`hidew-${i}`);
    }
    await g(() => { window.__hud.game.scene.children[0].children.forEach((c) => { c.visible = true; }); });
  }
  return info;
};
