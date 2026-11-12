// Screenshots of the demo screens: node tools/harness/play.mjs --root spikes/ui-demo --script spikes/ui-demo/scripts/shots.mjs
// Environment: UI_SCREENS="title,new-game" (comma list of `screen[?extra=flags]`), UI_SIZES="1280x720,1920x1080",
// UI_SCALES="100,80,150", UI_EXTRA="reducedMotion=1" (appended to every URL), UI_PREFIX="run1" (file name prefix).
// Writes <out>/<prefix><screen>-<w>x<h>-s<scale>.png and returns the list.
const DEFAULT_SCREENS = [
  'boot', 'title', 'title-empty', 'new-game', 'loading', 'loading-regen', 'loading-error', 'pause', 'settings&tab=graphics',
  'settings&tab=audio', 'settings&tab=controls', 'settings&tab=accessibility', 'settings&tab=gameplay', 'save-load&tab=save',
  'save-load&tab=load', 'save-load&tab=transfer', 'credits', 'codex', 'error', 'unsupported', 'epitaph',
];

export default async ({ page, shot, log, wait, url }) => {
  const screens = (process.env.UI_SCREENS ?? DEFAULT_SCREENS.join(',')).split(',').filter(Boolean);
  const sizes = (process.env.UI_SIZES ?? '1280x720').split(',');
  const scales = (process.env.UI_SCALES ?? '100').split(',');
  const extra = process.env.UI_EXTRA ? `&${process.env.UI_EXTRA}` : '';
  const prefix = process.env.UI_PREFIX ?? '';
  const base = url.split('?')[0];
  const out = [];
  for (const size of sizes) {
    const [w, h] = size.split('x').map(Number);
    await page.setViewportSize({ width: w, height: h });
    for (const scale of scales) {
      for (const s of screens) {
        const [name, ...rest] = s.split('&');
        const query = `screen=${name}${rest.length ? '&' + rest.join('&') : ''}&scale=${scale}${extra}`;
        await page.goto(`${base}?${query}`);
        await page.waitForFunction('window.__ready === true', null, { timeout: 30000 });
        await page.waitForTimeout(450); // entrance animation
        const file = `${prefix}${name}${rest.length ? '-' + rest.map((r) => r.split('=')[1]).join('-') : ''}-${w}x${h}-s${scale}`;
        out.push(await shot(file));
      }
    }
  }
  log(`${out.length} screenshots`);
  return out.map((p) => p.split('/').pop());
};
