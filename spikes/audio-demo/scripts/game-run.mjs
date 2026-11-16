// The audio in the real game (audio-pass acceptance 3): a 60 s scripted run with rain, a footstep event, digging and a
// bird; the cues the audio plays are collected from `window.__foundressAudio.cueLog()` (a ring of the last 50, so it is
// polled every simulated second), the loudness monitor is sampled, and Settings > Audio is screenshotted at the end.
// `?test=1` silences audio by design; `&audio=on` (src/audio/gameAudio.ts) lets the audio ignore it while the game
// stays deterministic and stepped. The gesture rule is real: the context starts only on the script's click.
//   node tools/harness/play.mjs --root . --query "test=1&audio=on&autostart=1&seed=3&quality=low" \
//        --script spikes/audio-demo/scripts/game-run.mjs --out test-output/audio-pass --script-timeout 900000 --timeout 240000
import fs from 'node:fs';
import path from 'node:path';

export default async ({ page, shot, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const result = { checks: {}, cues: {}, loudness: [], findings: [] };
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`game-run: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const cheat = (name, ...a) => g(([n, args]) => window.__game.cheat[n](...args), [name, a]);
  const q = (name, ...a) => g(([n, args]) => window.__game.query[n](...args), [name, a]);

  // ---- the gesture rule --------------------------------------------------------------------------------------
  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  result.checks.beforeGesture = await g(() => ({ status: window.__foundressAudio.status(), debug: window.__foundressAudio.debug() }));
  expect(result.checks.beforeGesture.status === 'off', 'audio started before any gesture', result.checks.beforeGesture);
  await wait(1500);
  expect((await g(() => window.__foundressAudio.status())) === 'off', 'audio started without a gesture after 1.5 s');
  await page.mouse.click(640, 360); // a trusted click: the user gesture
  for (let i = 0; i < 40 && (await g(() => window.__foundressAudio.status())) !== 'running'; i++) await wait(250);
  result.checks.afterGesture = await g(() => window.__foundressAudio.status());
  log('status after the click:', result.checks.afterGesture);
  expect(result.checks.afterGesture === 'running', 'audio did not start after the click', result.checks.afterGesture);

  // ---- setup: the opening handed over, a worker possessed ---------------------------------------------------
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  if (!(await handedOver())) {
    await cheat('completeFounding', 10);
    for (let i = 0; i < 120 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click();
  const stay = page.locator('[data-testid="founding-stay"]');
  if (await stay.count()) await stay.first().click();
  await g(() => window.__game.release());
  const nest = (await q('nest'))[0];
  const worker = (await q('ants')).find((a) => a.caste === 'worker' && a.alive !== false);
  expect(worker, 'no worker to possess');
  const pr = await g((id) => window.__game.possess(id), worker.id);
  log('possess', JSON.stringify(pr));
  await g(() => window.__game.step(10));
  const me = (await q('ants')).find((a) => a.id === worker.id);
  const here = me.pos;
  const bu = (await q('world')).bu;
  const ahead = (d) => ({ x: here.x + d * bu, y: here.y, z: here.z });

  // ---- the 60 s script -----------------------------------------------------------------------------------------
  const seen = new Map();
  const collect = async (label) => {
    const entries = await g(() => window.__foundressAudio.cueLog());
    for (const e of entries) {
      const key = `${e.t}|${e.cue}|${e.source}|${e.distBu}`;
      if (!seen.has(key)) { seen.set(key, e); result.cues[e.cue] = (result.cues[e.cue] ?? 0) + 1; }
    }
    if (label) result.loudness.push({ at: label, ...(await g(() => window.__foundressAudio.loudness())) });
  };
  const second = async (n = 1) => {
    for (let i = 0; i < n; i++) {
      await g(() => window.__game.step(10)); // one game second
      await wait.frames(2); // the audio frame drains the events
      await collect(null);
    }
  };

  await cheat('setWeatherClass', 'rain', 'downpour'); // rain begins: first-drops volley, the bed follows the precipitation
  await second(4);
  await collect('rain-onset');
  await cheat('triggerEvent', 'footsteps', ahead(30), 0); // a giant footstep event near the possessed ant
  await second(8);
  await collect('footsteps');
  await g(() => window.__game.setIntent({ dir: { x: 1, y: 0, z: 0 }, hurry: false, held: [] })); // walk: the ant's own steps
  await second(6);
  for (let i = 0; i < 10; i++) { // dig: bites on the ground ahead
    await g(() => { window.__game.act('dig-bite'); window.__game.step(8); });
    await wait.frames(2);
    await collect(null);
  }
  await collect('digging');
  await cheat('triggerBird', ahead(12), true); // a bird lands near the nest
  await second(10);
  await collect('bird');
  await second(22); // the rest of the minute: rain, wind, whatever the sim emits
  await collect('end');
  const tickEnd = (await g(() => window.__game.summary())).tick;
  log('game ticks stepped:', tickEnd);
  result.checks.ticks = tickEnd;

  // ---- what must have sounded ----------------------------------------------------------------------------------
  const cues = Object.keys(result.cues);
  const has = (re) => cues.some((c) => re.test(c));
  result.checks.expected = {
    rain: has(/^raindrop-hit$/) || has(/ambience/),
    footfall: has(/^giant\.footsteps$/),
    tremor: has(/^giant\.tremor$/),
    steps: has(/^step$/),
    digging: has(/^dig-bite/) || has(/^wood-chew$/),
    birdWhoosh: has(/^ev\.bird-whoosh$/) || has(/^bird-strike$/),
  };
  log('cues:', JSON.stringify(result.cues));
  log('expected:', JSON.stringify(result.checks.expected));
  const missing = Object.entries(result.checks.expected).filter(([, ok]) => !ok).map(([k]) => k);
  if (missing.length) result.findings.push(`missing expected cues: ${missing.join(', ')}`);
  result.checks.debug = await g(() => window.__foundressAudio.debug());
  result.checks.loudness = result.loudness;
  log('loudness samples:', JSON.stringify(result.loudness));

  // ---- Settings > Audio ------------------------------------------------------------------------------------------
  await g(() => window.__game.ui.open('pause')); // `__game.ui.open` knows only the pause menu: Settings is one click away
  await wait(500);
  const settingsBtn = page.getByRole('button', { name: /^settings$/i });
  if (await settingsBtn.count()) await settingsBtn.first().click();
  await wait(500);
  const tab = page.getByRole('tab', { name: 'Audio' });
  if (await tab.count()) await tab.first().click();
  await wait(600);
  result.checks.statusLine = await g(() => { const el = document.querySelector('[data-testid="audio-status"]'); return el ? { text: el.textContent, status: el.getAttribute('data-status') } : null; });
  log('status line:', JSON.stringify(result.checks.statusLine));
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'game-run.json'), JSON.stringify({ ...result, cueLogSample: [...seen.values()].slice(-60) }, null, 1));
  // the screenshot of a busy software-GL page can exceed the helper's 30 s: take it directly, with room
  try {
    await page.screenshot({ path: path.join(out, 'settings-audio.png'), timeout: 240000 });
    result.checks.screenshot = 'settings-audio.png';
  } catch (e) { result.findings.push(`settings screenshot failed: ${String(e.message).split('\n')[0]}`); }
  expect(result.checks.statusLine && result.checks.statusLine.status === 'running', 'the status line does not say running', result.checks.statusLine);
  expect(missing.length === 0, `expected cues missing: ${missing.join(', ')}`, result.cues);
  return { status: result.checks.afterGesture, cues: result.cues, loudness: result.loudness.map((l) => [l.at, l.shortTermLufs]), ticks: tickEnd };
};
