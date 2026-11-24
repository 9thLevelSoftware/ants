// look-pass-6 item 4: the title screen's horizon (a speckled band along it, look5 firstplay/seed1/01-title.png). One picture per quality tier:
//   node tools/harness/play.mjs --root . --query "test=1&quality=low" --script tests/e2e/look6-title.mjs --out test-output/look6/title
// L6_TAG=<prefix> (default 'title'), L6_TIERS=low,medium,high.
export default async ({ page, log, out }) => {
  const tag = process.env.L6_TAG ?? 'title';
  for (const q of (process.env.L6_TIERS ?? 'low').split(',')) {
    const r = await page.evaluate((id) => window.__game.quality(id), q);
    if (!r.ok) throw new Error(`quality ${q}: ${JSON.stringify(r)}`);
    await page.evaluate(() => window.__game.renderFrame({ settle: 1 }));
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${out}/${tag}-${q}.png`, timeout: 300000 });
    log('title', q);
  }
};
