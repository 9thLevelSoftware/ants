// Look pass 2 tuning lab: ONE game session, many look variants. Each variant is a snippet of JS run in the page that
// may change the mutable tuning tables (NIGHT_LOOK, ANT_FILL, ...) through `mod(path)` = the live ES module of a
// source file (the dev server serves one instance per URL, the game's own), then the scene is drawn and measured.
//
//   LAB_FILE=lab.json node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=medium" \
//        --script tests/e2e/look2-lab.mjs --out test-output/look2/lab
//
// lab.json: { "quality": "medium", "light": "night", "view": "surface", "variants": [ { "name": "a", "code": "..." } ] }
// Result per variant: the ground / ant numbers of tests/e2e/lib/look2-measure.mjs and a plate PNG.
import { readFileSync, writeFileSync } from 'node:fs';
import { measureInPage } from './lib/look2-measure.mjs';
import { stage } from './lib/look2-stage.mjs';

export default async ({ page, log, out: outDir }) => {
  const lab = JSON.parse(readFileSync(process.env.LAB_FILE, 'utf8'));
  const g = (fn, arg) => page.evaluate(fn, arg);
  const S = await stage(page, log, { arch: lab.arch ?? null, seed: lab.seed ?? 1 });
  await g((q) => window.__game.quality(q), lab.quality ?? 'medium');
  await S.setLight(lab.light ?? 'night');
  const view = lab.view ?? 'surface';
  if (view === 'surface' || view === 'entrance') await S.surfaceWorker(view);
  else if (view === 'nest') await S.nestWorker();
  else if (view === 'observer') await S.observerAt();
  else if (view === 'observerlow') await S.observerAt(22, 40);
  else if (view === 'slice') await S.sliceAt();
  else if (view === 'edge') await S.edgeAt();
  await g(() => window.__game.step(1));
  await S.render(0.5);
  const gp = view === 'surface' || view === 'entrance' ? await S.groundPoints() : { subject: null, points: [] };
  const results = [];
  for (const v of lab.variants) {
    if (v.light) await S.setLight(v.light);
    await page.evaluate(async ({ code }) => {
      const mod = (p) => import(/* @vite-ignore */ p);
      await new Function('mod', `return (async () => { ${code} })()`)(mod);
    }, { code: v.code ?? '' });
    const m = await page.evaluate(async ({ fn, args }) => {
      window.__game.renderFrame({ settle: 0.5 });
      return await new Function(`return (${fn})`)()(args);
    }, { fn: measureInPage.toString(), args: { points: gp.points, subject: gp.subject } });
    const h = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    await page.screenshot({ path: `${outDir}/${v.name}.png`, timeout: 300000 });
    await h.evaluate((el) => el.remove());
    results.push({ name: v.name, measure: m });
    log(`${v.name}: ground=${m.ground.median?.toFixed(3)} p10=${m.ground.p10?.toFixed(3)} p90=${m.ground.p90?.toFixed(3)} frame=${m.frame.median?.toFixed(3)} ant=${m.ant?.median?.toFixed(3)} ring=${m.ring?.median?.toFixed(3)} contrast=${m.contrast?.toFixed(2)}`);
  }
  writeFileSync(`${outDir}/lab-results.json`, JSON.stringify(results, null, 1));
  return { results: results.length };
};
