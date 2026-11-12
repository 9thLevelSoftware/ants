export default async ({ page, shot, log }) => {
  const st = await page.evaluate(() => window.__spike.walkerState());
  log('state', JSON.stringify(st));
  await shot('00-start');
  await page.evaluate(() => window.__spike.setCamera('free', { pos: [200, 140, 160], target: [300, -20, 330], fov: 55 }));
  await shot('01-overview');
  return { st, stats: await page.evaluate(() => window.__spike.stats()) };
};
