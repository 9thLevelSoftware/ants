// Harness script: screenshots of every rig and of both quality / post paths, with camera clearance checks.
// node tools/harness/play.mjs --root spikes/appshell-demo --query "test=1&quality=low&t=2" \
//   --script spikes/appshell-demo/scripts/shots.mjs --out test-output/appshell/shots
export default async ({ page, shot, log }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const cam = () => demo(() => window.__demo.camera());
  const times = await demo(() => window.__demo.times);
  const result = { clearances: {} };
  const check = async (name) => {
    const c = await cam();
    result.clearances[name] = { clearance: +c.clearance.toFixed(3), minAllowed: +(c.radius * 0.5).toFixed(3), state: c.debug.state, rig: c.rig };
    if (c.rig === 'third' && c.clearance < c.radius * 0.5) throw new Error(`${name}: camera clearance ${c.clearance} < ${c.radius * 0.5}`);
    log(name, JSON.stringify(result.clearances[name]));
  };

  // --- low quality (no post): third person in the open, on the wall, in the corridor; observer; colony
  await demo((t) => window.__demo.setTime(t), times.open);
  await shot('low-third-open'); await check('low-third-open');
  await demo((t) => window.__demo.setTime(t), times.wall);
  await shot('low-third-wall'); await check('low-third-wall');
  await demo((t) => window.__demo.setTime(t), times.corridor);
  await shot('low-third-corridor'); await check('low-third-corridor');
  await demo(() => window.__demo.orbit(70, 0)); // the player orbits inside the tunnel: still no clipping
  await shot('low-third-corridor-orbit'); await check('low-third-corridor-orbit');
  await demo((t) => window.__demo.setTime(t), times.open);
  await demo(() => window.__demo.setRig('observer'));
  await shot('low-observer'); await check('low-observer');
  await demo(() => window.__demo.setRig('colony'));
  await shot('low-colony'); await check('low-colony');
  await demo(() => window.__demo.setRig('third'));

  // --- low with post on, then high (post on) and high with post off
  result.lowPost = await demo(() => window.__demo.setPost(true));
  await shot('low-post-on');
  result.high = await demo(() => window.__demo.setQuality('high'));
  await shot('high-third-open'); await check('high-third-open');
  await demo((t) => window.__demo.setTime(t), times.wall);
  await shot('high-third-wall');
  await demo((t) => window.__demo.setTime(t), times.corridor);
  await shot('high-third-corridor'); await check('high-third-corridor');
  await demo((t) => window.__demo.setTime(t), times.open);
  result.highPostOff = await demo(() => window.__demo.setPost(false));
  await shot('high-post-off');
  result.stats = await demo(() => window.__demo.stats());
  result.warnings = await demo(() => window.__demo.warnings());
  result.placeholders = await demo(() => window.__demo.placeholders());
  await demo(() => window.__demo.dispose());
  return result;
};
