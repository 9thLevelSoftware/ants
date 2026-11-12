// End-to-end smoke check (task F3b, criterion 2):
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1" --script tests/e2e/smoke.mjs
// Boots straight into a generated game, steps 300 ticks, possesses the queen, walks her with setIntent, checks the
// time-speed rules, and takes third-person and observer screenshots. Throws on any failed expectation.
export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`smoke: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const result = {};

  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'game not playing after autostart', s0.mode);
  expect(s0.time.manualClock === true, 'test mode should not tick in real time');
  result.renderers = s0.renderers;

  // stepping without rendering
  const st = await g(() => window.__game.step(300));
  expect(st.tick === s0.tick + 300, 'step(300) did not advance 300 ticks', st);
  result.step300Ms = st.ms;

  // possession of the queen
  const p = await g(() => window.__game.possess('queen'));
  const s1 = await g(() => window.__game.summary());
  expect(s1.possessed && s1.possessed.caste === 'queen' && s1.possessed.controlled, 'queen not possessed', p);
  expect(s1.view === 'possess', 'view should be possess', s1.view);
  expect(s1.time.speed === 1, 'possession should run at 1x', s1.time);

  // GDD 01 E1: 8x is refused while possessing
  await g(() => window.__game.command({ type: 'setSpeed', speed: 8 }));
  const refused = await g(() => window.__game.events('speed-refused', 5));
  const s2 = await g(() => window.__game.summary());
  expect(s2.time.speed === 1 && refused.some((e) => e.reason === 'possession'), '8x not refused while possessing', { time: s2.time, refused });

  // upright on the ground where she starts (after walking she may legitimately be climbing: the surface walker
  // takes walls, and generated worlds can put a bank a few BU ahead of the start)
  expect(s2.possessed.up[1] > 0.9, 'queen is not upright on the ground at the start', s2.possessed.up);

  // walk forward (camera-relative W) for 2 game seconds
  const before = s2.possessed.pos;
  await g(() => window.__game.setIntent({ move: { x: 0, y: 1 } }));
  await g(() => window.__game.step(20));
  await g(() => window.__game.setIntent({}));
  const s3 = await g(() => window.__game.summary());
  const moved = Math.hypot(s3.possessed.pos[0] - before[0], s3.possessed.pos[1] - before[1], s3.possessed.pos[2] - before[2]);
  log('queen moved (mm) in 20 ticks:', moved.toFixed(2));
  result.walkedMm = moved;
  result.upAfterWalk = s3.possessed.up;
  expect(moved > 1, 'possessed queen did not move under setIntent', { before, after: s3.possessed.pos });
  expect(s3.possessed.up.every(Number.isFinite) && Math.abs(Math.hypot(...s3.possessed.up) - 1) < 0.01, 'queen up vector broken', s3.possessed.up);

  // third-person screenshot: camera behind and above the ant
  await g(() => window.__game.renderFrame());
  const cam = await g(() => window.__game.summary());
  const clear = await g(() => window.__game.camera.clearance());
  result.camera = { state: cam.camera.state, clearance: clear };
  expect(cam.camera.state !== null, 'no possession camera state');
  expect(clear.f >= clear.radius * 0.5, 'camera inside solid', clear);
  await shot('third-person');

  // stepping without rendering, then one render shows the advanced state
  const big = await g(() => window.__game.step(1000));
  result.step1000Ms = big.ms;
  await g(() => window.__game.renderFrame());

  // observer: release, then pull the follow camera out to show the surroundings
  await g(() => window.__game.release());
  const s4 = await g(() => window.__game.summary());
  expect(s4.view === 'observer' && s4.possessed === null, 'release did not switch to observer', { view: s4.view });
  expect(s4.camera.followId === s1.possessed.id, 'observer should follow the released queen', s4.camera);
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await shot('observer-follow');
  // free-fly observer above the queen: the surroundings
  await g(() => window.__game.camera.free());
  await g(() => window.__game.renderFrame({ settle: 0.5 }));
  await shot('observer');

  // time scale in observer: 8x allowed; possession drops back to 1x
  await g(() => window.__game.setSpeed(8));
  const s5 = await g(() => window.__game.summary());
  expect(s5.time.speed === 8, 'observer should allow 8x', s5.time);
  await g(() => window.__game.possess('queen'));
  const s6 = await g(() => window.__game.summary());
  expect(s6.time.speed === 1 && s6.view === 'possess', 'possession at 8x should drop to 1x', s6.time);
  // pause and resume
  await g(() => window.__game.setSpeed(0));
  const s7 = await g(() => window.__game.summary());
  expect(s7.time.paused === true && s7.time.speed === 0, 'pause failed', s7.time);
  await g(() => window.__game.setSpeed(2));
  const s8 = await g(() => window.__game.summary());
  expect(s8.time.paused === false && s8.time.speed === 2, 'resume at 2x failed', s8.time);

  result.perf = await g(() => window.__game.perf());
  expect(result.perf.drawCalls > 0 && result.perf.triangles > 0 && result.perf.ants >= 1, 'perf() incomplete', result.perf);
  expect(typeof result.perf.simMsPerTick === 'number', 'perf() has no sim time per tick', result.perf);
  result.hash = await g(() => window.__game.stateHash());
  result.final = { tick: s8.tick, view: s8.view, possessed: s8.possessed?.id ?? null };
  return result;
};
