// look-pass-5 item 1: the founding outcome card (and the failure card) framing. The opening is completed by the
// cheat (the picture is about the camera behind the card, not about the founding), the lapse is skipped, and the frame
// behind the card is rendered.
//   node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=low" --script tests/e2e/look5-outcome.mjs --out <dir>
// Environment: OUTCOME_WORKERS (default 12), OUTCOME_FAIL=1 (kill the clutch: the failure card).
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (n) => page.screenshot({ path: `${out}/${n}.png`, timeout: 600000 });
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(40));
  const workers = Number(process.env.OUTCOME_WORKERS ?? 12);
  await g((w) => window.__game.cheat.completeFounding(w), workers);
  let phase = null;
  for (let i = 0; i < 200; i++) {
    phase = await g(() => window.__founding.view()?.phase);
    if (phase === 'timelapse') break;
    await g(() => window.__game.step(20));
  }
  log('phase at lapse start', phase);
  if (phase === 'timelapse') {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await shot('lapse-start');
    log('lapse camera', JSON.stringify(await g(() => { const v = window.__hud.game.session.views; const r = (o) => JSON.parse(JSON.stringify(o)); return { on: v.foundingShotOn, pose: r(v.pose), shot: r(v.shot), subject: r(v.shotSource ? v.shotSource() : null), transition: v.transition.running }; })));
    if (process.env.OUTCOME_STOP_AT_LAPSE) return { phase };
    if (process.env.OUTCOME_ALERT) {
      // item 5: a flood alert raised in the lapse (as the founding chamber's rain flood does) and cleared by the sim before the card
      await g(() => window.__game.cheat.raiseAlert({ kind: 'queen-in-danger', level: 'critical', subjectId: 77, title: '', cause: '', tokens: { attacker: 'rising water', where: 'founding chamber' } }));
      await g(() => window.__game.step(2));
    }
    if (process.env.OUTCOME_FAIL) {
      // the failure card: the queen dies of exhaustion in the lapse (a real way for the opening to fail)
      await g(() => { const s = window.__hud.game.session.sim; window.__game.cheat.kill(s.stores.colonies.get(s.state.player.colonyId).queenId, 'starvation'); });
      await g(() => window.__game.step(20));
    } else await g(() => window.__founding.skipLapse());
  }
  for (let i = 0; i < 40; i++) {
    phase = await g(() => window.__founding.view()?.phase);
    if (phase === 'handover' || phase === 'failed' || phase === 'done') break;
    await g(() => window.__game.step(200));
  }
  await g(() => window.__game.step(2));
  if (process.env.OUTCOME_ALERT) {
    await g(() => window.__hud.game.refreshUi());
    log('alert cards before the clear', JSON.stringify(await g(() => [...document.querySelectorAll('[data-testid="alert-card"]')].map((e) => e.textContent))));
    await g(() => window.__game.cheat.clearAlert('queen-in-danger', 77));
    await g(() => window.__game.step(2));
    await g(() => window.__hud.game.refreshUi());
    log('alert cards at the card', JSON.stringify(await g(() => [...document.querySelectorAll('[data-testid="alert-card"]')].map((e) => e.textContent))));
  }
  log('phase at card', phase, JSON.stringify(await g(() => window.__founding.view()?.outcome)));
  await g(() => window.__game.renderFrame({ settle: 1.5 }));
  await shot('outcome-card');
  log('subject', JSON.stringify(await g(() => {
    const sim = window.__hud.game.session.sim, st = sim.state, col = st.player.colonyId;
    const nest = st.nests.find((n) => n.colony === col);
    return {
      bu: sim.world.bu,
      chambers: nest?.chambers.map((c) => ({ id: c.id, type: c.type, center: c.center, radii: c.radii, depthBu: c.depthBu, roofMin: c.roofMin })),
      origin: nest?.origin,
      ants: st.ants.filter((a) => a.alive && a.colony === col).map((a) => [a.caste, [a.pos.x, a.pos.y, a.pos.z].map((v) => Math.round(v * 10) / 10)]),
      brood: st.brood.filter((b) => b.alive && b.colony === col).map((b) => [b.stage, [b.pos.x, b.pos.y, b.pos.z].map((v) => Math.round(v * 10) / 10)]).slice(0, 6),
    };
  })));
  log('camera', JSON.stringify(await g(() => ({ pose: window.__game.camera.pose(), state: window.__game.camera.state(), clear: window.__game.camera.clearance() }))));
  return { phase };
};
