// app-seams-2 pictures: the opening card with no prompt over it, the Focus line on a new colony, the minimap in the
// possession and observer views (an entrance and a marker in view, scent view on), the Gameplay settings rows.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/appSeams2.mjs \
//        --out test-output/app-seams-2/hud --timeout 300000 --script-timeout 1500000
// The hand-over is reached by `cheat.completeFounding` (the colony does not grow reliably in the sim), and the trail cells
// the scent view draws are deposited by hand: both are stage settings, stated in the report.
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`appSeams2: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const shot = (name) => page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
  const frames = (n = 3) => g(async (k) => { for (let i = 0; i < k; i++) await new Promise((r) => requestAnimationFrame(() => r())); }, n);
  const hudBoxes = () => g(() => ({
    prompts: document.querySelectorAll('[data-hud="prompts"]:not([hidden])').length, hint: document.querySelectorAll('.fd-hint, [data-testid="hint-card"]').length,
    focus: document.querySelector('[data-testid="focus-line"]')?.textContent ?? null, minimap: !!document.querySelector('[data-testid="minimap"]'),
    marks: Array.from(document.querySelectorAll('[data-mm]')).map((e) => e.getAttribute('data-mm')),
  }));

  // 1. the opening: the intro card, nothing over it
  await frames(4);
  const intro = await g(() => ({ card: !!document.querySelector('[data-testid="intro-card"], .on-card, .fd-intro'), mode: window.__game.summary().mode, prompt: window.__game.summary().prompt ?? null }));
  log('intro', JSON.stringify(intro), JSON.stringify(await hudBoxes()));
  await shot('01-intro-card');

  // 2. past the card: the new colony shows the Focus line; the minimap is on
  await g(() => window.__hud.game.setSettings({ gameplay: { minimap: 'always', focusLine: 'auto' } }));
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await frames(6);
  const open1 = await hudBoxes();
  log('opening hud', JSON.stringify(open1));
  expect(open1.focus && open1.focus.startsWith('Aim:'), 'focus line on a new colony', open1);
  expect(open1.minimap, 'minimap mounted', open1);
  await shot('02-opening-focus-minimap');

  // 3. the hand-over (cheat), an entrance and a marker, the scent view with trail cells
  await g(() => window.__game.cheat.completeFounding(10));
  const handedOver = () => g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  for (let i = 0; i < 200 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click().catch(() => {});
  await g(() => window.__game.step(20));
  const stage = await g(() => {
    const game = window.__hud.game, sim = game.session.sim;
    const col = sim.state.colonies.find((c) => c.isPlayer).id;
    const nest = sim.state.nests.find((n) => n.colony === col);
    const e = nest.entrances[0];
    const p = e.pos;
    window.__game.command({ type: 'placeMarker', kind: 'forage', pos: { x: p.x + 30 * sim.world.bu, y: p.y, z: p.z - 40 * sim.world.bu }, radius: 120 });
    window.__game.command({ type: 'placeMarker', kind: 'avoid', pos: { x: p.x - 50 * sim.world.bu, y: p.y, z: p.z + 20 * sim.world.bu }, radius: 80 });
    // a hand-made trail from the entrance towards the forage marker
    for (let i = 0; i < 40; i++) {
      const t = i / 40;
      sim.phero.deposit(col, 'trail', { x: p.x + t * 30 * sim.world.bu, y: p.y + 1, z: p.z - t * 40 * sim.world.bu }, 8 + 3 * (1 - t));
    }
    window.__game.fx.overlay('scent', true);
    return { entrance: { ...p }, status: e.status, workers: window.__game.summary().colony?.workers ?? null };
  });
  log('stage', JSON.stringify(stage));
  await g(() => window.__game.step(2));

  // possession: a worker near the entrance (the observer camera is pointed at the entrance first)
  const possess = await g(() => {
    const sim = window.__hud.game.session.sim, p = sim.state.nests.find((n) => n.colony === sim.state.colonies.find((c) => c.isPlayer).id).entrances[0].pos;
    const ants = sim.state.ants.filter((a) => a.alive && a.caste === 'worker');
    if (!ants.length) return { ok: false };
    ants.sort((a, b) => Math.hypot(a.pos.x - p.x, a.pos.z - p.z) - Math.hypot(b.pos.x - p.x, b.pos.z - p.z));
    return { ok: true, id: ants[0].id, n: ants.length, d: Math.hypot(ants[0].pos.x - p.x, ants[0].pos.z - p.z) };
  });
  log('worker', JSON.stringify(possess));
  if (possess.ok) await g((id) => window.__game.teleport(id, window.__hud.game.session.sim.state.nests[0].entrances[0].pos) && window.__game.possess(id), possess.id);
  await g(() => window.__game.step(10));
  await g(() => window.__game.renderFrame());
  await frames(8);
  const poss = await hudBoxes();
  log('possession hud', JSON.stringify(poss), JSON.stringify(await g(() => window.__game.camera.view())));
  expect(poss.marks.includes('ant'), 'minimap shows the possessed ant', poss);
  expect(poss.marks.includes('entrance'), 'minimap shows an entrance', poss);
  expect(poss.marks.includes('marker'), 'minimap shows a marker', poss);
  await shot('03-possession-minimap-scent');
  const plateCanvas = await g(() => { const c = document.querySelector('.fd-minimap-plate'); return { w: c.width, h: c.height }; });
  log('plate', JSON.stringify(plateCanvas));

  // observer view
  await g(() => window.__game.release());
  await g(() => window.__game.step(3));
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.camera.free()); // fly free above the entrance: the staging put the camera in the mound
  await g(() => window.__game.renderFrame());
  await frames(8);
  const obs = await hudBoxes();
  log('observer hud', JSON.stringify(obs), JSON.stringify(await g(() => window.__game.camera.view())));
  expect(obs.marks.includes('entrance') && obs.marks.includes('marker') && !obs.marks.includes('ant'), 'observer: entrance and marker, no arrow', obs);
  await shot('04-observer-minimap-scent');

  // a click on the minimap pans the observer there
  const before = await g(() => window.__hud.game.session.focus());
  const box = await page.locator('.fd-minimap-box').boundingBox();
  await page.mouse.click(box.x + box.width * 0.85, box.y + box.height * 0.2);
  await g(() => window.__game.renderFrame());
  await frames(6);
  const after = await g(() => window.__hud.game.session.focus());
  log('click pan', JSON.stringify({ before, after }));
  expect(Math.hypot(after.x - before.x, after.z - before.z) > 100, 'the click panned the camera', { before, after });
  await shot('05-observer-after-click');

  // 4. the focus line when a new aim opens: the colony is past its first 2 days (the hand-over lapse), the top aim is closed by hand
  //    (staging: no milestone fired in the cheat run) and the next one opens: Auto shows it for 30 real seconds
  await g(() => window.__game.fx.overlay('scent', false));
  const aimBefore = await g(() => window.__hud.game.lastSnapshot?.focusAim ?? null);
  await g(() => {
    const sim = window.__hud.game.session.sim, top = sim.state.progression.aims.filter((a) => a.state === 'open').sort((a, b) => a.openedTick - b.openedTick)[0];
    if (top) { top.state = 'done'; top.doneTick = sim.state.tick; }
    window.__game.step(2);
    window.__hud.game.refreshUi();
  });
  await frames(6);
  const aimAfter = await g(() => window.__hud.game.lastSnapshot?.focusAim ?? null);
  const hudFocus = await hudBoxes();
  log('focus aim aimBefore/aimAfter', JSON.stringify(aimBefore), JSON.stringify(aimAfter), JSON.stringify(hudFocus));
  expect(aimAfter && aimAfter.newColony === false && hudFocus.focus && hudFocus.focus.startsWith('Aim:'), 'the focus line shows a newly opened aim', { aimAfter, hudFocus });
  await shot('06-focus-line-new-aim');

  // 5. the journal across a winter: the clock is set into the winter, entries written aimBefore keep their own dates
  await g(() => window.__game.cheat.setTime(22 * 6000 + 3000));
  await g(() => window.__game.step(300));
  await page.keyboard.press('KeyJ');
  await page.waitForSelector('[data-testid="journal-aims"], .pn-book', { timeout: 60000 });
  await page.locator('.pn-book [role="tab"]', { hasText: 'Log' }).click().catch(() => {});
  await frames(4);
  await shot('07-journal-log-across-winter');
  const rows = await g(() => Array.from(document.querySelectorAll('.pn-log-time')).slice(-8).map((e) => e.textContent));
  log('log times', JSON.stringify(rows));
  await page.locator('.pn-book [role="tab"]', { hasText: 'Milestones' }).click().catch(() => {});
  await frames(4);
  await shot('08-journal-milestones-across-winter');
  await page.keyboard.press('Escape');

  // 6. Settings > Gameplay (pause menu), the rows and then the bottom of the tab
  await g(() => window.__game.ui.open('pause'));
  await page.waitForSelector('[data-testid="pause-settings"]', { timeout: 60000 });
  await page.locator('[data-testid="pause-settings"]').click();
  await page.locator('.ui-book [role="tab"]', { hasText: 'Gameplay' }).click();
  await frames(5);
  await shot('09-settings-gameplay-top');
  await page.evaluate(() => { const sc = document.querySelector('.ui-book .ui-scroll, .ui-book [class*="scroll"]'); if (sc) sc.scrollTop = sc.scrollHeight; });
  await frames(4);
  await shot('10-settings-gameplay-bottom');

  // 7. New colony: species, locality, the rules with the preset text, then the custom rules and the preset table
  await g(() => window.__game.endGame());
  await frames(6);
  await page.locator('[data-testid="menu-new"]').click();
  await frames(6);
  await shot('11-new-game');
  const help = await g(() => document.querySelector('[data-testid="start-help"]')?.textContent ?? null);
  log('start help', help);
  expect(help && /day 5 of Spring/.test(help), 'the start help names the species day (5), not 3', help);
  await page.locator('[data-testid="custom-toggle"]').click();
  await frames(3);
  await page.evaluate(() => { const cols = document.querySelectorAll('.ui-column-scroll'); const c = cols[cols.length - 1]; if (c) c.scrollTop = c.scrollHeight; });
  await frames(4);
  await shot('12-new-game-custom-rules');
  await page.locator('[data-testid="preset-toggle"]').click();
  await frames(3);
  await shot('13-new-game-preset-rows');
  const rivals = await g(() => Array.from(document.querySelectorAll('[data-testid="preset-rows"] .ui-preset-row')).map((e) => e.textContent).filter((t) => /rival/i.test(t ?? '')));
  log('rival rows', JSON.stringify(rivals));
  expect(rivals.every((t) => !/\b1 young rivals\b/.test(t)), 'plural rule on the rival row', rivals);
  return { intro, open1, poss, obs };
};
