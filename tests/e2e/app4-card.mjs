// app-seams-4 item 5 (and the founding-shot items): replay a real founding from its sealed save to the outcome card, at one quality tier.
//   APP4_SAVE=<sealed save> node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" \
//     --script tests/e2e/app4-card.mjs --out test-output/app4/card-s1 --script-timeout 3000000
// Saves: test-output/look6/s1-sealed.save (seed 1, phase 'lay' right after the seal). Pictures: <out>/<tag>-11-timelapse.png and -12-outcome-card.png.
import fs from 'node:fs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'card';
  const step = (n) => g((k) => window.__game.step(k), n);
  const phase = () => g(() => window.__founding?.view()?.phase ?? null);
  const pic = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1.5 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${out}/${tag}-${name}.png`, timeout: 600000 });
    log('shot', name);
  };
  await page.waitForFunction(() => window.__game?.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  const r = await g((t) => window.__game.saves.importText(t, 'now'), fs.readFileSync(process.env.APP4_SAVE, 'utf8'));
  log('import', JSON.stringify(r));
  await page.waitForFunction(() => window.__game.summary().mode === 'playing', null, { timeout: 600000, polling: 250 });
  await step(2);
  log('phase', await phase());
  const layBatch = async () => {
    const seq0 = await g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
    await g(() => window.__game.act('lay-egg'));
    await step(10);
    await g(() => window.__game.act({ action: 'lay-egg', phase: 'stop' }));
    for (let t = 0; t < 600; t += 5) {
      await step(5);
      if (await g((since) => window.__game.events(undefined, 80, since).some((e) => (e.type === 'action-completed' || e.type === 'action-failed') && e.action === 'lay-egg'), seq0)) break;
    }
    await step(5);
  };
  for (let b = 0; b < 4; b++) await layBatch();
  await g(() => document.querySelector('[data-testid="founding-tend"]')?.click());
  await step(1);
  for (let i = 0; i < 100; i++) {
    const t = await g(() => window.__founding?.view()?.timelapse ?? null);
    if (t && t.counters.larvae > 0) break;
    await step(50);
  }
  await pic('11-timelapse');
  await g(() => document.querySelector('[data-testid="founding-skip"]')?.click());
  await step(1);
  log('phase after skip', await phase());
  // what the shot looks at, and the footprint of the cell at its slice plane
  log('shot subject', JSON.stringify(await g(async () => {
    const s2 = window.__hud.game.session, sim = s2.sim, src = s2.views.shotSource ? s2.views.shotSource() : null;
    const fp = await import('/src/game/flows/founding/cellFootprint.ts');
    const q = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId).queenId);
    const planeY = src ? src.cutY : q.pos.y + 2;
    return JSON.parse(JSON.stringify({ src, queen: q.pos, footprint: fp.cellFootprint(sim.field, q.pos, planeY, sim.world.bu), bu: sim.world.bu }));
  })));
  await pic('12-outcome-card');
  // where the cell's circle lands on the screen (the subject's centre, the queen, four points of the circle at the slice plane)
  log('projection', JSON.stringify(await g(async () => {
    const s2 = window.__hud.game.session, v = s2.views, src = v.shotSource ? v.shotSource() : null;
    const sim = s2.sim, q = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId).queenId);
    const dbg = window.__game.views;
    const pr = (p) => dbg.project(p);
    const pts = { centre: { x: src.x, y: src.cutY, z: src.z }, queen: q.pos };
    for (const [n, dx, dz] of [['e', 1, 0], ['w', -1, 0], ['n', 0, -1], ['s', 0, 1]]) pts[n] = { x: src.x + dx * src.radius, y: src.cutY, z: src.z + dz * src.radius };
    const o = {};
    for (const k of Object.keys(pts)) o[k] = pr(pts[k]);
    return o;
  })));
  await g(() => window.__game.renderFrame({ settle: 8 }));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${out}/${tag}-13-outcome-card-settled.png`, timeout: 600000 });
  // overlay: the columns of the carve field that are open somewhere below the shot's slice plane and connected (3D, 1 mm grid) to the queen (yellow), the open samples at the plane (red), the queen (green)
  const dots = await g(() => {
    const s2 = window.__hud.game.session, sim = s2.sim, src = s2.views.shotSource();
    const q = sim.stores.ants.get(sim.stores.colonies.get(sim.state.player.colonyId).queenId);
    const N = 30, H = 40, W = 2 * N + 1, y0 = src.cutY;
    const idx = (i, k, j) => (j * W + k) * W + i;
    const seen = new Uint8Array(W * W * (H + 1)), stack = [];
    const open = (i, k, j) => sim.field.sampleXYZ(q.pos.x + i - N, y0 - j, q.pos.z + k - N) > 0;
    // start: open sample nearest the queen
    let st = null;
    for (let j = 0; j <= 4 && !st; j++) for (let r = 0; r <= 3 && !st; r++) for (let di = -r; di <= r && !st; di++) for (let dk = -r; dk <= r && !st; dk++) if (open(N + di, N + dk, j + Math.round(q.pos.y - 0 > 0 ? y0 - q.pos.y : 0))) st = [N + di, N + dk, j + Math.round(y0 - q.pos.y)];
    const col = new Uint8Array(W * W);
    let n = 0;
    if (st) { stack.push(st); seen[idx(...st)] = 1; }
    while (stack.length) {
      const [i, k, j] = stack.pop(); n++; col[k * W + i] = 1;
      for (const [di, dk, dj] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]) {
        const a = i + di, b = k + dk, c = j + dj;
        if (a < 0 || b < 0 || c < 0 || a >= W || b >= W || c > H) continue;
        const id = idx(a, b, c);
        if (seen[id]) continue;
        seen[id] = 1;
        if (open(a, b, c)) stack.push([a, b, c]);
      }
    }
    const proj = (x, z) => window.__game.views.project({ x, y: y0, z });
    const d = document.createElement('div'); d.id = 'dots'; d.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:99999';
    const dot = (x, y, c, sz) => { const e = document.createElement('i'); e.style.cssText = `position:absolute;left:${x - sz / 2}px;top:${y - sz / 2}px;width:${sz}px;height:${sz}px;background:${c}`; d.appendChild(e); };
    let cols = 0, minx = 1e9, maxx = -1e9, minz = 1e9, maxz = -1e9;
    for (let k = 0; k < W; k++) for (let i = 0; i < W; i++) if (col[k * W + i]) { cols++; const x = q.pos.x + i - N, z = q.pos.z + k - N; const s = proj(x, z); if (s) dot(s.x, s.y, 'rgba(255,255,0,0.7)', 3); minx = Math.min(minx, x); maxx = Math.max(maxx, x); minz = Math.min(minz, z); maxz = Math.max(maxz, z); }
    for (let k = -N; k <= N; k++) for (let i = -N; i <= N; i++) if (sim.field.sampleXYZ(q.pos.x + i, y0, q.pos.z + k) > 0) { const s = proj(q.pos.x + i, q.pos.z + k); if (s) dot(s.x, s.y, 'red', 3); }
    const qs = window.__game.views.project(q.pos);
    dot(qs.x, qs.y, 'lime', 8);
    document.body.appendChild(d);
    return { voxels: n, cols, bbox: [minx - q.pos.x, maxx - q.pos.x, minz - q.pos.z, maxz - q.pos.z], start: st };
  });
  log('dots', JSON.stringify(dots));
  await page.screenshot({ path: `${out}/${tag}-14-overlay.png`, timeout: 600000 });
  return { phase: await phase() };
};
