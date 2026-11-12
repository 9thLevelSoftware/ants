// Behaviour checks of the HUD demo (task ui-hud acceptance 5): the HUD outside the tab order with the alert feed entered by
// backquote (or LB + View on a pad) and left by Esc (or B), a mouse click never leaving the focus on a chip, every drawer
// control reachable from the keyboard with a visible focus ring, gamepad movement inside an open drawer, linked sliders,
// alert throttling in the page, roster virtualisation, speed and pause buttons, the 8x lock, no remote requests.
//   node tools/harness/play.mjs --root spikes/hud-demo --script spikes/hud-demo/scripts/behaviour.mjs --query "scene=queen&anchor=1"
export default async ({ page, log, wait, context }) => {
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`hud-behaviour: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const g = (fn, arg) => page.evaluate(fn, arg);
  const out = {};
  const remote = [];
  context.on('request', (r) => { const u = r.url(); if (!/^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(u)) remote.push(u); });
  const active = () => g(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const cs = getComputedStyle(el);
    const revisit = el.dataset.hudSeen === '1';
    el.dataset.hudSeen = '1';
    return { revisit, tag: el.tagName, label: el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 30) ?? '', testid: el.dataset?.testid ?? '', ring: cs.outlineStyle !== 'none' || cs.boxShadow !== 'none' || !!el.closest('.ui-slider-track') };
  });
  const tabThrough = async (limit = 80) => {
    await g(() => document.querySelectorAll('[data-hud-seen]').forEach((e) => e.removeAttribute('data-hud-seen')));
    const seen = [];
    for (let i = 0; i < limit; i++) {
      await page.keyboard.press('Tab');
      const a = await active();
      if (!a) continue;
      if (a.revisit) break;
      seen.push({ key: `${a.tag}|${a.label}|${a.testid}`, ...a });
    }
    return seen;
  };

  // --- keyboard reach of the HUD (GDD 08 section 8: the HUD is not in the tab order; the feed is entered with backquote) ---
  const chipsInTabOrder = await g(() => [...document.querySelectorAll('.fd-root button, .fd-root [tabindex], .fd-root a[href], .fd-root input')]
    .filter((el) => !el.closest('.fd-drawer, .fd-alert-menu') && el.tabIndex >= 0).map((el) => el.getAttribute('aria-label') ?? el.className));
  expect(chipsInTabOrder.length === 0, 'HUD chips are in the tab order', chipsInTabOrder);
  let seen = await tabThrough(12);
  expect(seen.every((s) => !/Normal speed|^Colony$|Protein short|Colony orders/.test(s.label)), 'Tab walked into the HUD', seen.map((s) => s.label));
  out.hudTabStops = seen.length;
  // backquote enters the alert feed, with a visible focus ring; arrows move between cards; Esc hands the focus back
  await page.keyboard.press('Backquote');
  let a = await active();
  expect(a && /Protein short|alert|New food|Rain/i.test(a.label), 'backquote did not enter the alert feed', a);
  expect(a.ring, 'the focused alert card shows no focus indicator', a);
  const firstCard = a.label;
  await page.keyboard.press('ArrowDown');
  a = await active();
  expect(a && a.label !== firstCard, 'arrow down did not move to the next alert card', a);
  await page.keyboard.press('Escape');
  expect(await active() === null, 'Esc did not hand the focus back to the game');
  // gamepad: LB + View enters the feed, X opens the card menu, B leaves
  await g(() => { window.__fakePad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0, 0, 0], connected: true, id: 'test pad', index: 0, mapping: 'standard' }; navigator.getGamepads = () => [window.__fakePad]; window.dispatchEvent(new Event('gamepadconnected')); });
  const press = async (...ids) => { await g((ks) => ks.forEach((k) => { window.__fakePad.buttons[k].pressed = true; }), ids); await wait.frames(4); await g((ks) => ks.forEach((k) => { window.__fakePad.buttons[k].pressed = false; }), ids); await wait.frames(3); };
  await g(() => { window.__fakePad.buttons[4].pressed = true; });
  await press(8); // View, with LB held
  await g(() => { window.__fakePad.buttons[4].pressed = false; });
  a = await active();
  expect(a && /Protein short|alert|New food|Rain/i.test(a.label), 'LB + View did not enter the alert feed', a);
  await press(2); // X: the card menu
  expect(await g(() => !!document.querySelector('.fd-alert-menu')), 'X did not open the alert card menu');
  await page.keyboard.press('Escape'); // closes the menu, focus stays on the card
  await wait.frames(2);
  await press(1); // B: back to the game
  expect(await active() === null, 'B did not hand the focus back to the game');
  // a mouse click on a chip never leaves the focus on it, so Space cannot press it again (the review's reproduction)
  await page.locator('[data-testid="speed-pause"]').click(); // paused
  await page.locator('[data-testid="speed-pause"]').click(); // running again: the later checks start from the same state
  expect(await active() === null, 'a mouse click left the focus on the pause button', await active());
  const pausedBefore = await g(() => document.querySelector('[data-testid="speed-pause"]').getAttribute('aria-pressed'));
  await page.keyboard.press('Space');
  await wait.frames(2);
  expect(await g(() => document.querySelector('[data-testid="speed-pause"]').getAttribute('aria-pressed')) === pausedBefore, 'Space pressed the pause button again');
  // the Colony orders doorway is reachable without the tab order: the I key opens it (button and prompt are pointer doorways)
  expect(await g(() => !!document.querySelector('[data-testid="colony-orders-button"]')), 'the Colony orders button is missing in the queen scene');

  await page.keyboard.press('KeyI');
  await wait.frames(4);
  expect(await g(() => !!document.querySelector('.fd-directives')), 'I should open Directives');
  seen = await tabThrough(120);
  const orderLabels = seen.map((s) => s.label.toLowerCase());
  for (const need of ['forage share', 'nurse share', 'dig share', 'defend share', 'workers only', 'when alates are ready', 'about colony orders', 'auto', 'normal', 'keep foragers in', 'defensive', 'seal entrances in cold weather', 'close']) {
    expect(orderLabels.some((l) => l.includes(need)), `Directives control not reachable by keyboard: ${need}`, orderLabels);
  }
  expect(seen.every((s) => s.ring), 'a Directives control shows no focus indicator', seen.filter((s) => !s.ring));
  out.directivesTabStops = seen.length;

  // linked sliders in the page: moving Forage by keyboard keeps the sum at 100 and the lock holds
  await g(() => { document.querySelector('[data-group="nurse"] .ui-iconbtn')?.click(); });
  await g(() => document.querySelector('[data-group="forage"] [role="slider"]').focus());
  for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowRight');
  await wait(700);
  const shares = await g(() => Object.fromEntries(['forage', 'nurse', 'dig', 'defend'].map((k) => [k, Number(document.querySelector(`[data-group="${k}"] [role="slider"]`).getAttribute('aria-valuenow'))])));
  expect(Object.values(shares).reduce((a, b) => a + b, 0) === 100, 'slider shares do not sum to 100', shares);
  expect(shares.nurse === 30, 'the locked Nurse share moved', shares);
  expect(shares.forage === 55, 'Forage did not move by 4 steps of 5', shares);
  const sent = await g(() => window.__hudDemo.facade.commands.filter((c) => c.type === 'setDirectives'));
  expect(sent.length === 1 && sent[0].allocation && Math.round(Object.values(sent[0].allocation).reduce((a, b) => a + b, 0)) === 100, 'one setDirectives per burst', sent);
  out.shares = shares;

  // gamepad: the D-pad moves focus inside the drawer, A activates, B closes it
  await g(() => document.querySelector('[data-group="forage"] [role="slider"]').focus());
  const forageBefore = await g(() => document.querySelector('[data-group="forage"] [role="slider"]').getAttribute('aria-valuenow'));
  await press(13); // down
  const afterDown = await active();
  expect(await g(() => document.querySelector('[data-group="forage"] [role="slider"]').getAttribute('aria-valuenow')) === forageBefore, 'D-pad down nudged the slider it left');
  expect(afterDown && afterDown.label !== 'Forage share', 'D-pad down did not move focus inside the drawer', afterDown);
  out.padFocus = afterDown.label;
  await press(1); // B
  await wait.frames(3);
  expect(await g(() => !document.querySelector('.fd-directives')), 'B did not close the drawer');

  // --- roster: virtualisation, search, sort, keyboard rows ------------------------------------------------------------
  await page.keyboard.press('KeyL');
  await wait.frames(5);
  const rowCount = await g(() => document.querySelectorAll('[data-testid="roster-row"]').length);
  expect(rowCount > 5 && rowCount <= 60, 'roster rows out of budget', rowCount);
  expect(/1500 ants/.test(await g(() => document.querySelector('[data-testid="roster-count"]').textContent)), 'roster total');
  await g(() => { const b = document.querySelector('[data-testid="roster-body"]'); b.scrollTop = 20000; });
  await wait.frames(6);
  const rowCount2 = await g(() => document.querySelectorAll('[data-testid="roster-row"]').length);
  expect(rowCount2 > 0 && rowCount2 <= 60, 'roster rows after scrolling', rowCount2);
  const firstIdx = await g(() => Number(document.querySelector('[data-testid="roster-row"]').dataset.index));
  expect(firstIdx > 100, 'the roster window did not follow the scroll', firstIdx);
  await g(() => { document.querySelector('[data-testid="roster-body"]').scrollTop = 0; });
  await page.locator('[data-testid="roster-search"]').fill('0412');
  await wait.frames(6);
  const shown = await g(() => document.querySelector('[data-testid="roster-count"]').textContent);
  expect(/^\d+ ants?$/.test(shown) && Number(shown.split(' ')[0]) < 1500, 'search did not narrow the roster', shown);
  await page.locator('[data-testid="roster-search"]').fill('');
  await wait.frames(5);
  await page.locator('[data-testid="roster-sort-health"]').click();
  await wait.frames(5);
  expect(await g(() => document.querySelector('[data-testid="roster-sort-health"]').closest('[role="columnheader"]').getAttribute('aria-sort')) !== 'none', 'sort header state');
  // keyboard on rows: focus the first row, arrow down, Enter possesses
  await g(() => document.querySelector('[data-testid="roster-row"]').focus());
  await page.keyboard.press('ArrowDown');
  await wait.frames(3);
  const focusedRow = await g(() => document.activeElement?.dataset?.id ?? null);
  expect(focusedRow !== null, 'arrow down did not move to a row');
  await page.keyboard.press('Enter');
  await wait.frames(3);
  const possessCalls = await g(() => window.__hudDemo.facade.calls.filter((c) => c.startsWith('possess')));
  expect(possessCalls.some((c) => c === `possess ${focusedRow}`), 'Enter on a row did not possess it', possessCalls);
  out.rosterRows = [rowCount, rowCount2];
  await page.keyboard.press('Escape');
  await wait.frames(3);

  // --- time controls ----------------------------------------------------------------------------------------------------
  await g(() => document.querySelector('[data-testid="speed-pause"]').click());
  await wait.frames(3);
  expect(await g(() => document.querySelector('[data-testid="speed-pause"]').getAttribute('aria-pressed')) === 'true', 'pause not pressed');
  await g(() => document.querySelector('[data-testid="speed-4"]').click());
  await wait.frames(3);
  expect(await g(() => document.querySelector('[data-testid="speed-4"]').getAttribute('aria-pressed')) === 'true', '4x not pressed');
  expect(await g(() => document.querySelector('[data-testid="speed-8"]').getAttribute('aria-disabled')) === 'true', '8x should be locked while possessing');

  // --- alert throttling in the page (GDD 08 App. E checks 4 and 5) -----------------------------------------------------
  // a fresh page with no alerts, then five at once: three cards and "+2 more", at most four toasts
  const u = new URL(page.url());
  u.search = 'scene=empty&anchor=1';
  await page.goto(u.toString());
  await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
  expect(await g(() => window.__hud.alerts().cards.length) === 0, 'the empty scene should have no alert cards');
  await g(() => window.__hudDemo.setAlerts('many'));
  await wait.frames(6);
  const feed = await g(() => window.__hud.alerts());
  expect(feed.cards.length === 3 && feed.more === 2, 'alert stack', { cards: feed.cards.length, more: feed.more });
  expect(feed.toasts.length <= 4, 'more than 4 toasts', feed.toasts.length);
  out.alerts = { cards: feed.cards.length, more: feed.more, toasts: feed.toasts.length };

  expect(remote.length === 0, 'remote requests', remote);
  out.remoteRequests = remote.length;
  log('behaviour ok', JSON.stringify(out));
  return out;
};
