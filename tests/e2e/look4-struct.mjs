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
  const startPos = await g(() => window.__game.query.world().queenStart.pos);
  await g((p) => window.__game.cheat.spawnAnts(4, 'worker', null, p), startPos);
  await g(() => window.__game.step(60));
  const ent = await g(() => { const n = window.__hud.game.session.sim.state.nests.find((x) => x.entrances.length); return n ? n.entrances[0].pos : null; });
  log('entrance', JSON.stringify(ent));
  await g(() => window.__game.release());
  await g(() => window.__game.possess('worker'));
  if (ent) await g((p) => window.__game.teleport('possessed', { x: p.x + 8, y: p.y + 1, z: p.z + 8 }), ent);
  await g(() => window.__game.step(8));
  await render(); await shot('2-worker-at-entrance');
};
