// Stage 2 renderers and hooks in the real game (task wire-stage2): creatures of every family beside a worker for
// scale, an aphid herd on a stem, spider comfort off / softened, the scent view on a real foraging trail, the
// temperature / moisture / threats / dig-plans overlays (dig plans also in the possession view), rain with wet ground
// and a puddle, a footstep event passing a possessed ant (camera tremor), a mower or broom, and the frame cost with
// everything on. Every screenshot must be looked at.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&quality=high&autostart=1" --script tests/e2e/stage2.mjs \
//        --out test-output/stage2 --script-timeout 2400000 --timeout 240000
// rainlook / comfortlook / overlaylook are the screenshots of task stage2-look-fix (rain by day and night from the observer
// and possession cameras, the three spider comfort looks at two distances, the moisture and temperature overlays in dry
// and wet weather); they add pictures and checks, no existing assertion was changed.
// STAGE2_MACHINE=sweeping / STAGE2_RAINLOOK=night narrow those sections (long runs under load).
// STAGE2_ONLY=creatures,herd,...: run only these sections (setup always runs). STAGE2_SOFT=1: a failing section is
// recorded in result.failures instead of failing the run. The opening is skipped with cheat.completeFounding (the
// real opening is another task's).
const SECTIONS = ['creatures', 'herd', 'comfort', 'scent', 'overlays', 'machine', 'rain', 'footsteps', 'rainlook', 'comfortlook', 'overlaylook', 'humanlook', 'birdlook', 'perf'];

export default async ({ page, shot, log }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const only = process.env.STAGE2_ONLY ? process.env.STAGE2_ONLY.split(',') : null;
  const soft = !!process.env.STAGE2_SOFT;
  const result = { checks: {}, shots: [], failures: [], findings: [] };
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`stage2: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  const sim = (fn, arg) => g(([src, a]) => { const sm = window.__hud.game.session.sim; return new Function('sim', 'arg', `return (${src})(sim, arg)`)(sm, a); }, [fn.toString(), arg]);
  const step = (n) => g((k) => window.__game.step(k), n);
  const render = () => g(() => window.__game.renderFrame());
  const pic = async (name) => { await render(); result.shots.push(await shot(name)); log('shot', name); };
  const cheat = (name, ...a) => g(([n, args]) => window.__game.cheat[n](...args), [name, a]);
  const q = (name, ...a) => g(([n, args]) => window.__game.query[n](...args), [name, a]);
  const finding = (t) => { result.findings.push(t); log('FINDING', t); };
  const section = async (name, fn) => {
    if (only && !only.includes(name)) return;
    const t0 = Date.now();
    // every section starts in the observer view with no overlay on (a failed section may have left either)
    await g(() => {
      const gm = window.__game;
      for (const id of ['scent', 'temperature', 'moisture', 'threats', 'dig-plans']) gm.fx.overlay(id, false);
      gm.release();
      gm.camera.set('observer');
      gm.step(1);
    });
    try { result.checks[name] = (await fn()) ?? 'ok'; log('OK', name, JSON.stringify(result.checks[name])); } catch (e) {
      result.failures.push({ section: name, error: String(e?.message ?? e) });
      log('FAIL', name, String(e?.message ?? e));
      if (!soft) throw e;
    } finally { log('section', name, `${Math.round((Date.now() - t0) / 1000)} s`); }
  };

  // ---- setup: the real game, the opening completed by the founding cheat, observer camera -------------------------
  const s0 = await g(() => window.__game.summary());
  expect(s0.mode === 'playing', 'not playing after autostart', s0.mode);
  expect(await g(() => typeof window.__hud === 'object'), '__hud missing (needs ?test=1)');
  const renderers = s0.renderers ?? (await g(() => window.__game.summary().renderers));
  expect(Object.values(renderers).every((d) => !String(d).includes('(debug)')), 'a slot still runs its debug renderer', renderers);
  result.checks.renderers = renderers;
  const handedOver = () => sim((sm) => { const op = sm.state.player.opening; return !op || op.done || op.phase === 'handover' || op.phase === 'done'; });
  if (!(await handedOver())) {
    await cheat('completeFounding', 10);
    for (let i = 0; i < 120 && !(await handedOver()); i++) await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
  }
  expect(await handedOver(), 'the opening was not handed over by cheat.completeFounding');
  // the founding outcome card ("First workers: n") would cover every shot
  const cont = page.locator('[data-testid="founding-continue"]');
  if (await cont.count()) await cont.first().click();
  await step(1);
  // ... and the hand-over choice card after it (stay with the queen; the script releases her below)
  const stay = page.locator('[data-testid="founding-stay"]');
  if (await stay.count()) await stay.first().click();
  await step(1);
  await g(() => window.__game.release());
  await g(() => window.__game.camera.set('observer'));
  await step(1);
  const w = await q('world');
  const bu = w.bu;
  const nest = (await q('nest'))[0];
  const ent = nest.entrances[0].pos;
  const groundY = (x, z) => g(([x, z]) => window.__game.query.field(x, 0, z).height, [x, z]);
  /** Open ground (no primitive within 1 BU) at `distBu` from the entrance, trying 16 headings from `th0`. */
  const openGround = async (distBu, th0 = 0) => {
    for (let k = 0; k < 16; k++) {
      const th = th0 + (k * Math.PI) / 8, x = ent.x + Math.cos(th) * distBu * bu, z = ent.z + Math.sin(th) * distBu * bu;
      const y = await groundY(x, z);
      const d = await g(([x, y, z, b]) => window.__game.query.dig(x, y + 0.5 * b, z, b), [x, y, z, bu]);
      if (d.prim === null) return { x, y, z };
    }
    return null;
  };
  /** Observer free-fly pose looking at `t` from `distBu` away at `elevDeg`, heading `yawDeg`. */
  const look = (t, distBu, elevDeg = 25, yawDeg = 200) => {
    const e = (elevDeg * Math.PI) / 180, y = (yawDeg * Math.PI) / 180, d = distBu * bu;
    const pos = { x: t.x + Math.cos(y) * Math.cos(e) * d, y: t.y + Math.sin(e) * d, z: t.z + Math.sin(y) * Math.cos(e) * d };
    return g(([p, l]) => window.__game.camera.setPose(p, l), [pos, t]);
  };
  const spawnWorker = async (pos) => {
    const before = new Set((await q('ants')).map((a) => a.id));
    await cheat('spawnAnts', 1, 'worker', null, pos);
    return (await q('ants')).find((a) => !before.has(a.id)) ?? null;
  };
  const spawnCreature = async (kind, pos) => {
    const before = new Set((await q('creatures')).map((c) => c.id));
    const r = await cheat('spawnCreature', kind, pos);
    const c = (await q('creatures')).find((x) => !before.has(x.id) && x.kind === kind) ?? null;
    if (!c) finding(`cheat.spawnCreature ${kind} created nothing (${JSON.stringify(r)})`);
    return c;
  };
  result.checks.setup = { bu, size: w.size, entrance: ent, tick: (await g(() => window.__game.summary())).tick };

  // ---- creatures: one lineup per family beside a worker ---------------------------------------------------------
  await section('creatures', async () => {
    // [kind, body length mm] (balance creatures.ts): the row is spaced by size so small animals stay readable
    const families = [
      ['prey', [['caterpillar', 10], ['springtail', 1.5], ['fly-larva', 8], ['fruit-fly', 2.5]]],
      ['neutral', [['woodlouse', 10], ['snail', 20], ['millipede', 30]]],
      ['aphid-predators', [['ladybird', 6.5], ['ladybird-larva', 8], ['lacewing-larva', 7]]],
      ['ant-predators', [['wolf-spider', 10], ['centipede', 20], ['rove-beetle', 5], ['jumping-spider', 6]]],
    ];
    const out = {};
    let th = 0.3;
    for (const [family, kinds] of families) {
      const spot = await openGround(40, th);
      th += 1.3;
      expect(spot, `no open ground for the ${family} lineup`);
      const ids = [];
      const gap = 1.5 * bu;
      const span = kinds.reduce((n, [, mm]) => n + mm, 0) + gap * (kinds.length - 1);
      let off = -span / 2;
      for (const [kind, mm] of kinds) {
        const c = await spawnCreature(kind, { x: spot.x + off + mm / 2, y: spot.y, z: spot.z });
        if (c) ids.push(c.id);
        off += mm + gap;
      }
      const ant = await spawnWorker({ x: spot.x, y: spot.y, z: spot.z + 3 * bu }); // in front of the row, toward the camera
      await step(1);
      // the camera looks along -z at the row (yaw 90: it stands on +z), far enough for the whole row
      await look(spot, Math.max(8, (0.8 * span) / bu), 18, 90);
      await pic(`01-creatures-${family}`);
      const looks = [];
      for (const id of ids) looks.push({ id, look: await g((i) => window.__game.ui.look(i), id) });
      const drawn = looks.filter((l) => l.look && l.look.look).length;
      expect(drawn > 0, `no ${family} creature was drawn`, looks);
      if (drawn < ids.length) finding(`${family}: ${ids.length - drawn} of ${ids.length} spawned creatures not drawn in the frame (culled or off-screen)`);
      out[family] = { spawned: ids.length, drawn, ant: ant?.id ?? null };
    }
    // the bird event (beak and shadow) and an antlion pit
    const bspot = await openGround(30, 2.2);
    await cheat('triggerBird', bspot, true);
    await spawnWorker(bspot);
    let bird = await q('bird');
    for (let i = 0; i < 60 && bird && bird.phase !== 'landed'; i++) { await step(5); bird = await q('bird'); }
    if (bird) {
      await look({ x: bird.pos.x, y: bird.pos.y + 25 * bu, z: bird.pos.z }, 110, 12, 230);
      await pic('01-creatures-bird');
      out.bird = { phase: bird.phase, pos: bird.pos };
    } else finding('cheat.triggerBird started no bird event');
    const lion = await openGround(36, 4.0);
    const al = lion ? await spawnCreature('antlion', lion) : null;
    if (al) {
      await spawnWorker({ x: lion.x + 3 * bu, y: lion.y, z: lion.z });
      await step(1);
      await look(lion, 12, 40, 210);
      await pic('01-creatures-antlion');
      out.antlion = al.id;
    }
    return out;
  });

  // ---- an aphid herd on a stem ----------------------------------------------------------------------------------
  await section('herd', async () => {
    const plants = await q('plants');
    expect(plants.length > 0, 'the world has no plant instances');
    const near = plants.filter((p) => p.pos).sort((a, b) => Math.hypot(a.pos.x - ent.x, a.pos.z - ent.z) - Math.hypot(b.pos.x - ent.x, b.pos.z - ent.z));
    let herd = null, tried = 0;
    for (const p of near.slice(0, 8)) {
      tried++;
      const existing = (await q('herds')).find((h) => h.hostId === p.id);
      if (existing) { herd = existing; break; }
      const r = await cheat('spawnHerd', p.id, 120, 0);
      herd = (await q('herds')).find((h) => h.hostId === p.id) ?? null;
      if (herd) break;
      log('spawnHerd refused', p.id, JSON.stringify(r));
    }
    expect(herd && herd.site, 'no herd could be placed on the 8 nearest plants', { tried });
    await step(1);
    await look(herd.site, 10, 15, 200);
    await pic('02-aphid-herd');
    const st = await g(() => window.__game.perf().renderers.creatures);
    expect(st.aphids > 0 || st.herds > 0, 'the herd is not drawn', st);
    return { herd, aphids: st.aphids, herds: st.herds };
  });

  // ---- spider comfort off / softened (and the look read-out of every level) -------------------------------------
  await section('comfort', async () => {
    const spot = await openGround(45, 5.1);
    expect(spot, 'no open ground for the spider');
    const sp = await spawnCreature('wolf-spider', spot);
    expect(sp, 'no wolf spider');
    await spawnWorker({ x: spot.x + 4 * bu, y: spot.y, z: spot.z });
    await step(1);
    const levels = {};
    for (const level of ['off', 'softened', 'abstract', 'marker']) {
      await g((l) => window.__game.settings({ accessibility: { spiderComfort: l } }), level);
      await look((await q('creatures')).find((c) => c.id === sp.id)?.pos ?? spot, 6, 38, 210);
      if (level !== 'marker') await pic(`03-spider-comfort-${level}`);
      else await render();
      levels[level] = await g((i) => window.__game.ui.look(i), sp.id);
      expect(levels[level]?.comfort === level, `comfort ${level} did not reach the creature renderer`, levels[level]);
    }
    // GDD 08 E17: marker = no body, a ring with the label
    expect(levels.marker.ring === true && !levels.marker.look, 'marker comfort still draws a body or no ring', levels.marker);
    await g(() => window.__game.settings({ accessibility: { spiderComfort: 'off' } }));
    return levels;
  });

  // ---- scent view on a real foraging trail ----------------------------------------------------------------------
  let foodPos = null;
  await section('scent', async () => {
    const spot = await openGround(14, 0.7);
    expect(spot, 'no open ground for the food');
    await cheat('raw', { type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: spot, units: 400, stage: null });
    const food = (await q('sources')).find((s) => Math.hypot(s.pos.x - spot.x, s.pos.z - spot.z) < 3 * bu);
    expect(food, 'the spawned food source is missing');
    foodPos = food.pos;
    // the player marks the food for the foragers (a player action, GDD 02 §12.2)
    await g((p) => window.__game.command({ type: 'placeMarker', kind: 'forage', pos: p, radius: 6 * window.__game.query.world().bu }), food.pos);
    const mid = { x: (ent.x + food.pos.x) / 2, y: (ent.y + food.pos.y) / 2, z: (ent.z + food.pos.z) / 2 };
    let trail = 0, waited = 0, ev = 0, stepMs = 0;
    for (let i = 0; i < 40 && trail <= 0 && ev === 0; i++) {
      stepMs += (await step(300)).ms;
      waited += 300;
      trail = await q('scent', mid.x, mid.y, mid.z);
      ev = (await g(() => window.__game.events('trail-established', 5))).length;
    }
    log('scent wait', waited, 'ticks', Math.round(stepMs), 'ms');
    let via = 'foragers';
    if (trail <= 0 && ev === 0) {
      // The spec asks for the scent view on a real foraging trail, so no forager trail fails the section. Only with
      // STAGE2_SOFT=1 does it go on, with the failure recorded: a worker possessed at the food walks home with trail
      // laying on (a real trail pheromone deposit by an ant, drawn by the scent view), so the scent view is still shown.
      const msg = `no forager laid a trail to a sugar spill ${Math.round(Math.hypot(food.pos.x - ent.x, food.pos.z - ent.z) / bu)} BU from the entrance in ${waited} ticks (with a forage marker on it)`;
      if (!soft) throw new Error(`stage2: ${msg}; STAGE2_SOFT=1 continues with a player-laid trail`);
      finding(msg);
      result.failures.push({ section: 'scent', error: `${msg}; the shot shows a player-laid trail` });
      via = 'possessed worker with trail on';
      const wkr = await spawnWorker({ x: food.pos.x + 2 * bu, y: food.pos.y, z: food.pos.z });
      expect(wkr, 'no worker for the trail fallback');
      await g((id) => window.__game.possess(id), wkr.id);
      await g(() => window.__game.command({ type: 'setTrail', on: true }));
      await g((p) => window.__game.views.walk(400, { toward: p }), { x: ent.x, y: ent.y, z: ent.z });
      await g(() => window.__game.command({ type: 'setTrail', on: false }));
      await g(() => { window.__game.release(); window.__game.camera.set('observer'); window.__game.step(1); });
      trail = await q('scent', mid.x, mid.y, mid.z);
      if (trail <= 0) trail = Math.max(...(await Promise.all([0.25, 0.75].map((t) => q('scent', food.pos.x + (ent.x - food.pos.x) * t, food.pos.y, food.pos.z + (ent.z - food.pos.z) * t)))));
    }
    expect(trail > 0 || ev > 0, `no trail between the nest and the food after ${waited} ticks`, { trail, ev, via });
    // a few more minutes so the trail is laid both ways
    stepMs += (await step(600)).ms;
    await g(() => window.__game.fx.overlay('scent', true));
    await look(mid, 55, 75, 210);
    await pic('04-scent-trail');
    const st = await g(() => window.__game.fx.stats());
    expect(st.scentOn === 1 && st.scentCells > 0, 'the scent view drew nothing', st);
    await g(() => window.__game.fx.overlay('scent', false));
    return { trail, via, waited, events: ev, scentCells: st.scentCells, msPerTick: Math.round((stepMs / (waited + 600)) * 100) / 100 };
  });

  // ---- temperature, moisture, threats and dig-plans overlays ----------------------------------------------------
  await section('overlays', async () => {
    const centre = foodPos ? { x: (ent.x + foodPos.x) / 2, y: ent.y, z: (ent.z + foodPos.z) / 2 } : ent;
    // a predator near the nest so the threats overlay has something to show
    const tspot = await openGround(18, 3.3);
    if (tspot) await spawnCreature('wolf-spider', tspot);
    await step(20);
    const out = {};
    for (const id of ['temperature', 'moisture', 'threats']) {
      await g((o) => window.__game.fx.overlay(o, true), id);
      await look(centre, 110, 60, 210);
      await pic(`05-overlay-${id}`);
      const st = await g(() => window.__game.fx.stats());
      expect(st.field > 0, `the ${id} overlay drew nothing`, st);
      out[id] = { field: st.field, labels: st.labels };
    }
    // dig plans: a plan from a chamber wall of the player nest (as the colony view's planner places it)
    const plan = await sim((sm) => {
      const n = sm.state.nests.find((x) => x.colony === sm.state.colonies[0].id);
      const open = ['proposed', 'queued', 'active', 'stalled', 'paused'];
      if (n.digPlans.some((p) => open.includes(p.status))) return { existing: n.digPlans.length };
      const ch = n.chambers[0];
      const out = { x: 0, y: 0, z: 0 }, nn = { x: 0, y: 1, z: 0 };
      sm.field.project({ x: ch.center.x + ch.radii.x, y: ch.center.y, z: ch.center.z }, 0, out, nn);
      return { nestId: n.id, anchor: { pos: out, normal: nn } };
    });
    if (!plan.existing) {
      const r = await g((p) => window.__game.command({ type: 'planDig', nestId: p.nestId, kind: 'chamber', chamberType: 'food', size: 's', anchor: p.anchor, yawDeg: 0, priority: 'normal', confirmWarnings: true }), plan);
      log('planDig', JSON.stringify(r));
      expect(r.ok, 'planDig was refused', r);
    }
    const plans = await sim((sm) => sm.state.nests.find((x) => x.colony === sm.state.colonies[0].id).digPlans.filter((p) => ['proposed', 'queued', 'active', 'stalled', 'paused'].includes(p.status)).map((p) => ({ id: p.id, status: p.status, anchor: p.anchor.pos })));
    expect(plans.length > 0, 'no dig plan exists for the dig-plans overlay', plan);
    await g(() => window.__game.fx.overlay('dig-plans', true));
    await look({ x: plans[0].anchor.x, y: ent.y, z: plans[0].anchor.z }, 40, 50, 210);
    await pic('05-overlay-dig-plans-observer');
    const linesObs = await g(() => window.__game.views.markers?.() ?? null);
    // ... and in the possession view: the queen in the nest
    await g(() => window.__game.possess('queen'));
    await step(2);
    await g(() => window.__game.renderFrame({ settle: 2 }));
    // The outlines are drawn without a depth test, so they are on screen exactly when their points project into the
    // view. The queen's camera faces wherever she does: orbit it round (45° steps) until the outline is in view.
    const onScreen = () => g(() => {
      const gm = window.__hud.game, cam = gm.camera, lines = gm.viewsLayer.lastMarkerScene?.lines ?? [];
      const v = cam.position.clone();
      let n = 0, inView = 0;
      for (const l of lines) {
        for (let i = 0; i + 2 < l.positions.length; i += 3) {
          n++;
          v.set(l.positions[i], l.positions[i + 1], l.positions[i + 2]).project(cam);
          if (Math.abs(v.x) <= 0.95 && Math.abs(v.y) <= 0.95 && v.z > -1 && v.z < 1) inView++;
        }
      }
      return { lines: lines.length, points: n, inView };
    });
    let seen = await onScreen();
    for (let k = 0; k < 8 && seen.inView < Math.max(4, seen.points * 0.25); k++) {
      await g(() => { window.__game.camera.orbit(45, 0); window.__game.renderFrame({ settle: 1 }); });
      seen = await onScreen();
    }
    if (seen.inView < Math.max(4, seen.points * 0.25)) {
      // still out of view (a wall in the boom's way): pitch the boom up and try once more round
      for (let k = 0; k < 8 && seen.inView < Math.max(4, seen.points * 0.25); k++) {
        await g(() => { window.__game.camera.orbit(45, 20); window.__game.renderFrame({ settle: 1 }); });
        seen = await onScreen();
      }
    }
    await pic('05-overlay-dig-plans-possess');
    const ms = seen.lines;
    expect(ms > 0, 'no plan outlines in the possession view with the dig-plans overlay on', seen);
    expect(seen.inView >= Math.max(4, seen.points * 0.25), 'the plan outline is not in the possession camera view', seen);
    await g(() => window.__game.fx.overlay('dig-plans', false));
    const off = await sim(() => { window.__game.renderFrame(); return window.__hud.game.viewsLayer.lastMarkerScene?.lines.length ?? 0; });
    expect(off === 0, 'plan outlines stay in the possession view after the overlay is off', off);
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    await step(1);
    out.digPlans = { plans: plans.length, possessLines: ms, possessOnScreen: seen, observerMarkers: linesObs };
    return out;
  });

  // ---- a mower or a broom ---------------------------------------------------------------------------------------
  await section('machine', async () => {
    const out = {};
    // outdoor human events do not start in rain (the sim's gate); a natural shower may have come by now
    await cheat('setWeather', 'clear');
    // ... and the shot needs daylight: 10:00 of the next day (calendar ticks, 6000 per day)
    const cal = await sim((sm) => sm.state.env.calendar.startTick + sm.state.tick);
    await cheat('setTime', (Math.floor(cal / 6000) + 1) * 6000 + 2500);
    await step(5);
    const sites = await q('humanSites');
    const siteKinds = { mowing: ['lawn-mown'], sweeping: ['patio', 'kerb-strip', 'interior-floor'] };
    const near = (r) => Math.hypot((r.x0 + r.x1) / 2 - ent.x, (r.z0 + r.z1) / 2 - ent.z);
    result.checks.humanSites = sites.map((h) => h.kind);
    // STAGE2_MACHINE=sweeping picks the broom alone (the mower is the default first choice and ends the loop)
    for (const kind of process.env.STAGE2_MACHINE ? process.env.STAGE2_MACHINE.split(',') : ['mowing', 'sweeping']) {
      const site = sites.filter((h) => siteKinds[kind].includes(h.kind)).sort((a, b) => near(a.rect) - near(b.rect))[0];
      if (!site) { finding(`no ${siteKinds[kind].join('/')} site in this world for ${kind}`); continue; }
      const at = { x: (site.rect.x0 + site.rect.x1) / 2, y: 0, z: (site.rect.z0 + site.rect.z1) / 2 };
      at.y = await groundY(at.x, at.z);
      const before = (await q('humans')).map((r) => r.instId);
      const r = await cheat('triggerEvent', kind, at, 0);
      log('machine', kind, site.kind, JSON.stringify(at), JSON.stringify(r));
      // the event waits in the schedule while HUMAN_MAX_CONCURRENT runs are active (re-delayed 10-30 s each time), so
      // wait while our instance is still scheduled, up to 2 game minutes, and say why when it never ran
      const humanState = () => sim((sm, k) => {
        const h = sm.state.env.human;
        return {
          now: sm.state.tick, active: h.active.map((x) => x.inst?.kind ?? '?'),
          ours: h.scheduled.filter((i) => i.kind === k).map((i) => ({ id: i.id, startTick: i.startTick, cancelled: i.cancelled })),
        };
      }, kind);
      let run = null, hs = await humanState();
      for (let i = 0; i < 120 && !run; i++) {
        await step(10);
        run = (await q('humans')).find((x) => !before.includes(x.instId) && x.kind === kind) ?? null;
        hs = await humanState();
        if (!run && !hs.ours.some((o) => !o.cancelled) && i >= 30) break;
      }
      if (!run) {
        const why = await g(() => window.__game.events('human.cancelled', 3));
        finding(`cheat.triggerEvent ${kind} at its nearest site started no run (${JSON.stringify(r)}; cancelled: ${JSON.stringify(why)}; human state: ${JSON.stringify(hs)})`);
        continue;
      }
      // where the humans renderer drew this machine: the visible root of its pooled visual (renderer internals, read
      // only: the pool per visual kind), world mm
      const visualKey = kind === 'mowing' ? 'mower' : 'broom';
      const actorAt = () => g((key) => {
        const r = window.__hud.game.registry.entries.find((e) => e.slot === 'humans').renderer;
        r.group.updateMatrixWorld(true);
        const v = (r.pools?.get(key) ?? []).find((x) => x.root.visible);
        if (!v) return null;
        const m = v.root.matrixWorld.elements;
        return { x: m[12], y: m[13], z: m[14] };
      }, visualKey);
      let drawn = 0, pos = null;
      for (let i = 0; i < 60 && !pos; i++) {
        await step(10);
        if (!(await q('humans')).some((x) => x.instId === run.instId)) break;
        await render();
        drawn = (await g(() => window.__game.perf().renderers.humans)).actors ?? 0;
        if (drawn > 0) pos = await actorAt();
      }
      if (pos) {
        await look({ x: pos.x, y: await groundY(pos.x, pos.z), z: pos.z }, kind === 'mowing' ? 380 : 220, 24, 200);
        await pic(`08-${kind}`);
        out[kind] = { drawn, at: pos };
        break;
      }
      finding(`${kind}: the run never put an actor in view`);
    }
    expect(Object.keys(out).length > 0, 'neither a mower nor a broom was drawn');
    return out;
  });

  // ---- rain, wet ground and a puddle ----------------------------------------------------------------------------
  await section('rain', async () => {
    await cheat('setWeatherClass', 'rain', 'downpour');
    let wx = null;
    for (let i = 0; i < 12; i++) {
      await step(300);
      wx = await q('weather', { x: ent.x, z: ent.z });
      if (wx.puddle && wx.surfaceWet > 0.3) break;
    }
    expect(wx.rainRateMmH > 0, 'no rain after setWeather rain', wx);
    if (!wx.puddle) finding('no puddle cell formed within 3600 ticks of a downpour');
    const at = wx.puddle && Math.hypot(wx.puddle.x - ent.x, wx.puddle.z - ent.z) < 600 * bu ? wx.puddle : { x: ent.x + 10 * bu, y: ent.y, z: ent.z };
    await spawnWorker({ x: at.x + 3 * bu, y: at.y, z: at.z });
    await step(1);
    await look(at, 18, 12, 200);
    await pic('06-rain-wet-puddle');
    const st = await g(() => window.__game.perf().renderers.weather);
    expect(st.streaks > 0, 'the weather renderer drew no rain streaks', st);
    return { weather: wx, renderer: st };
  });

  // ---- a footstep event passing a possessed worker: soles and camera tremor -------------------------------------
  await section('footsteps', async () => {
    await cheat('setWeather', 'clear');
    await step(10);
    const spot = await openGround(30, 1.9);
    expect(spot, 'no open ground for the footstep test');
    const ant = await spawnWorker(spot);
    expect(ant, 'no worker');
    await g((id) => window.__game.possess(id), ant.id);
    await step(2);
    await g(() => window.__game.renderFrame({ settle: 2 }));
    const t0 = await g(() => window.__game.camera.tremors());
    const r = await cheat('triggerEvent', 'footsteps', spot, 0);
    log('footsteps', JSON.stringify(r));
    let shotTaken = false, tremors = t0, actors = 0, runs = [];
    for (let i = 0; i < 120 && !shotTaken; i++) {
      await step(4);
      await render();
      const hs = await g(() => window.__game.perf().renderers.humans);
      actors = Math.max(actors, hs.actors ?? 0);
      tremors = await g(() => window.__game.camera.tremors());
      runs = await q('humans');
      if (hs.actors > 0 && tremors > t0) {
        await pic('07-footsteps-tremor');
        shotTaken = true;
        // the sole that just landed, from outside (the sim is not stepped in between)
        const fall = (await g(() => window.__game.events('human.impact', 1)))[0];
        if (fall) {
          await g(() => { window.__game.release(); window.__game.camera.set('observer'); });
          await look(fall.footprint, 110, 18, 200);
          await pic('07-footsteps-sole');
        }
      }
      if (i > 60 && runs.length === 0) break;
    }
    if (!shotTaken) await pic('07-footsteps-tremor');
    expect(actors > 0, 'no footstep actor was drawn', { runs });
    expect(tremors > t0, 'no tremor reached the possession camera', { t0, tremors, runs });
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    await step(1);
    return { actors, tremors: tremors - t0 };
  });


  // ---- rain at every camera distance, day and night (task stage2-look-fix) --------------------------------------
  /** Sets the clock to `hour` (0..24) of the next game day (calendar ticks, 250 per hour). */
  const setClock = async (hour) => {
    const cal = await sim((sm) => sm.state.env.calendar.startTick + sm.state.tick);
    await cheat('setTime', (Math.floor(cal / 6000) + 1) * 6000 + Math.round(hour * 250));
    await step(5);
  };
  await section('rainlook', async () => {
    const out = {};
    const spot = (await openGround(12, 0.4)) ?? { x: ent.x + 12 * bu, y: ent.y, z: ent.z };
    // STAGE2_RAINLOOK=night runs one time of day only
    const times = [['day', 12], ['night', 22]].filter(([n]) => !process.env.STAGE2_RAINLOOK || process.env.STAGE2_RAINLOOK.split(',').includes(n));
    for (const [name, hour] of times) {
      await cheat('setWeather', 'clear');
      await setClock(hour);
      await cheat('setWeatherClass', 'rain', 'downpour');
      let wx = null;
      for (let i = 0; i < 6; i++) { await step(100); wx = await q('weather', { x: ent.x, z: ent.z }); if (wx.rainRateMmH > 0) break; }
      expect(wx.rainRateMmH > 0, `no rain for the ${name} shots`, wx);
      const ant = await spawnWorker({ x: spot.x + 3 * bu, y: spot.y, z: spot.z });
      await step(2);
      // observer height
      await look(spot, 22, 20, 200);
      await pic(`10-rain-${name}-observer`);
      // a camera 7 mm above the ground, 1.8 body lengths from the worker (the crevice end of the possession range)
      const wpos = (await q('ants')).find((a) => a.id === ant.id)?.pos ?? spot;
      await g(([p, l]) => window.__game.camera.setPose(p, l), [{ x: wpos.x + 2.5 * bu, y: wpos.y + 1.8 * bu, z: wpos.z + 5 * bu }, wpos]);
      await pic(`10-rain-${name}-crevice`);
      // possession (the real ant-height camera)
      await g((id) => window.__game.possess(id), ant.id);
      await step(2);
      await g(() => window.__game.renderFrame({ settle: 2 }));
      await pic(`10-rain-${name}-possess`);
      const st = await g(() => window.__game.perf().renderers.weather);
      expect(st.streaks > 0, `no rain streaks drawn in the ${name} possession view`, st);
      out[name] = { streaks: st.streaks, splashes: st.splashes, ripples: st.ripples };
      await g(() => { window.__game.release(); window.__game.camera.set('observer'); });
      await step(1);
    }
    await cheat('setWeather', 'clear');
    return out;
  });

  // ---- the three spider comfort looks side by side, at observer and possession distance ---------------------------
  await section('comfortlook', async () => {
    await cheat('setWeather', 'clear');
    await setClock(12);
    const spot = await openGround(48, 5.6);
    expect(spot, 'no open ground for the comfort row');
    const sp = await spawnCreature('wolf-spider', spot);
    expect(sp, 'no wolf spider');
    await spawnWorker({ x: spot.x + 4 * bu, y: spot.y, z: spot.z });
    await step(1);
    const at = (await q('creatures')).find((c) => c.id === sp.id)?.pos ?? spot;
    const out = {};
    for (const [dist, elev, tag] of [[16, 30, 'observer'], [6, 22, 'possess']]) {
      for (const level of ['off', 'softened', 'abstract']) {
        await g((l) => window.__game.settings({ accessibility: { spiderComfort: l } }), level);
        await look(at, dist, elev, 215);
        await pic(`11-comfort-${tag}-${level}`);
        out[`${tag}-${level}`] = await g((i) => window.__game.ui.look(i), sp.id);
      }
    }
    await g(() => window.__game.settings({ accessibility: { spiderComfort: 'off' } }));
    return out;
  });

  // ---- moisture and temperature overlays in dry, uniform and wet weather ----------------------------------------
  await section('overlaylook', async () => {
    await cheat('setWeather', 'clear');
    await setClock(12);
    await step(60);
    const centre = foodPos ? { x: (ent.x + foodPos.x) / 2, y: ent.y, z: (ent.z + foodPos.z) / 2 } : ent;
    const out = {};
    // where the topsoil moisture changes most within 100 BU of the nest (soil against paving, wet against dry): the
    // contour lines at 25 / 50 / 75 % can only be seen where there is a gradient
    const grad = await sim((sm, c) => {
      const m = sm.state.env.moisture, bu = sm.world.bu;
      if (!m || m.nx <= 0) return null;
      const at = (x, z) => m.theta0[Math.min(m.nz - 1, Math.max(0, Math.floor(z / m.cell))) * m.nx + Math.min(m.nx - 1, Math.max(0, Math.floor(x / m.cell)))] / 255;
      const vals = [];
      let best = null, bg = -1;
      for (let dz = -100 * bu; dz <= 100 * bu; dz += 3 * bu) {
        for (let dx = -100 * bu; dx <= 100 * bu; dx += 3 * bu) {
          const x = c.x + dx, z = c.z + dz, w = 6 * bu;
          vals.push(at(x, z));
          const n = [at(x + w, z), at(x - w, z), at(x, z + w), at(x, z - w), at(x, z)];
          const g = Math.max(...n) - Math.min(...n);
          if (g > bg) { bg = g; best = { x, z }; }
        }
      }
      vals.sort((a, b) => a - b);
      return { best, gradient: bg, theta0: [0.05, 0.5, 0.95].map((p) => Math.round(vals[Math.floor(p * (vals.length - 1))] * 1000) / 1000) };
    }, ent);
    out.gradient = grad;
    const edge = grad && grad.gradient > 0.05 ? { x: grad.best.x, y: await groundY(grad.best.x, grad.best.z), z: grad.best.z } : null;
    const shoot = async (tag) => {
      for (const id of ['moisture', 'temperature']) {
        await g((o) => window.__game.fx.overlay(o, true), id);
        await look(centre, 110, 60, 210);
        await pic(`12-overlay-${id}-${tag}-wide`);
        if (edge) { await look(edge, 45, 55, 210); await pic(`12-overlay-${id}-${tag}-edge`); }
        const st = await g(() => window.__game.fx.stats());
        expect(st.field > 0, `the ${id} overlay drew nothing (${tag})`, st);
        out[`${id}-${tag}`] = { field: st.field, labels: st.labels };
        await g((o) => window.__game.fx.overlay(o, false), id);
      }
      out[`theta0-${tag}`] = (await sim((sm, c) => {
        const m = sm.state.env.moisture;
        return m.theta0[Math.floor(c.z / m.cell) * m.nx + Math.floor(c.x / m.cell)] / 255;
      }, centre));
    };
    await shoot('dry');
    await cheat('setWeatherClass', 'rain', 'downpour');
    for (let i = 0; i < 8; i++) await step(300);
    // the rain stops, the ground stays wet; the picture is taken in daylight again
    await cheat('setWeather', 'clear');
    await setClock(12);
    await shoot('wet');
    return out;
  });

  // ---- a footfall seen from outside: trouser leg, shoe and shadow (task stage2-look-fix) --------------------------
  await section('humanlook', async () => {
    await cheat('setWeather', 'clear');
    await setClock(11);
    const spot = await openGround(40, 2.4);
    expect(spot, 'no open ground for the footfall');
    // only the footsteps of this event count (a mower running on its own schedule lands impacts too)
    const steps = () => g(() => window.__game.events('human.impact', 200).filter((e) => e.kind === 'footsteps'));
    const n0 = (await steps()).length;
    const r = await cheat('triggerEvent', 'footsteps', spot, 0);
    log('humanlook footsteps', JSON.stringify(r));
    let fall = null;
    // stepping only (no rendering) until a sole has landed, then draw once: cheap under load
    for (let i = 0; i < 400 && !fall; i++) {
      await step(4);
      const list = await steps();
      if (list.length > n0) fall = list[list.length - 1];
    }
    expect(fall && fall.footprint, 'no footstep landed in 1600 ticks', fall);
    const out = {};
    for (const [tag, dist, elev, yaw] of [['high', 110, 18, 200], ['low', 55, 5, 160]]) {
      await look(fall.footprint, dist, elev, yaw);
      await pic(`13-human-shoe-${tag}`);
      out[tag] = (await g(() => window.__game.perf().renderers.humans)).actors ?? 0;
    }
    expect(out.high > 0, 'the shoe was not drawn', out);
    // the soft blob shadows the renderer laid down (renderer internals, read only): where, how big, how dark
    out.blobs = await g(() => {
      const r = window.__hud.game.registry.entries.find((e) => e.slot === 'humans').renderer;
      return r.group.children.filter((o) => o.visible && o.isMesh && o.geometry.type === 'CircleGeometry')
        .map((o) => ({ at: [o.position.x, o.position.y, o.position.z].map(Math.round), scale: [o.scale.x, o.scale.z].map(Math.round), opacity: Math.round(o.material.opacity * 100) / 100 }));
    });
    return out;
  });

  // ---- the bird's strike beside a prop (task stage2-look-fix) -----------------------------------------------------
  await section('birdlook', async () => {
    await cheat('setWeather', 'clear');
    await setClock(13);
    // a spot right beside the nearest prop: the sim's aim lands where the beak and head would pass through it
    const primSpot = async () => {
      for (const dist of [22, 30, 38, 46, 56, 70]) {
        for (let k = 0; k < 24; k++) {
          const th = (k * Math.PI) / 12, x = ent.x + Math.cos(th) * dist * bu, z = ent.z + Math.sin(th) * dist * bu;
          const y = await groundY(x, z);
          const d = await g(([x, y, z, b]) => window.__game.query.dig(x, y + 0.5 * b, z, b), [x, y, z, bu]);
          if (d.prim !== null) return { x, y, z, prim: d.prim };
        }
      }
      return null;
    };
    const bspot = (await primSpot()) ?? (await openGround(30, 2.2));
    expect(bspot, 'no ground for the bird');
    log('birdlook spot', JSON.stringify(bspot));
    await cheat('triggerBird', bspot, true);
    await spawnWorker(bspot);
    let bird = await q('bird');
    for (let i = 0; i < 80 && bird && bird.phase !== 'landed'; i++) { await step(5); bird = await q('bird'); }
    expect(bird, 'cheat.triggerBird started no bird event');
    const out = { phase: bird.phase, shots: 0, nextToPrim: bspot.prim ?? null };
    // two strikes: where the beak waits above its aim, and a few ticks later at the peck
    for (let k = 0; k < 2; k++) {
      await look({ x: bird.pos.x, y: bird.pos.y + 20 * bu, z: bird.pos.z }, 70, 14, 230 + 40 * k);
      await pic(`14-bird-${k}`);
      out.shots++;
      await step(7);
      bird = (await q('bird')) ?? bird;
    }
    return out;
  });

  // ---- frame cost with everything on (high) ---------------------------------------------------------------------
  await section('perf', async () => {
    await g(() => window.__game.quality('high'));
    await cheat('setWeatherClass', 'rain', 'shower');
    await g(() => window.__game.fx.overlay('scent', true));
    await g(() => window.__game.fx.overlay('moisture', true));
    await g(() => window.__game.fx.effects({ particles: true, motes: true }));
    await cheat('triggerEvent', 'footsteps', ent, 0);
    await step(30);
    await look(ent, 60, 30, 210);
    const frames = [];
    for (let i = 0; i < 4; i++) {
      const t = await g(() => window.__game.renderFrame({ settle: 0 }));
      const p = await g(() => window.__game.perf());
      frames.push({ ms: t.ms, drawCalls: p.drawCalls, triangles: p.triangles });
    }
    await pic('09-everything-on');
    // What each Stage 2 renderer adds: draw once with its objects moved to a camera layer nobody renders, compare.
    // Hiding a group with `visible = false` does not work: renderers own their visibility and re-show it in update()
    // (the weather renderer does on every frame), and so do re-parenting tricks (the scent view re-adds its mesh).
    // Layers are left alone by every renderer; the check after the frame proves it for this run.
    const deltas = await g(() => {
      const gm = window.__hud.game, reg = gm.registry, scene = gm.scene;
      const OFF = 31, offMask = (1 << OFF) >>> 0; // three keeps the mask unsigned
      const rootsOf = (slot) => {
        const r = reg.entries.find((e) => e.slot === slot)?.renderer;
        if (slot === 'creatures') return [r?.creatures?.group].filter(Boolean);
        if (slot === 'weather') return [r?.weather?.group].filter(Boolean);
        if (slot === 'humans') return [r?.group].filter(Boolean);
        // fx: the overlay, scent and particle layers sit directly on the scene; fx:markers belongs to the views layer
        return scene.children.filter((o) => o.name.startsWith('fx:') && o.name !== 'fx:markers');
      };
      const measure = () => { window.__game.renderFrame({ settle: 0 }); const p = window.__game.perf(); return { drawCalls: p.drawCalls, triangles: p.triangles }; };
      const all = measure();
      const out = { all, method: 'camera layer 31' };
      for (const slot of ['creatures', 'humans', 'weather', 'fx']) {
        const roots = rootsOf(slot);
        if (!roots.length) { out[slot] = null; continue; }
        const saved = [];
        for (const root of roots) root.traverse((o) => { saved.push([o, o.layers.mask]); o.layers.set(OFF); });
        const m = measure();
        // a renderer that reset layers or added objects during the frame would make the delta a lie: say so
        let leaked = 0;
        for (const root of roots) root.traverse((o) => { if (o.layers.mask !== offMask) leaked++; });
        for (const [o, mask] of saved) o.layers.mask = mask;
        out[slot] = { drawCalls: all.drawCalls - m.drawCalls, triangles: all.triangles - m.triangles, objects: saved.length, leaked };
      }
      out.fxOwnCount = { drawCalls: reg.entries.find((e) => e.slot === 'fx').renderer.drawCalls() };
      return out;
    });
    for (const slot of ['creatures', 'humans', 'weather', 'fx']) {
      if (deltas[slot]?.leaked) finding(`perf: ${deltas[slot].leaked} ${slot} object(s) escaped the measuring layer; its delta is a lower bound`);
    }
    const wxStats = await g(() => window.__game.perf().renderers.weather);
    expect(!(wxStats?.streaks > 0) || deltas.weather?.drawCalls > 0, 'perf: rain streaks drawn but the weather delta is 0 (measurement broken)', { wxStats, weather: deltas.weather });
    const p = await g(() => window.__game.perf());
    const minMs = Math.min(...frames.map((f) => f.ms));
    const budget = { drawCalls: 350, triangles: 1.5e6 };
    if (p.drawCalls >= budget.drawCalls) finding(`draw calls ${p.drawCalls} >= budget ${budget.drawCalls}`);
    if (p.triangles >= budget.triangles) finding(`triangles ${p.triangles} >= budget ${budget.triangles}`);
    await g(() => window.__game.fx.overlay('scent', false));
    await g(() => window.__game.fx.overlay('moisture', false));
    return { frames, minMs, drawCalls: p.drawCalls, triangles: p.triangles, width: p.width, height: p.height, deltas, renderers: p.renderers, budget };
  });

  result.sections = SECTIONS.filter((s) => !only || only.includes(s));
  if (result.failures.length && !soft) throw new Error(`stage2: ${result.failures.length} section(s) failed`);
  return result;
};
