// Play views end to end (task views): possession on open ground, a wall, a ceiling, in the queen-sized shaft and in a
// chamber; observer following an ant with a hover highlight, possessing by E and by the pick API, Tab cycling in the
// documented order; colony view with slice and x-ray cutaways, a forage marker, a dig-plan ghost on a tunnel wall with
// validation feedback, placing it (the plan exists in the sim) and an invalid anchor that creates nothing.
//   node tools/harness/play.mjs --root . --query "test=1&quality=test" --script tests/e2e/views.mjs \
//        --out test-output/views --script-timeout 1500000
// VIEWS_SKIP_HIGH=1 skips the high-quality shots; VIEWS_QUICK=1 runs a short subset (classic-build check).
// Every screenshot must be looked at.

export default async ({ page, shot, log, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`views: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const render = () => g(() => window.__game.renderFrame());
  const sum = () => g(() => window.__game.summary());
  const poss = () => g(() => window.__game.views.possession());
  const quick = !!process.env.VIEWS_QUICK;
  // VIEWS_ONLY=wall,ceiling,...: run only these possession sections while iterating (open always runs)
  const only = process.env.VIEWS_ONLY ? process.env.VIEWS_ONLY.split(',') : null;
  const run = (name) => !only || only.includes(name);
  const out = { checks: {} };
  let s, st;
  const ok = (name, data) => { out.checks[name] = data ?? 'ok'; log('OK', name, data === undefined ? '' : JSON.stringify(data)); };

  await g(() => window.__game.newGame({ seed: 5, testWorld: { features: 'all', nest: 'small', workers: 8 } }));
  // the founding intro card would cover the subject in every shot (the manual test clock never advances it)
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(1));
  const info = await g(() => {
    const gm = window.__game, w = gm.query.world(), n = gm.query.nest()[0];
    const q = gm.summary().possessed;
    return { bu: w.bu, size: w.size, start: w.queenStart.pos, nest: n, queen: q && { ...q, lengthBu: gm.query.ant(q.id).lengthBu } };
  });
  const { bu, size, nest } = info;
  const queenId = info.queen.id;
  const ent = nest.entrances[0].pos;
  const ch = (type) => nest.chambers.find((c) => c.type === type);
  const food = ch('food');
  expect(info.queen && info.queen.caste === 'queen', 'the founding queen is possessed', info.queen);

  // GDD 6.1 on the shown frame: f(camera) >= 0.5 R
  const clearOk = async (label) => {
    const c = await g(() => window.__game.camera.clearance());
    const p = await poss();
    expect(c.f >= 0.5 * c.radius, `${label}: camera inside solid`, { c, p });
    return { f: +c.f.toFixed(3), half: +(0.5 * c.radius).toFixed(3), state: p.state, distL: +(p.distance / (bu * info.queen.lengthBu)).toFixed(2) };
  };
  const teleport = (pos) => g((p) => window.__game.teleport('possessed', p), pos);
  const walk = (ticks, o) => g(([n, opt]) => window.__game.views.walk(n, opt), [ticks, o]);
  const antNow = () => g((id) => window.__game.query.ant(id), queenId);

  // --- 1. possession on open ground --------------------------------------------------------------------------------
  let w = await walk(20, { dir: { x: 1, y: 0, z: 0.3 } });
  expect(w.minF >= w.clearance, 'open walk: camera inside solid', w);
  await render();
  await shot('01-possess-open');
  ok('open', { ...(await clearOk('open')), walk: w });
  expect((await poss()).state === 'open', 'open state');

  if (!quick && run('wall')) {
    // --- 2. on a wall (the test wall's -x face), walking up it --------------------------------------------------------
    const wallX = 0.2 * size - 1.5 * bu, wallZ = 0.5 * size;
    await teleport({ x: wallX - 0.4 * bu, y: 7 * bu, z: wallZ });
    w = await walk(12, { dir: { x: 0, y: 1, z: 0.15 } });
    let a = await antNow();
    expect(a.up.x < -0.8, 'on the wall face', a.up);
    expect(w.minF >= w.clearance, 'wall walk: camera inside solid', w);
    await render();
    await shot('02-possess-wall');
    ok('wall', { ...(await clearOk('wall')), up: a.up, walk: w });
  }
  if (!quick && run('ceiling')) {
    let a;

    // --- 3. on a ceiling (the underside of the test table top), frame-locked and with ceiling comfort ----------------
    // (a teleport lands on the ground below: the queen climbs the leg and walks out under the top, testFeatures.ts)
    const tx = 0.3 * size, tz = 0.75 * size, legTop = 12 * bu, legX = tx - 1 * bu;
    await teleport({ x: legX - 1.5 * bu, y: 0.3 * bu, z: tz });
    w = await walk(45, { toward: { x: legX, y: legTop - 1.5 * bu, z: tz } });
    const w2 = await walk(30, { toward: { x: tx - 7 * bu, y: legTop + 0.5 * bu, z: tz } });
    w = { ...w2, minF: Math.min(w.minF, w2.minF) };
    a = await antNow();
    expect(a.up.y < -0.8, 'on the ceiling', a.up);
    expect(w.minF >= w.clearance, 'ceiling walk: camera inside solid', w);
    await render();
    await shot('03-possess-ceiling');
    ok('ceiling', { ...(await clearOk('ceiling')), up: a.up, walk: w });
    await g(() => window.__game.views.cameraOptions({ ceilingComfort: true }));
    await render();
    await shot('03b-possess-ceiling-comfort');
    const up = await g(() => window.__game.camera.pose().up);
    expect(up.y > 0.3, 'ceiling comfort leans the picture upright', up);
    await g(() => window.__game.views.cameraOptions({ ceilingComfort: false }));
  }

  // --- 4. in the queen-sized shaft (1 BU radius: the Stage 1A case) --------------------------------------------------
  if (run('tunnel')) {
  await teleport({ x: ent.x + 0.3 * bu, y: ent.y - 1.2 * bu, z: ent.z + 0.1 * bu });
  let tunnel = null;
  for (let i = 0; i < 14 && !tunnel; i++) {
    w = await walk(3, { toward: food.center });
    expect(w.minF >= w.clearance, 'shaft walk: camera inside solid', w);
    const p = await poss();
    const a = await antNow();
    // a few steps of real walking first: the camera rides the queen's own trail down the shaft
    if (i >= 3 && (p.state === 'tunnel' || p.state === 'crevice') && a.pos.y < ent.y - 2 * bu) tunnel = p;
  }
  expect(tunnel, 'the camera reached the tunnel state in the shaft');
  await render();
  await shot('04-possess-tunnel');
  const t4 = await clearOk('tunnel');
  const p4 = await poss();
  expect(p4.distance >= 1.0 * info.queen.lengthBu * bu, 'tunnel shot: camera at least 1 L behind the queen (Stage 1A: 0.23 L)', p4);
  expect(p4.opacity > 0.9 && p4.occlusion < 0.5, 'tunnel shot: queen not faded, walls not dithered away', p4);
  ok('tunnel', { ...t4, opacity: p4.opacity, occlusion: p4.occlusion });
  }

  // --- 5. in a chamber -------------------------------------------------------------------------------------------------
  const nursery = ch('nursery');
  if (!quick && run('chamber')) {
    await teleport({ x: nursery.center.x - 2 * bu, y: nursery.center.y, z: nursery.center.z });
    w = await walk(15, { toward: { x: nursery.center.x + 3 * bu, y: nursery.center.y - nursery.radii.y, z: nursery.center.z } });
    expect(w.minF >= w.clearance, 'chamber walk: camera inside solid', w);
    await render();
    await shot('05-possess-chamber');
    const t5 = await clearOk('chamber');
    expect(t5.state === 'chamber' || t5.state === 'tunnel', 'chamber state', t5);
    ok('chamber', { ...t5, walk: w });
  }

  if (run('observer')) {
  // --- 6. observer following an ant, hover highlight, possess by E and by the pick API -------------------------------
  const sx = info.start.x + 3 * bu, sz = info.start.z;
  await teleport({ x: sx, y: 1 * bu, z: sz });
  const qs = await antNow();
  log('queen after teleport', JSON.stringify({ pos: qs.pos, tick: (await sum()).tick, founding: await g(() => window.__game.summary().founding ?? null) }));
  expect(Math.hypot(qs.pos.x - sx, qs.pos.z - sz) < 3 * bu && qs.pos.y > -bu, 'the queen is on the surface for the observer section', qs.pos);
  await g(([x, z]) => window.__game.cheat.spawnAnts(6, 'worker', null, { x, y: 0, z }), [sx + 4 * bu, sz + 2 * bu]);
  await g(() => window.__game.step(2));
  await g(() => window.__game.release());
  await g(() => window.__game.step(1));
  s = await sum();
  expect(s.view === 'observer', 'release -> observer', s.view);
  const workers = await g(([qid]) => {
    const gm = window.__game, q = gm.query.ant(qid);
    return gm.query.ants().filter((a) => a.caste === 'worker' && Math.hypot(a.pos.x - q.pos.x, a.pos.z - q.pos.z) < 30 * gm.query.world().bu && a.pos.y > -gm.query.world().bu);
  }, [queenId]);
  expect(workers.length >= 3, 'workers on the surface near the queen', workers.length);
  await render();
  const target = workers[0];
  const scr = await g((p) => window.__game.views.project(p), { x: target.pos.x, y: target.pos.y + 0.3 * bu, z: target.pos.z });
  expect(scr, 'worker on screen');
  await g(([x, y]) => window.__game.views.pointer(x, y), [scr.x, scr.y]);
  await render();
  st = await g(() => window.__game.views.state());
  const hl = await g(() => window.__game.highlight());
  expect(st.hover && st.hover.kind === 'ant', 'hover pick on an ant', st.hover);
  expect(hl.hover && hl.hover.kind === 'ant' && hl.hover.id === st.hover.id, 'hover highlight set from the pick', hl);
  await shot('06-observer-follow-hover');
  ok('observer-hover', { followId: st.followId, hover: st.hover.id });
  expect(st.followId === queenId, 'observer follows the released queen', st.followId);
  // select (inspect target for the HUD), then E possesses the hovered ant through the real input path
  st = await g(([x, y]) => window.__game.views.click(x, y), [scr.x, scr.y]);
  expect(st.selected && st.selected.id === st.hover.id, 'click selects the hovered ant', st.selected);
  const inspect = await g(() => window.__game.views.inspectTarget());
  expect(inspect && inspect.id === st.hover.id, 'inspectTarget getter', inspect);
  const hovered = st.hover.id;
  await g(() => window.__game.input.key('KeyE'));
  await wait.frames(3);
  s = await sum();
  expect(s.view === 'possess' && s.possessed && s.possessed.id === hovered, 'E possesses the hovered ant', { view: s.view, p: s.possessed?.id, hovered });
  ok('possess-E', hovered);
  // back to observer; the pick API's click-hold path possesses another ant
  await g(() => window.__game.release());
  await g(() => window.__game.step(1));
  await render();
  const other = await g(([id, w]) => {
    const gm = window.__game; // a worker other than the one just released, where it is now
    return w.map((x) => gm.query.ant(x.id)).find((a) => a && a.id !== id);
  }, [hovered, workers]);
  const scr2 = await g((p) => window.__game.views.project(p), { x: other.pos.x + other.up.x * 0.3 * bu, y: other.pos.y + other.up.y * 0.3 * bu, z: other.pos.z + other.up.z * 0.3 * bu });
  // A real held left button (400 ms) through the browser's mouse events and the input layer (GDD 01 §3.2), logged
  // only: in test mode the Game renders (and runs the views layer) only in frames with input activity, and the input
  // layer's hold pulse does not count as activity, so the frame where the hold fires is usually skipped (reported to
  // the input owner; real play renders every frame). The unit test views.verify.test.ts drives the same hold through
  // the real InputState; the asserted path below runs the same possessTarget() choice through the pick.
  const box = await g(() => {
    const c = [...document.querySelectorAll('canvas')].sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
    const r = c.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
  await page.mouse.move(box.x + scr2.x, box.y + scr2.y);
  await wait.frames(2);
  await page.mouse.down();
  await page.waitForTimeout(700);
  await wait.frames(2);
  await page.mouse.up();
  await wait.frames(2);
  s = await sum();
  const realHold = s.view === 'possess' && s.possessed?.id === other.id;
  log('real click-hold (informational)', JSON.stringify({ possessed: realHold, view: s.view }));
  if (!realHold) {
    const r2 = await g(([x, y]) => window.__game.views.possessAt(x, y), [scr2.x, scr2.y]);
    expect(r2.ok, 'click-hold possess of the ant under the cursor', r2);
  }
  ok('possess-hold', { id: other.id, realHold });

  // --- 7. Tab cycling (GDD 01 §3.2 / E20: nearest first from the current ant, list frozen within 2 s, wraps) ----------
  // The presses go through Game.cycle in one frame (views.cycle): six real key presses cannot fit in TAB_LIST_TTL_S
  // when one software-GL frame takes seconds; the key -> cycle binding itself is the input module's (one press checked).
  if (!quick) {
    const order = await g(() => {
      const gm = window.__game, me = gm.query.ant(gm.summary().possessed.id), bu2 = gm.query.world().bu;
      const col = gm.query.colony().id;
      const all = gm.query.ants().filter((a) => a.colony === col && a.id !== me.id)
        .map((a) => ({ id: a.id, d2: (a.pos.x - me.pos.x) ** 2 + (a.pos.y - me.pos.y) ** 2 + (a.pos.z - me.pos.z) ** 2 }))
        .sort((a, b) => a.d2 - b.d2 || a.id - b.id);
      for (const r of [40, 160]) { const near = all.filter((c) => c.d2 <= (r * bu2) ** 2); if (near.length) return near.map((c) => c.id); }
      return all.map((c) => c.id);
    });
    const seen = await g(() => window.__game.views.cycle(1, 6));
    const want = Array.from({ length: 6 }, (_, i) => order[i % order.length]);
    expect(JSON.stringify(seen) === JSON.stringify(want), 'Tab possesses in the documented order', { seen, want });
    // one real Tab key press through the input layer: the next ant nearest to the current one
    const before = (await sum()).possessed.id;
    await g(() => window.__game.input.key('Tab'));
    await wait.frames(2);
    const after = (await sum()).possessed.id;
    expect(after !== before, 'a real Tab key press possesses another ant', { before, after });
    ok('tab-order', { seen, keyPress: { before, after } });
  }
  }
  if (!run('colony')) return out;

  // --- 8. colony view: slice and x-ray cutaways --------------------------------------------------------------------
  await g(() => window.__game.camera.set('colony'));
  await g(() => window.__game.step(1));
  s = await sum();
  expect(s.view === 'colony', 'colony view', s.view);
  const centre = { x: (ent.x + nursery.center.x) / 2 + 2 * bu, z: (ent.z + nursery.center.z) / 2 + 3 * bu };
  await g((o) => window.__game.views.colonyCamera(o), { x: centre.x, z: centre.z, distBu: 75, pitchDeg: 58, yawDeg: 20, cutaway: 'slice', planeYBu: -13, radiusBu: 60 });
  await render();
  if (!quick) {
    await shot('07-colony-slice');
    await g(() => window.__game.views.colonyCamera({ cutaway: 'xray' }));
    await render();
    await shot('08-colony-xray');
    ok('cutaways');
    await g(() => window.__game.views.colonyCamera({ cutaway: 'slice' }));
  }

  // --- 9. a forage marker ----------------------------------------------------------------------------------------------
  await g(() => window.__game.views.tool('forage'));
  await g(() => window.__game.views.radius('forage', 15));
  const fp = { x: info.start.x - 2 * bu, y: 0, z: info.start.z + 14 * bu };
  const fscr = await g((p) => window.__game.views.project(p), fp);
  expect(fscr, 'forage point on screen');
  const before = (await g(() => window.__game.views.markers())).length;
  st = await g(([x, y]) => window.__game.views.click(x, y), [fscr.x, fscr.y]);
  const markers = await g(() => window.__game.views.markers());
  expect(markers.length === before + 1 && markers.some((m) => m.kind === 'forage' && Math.abs(m.radius - 15 * bu) < 1e-6), 'forage marker placed with its radius', { markers, msg: st.message });
  await g(() => window.__game.views.tool(null));
  await render();
  await shot('08b-colony-forage-marker');
  ok('forage-marker', markers.find((m) => m.kind === 'forage'));

  // --- 10. dig-plan ghost on a tunnel wall with validation feedback, then placed ----------------------------------------
  // the blind branch off the food -> nursery tunnel (testNest.ts geometry: rims 30 % inside each chamber at floor
  // + 1 BU; the branch runs 7 BU east, 1 BU down, 1 BU south from the tunnel's middle): nearly level, so the slice
  // just above its axis shows it as a long groove
  const rim = (c, toward) => {
    const dx = toward.x - c.center.x, dz = toward.z - c.center.z, l = Math.hypot(dx, dz) || 1;
    return { x: c.center.x + (dx / l) * c.radii.x * 0.7, y: c.center.y - c.radii.y + bu, z: c.center.z + (dz / l) * c.radii.z * 0.7 };
  };
  const ta = rim(food, nursery.center), tb = rim(nursery, food.center);
  const tm = { x: (ta.x + tb.x) / 2, y: (ta.y + tb.y) / 2, z: (ta.z + tb.z) / 2 };
  const mid = { x: tm.x + 3.5 * bu, y: tm.y - 0.5 * bu, z: tm.z + 0.5 * bu };
  const bl = Math.hypot(7, 1);
  const side = { x: -1 / bl, z: 7 / bl };
  await g((o) => window.__game.views.colonyCamera(o), { x: mid.x, z: mid.z, distBu: 26, pitchDeg: 70, yawDeg: 20, cutaway: 'slice', planeYBu: mid.y / bu + 0.3, radiusBu: 40 });
  await render();
  await g(() => window.__game.views.tool('dig'));
  await g(() => window.__game.views.planner({ template: 'chamber', chamberType: 'nursery', size: 's', yawDeg: 0 }));
  const wallPt = { x: mid.x + side.x * 0.9 * bu, y: mid.y, z: mid.z + side.z * 0.9 * bu };
  const wscr = await g((p) => window.__game.views.project(p), wallPt);
  expect(wscr, 'tunnel wall on screen');
  let pv = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [wscr.x, wscr.y])).planner;
  for (let i = 0; i < 23 && pv?.preview && pv.preview.validity === 'invalid' && !pv.preview.codes.includes('anchor-not-in-nest'); i++) {
    pv = (await g(() => window.__game.views.rotate(1))).planner;
    pv = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [wscr.x, wscr.y])).planner;
  }
  log('ghost', JSON.stringify(pv?.preview));
  expect(pv?.preview && pv.preview.validity !== 'invalid', 'a valid (or warning) ghost on the tunnel wall', pv);
  const anchor = pv.preview.anchor.pos;
  expect(Math.hypot(anchor.x - wallPt.x, anchor.y - wallPt.y, anchor.z - wallPt.z) < 3 * bu, 'ghost anchored on that wall', { anchor, wallPt });
  await render();
  await shot('09-colony-dig-ghost');
  ok('ghost', { validity: pv.preview.validity, warnings: pv.preview.warnings, targetVolume: pv.preview.targetVolume, ms: pv.preview.ms });
  const plansBefore = (await g(() => window.__game.query.nest()[0].digPlans)).length;
  st = await g(([x, y]) => window.__game.views.click(x, y), [wscr.x, wscr.y]);
  if (st.message && /confirm/.test(st.message)) st = await g(([x, y]) => window.__game.views.click(x, y), [wscr.x, wscr.y]);
  const plans = await g(() => window.__game.query.nest()[0].digPlans);
  expect(plans.length === plansBefore + 1 && plans[plans.length - 1].source === 'player' && plans[plans.length - 1].kind === 'chamber', 'placing the ghost creates the plan', { n: plans.length, plansBefore, msg: st.message });
  await render();
  await shot('10-colony-plan-placed');
  ok('plan-created', { id: plans[plans.length - 1].id, status: plans[plans.length - 1].status });

  // --- 11. an invalid anchor: the reason is shown and nothing is created ----------------------------------------------
  await g(() => window.__game.views.tool('dig'));
  const far = { x: mid.x - 14 * bu, y: mid.y, z: mid.z - 10 * bu };
  const bscr = await g((p) => window.__game.views.project(p), far);
  pv = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [bscr.x, bscr.y])).planner;
  expect(pv?.preview && pv.preview.validity === 'invalid' && pv.preview.reason, 'invalid anchor with a reason', pv);
  await render();
  await shot('11-colony-dig-invalid');
  st = await g(([x, y]) => window.__game.views.click(x, y), [bscr.x, bscr.y]);
  const plansAfter = (await g(() => window.__game.query.nest()[0].digPlans)).length;
  expect(plansAfter === plans.length, 'nothing created for an invalid anchor', { plansAfter, before: plans.length });
  ok('plan-refused', { codes: pv.preview.codes, reason: pv.preview.reason });
  await g(() => window.__game.views.cancel());

  // --- 12. double-click an ant in the colony view possesses it ---------------------------------------------------------
  if (!quick) {
    const inNursery = await g((id) => window.__game.query.ants().find((a) => a.caste === 'worker' && a.pos.y < -5 * window.__game.query.world().bu), 0);
    if (inNursery) {
      await g((o) => window.__game.views.colonyCamera(o), { x: inNursery.pos.x, z: inNursery.pos.z, distBu: 40, pitchDeg: 80, cutaway: 'xray' });
      await render();
      const ascr = await g((p) => window.__game.views.project(p), { x: inNursery.pos.x, y: inNursery.pos.y + 0.3 * bu, z: inNursery.pos.z });
      await g(([x, y]) => window.__game.views.click(x, y), [ascr.x, ascr.y]);
      await g(([x, y]) => window.__game.views.click(x, y), [ascr.x, ascr.y]);
      s = await sum();
      expect(s.view === 'possess' && s.possessed?.id === inNursery.id, 'double-click in the colony view possesses the ant', { view: s.view, p: s.possessed?.id, want: inNursery.id });
      ok('colony-dblclick-possess', inNursery.id);
      w = await walk(10, { toward: { x: inNursery.pos.x + 2 * bu, y: inNursery.pos.y, z: inNursery.pos.z } });
      expect(w.minF >= w.clearance, 'after colony possession: camera clear', w);
    }
  }

  if (!process.env.VIEWS_SKIP_HIGH && !quick) {
    await g(() => window.__game.camera.set('colony'));
    await g(() => window.__game.step(1));
    await g(() => window.__game.quality('high'));
    await g((o) => window.__game.views.colonyCamera(o), { x: centre.x, z: centre.z, distBu: 75, pitchDeg: 58, yawDeg: 20, cutaway: 'slice', planeYBu: -13, radiusBu: 60 });
    await render();
    await shot('12-high-colony-slice');
    ok('high-colony');
    // the tunnel shot at high quality, last: switching the quality back and forth mid-script currently leaves later
    // test-quality frames drawn from a stale view (render-app issue, reported)
    await g((id) => window.__game.possess(id), queenId);
    await g(() => window.__game.step(1));
    await teleport({ x: ent.x + 0.3 * bu, y: ent.y - 1.2 * bu, z: ent.z + 0.1 * bu });
    for (let i = 0; i < 8; i++) {
      w = await walk(3, { toward: food.center });
      expect(w.minF >= w.clearance, 'high: shaft walk: camera inside solid', w);
    }
    await render();
    await shot('13-high-tunnel');
    ok('high-tunnel', await clearOk('high-tunnel'));
    await g(() => window.__game.quality('test'));
  }
  return out;
};
