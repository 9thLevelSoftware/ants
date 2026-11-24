// Staging of the look-pass-2 scenes in the REAL game (tests/e2e/lib/look2.mjs, look2-lab.mjs): the founding cheat, the
// first workers, time of day and weather, and the four camera set-ups (possession on the surface, possession inside
// the nest, observer, colony slice). Everything goes through window.__game.
export const DAY = 6000; // calendar ticks per game day
export const at = (day, hour) => day * DAY + Math.round((hour / 24) * DAY);
export const SUMMER_DAY = 8;
/**
 * Colony-slice camera distance, body units. The colony rig clamps the distance to CV_DIST_BU[0] = 30 BU (src/render/camera/
 * constants.ts): a smaller request changes nothing (checked: a 14 BU request gave the same picture as 30), so this is the
 * closest view the player can have of the founding chamber.
 */
export const SLICE_DIST_BU = 30;
export const LIGHTS = {
  night: { hour: 23.5, weather: 'clear' },
  'night-rain': { hour: 22.5, weather: 'rain' },
  dusk: { hour: 20.1, weather: 'clear' },
  noon: { hour: 12.5, weather: 'clear' },
  overcast: { hour: 13.5, weather: 'overcast' },
};

/** Starts (or keeps) the game, completes the founding, adds workers; returns the staging helpers. */
export async function stage(page, log, { arch = null, seed = 1 } = {}) {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const expect = (cond, msg, data) => { if (!cond) throw new Error(`look2: ${msg} ${data === undefined ? '' : JSON.stringify(data)}`); };
  if (arch) await g(({ a, s }) => window.__game.newGame({ seed: s, archetype: a }), { a: arch, s: seed });
  const bu = (await g(() => window.__game.query.world())).bu;
  await g(() => window.__game.cheat.completeFounding(10));
  await g(() => window.__game.step(40));
  const nests = await g(() => window.__game.query.nest());
  const myColony = await g(() => window.__game.summary().colony?.id);
  const nest0 = nests.find((n) => n.colony === myColony) ?? nests[0];
  const start = await g(() => window.__game.query.world().queenStart);
  const cavity = nest0.founding?.cavitySeed ?? null;
  log('nest', JSON.stringify({ origin: nest0.origin, cavity, start: start.pos }));

  // the player's colony workers, nearest the nest first
  const myAnts = async () => g(() => {
    const cid = window.__game.summary().colony?.id;
    return window.__game.query.ants().filter((a) => a.colony === cid);
  });
  // the founding cheat leaves only the queen: add the first workers on the surface by the entrance
  await g((p) => window.__game.cheat.spawnAnts(7, 'worker', null, p), { x: start.pos.x + 3 * bu, y: start.pos.y + 0.5 * bu, z: start.pos.z + 4 * bu });
  await g(() => window.__game.step(10));
  const ants = await myAnts();
  const worker = ants.find((a) => a.caste === 'worker') ?? ants[0];
  expect(worker, 'no ant of the player colony', ants.length);
  log('ants', ants.length, 'possessing', worker.id, worker.caste);

  const setLight = async (name) => {
    const L = LIGHTS[name];
    await g((t) => window.__game.cheat.setTime(t), at(SUMMER_DAY, L.hour));
    await g((w) => window.__game.cheat.setWeather(w), L.weather);
  };
  const render = (settle = 0.5) => g((s) => window.__game.renderFrame({ settle: s }), settle);
  const frames = () => g(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const statsNow = async (benchN) => g((n) => {
    const p = window.__game.perf();
    return { drawCalls: p.drawCalls, triangles: p.triangles, frameMs: p.frameMs, world: p.renderers.world };
  }, benchN);

  // --- scenario staging -------------------------------------------------------------------------------------------
  const faceEntrance = async (back) => {
    // the ant stands `back` BU from the entrance on the surface, facing it
    const o = nest0.entrances[0]?.pos ?? start.pos;
    const f = start.fwd;
    const x = o.x - f.x * back * bu, z = o.z - f.z * back * bu;
    const gy = (await g((p) => window.__game.query.field(p.x, 0, p.z), { x, z })).height;
    await g((p) => window.__game.teleport('possessed', p), { x, y: gy + 1.5 * bu, z });
    await g(() => window.__game.step(3));
    await g((d) => window.__game.setIntent({ dir: d }), { x: f.x, y: 0, z: f.z });
    await g(() => window.__game.step(2));
    await g(() => window.__game.setIntent({}));
    await g(() => window.__game.step(2));
  };
  /**
   * Possesses a worker on the SURFACE a few body lengths from the entrance, facing it. The placement can fail on some
   * archetypes (kitchen-door: the point behind the entrance is a step or a doormat, and the game then leaves the queen
   * possessed underground), so the result is checked and the next try uses another distance, then another worker.
   */
  const surfaceWorker = async (view) => {
    const backs = view === 'entrance' ? [7, 4, 10, 14] : [14, 10, 20, 7];
    const surfaceNow = () => g(() => { const p = window.__game.summary().possessed; return p ? { id: p.id, underground: !!p.underground } : null; });
    const candidates = [worker, ...(await myAnts()).filter((a) => a.caste === 'worker' && a.id !== worker.id)].slice(0, 4);
    for (const w of candidates) {
      for (const back of backs) {
        await g(() => window.__game.release());
        await g((id) => window.__game.possess(id), w.id);
        await faceEntrance(back);
        const p = await surfaceNow();
        if (p && p.id === w.id && !p.underground) { log('surface worker', w.id, 'back', back); return; }
      }
    }
    throw new Error('look2: no worker could be placed on the surface');
  };
  const nestWorker = async () => {
    await g(() => window.__game.release());
    await g((id) => window.__game.possess(id), worker.id);
    if (cavity) await g((p) => window.__game.teleport('possessed', p), { x: cavity.x - 4 * bu, y: cavity.y, z: cavity.z });
    await g(() => window.__game.step(4));
  };
  /** Look pass 6: the possessed worker in the shaft of the entrance, 2.5 BU under it. */
  const tunnelWorker = async () => {
    await g(() => window.__game.release());
    await g((id) => window.__game.possess(id), worker.id);
    const E = nest0.entrances?.[0]?.pos;
    if (E) await g((p) => window.__game.teleport('possessed', p), { x: E.x, y: E.y - 2.5 * bu, z: E.z });
    await g(() => window.__game.step(4));
  };
  /** Look pass 6: the possessed worker in the founding chamber with eight more workers round her. */
  const crowdWorker = async () => {
    await nestWorker();
    if (!cavity) return;
    await g(({ c, bu }) => {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * 2 * Math.PI, r = (1.2 + 0.4 * (i % 3)) * bu;
        window.__game.cheat.spawnAnts(1, 'worker', null, { x: c.x - 4 * bu + Math.cos(a) * r, y: c.y, z: c.z + Math.sin(a) * r });
      }
      window.__game.step(6);
    }, { c: cavity, bu });
  };
  /** Observer camera `upBu` above and `backBu` behind the start point, looking at it (default 60 / 80 BU; the first
   *  look-pass-2 'before' sheet used 22 / 40, which is the 'observerlow' view). */
  const observerAt = async (upBu = 60, backBu = 80) => {
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    const o = start.pos;
    const back = backBu * bu;
    const pos = { x: o.x - start.fwd.x * back, y: o.y + upBu * bu, z: o.z - start.fwd.z * back };
    await g(({ pos, look }) => window.__game.camera.setPose(pos, look), { pos, look: { x: o.x, y: o.y, z: o.z } });
  };
  const sliceAt = async () => {
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('colony'));
    const c = cavity ?? start.pos;
    await g((o) => window.__game.views.colonyCamera(o), { x: c.x, z: c.z, distBu: SLICE_DIST_BU, pitchDeg: 55, yawDeg: 20, cutaway: 'slice', planeYBu: cavity ? cavity.y / bu : -6, radiusBu: 40 });
  };

  /** Ant height, 20 BU inside the nearest map edge, looking out over it (the horizon / map edge view). */
  const edgeAt = async () => {
    await g(() => window.__game.release());
    await g(() => window.__game.camera.set('observer'));
    const edge = await g(() => window.__game.query.edgeView());
    expect(edge && !edge.error, 'no edge view', edge);
    const out = { x: edge.look.x - edge.pos.x, z: edge.look.z - edge.pos.z }, len = Math.hypot(out.x, out.z);
    const pos = { ...edge.pos }, look = { ...edge.look };
    pos.x += (out.x / len) * 130 * bu; pos.z += (out.z / len) * 130 * bu;
    const gy = (await g((p) => window.__game.query.field(p.x, 0, p.z), pos)).height;
    pos.y = gy + 3 * bu; look.y = gy + 6 * bu;
    await g(({ pos, look }) => window.__game.camera.setPose(pos, look), { pos, look });
  };

  /**
   * What look2-measure.mjs needs from the real frame, in CSS px: the possessed ant's centre and apparent size, the
   * screen positions of terrain samples within 20 body lengths of it ("ground"), and of terrain samples within a few
   * body widths of it ("ring", for the contrast of the body against what it stands on).
   *
   * The ant's size is the PROJECTED length of one body length (BU) along each body axis, the largest of the three: the
   * possession camera sits a few body lengths behind and above the ant, so a size taken from the camera distance or
   * from the height of a point above the ant (first version) comes out several times too big. Ground samples that fall
   * inside the ant's disc are dropped; the ring keeps only terrain samples a little outside it.
   */
  const groundPoints = () => g(({ bu }) => {
    const gm = window.__game;
    const s = gm.summary();
    const pz = s.possessed;
    const none = { subject: null, points: [], ring: [] };
    if (!pz || pz.underground) return none;
    const subj = { x: pz.pos[0], y: pz.pos[1], z: pz.pos[2] };
    const c = gm.views.project(subj);
    if (!c) return none;
    const f = pz.fwd, side = [f[2], 0, -f[0]];
    let bodyPx = 4;
    for (const d of [[f[0], f[1], f[2]], [side[0], 0, side[2]], [0, 1, 0]]) {
      const a = gm.views.project({ x: subj.x - d[0] * 0.5 * bu, y: subj.y - d[1] * 0.5 * bu, z: subj.z - d[2] * 0.5 * bu });
      const b = gm.views.project({ x: subj.x + d[0] * 0.5 * bu, y: subj.y + d[1] * 0.5 * bu, z: subj.z + d[2] * 0.5 * bu });
      if (a && b) bodyPx = Math.max(bodyPx, Math.hypot(a.x - b.x, a.y - b.y));
    }
    const rPx = 0.5 * bodyPx;
    const subject = { x: Math.round(c.x), y: Math.round(c.y), rPx, bodyPx };
    const onScreen = (p) => p && p.x >= 0 && p.y >= 0 && p.x < 1280 && p.y < 720;
    const sample = (rBu, a) => {
      const x = subj.x + Math.cos(a) * rBu * bu, z = subj.z + Math.sin(a) * rBu * bu;
      const p = gm.views.project({ x, y: gm.query.field(x, 0, z).height, z });
      return onScreen(p) && Math.hypot(p.x - c.x, p.y - c.y) > 1.15 * rPx ? [Math.round(p.x), Math.round(p.y)] : null;
    };
    const points = [], ring = [];
    for (let r = 2; r <= 20; r += 1.5) {
      const n = Math.max(8, Math.round(r * 3));
      for (let i = 0; i < n; i++) { const p = sample(r, (i / n) * 2 * Math.PI); if (p) points.push(p); }
    }
    for (const r of [0.9, 1.4, 2, 2.8]) {
      for (let i = 0; i < 24; i++) {
        const p = sample(r, (i / 24) * 2 * Math.PI);
        if (p && Math.hypot(p[0] - c.x, p[1] - c.y) < 4 * rPx) ring.push(p);
      }
    }
    return { subject, points, ring };
  }, { bu });

  return { bu, worker, nest0, start, cavity, setLight, render, frames, statsNow, surfaceWorker, nestWorker, tunnelWorker, crowdWorker, observerAt, sliceAt, edgeAt, groundPoints };
}
