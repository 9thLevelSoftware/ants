// app-seams-2 item 4: do the winter rule and the extinction rule do anything in a running game?
//   node tools/harness/play.mjs --root . --query "test=1&autostart=0&quality=test" --script tests/e2e/appSeams2-rules.mjs --out test-output/app-seams-2/rules
// winterMode: realtime must play the winter days (no banner, no time-lapse); timelapse raises the banner. The game is
// taken to the hand-over with `cheat.completeFounding` and the clock is set into late autumn with `cheat.setTime`.
export default async ({ page, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const run = async (winterMode) => {
    await g((m) => window.__game.newGame({ seed: 1, customRules: { winterMode: m } }), winterMode);
    await g(() => window.__game.command({ type: 'openingSkipIntro' }));
    await g(() => window.__game.cheat.completeFounding(10));
    for (let i = 0; i < 200; i++) {
      const done = await g(() => { const op = window.__hud.game.session.sim.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
      if (done) break;
      await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
    }
    await g(() => window.__game.cheat.addFood(200, 80));
    const day = 6000;
    await g((t) => window.__game.cheat.setTime(t), 20 * day + day / 2); // autumn day 6, midday: winter begins at day 22
    const seen = { banners: 0, winterUi: false, seasons: new Set(), speedAtEnd: null };
    for (let i = 0; i < 40; i++) {
      await g(() => window.__game.step(300));
      const s = await g(() => ({ season: window.__game.summary().time.season, ui: !!document.querySelector('.wi-banner, [data-testid^="winter"]'), mode: window.__game.ui.screen() }));
      seen.seasons.add(s.season);
      if (s.ui) seen.winterUi = true;
    }
    const ev = await g(() => window.__game.events('overwinter.banner', 5));
    const sum = await g(() => window.__game.summary());
    return { winterMode, seasons: [...seen.seasons], banner: ev.length, winterUi: seen.winterUi, day: sum.time?.dayOfSeason, season: sum.time?.season, workers: sum.colony?.workers ?? null, mode: sum.mode };
  };
  const out = [];
  for (const m of ['timelapse', 'realtime']) { const r = await run(m); log(JSON.stringify(r)); out.push(r); }
  return out;
};
