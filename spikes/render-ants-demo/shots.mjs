/**
 * Acceptance screenshots for the render-ants task (deterministic: time advances only through __demo.step).
 *   node tools/harness/play.mjs --root spikes/render-ants-demo --query "quality=high" \
 *        --script spikes/render-ants-demo/shots.mjs --out test-output/render-ants-shots --width 1280 --height 720 --script-timeout 900000
 * Env SHOTS=comma,separated,prefixes limits the set.
 */
export default async ({ page, shot, log }) => {
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
  const only = (process.env.SHOTS || '').split(',').filter(Boolean);
  const want = (name) => !only.length || only.some((p) => name.startsWith(p));
  const out = {};
  const take = async (name, fn) => { if (!want(name)) return; await fn(); await shot(name); log('shot', name); };

  await take('01-lasius-worker-three-quarter', async () => { await D('setScene', 'hero', { species: 'lasius-niger', caste: 'worker' }); await D('step', 0.3); });
  await take('01b-lasius-worker-head', async () => { await D('setScene', 'hero', { species: 'lasius-niger', caste: 'worker' }); await D('setCamera', { target: [0, 0.45, 1.3], dist: 3.2, az: 28, el: 20, fov: 30 }); await D('step', 0.2); });
  await take('02-queen-and-worker', async () => { await D('setScene', 'queen', { species: 'lasius-niger' }); await D('step', 0.2); });
  await take('03-gyne-winged', async () => { await D('setScene', 'hero', { species: 'lasius-niger', caste: 'gyne' }); await D('setCamera', { target: [0, 1.2, -0.6], dist: 22, az: 40, el: 30, fov: 30 }); await D('step', 0.2); });
  await take('03b-camponotus-gyne', async () => { await D('setScene', 'hero', { species: 'camponotus-pennsylvanicus', caste: 'gyne' }); await D('setCamera', { target: [0, 2.5, -1.5], dist: 48, az: 40, el: 30, fov: 30 }); await D('step', 0.2); });
  await take('04-messor-major-minor', async () => { await D('setScene', 'poly', { species: 'messor-barbarus' }); await D('step', 0.2); });
  await take('04b-atta-major-minor', async () => { await D('setScene', 'poly', { species: 'atta-texana' }); await D('step', 0.2); });
  await take('04c-camponotus-major-minor', async () => { await D('setScene', 'poly', { species: 'camponotus-pennsylvanicus' }); await D('step', 0.2); });
  await take('05-carrying-cocoon', async () => { await D('setScene', 'carry', { species: 'lasius-niger' }); await D('step', 0.2); });
  await take('05b-messor-carrying-naked-pupa', async () => { await D('setScene', 'carry', { species: 'messor-barbarus' }); await D('step', 0.2); });
  await take('06-wall-and-ceiling', async () => { await D('setScene', 'wall'); await D('step', 0.6); });
  await take('06b-wall-close', async () => { await D('setScene', 'wall'); await D('step', 0.6); await D('setCamera', { target: [199, 14.5, -6], dist: 16, az: -60, el: 8, fov: 34 }); await D('render'); });
  await take('06c-ceiling-close', async () => { await D('setScene', 'wall'); await D('step', 0.6); await D('setCamera', { target: [168, 29, 7.6], dist: 15, az: -50, el: -22, fov: 34 }); await D('render'); });
  await take('07-brood-pile', async () => { await D('setScene', 'brood', { species: 'lasius-niger' }); await D('step', 0.2); });
  await take('08-poses', async () => { await D('setScene', 'poses'); await D('step', 0.3); });
  await take('08b-poses-close-a', async () => { await D('setScene', 'poses'); await D('step', 0.3); await D('setCamera', { target: [-11, 0.9, 0.5], dist: 24, az: 10, el: 18, fov: 32 }); await D('render'); });
  await take('08c-poses-close-b', async () => { await D('setScene', 'poses'); await D('step', 0.3); await D('setCamera', { target: [-41, 0.9, 1.0], dist: 26, az: 10, el: 18, fov: 32 }); await D('render'); });
  await take('08d-poses-close-c', async () => { await D('setScene', 'poses'); await D('step', 0.3); await D('setCamera', { target: [-67, 0.9, 0.5], dist: 26, az: 10, el: 18, fov: 32 }); await D('render'); });
  await take('09-items-carried-and-loose', async () => { await D('setScene', 'items'); await D('step', 0.2); });
  await take('09b-items-close', async () => { await D('setScene', 'items'); await D('step', 0.2); await D('setCamera', { target: [-15, 0.8, 2.5], dist: 26, az: 8, el: 30, fov: 32 }); await D('render'); });
  await take('09c-items-close', async () => { await D('setScene', 'items'); await D('step', 0.2); await D('setCamera', { target: [-63, 0.8, 2.5], dist: 26, az: 8, el: 30, fov: 32 }); await D('render'); });
  await take('10-lineup-all-species', async () => { await D('setScene', 'lineup', { species: 'all' }); await D('step', 0.2); });
  for (const [sp, c] of [['camponotus-pennsylvanicus', 'major'], ['messor-barbarus', 'major'], ['atta-texana', 'major'], ['atta-texana', 'minor'], ['lasius-niger', 'male']]) {
    await take(`11-hero-${sp}-${c}`, async () => { await D('setScene', 'hero', { species: sp, caste: c }); await D('step', 0.2); });
  }
  await take('12-crowd-2000', async () => { await D('setScene', 'crowd', { n: '2000', species: 'lasius-niger' }); await D('step', 0.4); out.crowd = await D('info'); });
  await take('12b-crowd-2000-lod-tint', async () => { await D('setLod', { debugTint: true }); await D('render'); await D('setLod', { debugTint: false }); });
  await take('12c-crowd-overview', async () => { await D('setCamera', { target: [0, 0, 0], dist: 520, az: 20, el: 50, fov: 40 }); await D('step', 0.1); out.overview = await D('info'); });
  await take('13-highlight-possessed-hover', async () => {
    await D('setScene', 'queen', { species: 'lasius-niger' }); await D('step', 0.1);
    const ids = await page.evaluate(() => window.__demo.sim.state.ants.map((a) => a.id));
    await D('possess', ids[0]); await D('setHover', ids[1]);
  });
  if (want('14-gait')) {
    // fixed camera, side view; three frames 1/6 gait cycle apart; footSlide projects the stance feet of every frame
    await D('setScene', 'gait'); await D('step', 0.5);
    const pos = await page.evaluate(() => { const a = window.__demo.sim.state.ants[0]; return [a.pos.x, a.pos.y, a.pos.z]; });
    await D('setCamera', { target: [pos[0], 0.45, pos[2] + 0.8], dist: 11, az: 90, el: 4, fov: 30, follow: -1 });
    const cycle = 2.0 / 24; // stride (mm per cycle) / speed (mm/s), Lasius worker
    for (let k = 0; k < 3; k++) { if (k) await D('step', cycle / 6, cycle / 24); else await D('render'); await shot(`14-gait-${k + 1}`); }
    await D('setScene', 'gait'); await D('step', 0.5);
    await D('setCamera', { target: [pos[0], 0.45, pos[2] + 0.8], dist: 11, az: 90, el: 4, fov: 30, follow: -1 });
    out.footSlide = await D('footSlide', 3, cycle / 6);
    await D('setCamera', { target: [pos[0], 0.45, pos[2] + 0.8], dist: 11, az: 90, el: 4, fov: 30, follow: 0 });
    out.footSlide60 = await D('footSlide', 60, 1 / 60); // camera follows: world-space drift is the measure here
    delete out.footSlide60.feet;
    log('footSlide', JSON.stringify({ ...out.footSlide, feet: undefined }), JSON.stringify(out.footSlide60));
  }
  return out;
};
