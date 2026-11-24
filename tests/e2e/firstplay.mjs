// The first playable end to end (task int-1B-app, gate 1B): title -> new colony -> world generation -> the founding
// sequence -> first workers -> an autonomous colony the player watches, joins, directs and saves. Driven through
// window.__game / window.__founding, with real key and mouse events wherever a control is being proven (title and
// new-colony buttons, the intro-card key, the founding buttons, the HUD drawers, the pause menu and save screens).
// No stand-ins: a step the game cannot do fails the run. A screenshot at every beat (test quality unless noted).
//
//   node tools/harness/play.mjs --root . --query "test=1&quality=test" --script tests/e2e/firstplay.mjs \
//        --out test-output/firstplay --script-timeout 3000000
//
// Options (environment):
//   FIRSTPLAY_UNTIL=<beat prefix>  stop after that beat (iterating)
//   FIRSTPLAY_CHECKPOINT=<file>    write the game exported right after the hand-over to this file
//   FIRSTPLAY_RESUME=<file>        skip the opening: import that export (written by an earlier run) and go on from it
//   FIRSTPLAY_TRAIL_CHECKPOINT=<file> write the game exported right after the trail check of beat 13 -> 14 (the slow part)
//   FIRSTPLAY_AT_TRAIL=1           with FIRSTPLAY_RESUME=<that file>: go on from the trail check (beats 14 to 25) without the 16000-tick wait
//   FIRSTPLAY_SEED=<hex code>      seed typed into the New colony screen (default 00000002: seed 2, warm summer)
//   FIRSTPLAY_AUTOFOUND=1          STAND-IN: complete the opening by cheat after beat 04 (recorded in result.standIns)
//   FIRSTPLAY_STANDIN_TRAIL=1      STAND-IN: lay the trail to the food by hand when no forager has (beat 13 -> 14; recorded in result.standIns)
//   FIRSTPLAY_CONTINUE=1           a failed check is recorded (result.softFailures) and the run goes on to the next beat (not a pass)
//   FIRSTPLAY_SHORT=1              the short run (portable build): title, new colony, intro, queen, workers, save
import fs from 'node:fs';
import {
  clearPose, digBite, findSite, FULL_RUN_BEATS, growthVerdict, helpers, lastSeq, nestOf, ROOM_MAX_ROUNDS, SHAFT_DEPTH_BU,
  SHAFT_MAX_BITES, SHAFT_SLOPE_DEG, SITE_MAX_R_BU, steerTo, walkDir,
} from './lib/firstplay-steps.mjs';

class Stop extends Error {}

export default async (ctx) => {
  const { page, log, out } = ctx;
  const result = { beats: [], checks: {}, out };
  const h = helpers(ctx, result);
  // FIRSTPLAY_DUMP=1 (opening-fix, instrumentation only): before every beat and at the lapse start / the reopen check, one JSON line in
  // <out>/dump.jsonl with the tick, the state hash, the founding phase, the possessed ant, the player nest's water, entrances and cell,
  // and (reopen) the colony's workers with their task, state and nav; compared with tools/sim/opening.ts's hashes.
  const dump = async (tag) => {
    if (!process.env.FIRSTPLAY_DUMP) return;
    const d = await g((t) => {
      const gm = window.__game, s = window.__hud?.game?.session, sim = s?.sim;
      if (!sim) return { tag: t };
      const col = sim.state.player.colonyId, n = sim.state.nests.find((x) => x.colony === col), a = sim.stores.ants.get(sim.state.player.possessedAntId);
      const r = (o) => JSON.parse(JSON.stringify(o ?? null));
      return r({ tag: t, tick: sim.state.tick, hash: gm.stateHash(), phase: sim.state.player.opening?.phase, speed: sim.state.env.time.speed,
        possessed: a ? { id: a.id, caste: a.caste, pos: a.pos } : null, water: n?.flood.water, level: n?.flood.level,
        entrances: n?.entrances.map((e) => ({ id: e.id, st: e.status, plug: e.plugVoxelCount, pos: e.pos })), chambers: n?.chambers.map((c) => ({ id: c.id, t: c.type, c: c.center })),
        plans: n?.digPlans.filter((p) => p.status !== 'complete' && p.status !== 'cancelled').map((p) => ({ id: p.id, kind: p.kind, src: p.source, st: p.status })),
        opening: { lapse: sim.state.player.opening?.lapse, hazards: sim.state.player.opening?.hazardLog?.slice(-4) },
        workers: t.startsWith('reopen') ? sim.state.ants.filter((x) => x.alive && x.colony === col).map((x) => ({ id: x.id, caste: x.caste, task: x.task, state: x.state, pos: x.pos, nav: x.nav, action: x.action })) : undefined });
    }, tag);
    fs.appendFileSync(`${out}/dump.jsonl`, JSON.stringify(d) + '\n');
    // FIRSTPLAY_DUMP_STATE=<beat prefix>: the whole sim state (typed arrays as arrays) at that beat, for a field-by-field diff
    if (process.env.FIRSTPLAY_DUMP_STATE && tag.startsWith(process.env.FIRSTPLAY_DUMP_STATE)) {
      const st = await g(() => JSON.stringify(window.__hud.game.session.sim.state, (_k, x) => (ArrayBuffer.isView(x) ? Array.from(x) : x)));
      fs.writeFileSync(`${out}/state-${tag}.json`, st);
    }
  };
  if (process.env.FIRSTPLAY_DUMP) { const b = h.beat; h.beat = async (name, ...rest) => { await dump(name); return b(name, ...rest); }; }
  const { g, expect, summary, view, phase, render, step, visible, beat } = h;
  const UNTIL = process.env.FIRSTPLAY_UNTIL ?? '';
  const SHORT = !!process.env.FIRSTPLAY_SHORT;
  const done = (name) => { if (UNTIL && name.startsWith(UNTIL)) throw new Stop(name); };
  /** A complete run from a fresh game: every beat is required (not the short, resumed, cut or stand-in runs). */
  const fullRun = () => !UNTIL && !SHORT && !process.env.FIRSTPLAY_RESUME && !result.standIns?.length;
  const click = async (id) => { await page.click(`[data-testid="${id}"]`, { timeout: 60000 }); await h.frames(2); };
  const consoleErrors = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  try {
    // ---- 1. title with its live backdrop ----------------------------------------------------------------------------
    await page.waitForSelector('[data-testid="menu-new"]', { timeout: 120000 });
    expect(await g(() => window.__game.summary().mode) === 'title', 'boot did not land on the title');
    const title = await g(() => window.__game.perf().renderers.world);
    expect(title.terrainTriangles > 0, 'the title has no backdrop world', title);
    await beat('01-title', ['menu-new']);
    done('01');

    // ---- 2. new colony screen (real clicks and typing) --------------------------------------------------------------
    await click('menu-new');
    await page.waitForSelector('[data-testid="seed-field"]', { timeout: 60000 });
    await page.fill('[data-testid="seed-field"]', process.env.FIRSTPLAY_SEED ?? '00000002');
    await h.frames(2);
    const code = await g(() => document.querySelector('[data-testid="seed-code"]')?.textContent ?? '');
    result.checks.seedCode = code;
    await beat('02-new-colony', ['begin'], { draw: false });
    done('02');

    let resumed = false;
    if (process.env.FIRSTPLAY_RESUME) {
      // iterate on the colony beats from a stored hand-over: start the typed game, then import the checkpoint
      await click('begin');
      await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000 });
      const text = fs.readFileSync(process.env.FIRSTPLAY_RESUME, 'utf8');
      const r = await g((t) => window.__game.saves.importText(t, 'now'), text);
      expect(r.ok, 'resume import failed', r);
      await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000 });
      resumed = true;
      log('resumed from', process.env.FIRSTPLAY_RESUME, JSON.stringify(await g(() => window.__game.summary().time)));
    }

    if (!resumed) {
      // ---- 3. generation, then the world with the intro card --------------------------------------------------------
      const t0 = Date.now();
      await click('begin');
      await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
      result.checks.generateS = Math.round((Date.now() - t0) / 100) / 10;
      let s = await summary();
      result.checks.world = { seed: s.seed, possessed: s.possessed?.caste, view: s.view };
      expect(await phase() === 'intro-card', 'a new game starts on the intro card', await phase());
      expect(s.possessed?.caste === 'queen' && s.view === 'possess', 'the founding queen is not possessed at the start', result.checks.world);
      await step(1);
      await beat('03-world-intro-card', ['founding-intro']);
      done('03');

      // ---- 4. a real key closes the card; the queen in third person on the surface ----------------------------------
      await page.keyboard.press('KeyW');
      await step(1);
      expect(await phase() === 'dealation', 'the intro card did not close on a key', await phase());
      await step(85);
      expect(await phase() === 'search', 'dealation did not end in search', await phase());
      s = await summary();
      // framing as the look reference (docs/research/spike-look-img/high-midday.png): the ant in the lower middle, one
      // body length spanning at least 13 % of the frame width (the reference ant's body is about 170 px of 1280)
      const camQueen = await g(() => {
        const gm = window.__game, p = gm.summary().possessed, a = gm.query.ant(p.id), L = a.lengthBu * gm.query.world().bu;
        const c = gm.camera.pose(), d = c.dir, u = c.up;
        const r = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x }, rl = Math.hypot(r.x, r.y, r.z) || 1;
        const pos = { x: p.pos[0], y: p.pos[1], z: p.pos[2] };
        const scr = gm.views.project(pos);
        const edge = gm.views.project({ x: pos.x + (r.x / rl) * L / 2, y: pos.y + (r.y / rl) * L / 2, z: pos.z + (r.z / rl) * L / 2 });
        const lengthPx = scr && edge ? 2 * Math.hypot(edge.x - scr.x, edge.y - scr.y) : 0;
        return { scr, lengthPx: Math.round(lengthPx), w: innerWidth, h: innerHeight, cam: gm.camera.state(), clear: gm.camera.clearance() };
      });
      result.checks.queenFraming = camQueen;
      expect(camQueen.scr && camQueen.scr.x > 0.3 * camQueen.w && camQueen.scr.x < 0.7 * camQueen.w && camQueen.scr.y > 0.55 * camQueen.h, 'the queen is not in the lower middle of the frame', camQueen);
      expect(camQueen.lengthPx >= 0.13 * camQueen.w, 'the queen is small in the frame (a body length under 13 % of the width)', camQueen);
      expect(camQueen.clear && camQueen.clear.f > 0, 'the possession camera is inside solid', camQueen.clear);
      await beat('04-queen-surface');
      done('04');
      if (SHORT) throw new Stop('short');

      if (process.env.FIRSTPLAY_AUTOFOUND) {
        // STAND-IN (recorded): the opening's remaining steps run automatically (cheat.completeFounding), for iterating
        // on the colony beats while a founding step is broken. The founding beats 05-12 are then not proven.
        result.standIns = ['founding: cheat.completeFounding instead of the player\'s dig, seal and clutch'];
        log('STAND-IN founding via cheat.completeFounding');
        await g(() => window.__game.cheat.completeFounding(12));
        for (let i = 0; i < 160; i++) {
          const ph = await phase();
          if (ph === 'handover' || ph === 'done' || ph === null) break;
          await g(() => { window.__founding?.skipLapse?.(); window.__game.step(500); });
        }
        if (await h.visible('founding-continue')) await click('founding-continue');
        await step(1);
        result.checks.autoFounding = { phase: await phase(), tick: (await summary()).tick, workers: (await g(() => window.__game.query.growth()))?.castes };
        log('autoFounding', JSON.stringify(result.checks.autoFounding));
      } else {
        // ---- 5. find diggable ground, walk there, antennate: the site read-out ------------------------------------------
        const bu = await h.bu();
        const start = { x: s.possessed.pos[0], y: s.possessed.pos[1], z: s.possessed.pos[2] };
        const site = await findSite(h, start, 2, SITE_MAX_R_BU, 1);
        expect(site, `no diggable founding site within ${SITE_MAX_R_BU} BU of the start`, start);
        const H = site.h;
        expect(await steerTo(h, site.x - H.x * 1.5 * bu, site.z - H.z * 1.5 * bu, 0.8 * bu), 'the queen did not reach the site', site);
        await walkDir(h, 2, H);
        await step(5);
        await page.keyboard.press('KeyT'); // antennate the ground (sniff): the key, not the API
        await step(20);
        let v = await view();
        if (!(v.site && v.site.active)) { log('T did not sniff; prompt', JSON.stringify(await g(() => window.__game.query.prompt()))); await g(() => window.__game.act('sniff')); await step(20); v = await view(); }
        expect(v.site && v.site.active, 'no site read-out after sniffing', v.site);
        result.checks.site = { q: v.site.q, word: v.site.word, rBu: site.rBu };
        await beat('05-site-readout', ['founding-site']);
        done('05');

        // ---- 6. dig the entrance: the mound grows ---------------------------------------------------------------------
        const mouth = (await summary()).possessed.pos;
        const depthBu = (p) => (mouth[1] - p[1]) / bu;
        for (let k = 0; k < 6 && (await phase()) === 'search'; k++) {
          await digBite(h, SHAFT_SLOPE_DEG, 30, H);
          if ((await phase()) === 'search') await walkDir(h, 2, H);
        }
        expect(await phase() === 'dig', 'the first bite did not start the dig', await phase());
        let bites = 1, depth = 0, depthBar = 0, best = 0, bestAt = 0, shotMound = false, shotShaft = false;
        while (bites < SHAFT_MAX_BITES && (depthBar < 1 || depth < SHAFT_DEPTH_BU - 2) && bites - bestAt < 60) {
          const seq0 = await lastSeq(h);
          await digBite(h, SHAFT_SLOPE_DEG, 30, H);
          const failed = await g((q) => window.__game.events('action-failed', 5, q).filter((e) => e.reason !== 'blocked').length, seq0);
          if (failed > 0) await walkDir(h, 3, H);
          bites++;
          depth = depthBu((await summary()).possessed.pos);
          depthBar = (await view()).readiness?.depth ?? 0;
          if (depth > best + 0.1) { best = depth; bestAt = bites; }
          if (!shotMound && depth > 3) {
            // the entrance and its growing mound from the surface (observer for one frame, then back to her)
            shotMound = true;
            const mounds = await g(() => window.__game.query.mounds());
            result.checks.moundEarly = mounds.map((m) => m.volume);
            await g(() => window.__game.release());
            const e0 = (await nestOf(h)).entrances[0];
            await g(({ a, l }) => window.__game.camera.setPose(a, l), await clearPose(h, e0?.pos ?? { x: mouth[0], y: mouth[1], z: mouth[2] }, 9, 14));
            await beat('06-digging-entrance-mound');
            await g(() => window.__game.possess('queen'));
            await step(2);
            done('06');
          }
          if (!shotShaft && depth > 5.5) {
            shotShaft = true;
            await render(1);
            const cam = await g(() => ({ state: window.__game.camera.state(), clear: window.__game.camera.clearance(), under: window.__game.summary().camera?.underground }));
            result.checks.shaftCamera = cam;
            expect(cam.clear && cam.clear.f > 0, 'the camera is inside solid in the shaft', cam);
            await beat('07-inside-shaft');
            done('07');
          }
        }
        result.checks.shaft = { bites, depthBu: depth, depthBar };
        expect(depthBar >= 1, 'the shaft did not get deep enough', result.checks.shaft);

        // ---- 7. the founding chamber: level bites round the shaft's end until the cell is ready -------------------------
        const rot = (deg) => { const c = Math.cos((deg * Math.PI) / 180), sn = Math.sin((deg * Math.PI) / 180); return { x: H.x * c - H.z * sn, y: 0, z: H.x * sn + H.z * c }; };
        const centre = (await summary()).possessed.pos;
        for (let r = 0; r < ROOM_MAX_ROUNDS && (await phase()) === 'dig'; r++) {
          for (let k = 0; k < 8; k++) {
            if ((await phase()) !== 'dig') break;
            const d = rot(k * 45 + (r % 2) * 22.5);
            await steerTo(h, centre[0], centre[2], 0.4 * bu);
            await walkDir(h, 1, d);
            for (let b = 0; b < 2; b++) await digBite(h, 3, 40, d);
          }
          await step(60);
        }
        v = await view();
        result.checks.readiness = v.readiness;
        expect(v.phase === 'seal', 'the founding cell never became ready', { phase: v.phase, readiness: v.readiness });
        await render(1);
        const camCell = await g(() => ({ state: window.__game.camera.state(), clear: window.__game.camera.clearance() }));
        result.checks.chamberCamera = camCell;
        expect(camCell.clear && camCell.clear.f > 0, 'the camera is inside solid in the chamber', camCell);
        await beat('08-founding-chamber', ['founding-readiness']);
        done('08');

        // ---- 8. sealing: E at the shaft (held seal-entrance) ------------------------------------------------------------
        await g(() => window.__game.act({ action: 'dig-bite', phase: 'stop' }));
        await step(20);
        // founding-close's rule: one press of the seal action from anywhere in the shaft; the founding walks her to the
        // throat by her own movement input and plugs the actual leak, repeating until the entrance is sealed
        let seals = 0;
        await g(() => window.__game.act('seal-entrance'));
        for (let t = 0; t < 3000 && (await phase()) === 'seal'; t += 50) {
          await step(50);
          seals = await g(() => window.__game.events('action-completed', 400).filter((e) => e.action === 'seal-entrance').length);
        }
        for (let i = 0; i < 5 && (await phase()) === 'seal'; i++) await step(20);
        result.checks.seal = { seals, entrances: (await nestOf(h)).entrances.map((e) => `${e.status}:${e.plugVoxelCount ?? ''}`), refusals: await g(() => window.__game.events('action-failed', 8).map((e) => `${e.action}:${e.reason}`)) };
        expect(await phase() === 'lay', 'the entrance was not sealed (founding-close owns sealing)', result.checks.seal);
        await beat('09-sealed');
        done('09');

        // ---- 9. the first clutch ----------------------------------------------------------------------------------------
        for (let i = 0; i < 40; i++) { if (depthBu((await summary()).possessed.pos) >= SHAFT_DEPTH_BU - 1) break; await walkDir(h, 3, H); }
        const layBatch = async () => { await g(() => window.__game.act('lay-egg')); await step(50); await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' })); await step(5); };
        for (let b = 0; b < 4; b++) await layBatch();
        v = await view();
        if (!v.clutch || v.clutch.eggs === 0) {
          const cell = (await nestOf(h)).chambers.find((c) => c.type === 'founding');
          for (let i = 0; i < 3 && cell && (!v.clutch || v.clutch.eggs === 0); i++) {
            await steerTo(h, cell.center.x, cell.center.z, 0.6 * bu);
            for (let b = 0; b < 4; b++) await layBatch();
            v = await view();
          }
        }
        result.checks.clutch = v.clutch;
        expect(v.clutch && v.clutch.eggs >= 6, 'no eggs laid', v.clutch);
        await g(() => window.__game.camera.orbit(160, 15));
        await g(() => window.__game.camera.zoom(1.3));
        await beat('10-first-clutch', ['founding-clutch']);
        done('10');

        // ---- 10. "Tend the brood" (real click): the time-lapse overlay, then the skip button --------------------------
        await click('founding-tend');
        await dump('lapse-start');
        await step(1);
        expect(await phase() === 'timelapse', 'Tend the brood did not start the time-lapse', await phase());
        // Step until the overlay shows brood (larvae), in short steps. The lapse is NOT closed by the founding flow: the simulation ends it
        // itself when every brood item is gone before a worker eclosed ("brood lost", fnd-review rule): the opening then goes back to the
        // lay phase for ONE relay clutch (colony/founding/failure.ts broodLost). The overlay is then legitimately gone, and the way to a
        // lapse that shows brood is to tend the new clutch. `lapseTrace` records what the lapse looked like, for the report.
        const lapseTrace = [];
        result.checks.relayClutches = 0;
        for (let i = 0; i < 400; i++) {
          const t = (await view()).timelapse;
          lapseTrace.push(t ? { i, progress: Math.round(t.progress * 1000) / 1000, stage: t.stage, counters: t.counters } : { i, over: true, phase: await phase() });
          if (t && t.counters.larvae > 0) break;
          if (!t) {
            const ph = await phase();
            if (ph !== 'lay' || result.checks.relayClutches >= 2) break; // handed over, failed, or a second relay: let the beat report it
            result.checks.relayClutches++;
            log('the lapse ended in brood lost; relay clutch', result.checks.relayClutches, JSON.stringify(lapseTrace[lapseTrace.length - 2] ?? null));
            // the relay clutch is laid by the player like the first one (the queen is in the chamber, the entrance sealed)
            for (let b = 0; b < 4; b++) await layBatch();
            for (let k = 0; k < 120 && !(await visible('founding-tend')) && (await phase()) === 'lay'; k++) { await layBatch(); await step(25); }
            // a DOM click, not Playwright's: the relay screen re-renders the button while it is being laid under
            if ((await phase()) === 'lay') await g(() => document.querySelector('[data-testid="founding-tend"]')?.click());
            await step(1);
            continue;
          }
          await step(50);
        }
        result.checks.lapseTrace = lapseTrace.filter((_, k) => k % 10 === 0 || k === lapseTrace.length - 1);
        log('lapse trace', JSON.stringify(lapseTrace[lapseTrace.length - 1]), 'relay clutches', result.checks.relayClutches);
        // look pass 5: where the chamber shot looks and what is in the cell (the cut plane has to pass through the cell with the animals below it)
        const shotInfo = () => g(() => {
          const s2 = window.__hud.game.session, v2 = s2.views, sim = s2.sim, col = sim.state.player.colonyId;
          const q = sim.stores.ants.get(sim.stores.colonies.get(col).queenId), nest = sim.state.nests.find((n) => n.colony === col);
          const r = (o) => JSON.parse(JSON.stringify(o ?? null));
          return r({ subject: v2.shotSource ? v2.shotSource() : null, queen: q && q.pos, chambers: nest?.chambers.map((c) => ({ c: c.center, r: c.radii, roofMin: c.roofMin, depthMm: c.depthMm })), origin: nest?.origin,
            brood: sim.state.brood.filter((b) => b.alive && b.colony === col).slice(0, 4).map((b) => [b.stage, b.pos]), ants: sim.state.ants.filter((a) => a.alive && a.colony === col).slice(0, 5).map((a) => [a.caste, a.pos]) });
        });
        result.checks.shotAtLapse = await shotInfo();
        log('shot at lapse', JSON.stringify(result.checks.shotAtLapse));
        await beat('11-timelapse', ['founding-lapse']);
        done('11');
        await click('founding-skip');
        await step(1);
        v = await view();
        expect(v.phase === 'handover' || v.phase === 'done', 'skip did not end the lapse', v.phase);
        result.checks.outcome = v.outcome;
        result.checks.shotAtOutcome = await shotInfo();
        log('shot at outcome', JSON.stringify(result.checks.shotAtOutcome));
        await beat('12-outcome-card', ['founding-outcome']);
        await click('founding-continue');
        await step(1);
      }

      // ---- 11. first workers at the reopened entrance -----------------------------------------------------------------
      // the hand-over banner: "Take a worker" (real click) releases the queen to her chamber and gives a worker
      if (await h.visible('founding-worker')) { await click('founding-worker'); await step(2); }
      else await g(() => window.__game.release());
      result.checks.afterHandover = { possessed: (await summary()).possessed?.caste ?? null };
      const outside = () => g(() => {
        const gm = window.__game, bu = gm.query.world().bu, n = gm.query.nest()[0];
        return gm.query.ants().some((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id && gm.query.field(a.pos.x, 0, a.pos.z).height - a.pos.y < 0.5 * bu
          && n.entrances.every((e) => Math.hypot(a.pos.x - e.pos.x, a.pos.z - e.pos.z) > 3 * bu));
      });
      let opened = false, outOk = false;
      for (let i = 0; i < 30 && !(opened && outOk); i++) {
        await step(250);
        opened ||= (await nestOf(h)).entrances.some((e) => e.status === 'open');
        outOk ||= opened && await outside();
      }
      await dump('reopen-check');
      result.checks.reopened = { opened, outside: outOk, phase: await phase(), entrances: (await nestOf(h)).entrances.map((e) => `${e.status}:${e.plugVoxelCount}`) };
      log('reopened', JSON.stringify(result.checks.reopened));
      if (!opened && process.env.FIRSTPLAY_AUTOFOUND) {
        // STAND-IN (recorded): the plug is carved open by cheat when the first workers did not reopen it
        (result.standIns ??= []).push('reopening: cheat.carveSphere through the plug');
        log('STAND-IN reopening via cheat.carveSphere');
        const e = (await nestOf(h)).entrances[0];
        await g((p) => window.__game.cheat.raw({ type: 'cheat.carveSphere', pos: p, r: 1.4 * window.__game.query.world().bu }), e.pos);
        for (let i = 0; i < 30 && !(opened && outOk); i++) {
          await step(250);
          opened ||= (await nestOf(h)).entrances.some((x) => x.status === 'open');
          outOk ||= opened && await outside();
        }
        result.checks.reopenedByCheat = { opened, outside: outOk };
      }
      expect(opened && outOk, 'the first workers did not reopen the entrance and walk out', (await nestOf(h)).entrances.map((e) => `${e.status}:${e.plugVoxelCount}`));
      const e0 = (await nestOf(h)).entrances.find((e) => e.status === 'open') ?? (await nestOf(h)).entrances[0];
      await g(() => window.__game.release());
      await g(({ a, l }) => window.__game.camera.setPose(a, l), await clearPose(h, e0.pos, 8, 14));
      await beat('13-first-workers-entrance');
      done('13');
      if (process.env.FIRSTPLAY_CHECKPOINT) {
        const x = await g(() => window.__game.saves.export('current', 'text'));
        if (x?.ok && typeof x.text === 'string') { fs.writeFileSync(process.env.FIRSTPLAY_CHECKPOINT, x.text); log('checkpoint written', process.env.FIRSTPLAY_CHECKPOINT); } else log('checkpoint export failed', JSON.stringify(x).slice(0, 300));
      }
    }

    await colonyBeats(h, result, { page, click, done, log });
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    log('stopped after', e.message);
  }
  result.consoleErrors = consoleErrors;
  expect(consoleErrors.length === 0, 'console errors', consoleErrors);
  if (fullRun()) {
    const missing = FULL_RUN_BEATS.filter((b) => !result.beats.includes(b));
    expect(missing.length === 0, 'beats missing from a full run', missing);
  }
  expect(!result.failures?.length, 'failed checks', result.failures);
  log('result', JSON.stringify(result));
  if (result.softFailures?.length) throw new Error(`firstplay (FIRSTPLAY_CONTINUE): ${result.softFailures.length} failed check(s): ${result.softFailures.map((f) => f.slice(0, 160)).join(' | ')}`);
  return result;
};

/** The colony half: a forager's trip, the queen's orders, Roster, observer + inspect, colony view, days, saves. */
async function colonyBeats(h, result, { page, click, done, log }) {
  const { g, expect, summary, step, beat, render } = h;
  const bu = await h.bu();
  const nest = await nestOf(h);
  const ent = nest.entrances.find((e) => e.status === 'open') ?? nest.entrances[0];

  // ---- 12. food near the nest; foragers find it and lay a trail; a worker is possessed and follows it ----------------
  // setup, not a stand-in: a sugar spill a short walk from the entrance so the trip fits a scripted run
  let spot = null, food = null, trail = 0, via = 'scouts', waited = 0;
  if (process.env.FIRSTPLAY_AT_TRAIL) {
    // iterating on beats 14+: the game was exported right after the trail check (FIRSTPLAY_TRAIL_CHECKPOINT), the spill and its trail are in it
    food = (await g(() => window.__game.query.sources())).filter((x) => Math.hypot(x.pos.x - ent.pos.x, x.pos.z - ent.pos.z) < 40 * bu).sort((p, q) => q.id - p.id)[0];
    expect(food, 'no food source in the trail checkpoint');
    trail = await g((m) => window.__game.query.scent(m.x, m.y, m.z), { x: (ent.pos.x + food.pos.x) / 2, y: (ent.pos.y + food.pos.y) / 2, z: (ent.pos.z + food.pos.z) / 2 });
    via = 'checkpoint';
  } else {
  const dirOut = { x: Math.cos(0.7), z: Math.sin(0.7) };
  for (let k = 0; k < 16 && !spot; k++) {
    const th = 0.7 + (k * Math.PI) / 8, x = ent.pos.x + Math.cos(th) * 22 * bu, z = ent.pos.z + Math.sin(th) * 22 * bu;
    const f = await g(([x, z]) => window.__game.query.field(x, 0, z), [x, z]);
    const dig = await g(([x, y, z]) => window.__game.query.dig(x, y + 0.5 * window.__game.query.world().bu, z, window.__game.query.world().bu), [x, f.height, z]);
    if (dig.prim === null) spot = { x, y: f.height, z };
  }
  expect(spot, 'no open ground for the food near the entrance');
  const sp = await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: p, units: 400, stage: null }), spot);
  log('food', JSON.stringify(sp), JSON.stringify(spot), dirOut);
  const srcs = await g(() => window.__game.query.sources());
  food = srcs.filter((s) => Math.hypot(s.pos.x - spot.x, s.pos.z - spot.z) < 3 * bu)[0];
  expect(food, 'the spawned food source is missing', srcs.length);
  const waitTrail = async (n) => {
    for (let i = 0; i < n && trail <= 0; i++) {
      await step(300);
      waited += 300;
      const mid = { x: (ent.pos.x + food.pos.x) / 2, y: (ent.pos.y + food.pos.y) / 2, z: (ent.pos.z + food.pos.z) / 2 };
      trail = await g((m) => window.__game.query.scent(m.x, m.y, m.z), mid);
      if (trail <= 0) {
        const ev = await g(() => window.__game.events('trail-established', 1));
        if (ev.length) trail = 1e-6;
      }
    }
  };
  await waitTrail(30);
  if (trail <= 0) {
    // The scouts have not found it: the player marks the food for the foragers (GDD 02 §12.2), with the colony view's
    // marker tool, as a player would. A player action, not a stand-in; the missed discovery is reported as a finding.
    (result.findings ??= []).push(`no scout discovered a sugar spill ${Math.round(Math.hypot(food.pos.x - ent.pos.x, food.pos.z - ent.pos.z))} mm from the open entrance in ${waited} ticks (foragers wait in the nest for a known source)`);
    const back = (await summary()).view;
    await g(() => window.__game.camera.set('colony'));
    await step(1);
    await g((o) => window.__game.views.colonyCamera(o), { x: food.pos.x, z: food.pos.z, distBu: 60, pitchDeg: 60, yawDeg: 20, cutaway: 'off' });
    await render(1);
    await g(() => window.__game.views.tool('forage'));
    const fs = await g((p) => window.__game.views.project(p), food.pos);
    if (fs) await g(([x, y]) => window.__game.views.click(x, y), [fs.x, fs.y]);
    await g(() => window.__game.views.tool(null));
    const placed = (await g(() => window.__game.views.markers())).filter((m) => m.kind === 'forage').length;
    expect(placed > 0, 'the forage marker on the food was not placed', fs);
    await g(() => window.__game.camera.set('observer'));
    if (back === 'possess') await g(() => window.__game.possess('queen'));
    via = 'forage-marker';
    await waitTrail(30);
  }
  if (trail <= 0 && process.env.FIRSTPLAY_STANDIN_TRAIL) {
    // STAND-IN (the colony does not reliably send foragers out in this build: see the app-seams-2 report): a trail from the entrance to the food is laid by hand, so
    // the beats that follow it (14 to 25) can still be run. Recorded in result.standIns; a run with it is not a full run.
    (result.standIns ??= []).push('trail: phero.deposit by hand from the entrance to the food (no forager laid one)');
    await g(([a, b]) => {
      const sim = window.__hud.game.session.sim, col = sim.state.colonies.find((c) => c.isPlayer).id;
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        sim.phero.deposit(col, 'trail', { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t + 1, z: a.z + (b.z - a.z) * t }, 8);
      }
    }, [ent.pos, food.pos]);
    // 18000 ticks on, the first spill is used up or dried: a fresh one at the same spot for the player's harvest (beat 15)
    await g((p) => window.__game.cheat.raw({ type: 'cheat.spawnFood', kind: 'sugar', variant: 'sugary-spill', pos: p, units: 400, stage: null }), spot);
    const fresh = (await g(() => window.__game.query.sources())).filter((x) => Math.hypot(x.pos.x - spot.x, x.pos.z - spot.z) < 3 * bu).sort((a, b) => b.id - a.id)[0];
    if (fresh) food = fresh;
    trail = await g((m) => window.__game.query.scent(m.x, m.y, m.z), { x: (ent.pos.x + food.pos.x) / 2, y: (ent.pos.y + food.pos.y) / 2, z: (ent.pos.z + food.pos.z) / 2 });
    via = 'stand-in';
  }
  }
  const g0 = await g(() => window.__game.query.growth());
  result.checks.trail = { trail, via, waited, growth: g0 };
  log('trail check', JSON.stringify(result.checks.trail));
  expect(trail > 0, 'no forager laid a trail to the food within 18000 ticks');
  if (process.env.FIRSTPLAY_TRAIL_CHECKPOINT && !process.env.FIRSTPLAY_AT_TRAIL) {
    const x = await g(() => window.__game.saves.export('current', 'text'));
    if (x?.ok && typeof x.text === 'string') { fs.writeFileSync(process.env.FIRSTPLAY_TRAIL_CHECKPOINT, x.text); log('trail checkpoint written'); } else log('trail checkpoint export failed', JSON.stringify(x).slice(0, 200));
  }
  // possess a worker near the entrance (Tab cycles from the observer focus; the API by id keeps it deterministic)
  const worker = await g((e) => {
    const gm = window.__game, bu = gm.query.world().bu;
    const ws = gm.query.ants().filter((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id).sort((a, b) => Math.hypot(a.pos.x - e.x, a.pos.z - e.z) - Math.hypot(b.pos.x - e.x, b.pos.z - e.z));
    const surface = ws.find((a) => gm.query.field(a.pos.x, 0, a.pos.z).height - a.pos.y < 0.5 * bu);
    return (surface ?? ws[0])?.id ?? -1;
  }, ent.pos);
  expect(worker >= 0, 'no worker to possess');
  await g((id) => window.__game.possess(id), worker);
  await step(2);
  let s = await summary();
  expect(s.possessed?.id === worker, 'possessing the worker failed', s.possessed);
  // walk to the food along the trail (sample the scent on the way: she is on the trail)
  // beat 14 is shot on the first sample on scent with the food still ahead (> 3 BU), else on arrival: never skipped
  let onTrail = 0, samples = 0, trailShot = null;
  for (let i = 0; i < 80; i++) {
    const p = (await summary()).possessed.pos;
    const d = Math.hypot(food.pos.x - p[0], food.pos.z - p[2]);
    if (d < 1.2 * bu) break;
    await g((v) => window.__game.setIntent({ dir: v }), { x: (food.pos.x - p[0]) / d, y: 0, z: (food.pos.z - p[2]) / d });
    await step(5);
    samples++;
    const scented = (await g((q) => window.__game.query.scent(q[0], q[1], q[2]), p)) > 0;
    if (scented) onTrail++;
    if (!trailShot && scented && d > 3 * bu) { await beat('14-worker-following-trail'); trailShot = { sample: samples, distBu: Math.round((d / bu) * 10) / 10 }; }
  }
  if (!trailShot) { await beat('14-worker-following-trail'); trailShot = { sample: samples, distBu: null, fallback: 'at the food' }; }
  await g(() => window.__game.setIntent({}));
  result.checks.trailWalk = { onTrail, samples, shot: trailShot };
  const before = await g((id) => { const a = window.__game.query.ant(id); return { c: a.cropC, p: a.cropP }; }, worker);
  await g((f) => window.__game.act({ action: 'harvest-liquid', target: { kind: 'source', id: f.id, pos: f.pos } }), food);
  for (let i = 0; i < 20; i++) { await step(10); if (!(await g((id) => window.__game.query.ant(id)?.action, worker))) break; }
  await g(() => window.__game.act({ action: 'harvest-liquid', phase: 'stop' }));
  const after = await g((id) => { const a = window.__game.query.ant(id); return { c: a.cropC, p: a.cropP }; }, worker);
  result.checks.harvest = { before, after, refusals: await g(() => window.__game.events('action-failed', 3).map((e) => `${e.action}:${e.reason}`)) };
  expect(after.c > before.c, 'harvesting did not fill the crop', result.checks.harvest);
  await beat('15-worker-harvesting');
  done('15');
  // back home: into the entrance; a nestmate takes the load (trophallaxis-give) or it goes to the chamber pool
  const g1 = await g(() => window.__game.query.growth());
  await steerTo(h, ent.pos.x, ent.pos.z, 1.0 * bu, 900);
  // unload-crop (crop -> the colony pool) needs her standing in a food chamber (any chamber when the nest has none): walk her down
  // the shaft to the room, then unload; the first version tried trophallaxis with the nearest nestmate, who is never in reach there
  const rooms = (await nestOf(h)).chambers;
  const room = rooms.find((c) => c.type === 'food') ?? rooms.find((c) => c.type !== 'founding') ?? rooms[0];
  expect(room, 'the nest has no chamber to unload in');
  let lastPos = null, stuck = 0;
  for (let i = 0; i < 40; i++) {
    const a = await g((id) => window.__game.query.ant(id), worker);
    if (a.cropC < after.c * 0.5) break;
    const p = (await summary()).possessed.pos, d = Math.hypot(room.center.x - p[0], room.center.z - p[2]);
    if (a.nestId < 0 || d > 0.8 * bu) {
      // down the shaft the way the queen dug it: from the entrance along the horizontal heading to the room (a walk straight at the
      // room centre crosses the ground above it instead); when she has not moved since the last round, a sidestep to unblock her
      const dx = room.center.x - ent.pos.x, dz = room.center.z - ent.pos.z, n = Math.hypot(dx, dz) || 1;
      const moved = lastPos ? Math.hypot(p[0] - lastPos[0], p[1] - lastPos[1], p[2] - lastPos[2]) : 1;
      stuck = moved < 0.3 ? stuck + 1 : 0;
      lastPos = p;
      if (a.nestId < 0) await steerTo(h, ent.pos.x, ent.pos.z, 0.5 * bu, 60);
      const turn = [0, 0.7, -0.7, 1.4, -1.4, Math.PI][stuck % 6], c = Math.cos(turn), sn = Math.sin(turn);
      const hx = dx / n, hz = dz / n;
      const deep = p[1] <= room.center.y + (room.radii?.y ?? 3 * bu);
      for (let k = 0; k < 12; k++) {
        if (deep) await steerTo(h, room.center.x, room.center.z, 0.5 * bu, 3); // in the room: straight at its centre
        else await walkDir(h, 3, { x: hx * c - hz * sn, y: 0, z: hx * sn + hz * c });
      }
      await g(() => window.__game.setIntent({}));
    }
    await g(() => window.__game.act('unload-crop'));
    await step(40);
    if (process.env.FIRSTPLAY_DEBUG) log('unload', i, JSON.stringify(await g((id) => { const gm = window.__game, w = gm.query.ant(id); return { crop: w.cropC + w.cropP, nest: w.nestId, pos: w.pos, ev: gm.events('action-failed', 2).map((e) => `${e.action}:${e.reason}`) }; }, worker)), JSON.stringify({ d: Math.round(d), room: room.center, radii: room.radii, stuck, type: room.type }));
    await g(() => window.__game.act({ action: 'unload-crop', phase: 'stop' }));
  }
  const delivered = await g((id) => window.__game.query.ant(id), worker);
  const g2 = await g(() => window.__game.query.growth());
  result.checks.delivery = { cropAfter: delivered.cropC, storesBefore: g1.stores, storesAfter: g2.stores, deliveries: [g1.deliveries, g2.deliveries] };
  expect(delivered.cropC < after.c * 0.5, 'the worker did not hand over her load', result.checks.delivery);
  await beat('16-worker-delivered');
  done('16');

  // ---- 13. the queen: Colony orders (real key I), a slider changes the allocation ---------------------------------------
  await g(() => window.__game.possess('queen'));
  await step(2);
  await render(2);
  await g(() => window.__hud?.game?.refreshUi?.());
  await h.frames(3);
  expect(await h.visible('colony-orders-button'), 'the queen has no Colony orders button after the hand-over');
  await page.keyboard.press('KeyI');
  await h.frames(4);
  expect(await h.visible('dir-workforce'), 'I did not open Colony orders');
  const d0 = await g(() => JSON.parse(JSON.stringify(window.__game.query.colony().directives)));
  const slider = page.locator('[data-group="forage"] [role="slider"]');
  await slider.focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  await h.frames(3);
  const d1 = await g(() => JSON.parse(JSON.stringify(window.__game.query.colony().directives)));
  result.checks.directives = { before: d0.allocation, after: d1.allocation };
  expect(d1.allocation !== 'auto' && typeof d1.allocation === 'object', 'the slider did not change the allocation', result.checks.directives);
  await beat('17-queen-colony-orders', ['dir-workforce'], { draw: true });
  await page.keyboard.press('Escape');
  await h.frames(3);
  done('17');

  // ---- 14. the Roster (real key L) ----------------------------------------------------------------------------------------
  await page.keyboard.press('KeyL');
  await h.frames(4);
  await g(() => window.__hud?.game?.refreshUi?.());
  await h.frames(3);
  expect(await h.visible('roster-body'), 'L did not open the Roster');
  result.checks.roster = await g(() => document.querySelector('[data-testid="roster-count"]')?.textContent ?? null);
  await beat('18-roster', ['roster-body']);
  await page.keyboard.press('Escape');
  await h.frames(3);
  done('18');

  // ---- 15. observer following a forager, with its inspect card ------------------------------------------------------------
  await g(() => window.__game.release());
  await step(2);
  const forager = await g(() => {
    const gm = window.__game, bu = gm.query.world().bu;
    const fs = gm.query.ants().filter((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id && a.task === 'forage' && gm.query.field(a.pos.x, 0, a.pos.z).height - a.pos.y < 0.5 * bu);
    return fs[0]?.id ?? gm.query.ants().find((a) => a.caste === 'worker' && a.colony === gm.query.colony()?.id)?.id ?? -1;
  });
  expect(forager >= 0, 'no forager to follow');
  await g((id) => { window.__game.views.select({ kind: 'ant', id }); window.__game.views.follow(true); }, forager);
  await step(20);
  await render(2);
  await g(() => window.__hud?.game?.refreshUi?.());
  await h.frames(3);
  result.checks.follow = await g(() => ({ view: window.__game.summary().view, mode: window.__game.summary().camera?.observerMode, inspect: window.__game.views.inspectTarget() }));
  expect(await h.visible('inspect-card'), 'no inspect card for the followed forager', result.checks.follow);
  await beat('19-observer-follow-inspect', ['inspect-card']);
  done('19');

  // ---- 16. colony view: slice cutaway, a forage marker, a dig plan ---------------------------------------------------------
  await g(() => window.__game.views.select(null));
  await g(() => window.__game.camera.set('colony'));
  await step(1);
  const n2 = await nestOf(h);
  const ch = n2.chambers.find((c) => c.type === 'founding') ?? n2.chambers[0];
  const c0 = ch ? ch.center : ent.pos;
  // framed on the middle between the nest and the food, so the marker's click lands on the food
  await g((o) => window.__game.views.colonyCamera(o), { x: (c0.x + food.pos.x) / 2, z: (c0.z + food.pos.z) / 2, distBu: 80, pitchDeg: 60, yawDeg: 20, cutaway: 'slice', planeYBu: c0.y / bu + 0.5, radiusBu: 50 });
  await g(() => window.__game.views.tool('forage'));
  await g(() => window.__game.views.radius('forage', 12));
  const fscr = await g((p) => window.__game.views.project(p), food.pos);
  let markers = [];
  if (fscr) { await g(([x, y]) => window.__game.views.click(x, y), [fscr.x, fscr.y]); markers = await g(() => window.__game.views.markers()); }
  await g(() => window.__game.views.tool(null));
  result.checks.markers = markers.map((m) => m.kind);
  expect(markers.some((m) => m.kind === 'forage'), 'the forage marker was not placed', { fscr, markers });
  // a dig plan: a nursery off the founding cell (rotate until the ghost is valid)
  await g(() => window.__game.views.tool('dig'));
  await g(() => window.__game.views.planner({ template: 'chamber', chamberType: 'nursery', size: 's', yawDeg: 0 }));
  const wall = ch ? { x: ch.center.x + ch.radii.x * 0.9, y: ch.center.y, z: ch.center.z } : null;
  let placed = false, pv = null;
  if (wall) {
    const wscr = await g((p) => window.__game.views.project(p), wall);
    if (wscr) {
      pv = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [wscr.x, wscr.y])).planner;
      for (let i = 0; i < 23 && pv?.preview && pv.preview.validity === 'invalid'; i++) {
        pv = (await g(() => window.__game.views.rotate(1))).planner;
        pv = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [wscr.x, wscr.y])).planner;
      }
      const before = (await nestOf(h)).digPlans.length;
      if (pv?.preview && pv.preview.validity !== 'invalid') {
        let st = await g(([x, y]) => window.__game.views.click(x, y), [wscr.x, wscr.y]);
        if (st.message && /confirm/.test(st.message)) st = await g(([x, y]) => window.__game.views.click(x, y), [wscr.x, wscr.y]);
        placed = (await nestOf(h)).digPlans.length > before;
      }
    }
  }
  await g(() => window.__game.views.tool(null));
  result.checks.digPlan = { placed, preview: pv?.preview ? { validity: pv.preview.validity, codes: pv.preview.codes } : null };
  expect(placed, 'no dig plan placed off the founding cell', result.checks.digPlan);
  await step(30);
  // the shot: closer, so the nest's rooms read (named and outlined on the cut), the marker ring entering the frame
  const mid = { x: c0.x + 0.3 * (food.pos.x - c0.x), z: c0.z + 0.3 * (food.pos.z - c0.z) };
  await g((o) => window.__game.views.colonyCamera(o), { x: mid.x, z: mid.z, distBu: 36, pitchDeg: 62, yawDeg: 20, cutaway: 'slice', planeYBu: c0.y / bu + 0.5, radiusBu: 50 });
  await beat('20-colony-slice-marker-plan', [], { settle: 1 });
  result.checks.sliceLabels = (await g(() => window.__game.views.markerLabels())).map((l) => l.text);
  expect(result.checks.sliceLabels.length > 0, 'the colony slice names no chamber', result.checks.sliceLabels);
  done('20');

  // ---- 17. days 2 and 3 at 8x with the HUD showing growth -------------------------------------------------------------------
  await g(() => window.__game.camera.set('observer'));
  await g(() => window.__game.setSpeed(8));
  const sp8 = (await summary()).time;
  expect(sp8.speed === 8, '8x refused while observing', sp8);
  const growth = [await g(() => window.__game.query.growth())];
  const dayOf = () => g(() => { const t = window.__game.summary().time; return `${t.season} ${t.dayOfSeason}`; });
  const dayStart = await dayOf();
  for (let d = 0; d < 2; d++) {
    await step(6000);
    growth.push(await g(() => window.__game.query.growth()));
    await g(({ a, l }) => window.__game.camera.setPose(a, l), await clearPose(h, ent.pos, 12, 20));
    await beat(`2${1 + d}-day-${d + 2}-8x`, ['hud-root']);
  }
  result.checks.days = { from: dayStart, to: await dayOf(), ...growthVerdict(growth) };
  // checked after the remaining beats (the save / continue beats still run and are shot), failing the run at the end
  if (!result.checks.days.grew) (result.failures ??= []).push(`no growth over game days 2-3 at 8x: ${JSON.stringify(result.checks.days)}`);
  done('22');

  // ---- 18. pause menu -> save -> return to title -> continue -> the same state ----------------------------------------------
  await g(() => window.__game.setSpeed(1));
  await page.keyboard.press('Escape');
  await h.frames(4);
  expect(await h.visible('pause-save'), 'Esc did not open the pause menu');
  await click('pause-save');
  await page.waitForSelector('.ui-book', { timeout: 60000 });
  const hashBefore = await g(() => window.__game.stateHash());
  const viewBefore = (await summary()).view;
  await beat('23-pause-save', [], { draw: false });
  // the first save slot's Save button
  await click('save-slot-1');
  if (await h.visible('confirm-ok')) await click('confirm-ok');
  await page.waitForTimeout(1500);
  const saves = await g(() => window.__game.saves.list());
  result.checks.saves = saves.map((x) => `${x.slot}:${x.tick}`);
  expect(saves.some((x) => x.slot !== 'auto' && x.slot !== 'quick'), 'no manual save written', saves);
  await page.keyboard.press('Escape');
  await h.frames(3);
  await click('pause-title');
  await page.waitForTimeout(500);
  if (await h.visible('confirm-ok')) await click('confirm-ok'); // saved just now: no prompt expected, but accept it
  await page.waitForFunction(() => window.__game.summary().mode === 'title', null, { timeout: 120000 });
  await page.waitForSelector('[data-testid="menu-continue"]:not([disabled])', { timeout: 120000 });
  await beat('24-title-continue', ['menu-continue']);
  await click('menu-continue');
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const hashAfter = await g(() => window.__game.stateHash());
  result.checks.load = { hashBefore, hashAfter, viewBefore, viewAfter: (await summary()).view };
  expect(hashAfter === hashBefore, 'the continued game differs from the saved one', result.checks.load);
  await beat('25-continued');
}
