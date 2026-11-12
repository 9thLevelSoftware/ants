// World dressing in the running game (task render-integration): the title backdrop, decor in a lawn view, the map
// edge, a frosty morning and a golden hour, plus the leak check over two game starts / ends and runtime quality
// switching with decor registered.
//   node tools/harness/play.mjs --root . --query "test=1&quality=test" --script tests/e2e/dressing.mjs \
//     --out test-output/dressing --script-timeout 2400000 --timeout 300000
// Boots to the title (no autostart). Look shots at `medium` (post chain: DoF, bloom, grade effect) and the frost shot
// at `low` (no-post path: the direct grading pass). Each shot is saved twice: with the UI and as a clean plate
// (`-plate`, UI hidden) so the scene itself can be judged. Software GL: a medium frame takes several seconds here.
// DRESSING_SKIP_LEAK=1 skips the two-game leak cycle (the slowest part).
const DAY = 6000; // ticks per game day
const at = (day, hour) => day * DAY + Math.round((hour / 24) * DAY); // calendar tick (day 0 = spring day 1)

export default async ({ page, log, out: outDir }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`dressing: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const result = { shots: {} };
  const world = async () => (await g(() => window.__game.perf())).renderers.world;
  const memory = async () => (await g(() => window.__game.perf())).memory;
  // own screenshot helper: software GL under load can need far more than the harness's default 30 s per capture
  const shot = async (name) => {
    const file = `${outDir}/${name}.png`;
    await page.screenshot({ path: file, timeout: 300000 });
    result.shots[name] = file;
  };
  const plate = async (name) => {
    await shot(name);
    const h = await page.addStyleTag({ content: '#ui{visibility:hidden !important}' });
    await shot(`${name}-plate`);
    await h.evaluate((el) => el.remove());
  };
  // the title backdrop is rebuilt asynchronously after endGame; in test mode it is drawn only on renderFrame()
  const waitTitle = async () => {
    for (let i = 0; i < 1200; i++) {
      const s = await g(() => ({ mode: window.__game.ui.screen(), w: window.__game.perf().renderers.world }));
      if (s.mode === 'title' && s.w.terrainTriangles > 0 && s.w['boundary.skirtTriangles'] > 0) {
        await g(() => window.__game.renderFrame());
        const ants = await g(() => window.__game.perf().renderers.ants.ants);
        expect(ants >= 3, 'title backdrop has no ants', ants);
        return s;
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error('dressing: title backdrop never built');
  };

  // 1. title backdrop
  await waitTitle();
  await g(() => window.__game.quality('medium'));
  await g(() => window.__game.renderFrame());
  const tw = await world();
  expect(tw['decor.blades'] > 100 && tw['decor.draped'] > 10, 'title backdrop has no grass / litter', tw);
  expect(tw['boundary.skirtTriangles'] > 0, 'title backdrop has no boundary skirt', tw);
  await plate('01-title');
  result.title = { decorBlades: tw['decor.blades'], decorDraped: tw['decor.draped'], grade: tw['grade.saturation'] };
  const base = await memory();
  result.memoryTitle = [base];
  log('title', JSON.stringify(result.title), 'memory', JSON.stringify(base));

  // 2. game starts and ends: GPU resource counts return to the title's. Geometries must match exactly; textures may
  // grow on the first games while the shared material library and the asset loader fill their caches (image textures
  // that finish loading during a game are uploaded on their first use), but must be steady by the third game.
  const GAMES = 3;
  if (process.env.DRESSING_SKIP_LEAK !== '1') {
    for (let i = 0; i < GAMES; i++) {
      await g(() => window.__game.newGame({ seed: 2, archetype: 'woodland-edge', view: 'observer' }));
      const m = await memory();
      log(`game ${i + 1} memory`, JSON.stringify(m));
      await g(() => window.__game.endGame());
      await waitTitle();
      const back = await memory();
      result.memoryTitle.push(back);
      log(`title after game ${i + 1}`, JSON.stringify(back));
      expect(back.geometries === base.geometries, 'GPU geometries did not return to the title baseline', { base, back });
      if (i === GAMES - 1) expect(back.textures === result.memoryTitle[i].textures, 'GPU textures still growing after several games (leak)', result.memoryTitle);
    }
  }

  // 3. lawn with grass and leaf litter, third person
  await g(() => window.__game.newGame({ seed: 2, archetype: 'woodland-edge' }));
  await g((t) => window.__game.cheat.setTime(t), at(9, 10.5)); // summer, mid-morning
  await g(() => window.__game.cheat.setWeather('clear'));
  const spot = await g(() => window.__game.query.lawnSpot());
  expect(spot && !spot.error, 'no lawn spot near a tree in this world', spot);
  await g(() => window.__game.possess('queen'));
  await g((p) => window.__game.teleport('possessed', { x: p.x, y: p.y + 2, z: p.z }), spot);
  await g(() => window.__game.step(10));
  await g(() => window.__game.renderFrame());
  const lw = await world();
  expect(lw['decor.blades'] > 100, 'no grass drawn in the lawn view', lw);
  expect(lw['decor.draped'] > 0, 'no leaf litter drawn in the lawn view', lw);
  await plate('02-lawn-third-person');
  result.lawn = { spot, blades: lw['decor.blades'], draped: lw['decor.draped'], decorTris: lw['decor.trianglesSubmitted'], camera: await g(() => window.__game.camera.state()) };
  log('lawn', JSON.stringify(result.lawn));

  // 4. the map edge: from above (observer) and from ant height, looking out
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  const edge = await g(() => window.__game.query.edgeView());
  expect(edge && !edge.error, 'no edge view', edge);
  await g((e) => window.__game.camera.setPose(e.pos, e.look), edge);
  const ew = await world();
  expect(ew['boundary.backdropShapes'] > 0 && ew['boundary.skirtTriangles'] > 0, 'boundary not drawn', ew);
  await plate('03-map-edge');
  const bu = (await g(() => window.__game.query.world())).bu;
  const low = { pos: { ...edge.pos }, look: { ...edge.look } };
  const out = { x: edge.look.x - edge.pos.x, z: edge.look.z - edge.pos.z }, len = Math.hypot(out.x, out.z);
  low.pos.x += (out.x / len) * 130 * bu; low.pos.z += (out.z / len) * 130 * bu; // 20 BU from the edge
  const gy = (await g((p) => window.__game.query.field(p.x, 0, p.z), low.pos)).height;
  low.pos.y = gy + 3 * bu; low.look.y = gy + 8 * bu;
  await g((e) => window.__game.camera.setPose(e.pos, e.look), low);
  await plate('03b-map-edge-ant-height');
  result.edge = { zone: edge.zone, side: edge.side, shapes: ew['boundary.backdropShapes'], skirtTris: ew['boundary.skirtTriangles'] };

  // 5. frosty morning on the no-post path (low): the direct grading pass desaturates
  await g(() => window.__game.quality('low'));
  await g(() => window.__game.cheat.setWeather('frost'));
  await g((t) => window.__game.cheat.setTime(t), at(2, 8));
  await g(() => window.__game.possess('queen'));
  await g(() => window.__game.step(2));
  await g(() => window.__game.renderFrame());
  const fw = await world();
  expect(fw['grade.saturation'] < 0.8, 'frost does not desaturate', fw);
  await plate('04-frost-morning');
  result.frost = { saturation: fw['grade.saturation'], gainR: fw['grade.gainR'], gainB: fw['grade.gainB'] };

  // 6. golden hour on the post path (medium)
  await g(() => window.__game.quality('medium'));
  await g(() => window.__game.cheat.setWeather('clear'));
  await g((t) => window.__game.cheat.setTime(t), at(9, 19.6));
  await g(() => window.__game.step(2));
  await g(() => window.__game.renderFrame());
  const gw = await world();
  expect(gw['grade.gainR'] > gw['grade.gainB'], 'golden hour grade is not warm', gw);
  await plate('05-golden-hour');
  result.golden = { saturation: gw['grade.saturation'], gainR: gw['grade.gainR'], gainB: gw['grade.gainB'] };

  // 7. runtime quality switching with decor registered
  const switched = [];
  for (const q of ['test', 'low', 'high', 'test']) {
    await g((id) => window.__game.quality(id), q);
    await g(() => window.__game.renderFrame());
    const w = await world();
    switched.push({ q, blades: w['decor.blades'], blocks: w['decor.blocks'] });
  }
  expect(switched[0].blades === 0 && switched[1].blades > 0 && switched[2].blades > switched[1].blades && switched[3].blades === 0, 'decor does not follow the quality preset', switched);
  result.qualitySwitch = switched;
  result.perf = await g(() => { const p = window.__game.perf(); return { drawCalls: p.drawCalls, triangles: p.triangles, frameMs: p.frameMs, memory: p.memory }; });

  await g(() => window.__game.endGame());
  await waitTitle();
  log('result', JSON.stringify(result));
  return result;
};
