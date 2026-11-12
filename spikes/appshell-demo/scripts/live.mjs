// Harness script: the live loop (clock running) driven by real key / mouse / wheel input through every rig.
// node tools/harness/play.mjs --root spikes/appshell-demo --query "test=1&quality=auto" \
//   --script spikes/appshell-demo/scripts/live.mjs --out test-output/appshell/live
export default async ({ page, shot, log, wait }) => {
  const cam = () => page.evaluate(() => window.__demo.camera());
  await page.mouse.click(640, 400); // focus the canvas
  await wait(1500);
  const a = await cam();
  await page.keyboard.press('Digit2'); // observer
  await wait(600);
  await page.keyboard.down('KeyW');
  await wait(1000);
  await page.keyboard.up('KeyW');
  const b = await cam();
  if (Math.hypot(a.pose.pos.x - b.pose.pos.x, a.pose.pos.z - b.pose.pos.z) < 1) throw new Error('observer did not fly');
  await shot('live-observer');
  await page.keyboard.press('Digit3'); // colony
  await wait(900);
  await page.mouse.wheel(0, -300);
  await page.keyboard.press('KeyG'); // cutaway mode
  await wait(300);
  await shot('live-colony');
  await page.keyboard.press('Digit4'); // photo
  await wait(600);
  await page.keyboard.press('BracketLeft');
  await wait(300);
  await shot('live-photo');
  await page.keyboard.press('Digit1'); // back to the ant
  await wait(1200);
  await page.mouse.move(640, 400);
  await page.mouse.down({ button: 'middle' });
  await page.mouse.move(700, 380, { steps: 6 });
  await page.mouse.up({ button: 'middle' });
  await page.keyboard.press('KeyZ'); // recentre
  await wait(800);
  await shot('live-third');
  const info = { input: await page.evaluate(() => window.__demo.input()), stats: await page.evaluate(() => window.__demo.stats()), cam: await cam() };
  log(JSON.stringify({ quality: await page.evaluate(() => document.getElementById('hud').textContent.split('\n')[0]), rig: info.cam.rig, fps: info.stats.fps }));
  await page.evaluate(() => window.__demo.dispose());
  return info;
};
