// app-seams-4 item 1: what a player's click on soil beside the open founding cell does in the colony view's dig planner.
// Starts a game, imports a live colony (firstplay's trail checkpoint, FIRSTPLAY_TRAIL_CHECKPOINT) and clicks the planner at points of the slice
// plane at growing distances from the cell's wall, around the cell, plus the point the old firstplay script hovered. Logs a table, takes
// pictures of a valid and an invalid ghost with the reason.
//   APP4_SAVE=test-output/app4/s1-trail.save node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" \
//     --script tests/e2e/app4-planner.mjs --out test-output/app4/planner-before --script-timeout 1800000
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'pl';
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 600000 });
    log('shot', name);
  };
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_SAVE, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await g(() => window.__game.step(2));
  const info = await g(() => {
    const gm = window.__game, bu = gm.query.world().bu, nest = gm.query.nest()[0];
    const ch = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
    const q = gm.query.ants().find((a) => a.caste === 'queen');
    return { bu, ch: { c: ch.center, r: ch.radii }, queen: q?.pos ?? null, ents: nest.entrances.map((e) => ({ s: e.status, p: e.pos })) };
  });
  log('info', JSON.stringify(info));
  const bu = info.bu, c = info.queen ?? info.ch.c;
  // the plane: just above the queen / the cell centre, as firstplay's colony view does
  const planeBu = (info.ch.c.y) / bu + 0.5;
  await g(() => window.__game.camera.set('colony'));
  await g(() => window.__game.step(1));
  await g((o) => window.__game.views.colonyCamera(o), { x: c.x, z: c.z, distBu: 36, pitchDeg: 62, yawDeg: 20, cutaway: 'slice', planeYBu: planeBu, radiusBu: 50 });
  await g(() => window.__game.views.tool('dig'));
  await g(() => window.__game.views.planner({ template: 'chamber', chamberType: 'nursery', size: 's', yawDeg: 0 }));
  // the open region of the plane around the cell (flood fill from the open sample nearest the queen / the chamber centre) and rays out of it
  const probes = await g(({ cx, cz, planeY, bu }) => {
    const gm = window.__game, f = (x, z) => gm.query.field(x, planeY, z).f;
    const step = 0.5 * bu, N = 60, key = (i, k) => k * (2 * N + 1) + i + N;
    let start = null;
    for (let d = 0; d < 12 && !start; d++) for (let i = -d; i <= d && !start; i++) for (let k = -d; k <= d && !start; k++) if (Math.max(Math.abs(i), Math.abs(k)) === d && f(cx + i * step, cz + k * step) > 0) start = [i, k];
    if (!start) return { start: null, probes: [] };
    const seen = new Set([key(...start)]), q = [start], cells = [];
    while (q.length) {
      const [i, k] = q.pop(); cells.push([i, k]);
      if (cells.length > 4000) break;
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = k + dk; if (Math.abs(a) > N || Math.abs(b) > N || seen.has(key(a, b))) continue; seen.add(key(a, b)); if (f(cx + a * step, cz + b * step) > 0) q.push([a, b]); }
    }
    let mx = 0, mz = 0; for (const [i, k] of cells) { mx += i; mz += k; } mx /= cells.length; mz /= cells.length;
    const out = [];
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * 2 * Math.PI, dx = Math.cos(th), dz = Math.sin(th);
      // from the centroid out to the first solid sample, then on into the soil by d BU
      let t = 0; while (t < 30 * bu && f(cx + mx * step + dx * t, cz + mz * step + dz * t) > 0) t += 0.25 * bu;
      if (t >= 30 * bu) continue;
      for (const d of [0.5, 1, 1.5, 2, 3, 4, 6, 9, 12]) out.push({ a, dBu: d, x: cx + mx * step + dx * (t + d * bu), z: cz + mz * step + dz * (t + d * bu), edgeBu: Math.round(t / bu * 10) / 10 });
    }
    return { start, cellCells: cells.length, areaBu2: Math.round(cells.length * 0.25), probes: out };
  }, { cx: c.x, cz: c.z, planeY: planeBu * bu, bu });
  log('cell at the plane', JSON.stringify({ start: probes.start, cells: probes.cellCells, areaBu2: probes.areaBu2 }));
  const rows = [];
  for (const p of probes.probes) {
    const scr = await g((q) => window.__game.views.project({ x: q.x, y: window.__game.views.state().cutaway?.planeY ?? q.y, z: q.z }), { x: p.x, y: planeBu * bu, z: p.z });
    if (!scr) continue;
    const pk = await g(([x, y]) => window.__game.views.pick(x, y)?.surface ?? null, [scr.x, scr.y]);
    let st = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [scr.x, scr.y])).planner;
    let first = st?.preview ? { v: st.preview.validity, codes: st.preview.codes } : null;
    let best = first;
    for (let i = 0; i < 23 && best && best.v === 'invalid' && !best.codes.includes('anchor-not-in-nest'); i++) {
      await g(() => window.__game.views.rotate(1));
      st = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [scr.x, scr.y])).planner;
      if (st?.preview) best = { v: st.preview.validity, codes: st.preview.codes };
      if (best.v !== 'invalid') break;
    }
    await g(() => window.__game.views.rotate(0));
    rows.push({ a: p.a, dBu: p.dBu, pick: pk ? pk.kind : null, first, anyYaw: best });
  }
  fs.writeFileSync(`${out}/${tag}-table.json`, JSON.stringify({ info, rows }, null, 1));
  const summarise = {};
  for (const r2 of rows) { const k = `${r2.dBu}:${r2.pick}:${r2.first?.v}:${(r2.first?.codes ?? []).join('+')}->${r2.anyYaw?.v}`; summarise[k] = (summarise[k] ?? 0) + 1; }
  log('planner table', JSON.stringify(summarise));
  // pictures: the ghost for a click 4 BU from the wall (valid after the snap fix) and for one 12 BU away (refused, with the reason)
  const shoot = async (dBu, name) => {
    const cand = probes.probes.filter((p) => p.dBu === dBu);
    for (const p of cand) {
      const scr = await g((q) => window.__game.views.project(q), { x: p.x, y: planeBu * bu, z: p.z });
      if (!scr) continue;
      let st = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [scr.x, scr.y])).planner;
      for (let i = 0; i < 23 && st?.preview?.validity === 'invalid' && !st.preview.codes.includes('anchor-not-in-nest'); i++) {
        await g(() => window.__game.views.rotate(1));
        st = (await g(([x, y]) => window.__game.views.hoverPlan(x, y), [scr.x, scr.y])).planner;
      }
      const want = name === 'valid' ? st?.preview?.validity !== 'invalid' : st?.preview?.validity === 'invalid';
      if (want) { log(name, JSON.stringify({ dBu, v: st.preview.validity, codes: st.preview.codes, reason: st.preview.reason })); await pic(name); return true; }
    }
    return false;
  };
  await shoot(4, 'valid');
  await shoot(9, 'invalid');
  return { rows: rows.length };
};
