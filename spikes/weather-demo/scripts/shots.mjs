import { writeFileSync } from 'node:fs';
// Acceptance screenshots of the weather demo: a low nest beside a paved hollow, before / during / after a storm.
// Usage (from the project root; one harness at a time):
//   node tools/harness/play.mjs --root spikes/weather-demo --query "test=1" --script spikes/weather-demo/scripts/shots.mjs \
//        --out test-output/weather/shots-test --timeout 120000 --script-timeout 900000
// Same with --query "quality=high" for the look preset. WX_SHOTS=storm,after saves only the matching shots (the
// others still run, so the sim state is the same).
const W = (fn, arg) => [fn.toString(), arg];
const png = () => document.querySelector('canvas').toDataURL('image/png');

export default async ({ page, log, out }) => {
  const only = (process.env.WX_SHOTS ?? '').split(',').filter(Boolean);
  const result = {};
  const run = async (name, fn, arg) => {
    if (only.length && !only.some((o) => name.includes(o))) { await page.evaluate(([src, a]) => (0, eval)(`(${src})`)(window.__wx, a), W(fn, arg)); return; }
    const [info, data] = await page.evaluate(([src, a, cap]) => {
      const r = (0, eval)(`(${src})`)(window.__wx, a);
      return [r, (0, eval)(`(${cap})`)()];
    }, [...W(fn, arg), png.toString()]);
    log(name, JSON.stringify(info));
    result[name] = info;
    writeFileSync(`${out}/${name}.png`, Buffer.from(data.split(',')[1], 'base64'));
  };
  await run('01-before-surface', (wx) => { wx.phase('before'); wx.view('surface'); wx.play(10); return wx.stats(); });
  await run('02-before-tunnel', (wx) => { wx.view('tunnel'); wx.settle(3); return wx.stats(); });
  // a held thunderstorm: 1.2 game hours
  await run('03-storm-surface', (wx) => { wx.phase('storm'); wx.view('surface'); wx.play(300); return wx.stats(); });
  await run('04-storm-puddle', (wx) => { wx.view('puddle'); wx.settle(2); return wx.stats(); });
  await run('05-storm-tunnel', (wx) => { wx.view('tunnel'); wx.settle(3); return wx.stats(); });
  // reduced motion (query reduced=1): the soft brightening at its peak, a second into it
  await run('06-storm-lightning', (wx) => { wx.view('surface'); wx.flash(); wx.render(wx.reducedMotion ? 1 : 0.01); return wx.stats(); });
  // after: 4 game hours of overcast
  await run('07-after-surface', (wx) => { wx.phase('after'); wx.view('surface'); wx.play(1000); return wx.stats(); });
  await run('08-after-puddle', (wx) => { wx.view('puddle'); wx.settle(2); return wx.stats(); });
  await run('09-after-tunnel', (wx) => { wx.view('tunnel'); wx.settle(3); return wx.stats(); });
  await page.evaluate(() => window.__wx.dispose());
  return result;
};
