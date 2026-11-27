// Shared steps of the first-play scripts (tests/e2e/firstplay.mjs, the portable short run): page helpers, the
// founding queen's walk, dig, seal and clutch through the real action primitives (the same moves as
// tests/e2e/founding.mjs, which the founding task owns), and camera poses with a clear line of sight.
// Everything runs through window.__game / window.__founding; nothing here writes simulation state.

export const SHAFT_DEPTH_BU = 9; // Lasius D_MIN in open soil is 8 BU
export const SHAFT_MAX_BITES = 260;
export const SHAFT_SLOPE_DEG = 55;
export const ROOM_MAX_ROUNDS = 4;
export const SITE_MAX_R_BU = 120;

export function helpers({ page, shot, log, wait }, result) {
  const g = (fn, arg) => page.evaluate(fn, arg);
  // FIRSTPLAY_CONTINUE=1 (look pass 5): a failed check is recorded in result.softFailures and the run goes on to the next beat, so one run
  // shows what every later beat looks like. The run is then not a pass (the final result lists the failures); a normal run still stops at the first.
  const expect = (cond, msg, data) => {
    if (cond) return;
    const text = `firstplay: ${msg} ${data === undefined ? '' : JSON.stringify(data).slice(0, 1500)}`;
    if (!process.env.FIRSTPLAY_CONTINUE) throw new Error(text);
    (result.softFailures ??= []).push(text);
    log('SOFT FAILURE', text.slice(0, 300));
  };
  const summary = () => g(() => window.__game.summary());
  const view = () => g(() => window.__founding?.view() ?? null);
  const phase = async () => (await view())?.phase ?? null;
  const render = (settle) => g((s) => window.__game.renderFrame(s === undefined ? {} : { settle: s }), settle);
  const step = (n) => g((k) => window.__game.step(k), n);
  const visible = (id) => g((t) => { const e = document.querySelector(`[data-testid="${t}"]`); return !!e && e.getBoundingClientRect().width > 0; }, id);
  const frames = (n = 2) => wait.frames(n);
  const bu = async () => (await g(() => window.__game.query.world())).bu;
  /** A screenshot beat: the scene is drawn (settled), the UI catches up, then the capture (generous timeout). */
  const beat = async (name, testIds = [], { settle = 0.5, draw = true } = {}) => {
    if (draw) await render(settle);
    await frames(3);
    await g(() => { const a = document.activeElement; if (a && a.tagName === 'BUTTON' && !a.closest('.fd-drawer, .ui-book, .ui-pausecard, .ui-modal')) a.blur(); });
    const file = await page.screenshot({ path: `${result.out}/${name}.png`, timeout: 300000 }).then(() => `${result.out}/${name}.png`);
    result.beats.push(name);
    for (const id of [].concat(testIds)) expect(await visible(id), `beat ${name}: ${id} not on screen`);
    log('beat', name);
    return file;
  };
  return { g, expect, summary, view, phase, render, step, visible, frames, bu, beat, shot, log };
}

/** An observer pose `back` BU from point m and `up` BU above it with a clear line of sight (plants, stones, walls). */
export async function clearPose(h, m, up, back) {
  return h.g(({ m, up, back }) => {
    const gm = window.__game, bu = gm.query.world().bu;
    for (let k = 0; k < 24; k++) {
      const th = (k / 24) * 2 * Math.PI;
      const a = { x: m.x + Math.cos(th) * back * bu, y: m.y + up * bu, z: m.z + Math.sin(th) * back * bu };
      let clear = true;
      for (let i = 0; i < 48 && clear; i++) {
        const t = (i / 48) * (1 - bu / Math.hypot(a.x - m.x, a.y - m.y, a.z - m.z));
        if (gm.query.field(a.x + (m.x - a.x) * t, a.y + (m.y - a.y) * t, a.z + (m.z - a.z) * t).f < 0.3 * bu) clear = false;
      }
      if (clear) return { a, l: m };
    }
    return { a: { x: m.x + back * bu, y: m.y + up * bu, z: m.z }, l: m };
  }, { m, up, back });
}

/** Diggable ground near `o` with a straight ramp of the given slope: {x,y,z,h,rBu} or null. */
export async function findSite(h, o, fromBu, toBu, stepBu) {
  return h.g(({ o, slope, fromBu, toBu, stepBu }) => {
    const gm = window.__game, bu = gm.query.world().bu, tan = Math.tan((slope * Math.PI) / 180);
    const ground = (x, z) => gm.query.field(x, 0, z).height;
    const clearAbove = (x, z, gy) => [0.3, 1, 2].every((hh) => gm.query.dig(x, gy + hh * bu, z, bu).prim === null);
    for (let r = fromBu; r <= toBu; r += stepBu) {
      const n = Math.max(1, Math.round((2 * Math.PI * r) / stepBu));
      for (let i = 0; i < n; i++) {
        const ph = (i / n) * 2 * Math.PI, sx = o.x + Math.cos(ph) * r * bu, sz = o.z + Math.sin(ph) * r * bu, sy = ground(sx, sz);
        if (!clearAbove(sx, sz, sy) || gm.query.dig(sx, sy - 2 * bu, sz, bu).speed < 0.5) continue;
        for (let a = 0; a < 16; a++) {
          const th = (a / 16) * 2 * Math.PI, hx = Math.cos(th), hz = Math.sin(th);
          let ok = true;
          for (let u = -3; u <= 9 && ok; u += 0.5) {
            const x = sx + hx * u * bu, z = sz + hz * u * bu, gy = ground(x, z);
            if (!clearAbove(x, z, gy)) ok = false;
            if (u >= 0 && ok) {
              const d = gm.query.dig(x, gy - (u * tan + 1) * bu, z, 3 * bu);
              if (d.speed < 0.5 || d.prim !== null) ok = false;
              const deep = gm.query.dig(x, gy - 11 * bu, z, 3 * bu);
              if (deep.speed < 0.5 || deep.prim !== null) ok = false;
            }
          }
          if (ok) return { x: sx, y: sy, z: sz, h: { x: hx, y: 0, z: hz }, rBu: r };
        }
      }
    }
    return null;
  }, { o, slope: SHAFT_SLOPE_DEG, fromBu, toBu, stepBu });
}

/**
 * Walk the possessed ant toward (gx, gz) with the camera-independent intent until within tol mm. A player walks round what is in the way: while she has
 * climbed onto a plant or a stone (her thorax more than 3 BU over the ground) she goes back the way she came for a few steps, and while no ground is gained she
 * turns a quarter to one side, then the other (a straight walk at a goal behind a grass clump took her up the stems for good, app-seams-4 fix pass, seed 1 beat 16).
 */
export async function steerTo(h, gx, gz, tol, maxSteps = 600) {
  const bu = await h.bu();
  let best = Infinity, stall = 0, side = 1, down = 0;
  for (let i = 0; i < maxSteps; i++) {
    const p = (await h.summary()).possessed?.pos;
    if (!p) return false;
    const dx = gx - p[0], dz = gz - p[2], d = Math.hypot(dx, dz);
    if (d < tol) { await h.g(() => window.__game.setIntent({})); return true; }
    if (d < best - 0.05 * bu) { best = d; stall = 0; } else stall++;
    if (stall > 12) { side = -side; stall = 0; }
    if (down === 0 && i % 4 === 0) {
      const gh = await h.g(([x, z]) => window.__game.query.field(x, 0, z).height, [p[0], p[2]]);
      if (p[1] - gh > 3 * bu) down = 8;
    }
    let ang = stall > 5 ? side * Math.PI / 2 : 0;
    if (down > 0) { ang = Math.PI; down--; }
    const ca = Math.cos(ang), sa = Math.sin(ang), vx = dx / d, vz = dz / d;
    await h.g((v) => window.__game.setIntent({ dir: v }), { x: vx * ca - vz * sa, y: 0, z: vx * sa + vz * ca });
    await h.step(d > 3 * bu ? 2 : 1);
  }
  await h.g(() => window.__game.setIntent({}));
  return false;
}

export async function walkDir(h, ticks, v) {
  await h.g((m) => window.__game.setIntent({ dir: m }), v);
  await h.step(ticks);
  await h.g(() => window.__game.setIntent({}));
}

/** One dig bite toward heading `hd` at `slopeDeg` below the horizontal; waits for the bite to end. */
export async function digBite(h, slopeDeg, ticks, hd) {
  return h.g(({ slope, n, hd }) => {
    const gm = window.__game, p = gm.summary().possessed;
    if (!p) { gm.possess('queen'); return null; }
    const d = 8;
    const r = gm.act({ action: 'dig-bite', target: { kind: 'point', id: -1, pos: { x: p.pos[0] + hd.x * d, y: p.pos[1] - Math.tan((slope * Math.PI) / 180) * d, z: p.pos[2] + hd.z * d } } });
    gm.step(2);
    gm.act({ action: 'dig-bite', phase: 'stop' });
    for (let t = 0; t < n; t += 2) { if (!gm.query.ant(p.id)?.action) break; gm.step(2); }
    return r;
  }, { slope: slopeDeg, n: ticks, hd });
}

/**
 * Soil beside an open cell, the way a player sees it in the colony view's slice: the open cells of the slice plane `planeY` connected to the open sample
 * nearest (x, z), their centre, and for 12 directions out of it the point `dBu` BU beyond the first wall. Returns [{ x, z, dir }] (mm) or [].
 * Reads the field only (window.__game.query.field); nothing is written. The click that follows is the player's: views.project + views.click.
 */
export async function soilBesideCell(h, x, z, planeY, dBu) {
  return h.g(({ cx, cz, planeY, dBu }) => {
    const gm = window.__game, bu = gm.query.world().bu, f = (px, pz) => gm.query.field(px, planeY, pz).f;
    const step = 0.5 * bu, N = 40, key = (i, k) => k * (2 * N + 1) + i + N;
    let start = null;
    for (let d = 0; d < 12 && !start; d++) for (let i = -d; i <= d && !start; i++) for (let k = -d; k <= d && !start; k++) if (Math.max(Math.abs(i), Math.abs(k)) === d && f(cx + i * step, cz + k * step) > 0) start = [i, k];
    if (!start) return [];
    const seen = new Set([key(start[0], start[1])]), q = [start], cells = [];
    while (q.length && cells.length < 3000) {
      const [i, k] = q.pop(); cells.push([i, k]);
      for (const [di, dk] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = k + dk; if (Math.abs(a) > N || Math.abs(b) > N || seen.has(key(a, b))) continue; seen.add(key(a, b)); if (f(cx + a * step, cz + b * step) > 0) q.push([a, b]); }
    }
    let mx = 0, mz = 0; for (const [i, k] of cells) { mx += i; mz += k; } mx = cx + (mx / cells.length) * step; mz = cz + (mz / cells.length) * step;
    const out = [];
    for (let a = 0; a < 12; a++) {
      const th = (a / 12) * 2 * Math.PI, dx = Math.cos(th), dz = Math.sin(th);
      let t = 0; while (t < 30 * bu && f(mx + dx * t, mz + dz * t) > 0) t += 0.25 * bu;
      if (t >= 30 * bu) continue;
      const px = mx + dx * (t + dBu * bu), pz = mz + dz * (t + dBu * bu);
      if (f(px, pz) < 0) out.push({ x: px, z: pz, dir: a });
    }
    return out;
  }, { cx: x, cz: z, planeY, dBu });
}

/**
 * Plans a chamber of `type` (size small) beside the queen's cell in the colony view, as a player does it (app-seams-4 item 1): the colony view framed on the
 * cell with the slice cut, the Dig tool, a click on the soil of the slice a little beside the open cell, the ghost turned (Q / E, 15 degrees) until it is valid.
 * Returns { placed, preview } ({ validity, codes, reason } of the last ghost looked at). Leaves the tool off and the colony camera where it is.
 */
export async function placeChamberPlan(h, type, { distBu = 36, beside = 2.5 } = {}) {
  const bu = await h.bu(), nest = await nestOf(h);
  const ch = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  const c0 = ch ? ch.center : nest.origin;
  const queen = (await h.g(() => window.__game.query.ants().find((a) => a.caste === 'queen')))?.pos ?? c0;
  const planeYmm = Math.min(0, c0.y + 0.5 * bu);
  await h.g(() => window.__game.camera.set('colony'));
  await h.step(1);
  await h.g((o) => window.__game.views.colonyCamera(o), { x: queen.x, z: queen.z, distBu, pitchDeg: 62, yawDeg: 20, cutaway: 'slice', planeYBu: c0.y / bu + 0.5, radiusBu: 50 });
  await h.render(1); // the camera the clicks are projected with is the one drawn: a click before this frame projects with the old pose
  await h.g(() => window.__game.views.tool('dig'));
  await h.g((t) => window.__game.views.planner({ template: 'chamber', chamberType: t, size: 's', yawDeg: 0 }), type);
  let placed = false, pv = null;
  for (const sp of await soilBesideCell(h, queen.x, queen.z, planeYmm, beside)) {
    if (placed) break;
    const scr = await h.g((p) => window.__game.views.project(p), { x: sp.x, y: planeYmm, z: sp.z });
    if (!scr) continue;
    const hover = async () => (await h.g(([x, y]) => window.__game.views.hoverPlan(x, y), [scr.x, scr.y])).planner;
    pv = await hover();
    for (let i = 0; i < 23 && pv?.preview && pv.preview.validity === 'invalid' && !pv.preview.codes.includes('anchor-not-in-nest'); i++) {
      await h.g(() => window.__game.views.rotate(1));
      pv = await hover();
    }
    const before = (await nestOf(h)).digPlans.length;
    if (pv?.preview && pv.preview.validity !== 'invalid') {
      let st = await h.g(([x, y]) => window.__game.views.click(x, y), [scr.x, scr.y]);
      if (st.message && /confirm/.test(st.message)) st = await h.g(([x, y]) => window.__game.views.click(x, y), [scr.x, scr.y]);
      await h.step(2);
      placed = (await nestOf(h)).digPlans.length > before;
    }
  }
  await h.g(() => window.__game.views.tool(null));
  return { placed, preview: pv?.preview ? { validity: pv.preview.validity, codes: pv.preview.codes, reason: pv.preview.reason ?? null } : null };
}

export const lastSeq = (h) => h.g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
export const nestOf = async (h) => (await h.g(() => window.__game.query.nest()))[0];

/** Every beat the full first play must shoot (task int-1B-app Work 3); checked at the end of a complete run. */
export const FULL_RUN_BEATS = [
  '01-title', '02-new-colony', '03-world-intro-card', '04-queen-surface', '05-site-readout', '06-digging-entrance-mound',
  '07-inside-shaft', '08-founding-chamber', '09-sealed', '10-first-clutch', '11-timelapse', '12-outcome-card',
  '13-first-workers-entrance', '14-worker-following-trail', '15-worker-harvesting', '16-worker-delivered',
  '17-queen-colony-orders', '18-roster', '19-observer-follow-inspect', '20-colony-slice-marker-plan', '21-day-2-8x',
  '22-day-3-8x', '23-pause-save', '24-title-continue', '25-continued',
];

/**
 * "Days 2 and 3 at 8x with the HUD showing growth": over the two days the colony gained workers or brood (eggs,
 * larvae and pupae together). `series` holds query.growth() samples, first and last compared.
 */
export function growthVerdict(series) {
  const first = series[0], last = series[series.length - 1];
  const workers = (x) => x?.castes?.worker ?? 0;
  const out = {
    workers: series.map(workers), brood: series.map((x) => x?.brood ?? 0),
    p: series.map((x) => Math.round((x?.stores?.p ?? 0) * 100) / 100), c: series.map((x) => Math.round((x?.stores?.c ?? 0) * 100) / 100),
  };
  out.grew = !!first && !!last && (workers(last) > workers(first) || last.brood > first.brood);
  return out;
}
