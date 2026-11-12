/**
 * Kernel demo screenshots (production kernel), driven through window.__spike (deterministic with ?test=1).
 *   node tools/harness/play.mjs --root spikes/kernel-demo --query "test=1" --script spikes/kernel-demo/scripts/shots.mjs \
 *        --out test-output/kernel-demo --width 1280 --height 720 --script-timeout 300000
 * Poses are reached by WALKING from start points (teleports only set up the start), so the shots also exercise the
 * walker. The returned JSON carries the walker state for every shot.
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
  const nest = await page.evaluate(() => window.__spike.nest);
  const ent = nest.entrance;

  // 01 surface with the entrance hole, third person
  await S('setInput', { forward: 1 });
  await S('step', 0.3, { render: false });
  await S('setInput', { forward: 0 });
  await S('setCamera', 'third', { pitch: 0.15 });
  let st = await S('step', 0.6);
  await snap('01-surface-entrance-3p', st);
  await S('setCamera', 'free', { pos: [ent.x - 10, ent.y + 42, ent.z - 8], target: [ent.x + 6, ent.y - 14, ent.z + 5], fov: 50 });
  await snap('01b-entrance-looking-down-free');

  // 02 third person inside the tunnel: walk to the hole, then the BFS autopilot towards chamber C1 takes the walker
  //    over the rim and down the shaft
  await S('setCamera', 'third', { pitch: -0.15 });
  st = await S('walkerState');
  for (let i = 0; i < 120 && Math.hypot(st.pos[0] - ent.x, st.pos[2] - ent.z) > 5; i++) {
    await S('setInput', { forward: 1, desired: [ent.x - st.pos[0], 0, ent.z - st.pos[2]] });
    st = await S('step', 1 / 30, { render: false });
  }
  await S('setInput', { forward: 0 });
  res.navTo = await S('navTo', 'C1');
  st = await walkUntil((s) => s.pos[1] < ent.y - 22, 8);
  st = await S('step', 0.4);
  await snap('02-tunnel-3p', st);

  // 03 a walker on a chamber ceiling: from the C1 floor up the curved wall onto the ceiling
  const c1 = nest.chambers[0];
  await S('teleport', c1.c.x - 8, c1.c.y - 4, c1.c.z, { heading: 0 });
  await S('setInput', { forward: 1 });
  st = await walkUntil((s) => s.up[1] < -0.95, 4);
  st = await S('step', 0.3, { render: false });
  await S('setInput', { forward: 0 });
  st = await S('step', 0.6);
  await snap('03-chamber-ceiling-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] - 15, c1.c.y - 4.5, st.pos[2] - 9], target: [st.pos[0], st.pos[1] - 0.5, st.pos[2]], fov: 70 });
  await snap('03b-chamber-ceiling-observer', st);

  // 04 climbing the plant stem
  await S('setCamera', 'third', { pitch: 0 });
  const gs = await H(175, 400);
  await S('teleport', 175, gs + 5, 400, { heading: Math.PI });
  await S('setInput', { forward: 1 });
  st = await S('step', 1.6, { render: false });
  await S('setInput', { forward: 0 });
  st = await S('step', 0.5);
  await snap('04-stem-climb-3p', st);
  await S('setCamera', 'free', { pos: [st.pos[0] + 34, st.pos[1] + 6, st.pos[2] - 26], target: [st.pos[0], st.pos[1] - 4, st.pos[2]], fov: 45 });
  await snap('04b-stem-climb-side', st);

  // 05 AI walkers flowing through the nest
  await S('setCamera', 'third', { pitch: 0 });
  res.spawned = await S('spawnAI', 60);
  await S('step', 8, { render: false });
  await S('teleport', 307, -64, 333, { heading: 2.6 });
  st = await S('step', 0.5);
  res.ai = await S('aiState');
  await snap('05-ai-tunnel-3p', st);
  await S('setCamera', 'free', { pos: [c1.c.x - 3, c1.c.y + 2, c1.c.z - 16], target: [c1.c.x + 4, c1.c.y - 5, c1.c.z + 14], fov: 75 });
  await snap('05b-ai-chamber-observer');
  res.aiAfter = await S('aiState');
  res.stats = await S('stats');
  return res;
};
