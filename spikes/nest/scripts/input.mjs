// Real-time loop + real input events (no ?test=1): keyboard W, mouse drag orbit (no pointer lock), wheel, E dig.
export default async ({ page, shot, log, wait }) => {
  const st0 = await page.evaluate(() => window.__spike.walkerState());
  await page.mouse.move(640, 360);
  await page.keyboard.down('KeyW');
  await wait(2500);
  await page.keyboard.up('KeyW');
  const st1 = await page.evaluate(() => window.__spike.walkerState());
  // drag to orbit 90 degrees-ish
  const ref0 = await page.evaluate(() => window.__spike.walkerState().camera.pos);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) { await page.mouse.move(640 - i * 25, 360 + i * 4); await wait(30); }
  await page.mouse.up();
  await wait(400);
  const ref1 = await page.evaluate(() => window.__spike.walkerState().camera.pos);
  await page.mouse.wheel(0, 400);
  await wait(800);
  const z1 = await page.evaluate(() => window.__spike.walkerState().camera);
  await shot('input-after-orbit-zoom');
  // dig with E (hold briefly)
  const b0 = await page.evaluate(() => window.__spike.stats().digs.length);
  await page.keyboard.down('KeyE'); await wait(700); await page.keyboard.up('KeyE');
  await wait(300);
  const b1 = await page.evaluate(() => window.__spike.stats().digs.length);
  await shot('input-after-dig');
  const r = { moved: Math.hypot(st1.pos[0] - st0.pos[0], st1.pos[2] - st0.pos[2]), camMoved: Math.hypot(ref1[0] - ref0[0], ref1[2] - ref0[2]), zoomDesired: z1.desired, digs: b1 - b0, fps: await page.evaluate(() => document.getElementById('hud').textContent.split('\n')[0]) };
  log(JSON.stringify(r));
  await page.evaluate(() => window.__spike.dispose());
  return r;
};
