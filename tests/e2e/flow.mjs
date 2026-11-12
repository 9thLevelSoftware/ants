// Game-level flow checks from GDD 01 Appendix E that the Game orchestrator owns (E2, E17, E21, E22, E24), plus the
// pause menu freeze:
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1" --script tests/e2e/flow.mjs
export default async ({ page, log, wait, shot }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`flow: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const sum = () => g(() => window.__game.summary());
  const frames = (n) => wait.frames(n);
  const out = {};

  // a few foragers around the queen
  const sp = await g(() => window.__game.cheat.spawnAnts(5, 'worker', 'forage'));
  expect(sp.ok, 'spawnAnts refused', sp);
  await g(() => window.__game.step(2));

  // E2: observer at 8x, possess('forager') -> that ant, controlled, 1x
  await g(() => window.__game.release());
  await g(() => window.__game.setSpeed(8));
  expect((await sum()).time.speed === 8, 'observer 8x');
  const p = await g(() => window.__game.possess('forager'));
  await g(() => window.__game.step(1));
  let s = await sum();
  expect(s.possessed && s.possessed.id === p.id && s.possessed.controlled && s.possessed.caste === 'worker', 'E2 possess forager', s.possessed);
  expect(s.time.speed === 1, 'E2 speed 1 after possession', s.time);
  out.E2 = 'ok';

  // E21: M -> colony view, ant released with a task; M again -> same ant, 1x
  const id = s.possessed.id;
  await g(() => window.__game.setSpeed(4));
  await g(() => window.__game.input.key('KeyM'));
  await frames(3);
  s = await sum();
  const released = await g((i) => window.__game.query.ant(i), id);
  expect(s.view === 'colony' && s.possessed === null && s.returnAntId === id, 'E21 colony view after M', { view: s.view, ret: s.returnAntId });
  expect((released.flags & 1) === 0 && typeof released.task === 'string', 'E21 released ant has a task', released.task);
  await g(() => window.__game.renderFrame());
  await shot('colony-view');
  await g(() => window.__game.input.key('KeyM'));
  await frames(3);
  s = await sum();
  expect(s.view === 'possess' && s.possessed && s.possessed.id === id && s.time.speed === 1, 'E21 back to the same ant at 1x', { view: s.view, p: s.possessed?.id, t: s.time });
  out.E21 = 'ok';

  // E17: W held with the sim running, then blur -> inputs released, paused, autoPaused; the ant stops
  await g(() => window.__game.realtime(true));
  await g(() => window.__game.input.key('KeyW', 'down'));
  await frames(6);
  await g(() => window.__game.input.blur());
  await frames(2);
  s = await sum();
  const held = (await g(() => window.__game.input.summary())).held;
  expect(s.time.paused && s.time.autoPaused, 'E17 paused + autoPaused after blur', s.time);
  expect(!held.includes('move.up'), 'E17 held inputs released', held);
  await g(() => window.__game.realtime(false));
  await g(() => window.__game.step(10));
  s = await sum();
  expect(s.possessed.speed === 0, 'E17 ant speed 0 after step(10)', s.possessed.speed);
  await g(() => window.__game.input.key('KeyW', 'up'));
  out.E17 = 'ok';

  // E22: photo mode from the observer at 4x freezes the tick; on exit the speed and the camera pose are back
  await g(() => window.__game.release());
  await g(() => window.__game.setSpeed(4));
  await g(() => window.__game.renderFrame({ settle: 1 }));
  const pose0 = await g(() => window.__game.camera.pose());
  await g(() => window.__game.realtime(true));
  await g(() => window.__game.camera.set('photo'));
  const t0 = (await sum()).tick;
  await page.waitForTimeout(1500);
  const t1 = (await sum()).tick;
  expect(t1 === t0, 'E22 tick frozen in photo mode', { t0, t1 });
  await g(() => window.__game.realtime(false));
  await g(() => window.__game.camera.set('observer'));
  await frames(2);
  s = await sum();
  const pose1 = await g(() => window.__game.camera.pose());
  const d = Math.hypot(pose1.pos.x - pose0.pos.x, pose1.pos.y - pose0.pos.y, pose1.pos.z - pose0.pos.z);
  expect(s.view === 'observer' && s.time.speed === 4, 'E22 back in observer at 4x', { view: s.view, t: s.time });
  expect(d < 0.05, 'E22 camera pose restored', { d, pose0: pose0.pos, pose1: pose1.pos });
  out.E22 = { photoFrozenTicks: t1 - t0, poseErrorMm: d };

  // pause menu freezes time and Esc closes it
  await g(() => window.__game.ui.open('pause'));
  await g(() => window.__game.realtime(true));
  const m0 = (await sum()).tick;
  await page.waitForTimeout(500);
  const m1 = (await sum()).tick;
  expect((await sum()).mode === 'paused' && m1 === m0, 'pause menu should freeze', { m0, m1 });
  await g(() => window.__game.input.key('Escape'));
  await frames(3);
  expect((await sum()).mode === 'playing', 'Esc should close the pause menu');
  await g(() => window.__game.realtime(false));
  out.pauseMenu = 'ok';

  // E24: the possessed worker dies -> hold ~3 s on the body, then observer; one possessed-ant-died event
  await g(() => window.__game.possess('forager'));
  const victim = (await sum()).possessed.id;
  await g((i) => window.__game.cheat.kill(i), victim);
  await page.waitForTimeout(3500);
  await frames(2);
  s = await sum();
  const died = (await g(() => window.__game.events('possessed-ant-died', 10))).filter((e) => e.antId === victim);
  expect(s.possessed === null && s.view === 'observer' && died.length === 1, 'E24 death -> observer', { view: s.view, died });
  out.E24 = 'ok';
  log(JSON.stringify(out));
  return out;
};
