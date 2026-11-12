// The classic single-file build inside <iframe sandbox="allow-scripts"> (opaque origin: no localStorage, no CORS):
//   npx vite build spikes/ui-demo --config spikes/ui-demo/vite.config.ts --mode classic --outDir ../../test-output/ui-demo-classic --emptyOutDir
//   node tools/harness/play.mjs --static --root test-output/ui-demo-classic --script spikes/ui-demo/scripts/iframe.mjs
// Proves the UI starts, renders with the bundled fonts, survives the missing storage and makes no request of its own.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export default async ({ page, shot, log, url, root }) => {
  const base = url.split('?')[0];
  writeFileSync(join(root, 'frame.html'), '<!doctype html><html><body style="margin:0;background:#222"><iframe id="f" sandbox="allow-scripts" src="./index.html?screen=settings&tab=accessibility" style="border:0;width:100vw;height:100vh"></iframe></body></html>');
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto(`${base}frame.html`);
  const frame = await (async () => {
    for (let i = 0; i < 100; i++) {
      const f = page.frames().find((x) => x !== page.mainFrame());
      if (f) return f;
      await page.waitForTimeout(100);
    }
    throw new Error('no iframe');
  })();
  await frame.waitForFunction('window.__ready === true', null, { timeout: 30000 });
  await page.waitForTimeout(600);
  const info = await frame.evaluate(`({ origin: window.origin, storage: (() => { try { localStorage.getItem('x'); return 'available'; } catch { return 'blocked'; } })(), fonts: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family), notice: document.querySelector('.ui-notice')?.textContent ?? '' })`);
  log(JSON.stringify(info));
  await shot('iframe-settings');
  const ownOrigin = new URL(base).origin;
  const remote = requests.filter((u) => !u.startsWith(ownOrigin) && !u.startsWith('data:') && !u.startsWith('blob:'));
  if (info.origin !== 'null') throw new Error(`the frame is not opaque-origin (origin ${info.origin})`);
  if (info.storage !== 'blocked') throw new Error('expected storage to be blocked in the sandbox');
  if (!info.fonts.some((f) => f.includes('Inter'))) throw new Error('bundled Inter font did not load in the sandbox');
  if (!info.notice.includes('cannot be stored')) throw new Error('Settings did not tell the player that settings cannot be stored');
  if (remote.length) throw new Error(`remote requests: ${remote.join(', ')}`);
  return info;
};
