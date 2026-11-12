// Debug renderers on the small test world (primitives, a carved nest with an open entrance, workers inside):
//   node tools/harness/play.mjs --root . --query "test=1" --script tests/e2e/debugRender.mjs
// Screenshots: the entrance from above (terrain hole discarded, cavity walls visible through it), the test
// features (wall, table, stone, stem) and a worker possessed inside a chamber.
export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`debugRender: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  await g(() => window.__game.newGame({ view: 'observer', testWorld: { nest: 'small', workers: 6, features: 'all', terrain: 'noise' } }));
  const nest = await g(() => window.__game.query.nest());
  const s = await g(() => window.__game.summary());
  expect(s.nest.carveChunks > 0 && s.nest.breaches > 0, 'test nest not carved', s.nest);
  const e = nest[0].entrances[0].pos;
  const bu = (await g(() => window.__game.query.world())).bu;

  await g(({ e, bu }) => window.__game.camera.setPose({ x: e.x - 6 * bu, y: e.y + 9 * bu, z: e.z + 7 * bu }, e), { e, bu });
  await g(() => window.__game.renderFrame({ settle: 0.1 }));
  await shot('entrance');

  const w = await g(() => window.__game.query.world());
  const c = { x: w.size / 2, y: 0, z: w.size / 2 };
  await g(({ c, bu }) => window.__game.camera.setPose({ x: c.x - 40 * bu, y: c.y + 45 * bu, z: c.z + 60 * bu }, c), { c, bu });
  await g(() => window.__game.renderFrame({ settle: 0.1 }));
  await shot('features');

  const worker = s.counts.ants > 1 ? (await g(() => window.__game.query.ants())).find((a) => a.caste === 'worker') : null;
  expect(worker, 'no worker in the test nest');
  await g((id) => window.__game.possess(id), worker.id);
  await g(() => window.__game.renderFrame());
  const p = await g(() => window.__game.summary());
  const clear = await g(() => window.__game.camera.clearance());
  log('in-nest camera state', p.camera.state, 'underground', p.camera.underground, 'clearance', JSON.stringify(clear));
  expect(p.possessed && p.possessed.underground, 'possessed worker should be underground', p.possessed);
  expect(clear.f > 0, 'camera inside solid in the nest', clear);
  await shot('in-nest');
  return { stats: (await g(() => window.__game.perf())).renderers, camState: p.camera.state };
};
