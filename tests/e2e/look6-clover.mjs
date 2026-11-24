// look-pass-6 item 4: a clover head close up (white polka dots, look5 item6/camera-try1/flank45-follow.png). The nearest clover patch of the game's
// world, the observer camera 22 mm from the head, at each quality of L6_TIERS (default low,medium). Pictures: <out>/clover-<tier>[-<tag>].png
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=low" --script tests/e2e/look6-clover.mjs --out test-output/look6/clover
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.L6_TAG ? `-${process.env.L6_TAG}` : '';
  const plants = await g(() => window.__game.query.plants().filter((p) => /clover/.test(p.templateId ?? '') && p.pos));
  log('clover plants', plants.length);
  if (!plants.length) throw new Error('look6-clover: no clover in this world');
  const s = await g(() => window.__game.query.world().queenStart.pos);
  plants.sort((a, b) => Math.hypot(a.pos.x - s.x, a.pos.z - s.z) - Math.hypot(b.pos.x - s.x, b.pos.z - s.z));
  const p = plants[0].pos;
  await g(() => window.__game.camera.set('observer'));
  for (const q of (process.env.L6_TIERS ?? 'low,medium').split(',')) {
    await g((id) => window.__game.quality(id), q);
    const h = await g((x) => window.__game.query.field(x.x, 0, x.z).height, p);
    const head = { x: p.x, y: h + 90, z: p.z };
    await g(({ pos, look }) => window.__game.camera.setPose(pos, look), { pos: { x: head.x + 16, y: head.y + 14, z: head.z + 12 }, look: head });
    await g(() => window.__game.renderFrame({ settle: 1.5 }));
    await page.waitForTimeout(400);
    const h2 = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    await page.screenshot({ path: `${out}/clover-${q}${tag}.png`, timeout: 300000 });
    await h2.evaluate((el) => el.remove());
    log('clover', q, JSON.stringify(head));
  }
};
