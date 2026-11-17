// Look pass 3, item 2 (S16): the gaster of a worker with a full crop, in the ants demo (spikes/render-ants-demo, 'poses' row:
// the last pose is 'replete'). The game has no cheat for a full crop, so the gaster look is judged here, at the demo's day light
// and from the same pose before and after.
//
//   node tools/harness/play.mjs --root spikes/render-ants-demo --query "quality=high" --script tests/e2e/look3-replete.mjs \
//        --out test-output/look3/ants --width 1280 --height 720 --script-timeout 900000
// LOOK3_TAG=before|after (file prefix); LOOK3_MEMBRANE=#bba98a (patch the Lasius membrane colour before the scene is built, to
// reproduce the old look).
export default async ({ page, shot, log }) => {
  const tag = process.env.LOOK3_TAG ?? 'after';
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
  if (process.env.LOOK3_MEMBRANE) {
    await page.evaluate(async (hex) => { const m = await import('/src/render/ants/morph/lasius.ts'); m.LASIUS_COLORS.membrane = hex; }, process.env.LOOK3_MEMBRANE);
  }
  await D('setScene', 'poses'); await D('step', 0.3);
  await D('setCamera', { target: [-67, 0.9, 0.5], dist: 26, az: 10, el: 18, fov: 32 }); await D('render');
  await shot(`${tag}-replete-a`);
  await D('setCamera', { target: [-67.5, 0.9, 0.5], dist: 10, az: 60, el: 25, fov: 32 }); await D('render');
  await shot(`${tag}-replete-b`);
  log('replete shots', tag);
};
