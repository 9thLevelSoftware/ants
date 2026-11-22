// app-seams-3 item 5: the queen at the distance a player first sees her (the opening's possession camera), same pose and
// state at every quality; run once per preset, before and after a material change.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=<test|medium|high>" --script tests/e2e/appSeams3-queen.mjs \
//        --out test-output/app-seams-3/queen-<label>-<quality> --script-timeout 900000
// Pictures: 01-default (full frame, the first-play framing), 02-side (orbited 95 degrees), 03-side-close (pulled in to 0.6 of that distance).
export default async ({ page, shot, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(90));
  await g(() => window.__game.command({ type: 'cheat.setWeather', state: 'clear', intensityClass: 0 }));
  await g(() => window.__game.step(30));
  const q = await g(() => window.__game.quality());
  log('quality', JSON.stringify(q));
  await g(() => window.__game.renderFrame({ settle: 3 }));
  await wait.frames(2);
  await shot('01-default');
  // side-on, a little closer: how she reads when a player turns the camera round her
  await g(() => window.__game.camera.orbit(95, 4));
  await g(() => window.__game.renderFrame({ settle: 3 }));
  await wait.frames(2);
  await shot('02-side');
  await g(() => window.__game.camera.zoom(0.6));
  await g(() => window.__game.renderFrame({ settle: 3 }));
  await wait.frames(2);
  await shot('03-side-close');
  return { quality: q };
};
