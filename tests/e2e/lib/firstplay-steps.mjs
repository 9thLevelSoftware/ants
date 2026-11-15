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
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`firstplay: ${msg} ${data === undefined ? '' : JSON.stringify(data).slice(0, 1500)}`); };
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

/** Walk the possessed ant toward (gx, gz) with the camera-independent intent until within tol mm. */
export async function steerTo(h, gx, gz, tol, maxSteps = 600) {
  const bu = await h.bu();
  for (let i = 0; i < maxSteps; i++) {
    const p = (await h.summary()).possessed?.pos;
    if (!p) return false;
    const dx = gx - p[0], dz = gz - p[2], d = Math.hypot(dx, dz);
    if (d < tol) { await h.g(() => window.__game.setIntent({})); return true; }
    await h.g((v) => window.__game.setIntent({ dir: v }), { x: dx / d, y: 0, z: dz / d });
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

export const lastSeq = (h) => h.g(() => { const e = window.__game.events(undefined, 1); return e.length ? e[e.length - 1].seq : 0; });
export const nestOf = async (h) => (await h.g(() => window.__game.query.nest()))[0];
