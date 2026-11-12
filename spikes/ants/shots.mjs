/**
 * Required screenshots for docs/research/spike-ants.md.
 *   node tools/harness/play.mjs --root spikes/ants --script spikes/ants/shots.mjs --out docs/research/spike-ants-img --width 1280 --height 720
 * Everything is deterministic: time only advances through __spike.step().
 */
export default async ({ page, shot, log }) => {
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  const dof = (on) => S('setPost', { dof: on });
  const r = {};

  // ---- worker: three-quarter close-up, side profile, top view, head close-up
  await S('setScene', 'hero', { variant: 'worker' });
  await S('setAnt', 0, { phase: 0.18 });
  await dof(true);
  await S('setCamera', 'three-quarter'); await S('render'); await shot('01-worker-three-quarter');
  await dof(false);
  await S('setCamera', 'side'); await S('render'); await shot('02-worker-side');
  await S('setCamera', 'top'); await S('render'); await shot('03-worker-top');
  await dof(true);
  await S('setCamera', { target: [0, 0.45, 1.35], dist: 3.0, az: 28, el: 22, fov: 30 }); await S('setPost', { focus: 3.0, range: 1.2 }); await S('render'); await shot('04-worker-head');
  await dof(false);

  // ---- queen next to a worker for scale
  await S('setScene', 'scale'); await S('render'); await shot('05-queen-vs-worker');

  // ---- winged virgin queen (gyne) and male
  await S('setScene', 'hero', { variant: 'gyne' }); await S('setAnt', 0, { phase: 0.18 });
  await dof(true); await S('setCamera', 'three-quarter'); await S('render'); await shot('06-gyne-winged');
  await dof(false); await S('setCamera', 'top'); await S('render'); await shot('06b-gyne-top');
  await S('setScene', 'hero', { variant: 'male' }); await S('setAnt', 0, { phase: 0.18 });
  await dof(true); await S('setCamera', 'three-quarter'); await S('render'); await shot('07-male'); await dof(false);

  // ---- gait: three frames 1/6 cycle apart, side view, camera follows the ant (ground slides back, planted feet stay put)
  await S('setScene', 'hero', { variant: 'worker' });
  await S('setPose', 0, { speed: 24 });
  await S('step', 0.5);
  const cam = await S('setCamera', 'side');
  await S('setCamera', { pos: cam.pos, target: cam.target, follow: 0 });
  const stride = (await page.evaluate(() => window.__spike.debug.variants[0].rig.gait[0]));
  const dt = stride / 24 / 6;
  r.gait = [];
  for (let k = 0; k < 3; k++) { if (k) await S('step', dt); else await S('render'); r.gait.push(await page.evaluate(() => window.__spike.ants[0].phase)); await shot(`08-gait-${k + 1}`); }
  r.footSlide = await S('footSlide', 2, 0);

  // ---- carrying a cocoon (and the full item set)
  await S('setScene', 'hero', { variant: 'worker' });
  await S('setPose', 0, { item: 'cocoon' }); await S('setAnt', 0, { phase: 0.3 });
  await dof(true); await S('setCamera', { target: [0, 0.6, 1.6], dist: 15, az: 52, el: 22, fov: 30 }); await S('render'); await shot('09-carry-cocoon'); await dof(false);
  await S('setScene', 'items'); await S('render'); await shot('10-items-and-carriers');
  await S('setCamera', { target: [-4, 0.6, 3.5], dist: 16, az: 10, el: 32, fov: 30 }); await S('render'); await shot('10b-eggs-larva-cocoon');
  await S('setCamera', { target: [-26, 0.6, 3.5], dist: 16, az: 10, el: 32, fov: 30 }); await S('render'); await shot('10c-pupa-crumb-pellet');
  await S('setCamera', { target: [-52, 0.6, 3.5], dist: 16, az: 10, el: 32, fov: 30 }); await S('render'); await shot('10d-seed-leaf-droplet');

  // ---- poses and polymorphism
  await S('setScene', 'poses'); await S('step', 0.2); await shot('11-poses');
  await S('setCamera', { target: [-22.5, 1.0, 0], dist: 14, az: 25, el: 14, fov: 30 }); await S('render'); await shot('11b-spray-and-replete');
  await S('setScene', 'lineup'); await S('render'); await shot('12-castes-lineup');

  // ---- crowd of 2000 + far LOD
  await S('setScene', 'crowd', { n: 2000 }); await S('step', 0.4);
  await S('render'); r.crowd = await S('info'); await shot('13-crowd-2000');
  await S('setCamera', { target: [0, 0, 0], dist: 560, az: 20, el: 50, fov: 40 }); await S('render'); r.crowdOverview = (await S('info')).lod; await shot('13b-crowd-2000-overview');
  await S('setCamera', { target: [0, 0, 60], dist: 150, az: 20, el: 20, fov: 40 });
  await S('setLod', { debugTint: true }); await S('render'); await shot('14-far-lod-tinted'); await S('setLod', { debugTint: false });
  await S('setScene', 'lod'); await S('step', 0.1); await shot('15-lod-ladder');
  await S('setCamera', { target: [-9, 0.8, 0], dist: 75, az: 35, el: 30, fov: 30 }); await S('render'); await shot('15b-lod-ladder-mid-distance');

  log(JSON.stringify({ gait: r.gait, footSlide: r.footSlide, crowdLod: r.crowd.lod, crowdTris: r.crowd.submittedTris, overview: r.crowdOverview }));
  return { gait: r.gait, footSlide: r.footSlide, crowdLod: r.crowd.lod, crowdTris: r.crowd.submittedTris, overview: r.crowdOverview, variants: r.crowd.variants, items: r.crowd.items };
};
