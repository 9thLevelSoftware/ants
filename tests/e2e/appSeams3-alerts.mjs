// app-seams-3 item 2: the queen's danger card with its three causes, staged by cheat (progression's own publisher):
// rising water (flood module tokens), a creature (attacker tokens) and combat's own cause words. One picture with all three (the feed shows three cards; the "damage" wording is pinned by a unit test).
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=test" --script tests/e2e/appSeams3-alerts.mjs \
//        --out test-output/app-seams-3/alerts --script-timeout 900000
export default async ({ page, shot, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const raise = (subjectId, title, cause, tokens) => g(([s, t, c, k]) => window.__game.cheat.raiseAlert({ kind: 'queen-in-danger', level: 'critical', subjectId: s, title: t, cause: c, tokens: k }), [subjectId, title, cause, tokens]);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(90));
  const ids = [
    await raise(101, '', '', { attacker: 'rising water', where: 'royal chamber' }),
    await raise(102, '', '', { attacker: 'wolf spider', where: 'royal chamber' }),
    await raise(103, 'The queen is in danger', 'hostile-near', { cause: 'hostile-near' }),
  ];
  log('alert ids', JSON.stringify(ids));
  await g(() => window.__game.step(2));
  await g(() => window.__hud.game.refreshUi());
  await wait.frames(3);
  const cards = await g(() => [...document.querySelectorAll('[data-testid="alert-card"], .fd-alert')].map((e) => e.textContent));
  log('cards', JSON.stringify(cards));
  await g(() => window.__game.renderFrame());
  await wait.frames(2);
  await shot('queen-danger-cards');
  return { ids, cards };
};
