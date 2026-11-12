// Screenshots of the HUD demo scenes at the sizes and scales that matter (task ui-hud acceptance 2). Run through the
// harness; env: HUD_SIZES="1280x720,1920x1080" HUD_SCALES="100,80,150" HUD_SCENES="worker,queen,orders,roster,inspect,alerts,hidden" HUD_PREFIX=name.
//   node tools/harness/play.mjs --root spikes/hud-demo --script spikes/hud-demo/scripts/shots.mjs --query "scene=worker" --out test-output/hud/shots
export default async ({ page, shot, log, wait, url }) => {
  const sizes = (process.env.HUD_SIZES ?? '1280x720').split(',').map((s) => s.split('x').map(Number));
  const scales = (process.env.HUD_SCALES ?? '100').split(',').map(Number);
  const scenes = (process.env.HUD_SCENES ?? 'worker,queen,orders,roster,inspect,alerts,hidden').split(',');
  const prefix = process.env.HUD_PREFIX ?? 'hud';
  const base = new URL(url);
  const out = [];
  for (const [w, h] of sizes) {
    for (const scale of scales) {
      for (const scene of scenes) {
        await page.setViewportSize({ width: w, height: h });
        const u = new URL(base);
        u.search = `scene=${scene}&scale=${scale}&anchor=1${process.env.HUD_EXTRA ? '&' + process.env.HUD_EXTRA : ''}${scene === 'orders' && process.env.HUD_MANUAL ? '&manual=1' : ''}`;
        await page.goto(u.toString());
        await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
        await wait.frames(4);
        const name = `${prefix}-${scene}-${w}x${h}-s${scale}`;
        out.push(await shot(name));
        log('shot', name);
      }
    }
  }
  return { shots: out };
};
