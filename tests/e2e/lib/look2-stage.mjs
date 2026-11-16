// Staging of the look-pass-2 scenes in the REAL game (tests/e2e/look2.mjs, look2-lab.mjs): the founding cheat, the
// first workers, time of day and weather, and the four camera set-ups (possession on the surface, possession inside
// the nest, observer, colony slice). Everything goes through window.__game.
export const DAY = 6000; // calendar ticks per game day
export const at = (day, hour) => day * DAY + Math.round((hour / 24) * DAY);
export const SUMMER_DAY = 8;
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
  const surfaceWorker = async (view) => {
    await g(() => window.__game.release());
    await g((id) => window.__game.possess(id), worker.id);
    await faceEntrance(view === 'entrance' ? 7 : 14);
  };
  const nestWorker = async () => {
    await g(() => window.__game.release());
    await g((id) => window.__game.possess(id), worker.id);
    if (cavity) await g((p) => window.__game.teleport('possessed', p), { x: cavity.x - 4 * bu, y: cavity.y, z: cavity.z });
    await g(() => window.__game.step(4));
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
    await g((o) => window.__game.views.colonyCamera(o), { x: c.x, z: c.z, distBu: 30, pitchDeg: 55, yawDeg: 20, cutaway: 'slice', planeYBu: cavity ? cavity.y / bu : -6, radiusBu: 40 });
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

  /** Screen positions (CSS px) of terrain samples within 20 body lengths of the subject, and of the subject itself. */
  const groundPoints = () => g(({ bu }) => {
    const gm = window.__game;
    const s = gm.summary();
    const subj = s.possessed ? { x: s.possessed.pos[0], y: s.possessed.pos[1], z: s.possessed.pos[2] } : null;
    if (!subj || s.possessed.underground) return { subject: null, points: [] };
    const pts = [];
    for (let r = 2; r <= 20; r += 1.5) {
      const n = Math.max(8, Math.round(r * 3));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * 2 * Math.PI, x = subj.x + Math.cos(a) * r * bu, z = subj.z + Math.sin(a) * r * bu;
        const y = gm.query.field(x, 0, z).height;
        const p = gm.views.project({ x, y, z });
        if (p && p.x >= 0 && p.y >= 0 && p.x < 1280 && p.y < 720) pts.push([Math.round(p.x), Math.round(p.y)]);
      }
    }
    const c = gm.views.project(subj);
    const top = gm.views.project({ x: subj.x, y: subj.y + 1.2 * bu, z: subj.z });
    return { subject: c ? { x: Math.round(c.x), y: Math.round(c.y), rPx: top ? Math.max(6, Math.abs(c.y - top.y) * 2.2) : 14 } : null, points: pts };
  }, { bu });


  return { bu, worker, nest0, start, cavity, setLight, render, frames, statsNow, surfaceWorker, nestWorker, observerAt, sliceAt, edgeAt, groundPoints };
}
