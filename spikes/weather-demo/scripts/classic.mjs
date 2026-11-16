// The classic single-file build served statically under a sub-path: the weather renderer still works.
//   npx vite build spikes/weather-demo --config spikes/weather-demo/vite.config.ts --mode classic \
//        --outDir ../../test-output/weather/classic --emptyOutDir
//   node tools/harness/play.mjs --static --mount /games/foundress/wx/ --root test-output/weather/classic \
//        --query "test=1&hud=0" --script spikes/weather-demo/scripts/classic.mjs --out test-output/weather/classic-run
import { writeFileSync } from 'node:fs';
export default async ({ page, log, out }) => {
  const [info, png] = await page.evaluate(() => {
    const wx = window.__wx;
    wx.phase('storm');
    wx.view('puddle');
    wx.play(300);
    return [{ ...wx.stats().weather, scripts: [...document.scripts].map((s) => s.type || 'classic') }, document.querySelector('canvas').toDataURL('image/png')];
  });
  log(JSON.stringify(info));
  writeFileSync(`${out}/classic-storm-puddle.png`, Buffer.from(png.split(',')[1], 'base64'));
  await page.evaluate(() => window.__wx.dispose());
  return info;
};
