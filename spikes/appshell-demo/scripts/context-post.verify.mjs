// Review check (F3a): WebGL context loss and restore with the post chain ON (edge.mjs only covers post off).
// node tools/harness/play.mjs --root spikes/appshell-demo --query "test=1&quality=high&t=2" \
//   --script spikes/appshell-demo/scripts/context-post.verify.mjs --out test-output/review-f3a/context-post
export default async ({ page, shot, wait }) => {
  const demo = (fn) => page.evaluate(fn);
  await shot('before-loss');
  await demo(() => window.__demo.loseContext());
  await wait(() => window.__demo.contextLost() === true);
  const whileLost = await demo(() => window.__demo.renderFrame());
  await demo(() => window.__demo.restoreContext());
  await wait(() => window.__demo.contextLost() === false);
  await demo(() => window.__demo.setTime(window.__demo.times.open));
  const after = await demo(() => window.__demo.renderFrame());
  await wait.frames(2);
  await shot('after-restore-post');
  const stats = await demo(() => window.__demo.stats());
  await demo(() => window.__demo.dispose());
  if (whileLost !== false || after !== true) throw new Error(`context handling with post: ${whileLost} ${after}`);
  return { whileLost, after, stats };
};
