// Determinism check (task F3b, criterion 3):
//   node tools/harness/play.mjs --root . --query "test=1&autostart=1&seed=1" --script tests/e2e/determinism.mjs
// Two fresh runs with the same seed (the autostarted game, then a fresh page load) and a third new game in the same
// page, each driven by the same scripted inputs for 500 ticks, must give the same stateHash(). A different seed
// must give a different one.
const SCRIPT = async () => {
  const g = window.__game;
  const out = [];
  g.possess('queen');
  g.step(100);
  g.setIntent({ dir: { x: 0.8, y: 0, z: 0.6 } });
  g.step(150);
  g.setIntent({ dir: { x: -1, y: 0, z: 0 }, hurry: true });
  g.step(150);
  g.setIntent({});
  g.release();
  g.step(100);
  out.push(g.summary().tick);
  out.push(g.stateHash());
  return out;
};

export default async ({ page, log }) => {
  const run = () => page.evaluate(SCRIPT);
  const first = await run();
  log('autostarted run:', JSON.stringify(first));

  await page.evaluate(() => window.__game.dispose()); // free the GL context before reloading (software GL backlog)
  await page.reload();
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120000 });
  const second = await run();
  log('fresh page run:', JSON.stringify(second));

  await page.evaluate(() => window.__game.newGame({ seed: 1 }));
  const third = await run();
  log('new game in the same page:', JSON.stringify(third));

  await page.evaluate(() => window.__game.newGame({ seed: 2 }));
  const other = await run();
  log('seed 2:', JSON.stringify(other));

  if (first[0] !== 500) throw new Error(`expected tick 500, got ${first[0]}`);
  if (first[1] !== second[1] || first[1] !== third[1]) throw new Error(`state hashes differ: ${first[1]} ${second[1]} ${third[1]}`);
  if (other[1] === first[1]) throw new Error('a different seed gave the same state hash');
  return { hash: first[1], seed2: other[1] };
};
