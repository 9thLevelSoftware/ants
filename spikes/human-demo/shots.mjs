// Human events demo shots: one ant-height frame per scene (spikes/human-demo/scenes.ts).
//
//   node tools/harness/play.mjs --root spikes/human-demo --query "quality=high&hud=1" --script spikes/human-demo/shots.mjs \
//        --out test-output/human/high --timeout 300000 --script-timeout 1200000
//
// Environment: HUMAN_SCENES=a,b (default: all), HUMAN_TAG=high (file-name prefix).
export default async ({ page, shot, log }) => {
  const tag = process.env.HUMAN_TAG ?? 'shot';
  const all = await page.evaluate(() => window.__human.scenes());
  const want = process.env.HUMAN_SCENES ? process.env.HUMAN_SCENES.split(',') : all.map((s) => s.id);
  const out = [];
  for (const id of want) {
    const r = await page.evaluate((s) => window.__human.show(s), id);
    log(`${id}: ${JSON.stringify(r)}`);
    const file = `${tag}-${id}`;
    await shot(file);
    out.push({ id, file, ...r });
  }
  return out;
};
