/**
 * Acceptance screenshots for render-creatures (deterministic: time advances only through __demo.step).
 *   node tools/harness/play.mjs --root spikes/render-creatures-demo --query "quality=high" \
 *        --script spikes/render-creatures-demo/shots.mjs --out test-output/creatures-render/shots --width 1280 --height 720 --script-timeout 900000
 * Env SHOTS=comma,separated,prefixes limits the set.
 */
export default async ({ page, shot, log }) => {
  const D = (f, ...a) => page.evaluate(([f, a]) => window.__demo[f](...a), [f, a]);
  const only = (process.env.SHOTS || '').split(',').filter(Boolean);
  const want = (name) => !only.length || only.some((p) => name.startsWith(p));
  const out = {};
  const take = async (name, fn) => { if (!want(name)) return; await fn(); await shot(name); log('shot', name); };

  await take('01-lineup', async () => { await D('setScene', 'lineup'); await D('step', 0.3); out.lineup = await D('info'); });
  if (want('02-')) {
    const items = ['mite', 'springtail', 'aphid', 'fruit-fly', 'phorid-fly', 'ant-spider', 'rove-beetle', 'jumping-spider', 'ladybird', 'lacewing-larva',
      'ladybird-larva', 'fly-larva', 'caterpillar', 'caterpillar-hairy', 'woodlouse', 'wolf-spider', 'antlion', 'snail', 'centipede', 'caterpillar-medium',
      'millipede', 'earthworm'];
    await D('setScene', 'lineup', { labels: '0' }); await D('step', 0.3);
    const sel = (process.env.ITEMS || '').split(',').filter(Boolean);
    for (const [i, it] of items.entries()) {
      if (sel.length && !sel.includes(it)) continue;
      await D('view', it); await shot(`02-${String(i).padStart(2, '0')}-${it}`); log('shot', it);
    }
  }
  if (want('03-')) {
    await D('setComfort', 'off');
    for (const g of ['walk', 'crawl', 'hop-hover', 'coiled', 'dead']) {
      await D('setScene', 'styles'); await D('step', 0.55); await D('setAlpha', 0.5); await D('view', g);
      await shot(`03-styles-${g}`); log('shot', g);
    }
    out.styles = await D('info');
  }
  await take('04-herd', async () => { await D('setScene', 'herd'); await D('step', 0.2); out.herd = await D('info'); });
  await take('04b-herd-stem', async () => { await D('setScene', 'herd'); await D('step', 0.2); await D('view', 'stem'); });
  await take('04c-herd-leaf-underside', async () => { await D('setScene', 'herd'); await D('step', 0.2); await D('view', 'leaf'); });
  await take('04d-herd-dense', async () => { await D('setScene', 'herd'); await D('step', 0.2); await D('view', 'dense'); });
  await take('04e-herd-scale', async () => { await D('setScene', 'herd'); await D('step', 0.2); await D('view', 'scale'); });
  await take('05-pit', async () => { await D('setScene', 'pit'); await D('step', 0.2); out.pit = await D('info'); });
  await take('05b-pit-low', async () => { await D('setScene', 'pit'); await D('step', 0.2); await D('view', 'low'); });
  await take('05c-pit-close', async () => { await D('setScene', 'pit'); await D('step', 0.2); await D('view', 'close'); });
  await take('06-bird-approach', async () => { await D('setScene', 'bird-approach'); await D('step', 0.05); out.birdApproach = await D('info'); });
  await take('06b-bird-strike', async () => { await D('setScene', 'bird'); await D('step', 0.1); await D('setAlpha', 0.6); out.bird = await D('info'); });
  await take('06c-bird-strike-ant-level', async () => { await D('setScene', 'bird'); await D('step', 0.1); await D('setAlpha', 0.6); await D('view', 'low'); });
  for (const level of ['off', 'softened', 'abstract', 'marker']) {
    await take(`07-comfort-${level}`, async () => {
      await D('setScene', 'comfort'); await D('setComfort', level, { centipedes: level !== 'off' }); await D('step', 0.1);
      out[`comfort-${level}`] = await D('info');
    });
  }
  await take('08-crowd-300', async () => { await D('setComfort', 'off'); await D('setScene', 'crowd', { n: '300' }); await D('step', 0.3); out.crowd = await D('info'); });
  return out;
};
