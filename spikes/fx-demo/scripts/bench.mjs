// Acceptance 3 in the browser: scent view with 100,000 active cells on the bench world.
//   node tools/harness/play.mjs --root spikes/fx-demo --query "quality=high&world=bench&hud=0" --script spikes/fx-demo/scripts/bench.mjs \
//        --out test-output/scent-fx/bench --timeout 120000 --script-timeout 900000
import { writeFileSync } from 'node:fs';
export default async ({ page, log, out }) => {
  const [r, png] = await page.evaluate(() => {
    const res = window.__fx.bench100k(120);
    return [res, document.querySelector('canvas').toDataURL('image/png')];
  });
  log(JSON.stringify(r));
  writeFileSync(`${out}/bench-100k.png`, Buffer.from(png.split(',')[1], 'base64'));
  await page.evaluate(() => window.__fx.dispose());
  return r;
};
