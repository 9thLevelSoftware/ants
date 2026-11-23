// look-pass-5 item 6: the queen, brood and chamber inspectors on a live colony past the hand-over, each checked for label / value order, units
// and clipped text; plus the possession camera on a 45 degree slope and in a nest shaft (staged with the debug API).
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look5-inspect.mjs --out <dir> --script-timeout 1800000
// Environment: INSPECT_DAYS (game days to run after the hand-over, default 8), INSPECT_ONLY=cards|camera.
export default async ({ page, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n, clip) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000, ...(clip ? { clip } : {}) });
  const render = (s = 1) => g((k) => window.__game.renderFrame({ settle: k }), s);
  const only = process.env.INSPECT_ONLY ?? '';
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(40));
  await g(() => window.__game.cheat.completeFounding(12));
  for (let i = 0; i < 200; i++) {
    const ph = await g(() => window.__founding.view()?.phase);
    if (ph === 'timelapse') break;
    await g(() => window.__game.step(20));
  }
  await g(() => window.__founding.skipLapse());
  for (let i = 0; i < 40; i++) {
    const ph = await g(() => window.__founding.view()?.phase);
    if (ph === 'handover' || ph === 'done' || ph === null) break;
    await g(() => window.__game.step(200));
  }
  await g(() => window.__founding.closeOutcome());
  await g(() => window.__founding.stayWithQueen());
  const days = Number(process.env.INSPECT_DAYS ?? 8);
  for (let d = 0; d < days; d++) await g(() => window.__game.step(6000));
  log('summary', JSON.stringify(await g(() => { const s = window.__game.summary(); return { time: s.time, pop: s.population ?? s.colony?.population, mode: s.mode, view: s.view }; })));

  /** Pins the inspect card on ref, renders, and reads the card: title, rows (label, value) and every element whose text is clipped. */
  const card = async (name, ref) => {
    await g((r) => window.__hud.inspect(r), ref);
    await g(() => window.__hud.game.refreshUi());
    await render(1);
    await wait.frames(2);
    const info = await g(() => {
      const c = document.querySelector('[data-testid="inspect-card"]');
      if (!c) return null;
      const rows = [...c.querySelectorAll('.fd-ins-row')].map((r) => [...r.children].map((e) => e.textContent.trim()));
      const blocks = [...c.querySelectorAll('.fd-ins-block')].map((b) => ({ title: b.querySelector('.fd-ins-h')?.textContent, n: b.querySelectorAll('.fd-ins-row').length }));
      const clipped = [...c.querySelectorAll('*')].filter((e) => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflow !== 'visible').map((e) => `${e.className}: ${e.textContent.trim().slice(0, 60)}`);
      const b = c.getBoundingClientRect();
      return { title: c.querySelector('[data-testid="inspect-title"]')?.textContent, rows, blocks, clipped, box: { x: b.x, y: b.y, w: b.width, h: b.height }, vw: innerWidth, vh: innerHeight };
    });
    log(name, JSON.stringify(info));
    await shot(name);
    return info;
  };

  const res = {};
  if (only !== 'camera') {
    await g(() => window.__game.camera.set('observer'));
    await g(() => window.__game.step(2));
    const ids = await g(() => {
      const s = window.__hud.game.session.sim, st = s.state, col = st.player.colonyId;
      const q = s.stores.ants.get(s.stores.colonies.get(col).queenId);
      const nest = st.nests.find((n) => n.colony === col);
      const brood = st.brood.filter((b) => b.alive && b.colony === col && b.carriedBy < 0);
      const by = (stage) => brood.find((b) => b.stage === stage);
      return {
        queen: q ? { id: q.id, pos: q.pos } : null,
        eggs: by('egg')?.id ?? -1, larva: by('larva')?.id ?? -1, pupa: by('pupa')?.id ?? -1,
        broodPos: Object.fromEntries(['egg', 'larva', 'pupa'].map((k) => [k, by(k)?.pos ?? null])),
        chambers: nest.chambers.map((c) => ({ id: c.id, type: c.type, center: c.center })),
        counts: { brood: brood.length, ants: st.ants.filter((a) => a.alive && a.colony === col).length },
      };
    });
    log('ids', JSON.stringify(ids));
    // the camera follows the thing inspected: the observer on the nest, close
    const near = async (p, back = 40) => {
      await g((a) => { const s = window.__hud.game.session; s.views.freeFlyAt({ x: a.p.x + a.back, y: a.p.y + a.back * 0.8, z: a.p.z + a.back }, a.p); window.__game.renderNow(0); }, { p, back });
    };
    if (ids.queen) { await near(ids.queen.pos); res.queen = await card('queen-inspector', { kind: 'ant', id: ids.queen.id }); }
    for (const k of ['egg', 'larva', 'pupa']) {
      const id = ids[k === 'egg' ? 'eggs' : k];
      if (id >= 0) { await near(ids.broodPos[k], 25); res[k] = await card(`brood-${k}-inspector`, { kind: 'brood', id }); } else log('no brood of stage', k);
    }
    for (const c of ids.chambers.slice(0, 2)) { await near(c.center, 60); res[`chamber-${c.id}`] = await card(`chamber-${c.type}-${c.id}-inspector`, { kind: 'chamber', id: c.id }); }
    await g(() => window.__hud.inspect(null));
  }
  return res;
};
