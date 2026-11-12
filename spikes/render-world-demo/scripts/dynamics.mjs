// Harness script: runtime changes. A dynamic primitive appears and disappears in the very next frame, the entrance
// mound grows and is redrawn within a few frames, and a new hole dug at runtime opens in the ground.
// node tools/harness/play.mjs --root spikes/render-world-demo --query "test=1&t=1&hud=0&view=breach" \
//   --script spikes/render-world-demo/scripts/dynamics.mjs --out test-output/rw/dynamics
export default async ({ page, shot, log }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const res = {};
  await demo(() => window.__demo.setView('breach'));
  await shot('dyn-0-before');
  // add a dynamic primitive: present after one render
  const id = await demo(() => {
    const h = window.__demo.height(7712, 8160);
    return window.__demo.addPrim({ shape: 'box', material: 'plastic', pos: { x: 7712, y: h + 3, z: 8160 }, size: { x: 6, y: 3, z: 4 }, round: 1, tint: 0.2 });
  });
  res.addedVisible = await demo((i) => window.__demo.hasPrim(i), id);
  await shot('dyn-1-added');
  res.removed = await demo((i) => window.__demo.removePrim(i), id);
  res.removedGone = !(await demo((i) => window.__demo.hasPrim(i), id));
  await shot('dyn-2-removed');
  // grow the mound: rebuilt on the next frame
  const before = await demo(() => window.__demo.stats().world.mounds);
  res.moundRebuilds = await demo(() => window.__demo.growMound(2.2));
  res.moundsBefore = before;
  await shot('dyn-3-mound-grown');
  // dig a new hole beside the entrance: the hole mask rasterises it within the per-frame tile budget
  res.breaches = await demo(() => window.__demo.dig(7735, 8170, 4));
  res.holeSlots = await demo(() => window.__demo.stats().world.holeSlots);
  await shot('dyn-4-dug');
  log(JSON.stringify(res));
  if (!res.addedVisible || !res.removedGone) throw new Error('dynamic primitive did not follow the sim within one frame');
  return res;
};
