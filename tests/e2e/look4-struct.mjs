// look-pass-4 item 2: structures at ant height, two shots per archetype: (1) the opening shot, (2) a worker standing at the nest entrance
// (the opening completed by cheat: the scene is set by cheat.completeFounding + spawnAnts + teleport, not played). One run per archetype.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=medium&archetype=kitchen-door" --script tests/e2e/look4-struct.mjs --out test-output/look4/item2/<tag>-<arch>-<q>
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  const render = () => g(() => window.__game.renderFrame({ settle: 1 }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await render(); await shot('1-opening');
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
  const ent = await g(() => { const n = window.__hud.game.session.sim.state.nests.find((x) => x.entrances.length); return n ? n.entrances[0].pos : null; });
  log('entrance', JSON.stringify(ent));
  const worker = await g((e) => {
    const gm = window.__game, bu = gm.query.world().bu;
    const ws = gm.query.ants().filter((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id).sort((a, b) => Math.hypot(a.pos.x - e.x, a.pos.z - e.z) - Math.hypot(b.pos.x - e.x, b.pos.z - e.z));
    const surface = ws.find((a) => gm.query.field(a.pos.x, 0, a.pos.z).height - a.pos.y < 0.5 * bu);
    return (surface ?? ws[0])?.id ?? -1;
  }, ent);
  await g((id) => window.__game.possess(id), worker);
  await g(() => window.__game.step(2));
  // the entrance mouth: 3 BU toward the start, on the ground (the walker snaps to the surface)
  const bu = await g(() => window.__game.query.world().bu);
  const ground = await g((e) => window.__game.query.field(e.x + 12, 0, e.z + 12).height, ent);
  await g((a) => window.__game.teleport('possessed', { x: a.e.x + 12, y: a.g + 1, z: a.e.z + 12 }), { e: ent, g: ground });
  await g(() => window.__game.step(10));
  log('possessed', JSON.stringify(await g(() => window.__game.summary().possessed)));
  await render(); await shot('2-worker-at-entrance');
};
