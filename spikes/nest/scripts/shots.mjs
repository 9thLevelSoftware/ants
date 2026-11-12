/**
 * Required screenshots for the nest spike, all driven through window.__spike (deterministic: ?test=1, fixed steps).
 *   node tools/harness/play.mjs --root spikes/nest --query "test=1" --script spikes/nest/scripts/shots.mjs \
 *        --out docs/research/spike-nest-img --width 1280 --height 720
 * Every pose is reached by WALKING from a start point (teleports only set up the start), so the shots also prove the
 * walker. The returned JSON carries the walker/camera state at every shot.
 */
export default async ({ page, shot, log }) => {
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  const H = (x, z) => page.evaluate(([x, z]) => window.__spike.height(x, z), [x, z]);
  const res = {};
  const snap = async (name, st) => { await shot(name); res[name] = st ?? (await S('walkerState')); log(name, JSON.stringify(res[name].pos ?? ''), JSON.stringify(res[name].up ?? '')); };
  const walkUntil = async (pred, max = 6, dt = 1 / 30) => {
    let st;
    for (let t = 0; t < max; t += dt) { st = await S('step', dt, { render: false }); if (pred(st)) break; }
    return st;
  };
  const third = (o = {}) => S('setCamera', 'third', o);
  const nest = await page.evaluate(() => window.__spike.nest);
  const [ex, ey, ez] = nest.entrance;

  // 01 surface with the entrance hole, third person (walk toward it from the start pose)
  await S('setInput', { forward: 1 });
  await S('step', 0.3, { render: false });
  await S('setInput', { forward: 0 });
  await third({ pitch: 0.15 });
  let st = await S('step', 0.6);
  await snap('01-surface-entrance-3p', st);

  // 02 looking down into the hole: ant at the rim, camera orbited high above it
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => Math.hypot(s.pos[0] - ex, s.pos[2] - ez) < 6.5, 3);
  await S('setInput', { forward: 0 });
  await third({ pitch: 1.0, zoom: 0.8 });
  st = await S('step', 0.5);
  await snap('02-hole-looking-down-3p', st);
  await S('setCamera', 'free', { pos: [ex - 10, ey + 42, ez - 8], target: [ex + 6, ey - 14, ez + 5], fov: 50 });
  await snap('02b-hole-looking-down-free');

  // 03 third person inside the tunnel: keep walking down the shaft
  await third({ pitch: 0, zoom: 1 });
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => s.pos[1] < ey - 24, 4);
  await S('setInput', { forward: 0 });
  st = await S('step', 0.6);
  await snap('03-tunnel-3p', st);

  // 04 inside a chamber: continue into C1
  await S('setInput', { forward: 1 });
  const c1 = nest.chambers[0];
  st = await walkUntil((s) => Math.hypot(s.pos[0] - c1.x, s.pos[2] - c1.z) < 12, 4);
  await S('setInput', { forward: 0 });
  st = await S('step', 0.8);
  await snap('04-chamber-3p', st);

  // 05 ant on the chamber ceiling: walk from the C1 floor up the curved wall onto the ceiling
  await S('teleport', c1.x - 8, c1.y - 4, c1.z, { heading: 0 });
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => s.up[1] < -0.95, 3);
  st = await S('step', 0.3, { render: false });
  await S('setInput', { forward: 0 });
  st = await S('step', 0.6);
  await snap('05-chamber-ceiling-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] - 15, c1.y - 4.5, st.pos[2] - 9], target: [st.pos[0], st.pos[1] - 0.5, st.pos[2]], fov: 70 });
  await snap('05b-chamber-ceiling-observer');

  // 06 climbing the plant stem
  await third();
  const gs = await H(175, 400);
  await S('teleport', 175, gs + 5, 400, { heading: Math.PI });
  await S('setInput', { forward: 1 });
  st = await S('step', 1.4, { render: false });
  await S('setInput', { forward: 0 });
  st = await S('step', 0.5);
  await snap('06-stem-climb-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] + 34, st.pos[1] + 6, st.pos[2] - 26], target: [st.pos[0], st.pos[1] - 4, st.pos[2]], fov: 45 });
  await snap('06b-stem-climb-side');

  // 07 underside of the table top: up the leg, through the concave corner, out along the underside
  await third();
  const gt = await H(275, 600);
  await S('teleport', 275, gt + 5, 600, { heading: Math.PI });
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => s.up[1] < -0.95, 3);
  st = await S('step', 0.3, { render: false });
  await S('setInput', { forward: 0 });
  st = await S('step', 0.6);
  await snap('07-table-underside-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] + 22, st.pos[1] - 26, st.pos[2] - 46], target: [st.pos[0] - 6, st.pos[1] - 2, st.pos[2]], fov: 50 });
  await snap('07b-table-underside-side');

  // 08 mid floor-to-wall transition
  await third();
  const gw = await H(110, 300);
  await S('teleport', 110, gw + 5, 300, { heading: Math.PI });
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => s.upVis[0] > 0.6, 3, 1 / 60);
  await S('setInput', { forward: 0 });
  st = await S('step', 0);
  await snap('08-floor-to-wall-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] + 16, st.pos[1] + 8, st.pos[2] - 22], target: [st.pos[0] - 1, st.pos[1] + 1, st.pos[2]], fov: 45 });
  await snap('08b-floor-to-wall-side');

  // 12 the tunnel that surfaces beneath the edge of the paving slab: walk up its floor from inside and out
  await third({ pitch: 0, zoom: 1 });
  const sx = nest.slabExit;
  await S('teleport', 341, -20, 312, { heading: 0 });
  const toExit = (p) => [sx[0] - p[0], sx[1] + 2 - p[1], sx[2] - p[2]];
  st = await S('walkerState');
  for (let i = 0; i < 120; i++) {
    await S('setInput', { forward: 1, desired: toExit(st.pos) });
    st = await S('step', 1 / 30, { render: false });
    if (Math.hypot(...toExit(st.pos)) < 9) break;
  }
  await S('setInput', { forward: 0 });
  st = await S('step', 0.4);
  await snap('12-slab-exit-tunnel-3p', st);
  for (let i = 0; i < 60; i++) {
    await S('setInput', { forward: 1, desired: [-0.3, 1, 0.1] });
    st = await S('step', 1 / 30, { render: false });
    if (st.pos[1] > sx[1] + 2.5) break;
  }
  await S('setInput', { forward: 0 });
  await third({ pitch: 0.6, zoom: 0.9 });
  st = await S('step', 0.6);
  await snap('12b-slab-exit-emerged-3p', st);
  await S('setCamera', 'free', { pos: [sx[0] - 24, sx[1] + 13, sx[2] - 9], target: [sx[0] + 1, sx[1] - 1, sx[2] + 1], fov: 45 });
  await snap('12c-slab-exit-outside');

  // 10 AI ants flowing through the tunnel
  await third();
  await S('spawnAI', 50);
  await S('step', 6, { render: false });
  await S('teleport', 307, -64, 333, { heading: 2.6 });
  st = await S('step', 0.5);
  res.ai = await S('aiState');
  await snap('10-ai-tunnel-3p', st);
  await S('setCamera', 'free', { pos: [c1.x - 3, c1.y + 2, c1.z - 16], target: [c1.x + 4, c1.y - 5, c1.z + 14], fov: 75 });
  await snap('10b-ai-chamber-observer');

  // 09 cutaway of the whole nest: x-ray soil (nest "cast") and an opaque slice with a dig marker
  await S('setCamera', 'cutaway', { plane: 240, xray: true, yaw: 0.35, pitch: 0.25, dist: 330, target: [300, -60, 330] });
  await snap('09-cutaway-xray-whole-nest');
  await S('setCamera', 'cutaway', { plane: 340, xray: false, yaw: 0.05, pitch: 0.18, dist: 120, target: [305, -62, 340] });
  res.marker = await S('placeMarker', 0.12, -0.3);
  await snap('09b-cutaway-slice-marker');

  // 11 digging: possess an ant on open ground and dig a new 30 degree tunnel (ramp brush), steering like a player
  await third({ pitch: 0, zoom: 1 });
  await S('teleport', 190, 20, 300, { heading: 0 });
  const digs = [];
  for (let i = 0; i < 22; i++) {
    digs.push((await S('dig')).last);
    await S('setInput', { forward: 1, desired: [Math.cos(0.52), -Math.sin(0.52), 0] });
    await S('step', 0.06, { render: false });
    await S('setInput', { forward: 0 });
  }
  res.digs = digs;
  await third({ yaw: Math.PI, pitch: 0.1 });
  st = await S('step', 0.5);
  await snap('11-dig-new-tunnel-looking-back-3p', st);
  await S('setCamera', 'cutaway', { plane: 300, xray: false, yaw: 0, pitch: 0.12, dist: 120, target: [222, -18, 300] });
  await snap('11b-dig-new-tunnel-cut');
  await S('setCamera', 'free', { pos: [180, 26, 292], target: [196, -4, 300], fov: 50 });
  await snap('11c-dig-new-entrance-outside');

  // 13 camera very close: ant fades (zoom in hard)
  await third({ yaw: Math.PI, zoom: 0.24, pitch: 0.1 });
  st = await S('step', 0.5);
  await snap('13-camera-close-fade', st);
  await third({ zoom: 1 });
  res.stats = await S('stats');
  return res;
};
