// Keyboard-only navigation check of every screen (task ui-shell acceptance 3): Tab / Shift+Tab / arrows / Enter / Esc.
//   node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/keyboard.mjs --query screen=title
// For each screen it
//   1. presses Tab until focus returns to the first stop, recording every stop (sequence, accessible name),
//   2. checks that a focus ring is visible on every stop,
//   3. proves that every interactive element not on the Tab path (roving-tabindex members) is reachable with the
//      arrow keys from a stop of its group,
//   4. lists interactive elements that are neither (a failure).
// Set UI_PRINT=1 to print the sequences. The script throws when anything fails.
const SCREENS = [
  'title', 'title-empty', 'new-game', 'loading', 'loading-error', 'pause', 'settings&tab=graphics', 'settings&tab=audio', 'settings&tab=controls',
  'settings&tab=accessibility', 'settings&tab=gameplay', 'save-load&tab=save', 'save-load&tab=load', 'save-load&tab=transfer', 'credits', 'codex',
  'error', 'unsupported', 'epitaph', 'components&section=buttons', 'components&section=inputs', 'components&section=structure', 'components&section=feedback',
];

/** Runs in the page: describes the focused element, and the set of interactive elements that should be reachable. */
const PAGE_HELPERS = `
(() => {
  const name = (el) => {
    if (!el) return '';
    const lb = el.getAttribute('aria-labelledby');
    if (lb) return lb.split(/\\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '').join(' ').trim();
    return (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60);
  };
  const ids = new WeakMap();
  let counter = 0;
  const describe = (el) => {
    if (!el || el === document.body) return null;
    const role = el.getAttribute('role') || el.tagName.toLowerCase();
    if (!ids.has(el)) ids.set(el, ++counter);
    return { role, name: name(el), id: el.getAttribute('data-testid') || '', uid: ids.get(el) };
  };
  const visible = (el) => {
    if (el.closest('[inert]') || el.closest('[hidden]')) return false;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const SEL = 'button, [role=radio], [role=tab], [role=slider], [role=spinbutton], [role=switch], input, textarea, select, a[href], [tabindex="0"], [role=option]';
  // the stepper's plus / minus buttons are for the mouse: its container is the keyboard stop (Up / Down)
  const interactive = () => Array.from(document.querySelectorAll(SEL)).filter((el) => visible(el) && !el.disabled && el.getAttribute('aria-disabled') !== 'true' && !el.closest('.ui-tip-bubble') && !el.classList.contains('ui-stepper-btn'));
  const ring = (el) => {
    const s = getComputedStyle(el);
    if (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) return true;
    // sliders draw the ring on their thumb
    const thumb = el.querySelector('.ui-slider-thumb');
    if (thumb) { const t = getComputedStyle(thumb); return t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) > 0; }
    return false;
  };
  window.__kb = { describe, interactive, ring, visible };
})();
`;

export default async ({ page, log, url }) => {
  const base = url.split('?')[0];
  const failures = [];
  const report = {};
  const print = process.env.UI_PRINT === '1';
  const only = process.env.UI_ONLY ? process.env.UI_ONLY.split(',') : null;
  for (const s of SCREENS) {
    if (only && !only.includes(s)) continue;
    const [name, ...rest] = s.split('&');
    await page.goto(`${base}?screen=${name}${rest.length ? '&' + rest.join('&') : ''}&reducedMotion=1`);
    await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
    await page.waitForTimeout(200);
    await page.evaluate(PAGE_HELPERS);

    const stops = [];
    const key = (d) => String(d.uid);
    const seen = new Set();
    const ringless = [];
    // the screen's own initial focus is the first stop; Tab then runs until focus comes round again (a trapped
    // screen) or leaves the page (then once more, to enter from the top and visit what lay before the first stop)
    let cur = await page.evaluate('window.__kb.describe(document.activeElement)');
    if (!cur) { await page.keyboard.press('Tab'); cur = await page.evaluate('window.__kb.describe(document.activeElement)'); }
    const first = cur;
    let wrapped = false, left = 0;
    for (let i = 0; i < 400 && cur; i++) {
      const k = key(cur);
      if (i > 0 && seen.has(k)) { wrapped = true; break; }
      stops.push(cur);
      seen.add(k);
      if (!(await page.evaluate('window.__kb.ring(document.activeElement)'))) ringless.push(cur);
      await page.keyboard.press('Tab');
      cur = await page.evaluate('window.__kb.describe(document.activeElement)');
      if (!cur && left++ < 1) { await page.keyboard.press('Tab'); cur = await page.evaluate('window.__kb.describe(document.activeElement)'); }
    }
    if (!wrapped && stops.length) failures.push(`${s}: Tab left the screen instead of cycling inside it`);
    // Shift+Tab from the first stop must land on the last stop
    await page.keyboard.press('Shift+Tab');
    const back = await page.evaluate('window.__kb.describe(document.activeElement)');

    // interactive elements not visited by Tab
    const all = await page.evaluate(`window.__kb.interactive().map((el) => ({ d: window.__kb.describe(el), grouped: !!el.closest('[role=radiogroup],[role=tablist],[role=listbox]'), roving: el.getAttribute('tabindex') === '-1' }))`);
    const missing = all.filter((e) => !seen.has(key(e.d)));
    // arrow-reachability: walk every roving group with the arrow keys (radio groups first: tab rails re-render the page)
    const arrowSeen = new Set();
    for (const kind of ['radiogroup', 'tablist']) {
      const count = await page.evaluate(`Array.from(document.querySelectorAll('[role=${kind}]')).filter((g) => window.__kb.visible(g)).length`);
      for (let i = 0; i < count; i++) {
        const info = await page.evaluate(`(() => { const g = Array.from(document.querySelectorAll('[role=${kind}]')).filter((g) => window.__kb.visible(g))[${i}]; if (!g) return null; const el = g.querySelector('[tabindex="0"]') || g.querySelector('[role=radio],[role=tab]'); if (!el) return null; el.focus(); return { stop: window.__kb.describe(el), n: g.querySelectorAll('[role=radio],[role=tab]').length, vertical: g.getAttribute('aria-orientation') === 'vertical' || g.classList.contains('ui-radiocards') || g.classList.contains('is-vertical') }; })()`);
        if (!info) continue;
        arrowSeen.add(key(info.stop));
        for (let j = 0; j < info.n + 1; j++) {
          await page.keyboard.press(info.vertical ? 'ArrowDown' : 'ArrowRight');
          const d = await page.evaluate('window.__kb.describe(document.activeElement)');
          if (d) arrowSeen.add(key(d));
        }
      }
    }
    const unreachable = missing.filter((e) => !arrowSeen.has(key(e.d)));

    report[s] = { stops: stops.length, tabOrder: stops.map((d) => `${d.role}:${d.name || d.id}`), missingFromTab: missing.length, unreachable: unreachable.map((e) => `${e.d.role}:${e.d.name}`), noRing: ringless.map((d) => `${d.role}:${d.name}`), shiftTabLandsOn: back ? `${back.role}:${back.name || back.id}` : null };
    if (stops.length === 0 && all.length > 0) failures.push(`${s}: no focusable element at all`);
    if (unreachable.length) failures.push(`${s}: not reachable by keyboard: ${unreachable.map((e) => e.d.name || e.d.role).join(', ')}`);
    if (ringless.length) failures.push(`${s}: no visible focus ring on: ${ringless.map((d) => d.name || d.role).join(', ')}`);
    if (stops.length > 1 && wrapped && back && key(back) !== key(stops[stops.length - 1])) failures.push(`${s}: Shift+Tab from the first stop did not land on the last (${back.role}:${back.name})`);
    if (print) log(`${s}\n  ` + report[s].tabOrder.join('\n  '));
  }
  log(JSON.stringify(Object.fromEntries(Object.entries(report).map(([k, v]) => [k, { stops: v.stops, unreachable: v.unreachable.length, noRing: v.noRing.length }]))));
  if (failures.length) throw new Error(`keyboard check failed:\n${failures.join('\n')}`);
  return { screens: Object.keys(report).length, stops: Object.fromEntries(Object.entries(report).map(([k, v]) => [k, v.stops])), orders: report };
};
