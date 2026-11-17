// Gate play-through with pictures (task gate-close-app step 4): after the hand-over, 20 minutes of play at 1x then 20
// at 4x, a screenshot every 2 minutes, in turn from observer, possession, colony slice and scent view; then
// (PLAY_DAYNIGHT=1) one full day-night cycle at 8x with a shot every 2 game hours.
// "Minutes" are REAL minutes of play: one game minute is only about 4 ticks (1 game day = 6000 ticks), so 20 game
// minutes would be 8 real seconds at 1x. The harness runs on a manual clock (window.__game.step(n) advances n ticks
// whatever the speed setting), so the script itself scales the ticks by the speed: a 2-minute interval is
// 2 x REAL_MIN_TICKS x speed ticks (1200 at 1x = 4.8 game hours, 4800 at 4x = 19.2 game hours). Shot names carry
// the speed and the real minute: x1-r02-observer.png, x4-r10-slice.png.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=high" --script tests/e2e/playthrough.mjs \
//        --out test-output/gate-close/app/play/seed1 --timeout 900000 --script-timeout 7200000
// Environment: PLAY_ARCH=kitchen-door (new game of that archetype first), PLAY_SEED=1, PLAY_MINUTES=20 (per speed),
// PLAY_DAYNIGHT=1. The opening is completed by the founding cheat and the time-lapse skipped (real first workers),
// recorded in result.standIns. Every shot is listed in result.shots with time of day, view and colony numbers.
const REAL_MIN_TICKS = 600; // ticks in one real minute at 1x (10 ticks per real second)
const HOUR_TICKS = 250; // ticks per game hour (1 game day = 6000 ticks)

export default async ({ page, log, out }) => {
  const env = process.env;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`playthrough: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const step = (n) => g((k) => window.__game.step(k), n);
  const render = (settle = 0.5) => g((s) => window.__game.renderFrame({ settle: s }), settle);
  const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const result = { shots: [], standIns: ['opening completed by cheat.completeFounding + time-lapse skip'], colony: [] };

  if (env.PLAY_ARCH) await g(({ a, s }) => window.__game.newGame({ seed: s, archetype: a }), { a: env.PLAY_ARCH, s: Number(env.PLAY_SEED ?? 1) });
  const world = await g(() => window.__game.query.world());
  const bu = world.bu;
  result.world = { archetype: world.archetype ?? env.PLAY_ARCH ?? 'default', seed: world.seed ?? null };

  // --- the opening, by cheat; the time-lapse skipped so the first workers are the sim's own ---------------------------
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.cheat.completeFounding(10));
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  for (let i = 0; i < 200 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  expect(await handedOver(), 'the opening was not handed over');
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click().catch(() => {});
  await step(2);
  const census = async () => g(() => {
    const s = window.__game.summary();
    return { time: s.time.label, weather: s.weather.state, colony: s.colony, brood: s.brood, alerts: (s.alerts ?? []).map((a) => `${a.kind}:${a.level}`) };
  });
  log('handed over', JSON.stringify(await census()));
  const myColony = await g(() => window.__game.summary().colony?.id);
  const nests = await g(() => window.__game.query.nest());
  const nest = nests.find((n) => n.colony === myColony) ?? nests[0];
  const origin = nest.entrances[0]?.pos ?? nest.origin;
  const cell = nest.chambers[0]?.center ?? origin;

  // --- the four views ---------------------------------------------------------------------------------------------------
  const scentOff = () => g(() => window.__game.fx.overlay('scent', false));
  const views = {
    observer: async () => {
      await scentOff();
      await g(() => window.__game.release());
      await g(() => window.__game.camera.set('observer'));
      await g(({ o, bu }) => window.__game.camera.setPose({ x: o.x - 30 * bu, y: o.y + 24 * bu, z: o.z - 30 * bu }, o), { o: origin, bu });
    },
    possession: async () => {
      await scentOff();
      let r = await g(() => window.__game.possess('forager'));
      if (!r?.ok) r = await g(() => window.__game.possess('worker'));
      if (!r?.ok) r = await g(() => window.__game.possess('queen'));
      await step(2);
    },
    slice: async () => {
      await scentOff();
      await g(() => window.__game.release());
      await g(() => window.__game.camera.set('colony'));
      await g((o) => window.__game.views.colonyCamera(o), { x: cell.x, z: cell.z, distBu: 16, pitchDeg: 55, yawDeg: 20, cutaway: 'slice', planeYBu: cell.y / bu + 1, radiusBu: 40 });
    },
    scent: async () => {
      await g(() => window.__game.release());
      await g(() => window.__game.camera.set('observer'));
      await g(({ o, bu }) => window.__game.camera.setPose({ x: o.x - 20 * bu, y: o.y + 30 * bu, z: o.z - 20 * bu }, o), { o: origin, bu });
      await g(() => window.__game.fx.overlay('scent', true));
    },
  };
  const order = ['observer', 'possession', 'slice', 'scent'];
  let k = 0;
  const shotNow = async (tag) => {
    const v = order[k++ % order.length];
    await views[v]();
    await render(0.5);
    await frames();
    const c = await census();
    const file = `${out}/${tag}-${v}.png`;
    await page.screenshot({ path: file, timeout: 300000 });
    result.shots.push({ file, view: v, ...c });
    log('shot', file, JSON.stringify(c));
  };

  // --- 20 real minutes at 1x, then 20 at 4x, a shot every 2 real minutes ------------------------------------------------
  const minutes = Number(env.PLAY_MINUTES ?? 20);
  for (const speed of [1, 4]) {
    const tickAtStart = await g(() => window.__game.summary().tick);
    for (let m = 2; m <= minutes; m += 2) {
      await g((s) => window.__game.setSpeed(s), speed); // again each time: taking an ant drops to 1x (dropTo1xOnPossess)
      await step(2 * REAL_MIN_TICKS * speed);
      await shotNow(`x${speed}-r${String(m).padStart(2, '0')}`);
    }
    const ticks = (await g(() => window.__game.summary().tick)) - tickAtStart;
    result.colony.push({ after: `${minutes} real min at ${speed}x`, ticks, gameHours: +(ticks / HOUR_TICKS).toFixed(1), ...(await census()) });
  }

  // --- one day-night cycle at 8x, a shot every 2 game hours (observer: 8x is refused while possessing) --------------------
  if (env.PLAY_DAYNIGHT) {
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    await g(() => window.__game.setSpeed(8));
    for (let h = 2; h <= 24; h += 2) {
      await step(2 * HOUR_TICKS);
      await scentOff();
      await g(() => window.__game.camera.set('observer'));
      await g(({ o, bu }) => window.__game.camera.setPose({ x: o.x - 30 * bu, y: o.y + 18 * bu, z: o.z - 30 * bu }, o), { o: origin, bu });
      await render(0.5);
      await frames();
      const c = await census();
      const file = `${out}/day-h${String(h).padStart(2, '0')}.png`;
      await page.screenshot({ path: file, timeout: 300000 });
      result.shots.push({ file, view: 'observer-8x', ...c });
      log('shot', file, JSON.stringify(c));
    }
    result.colony.push({ after: 'day-night at 8x', ...(await census()) });
  }
  return result;
};
