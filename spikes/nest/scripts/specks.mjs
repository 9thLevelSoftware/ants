export default async ({ page, shot, log }) => {
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  await S('teleport', 200, 20, 200, { heading: 0 });
  await S('dig'); await S('dig', 4, 'body');
  await S('setVisible', 'ants', false);
  await S('setCamera', 'free', { pos: [204, 14, 196], target: [206, 0, 201], fov: 60 });
  await shot('a-all');
  await S('setVisible', 'cavity', false);
  await shot('b-no-cavity');
  await S('setVisible', 'cavity', true);
  await S('setVisible', 'terrain', false);
  await shot('c-no-terrain');
  log(JSON.stringify(await page.evaluate(() => window.__spike.stats().breaches)));
};
