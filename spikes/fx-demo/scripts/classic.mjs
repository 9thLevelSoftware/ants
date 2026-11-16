// The classic single-file build served statically under a sub-path: the scent view and the effects still work.
//   node tools/harness/play.mjs --static --mount /games/foundress/fx/ --root test-output/scent-fx/classic \
//        --query "test=1&ticks=1500&hud=0" --script spikes/fx-demo/scripts/classic.mjs --out test-output/scent-fx/classic-run
import { writeFileSync } from 'node:fs';
export default async ({ page, log, out }) => {
  const [info, png] = await page.evaluate(() => {
    const fx = window.__fx;
    fx.effects(true, true);
    fx.view('trail');
    fx.overlay('scent', true);
    fx.render(0);
    return [{ ...fx.stats().fx, scripts: [...document.scripts].map((s) => s.type || 'classic') }, document.querySelector('canvas').toDataURL('image/png')];
  });
  log(JSON.stringify(info));
  writeFileSync(`${out}/classic-trail.png`, Buffer.from(png.split(',')[1], 'base64'));
  await page.evaluate(() => window.__fx.dispose());
  return info;
};
