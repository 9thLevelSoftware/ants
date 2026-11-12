// Measurements for docs/research/spike-nest.md. Run alone (SwiftShader + V8 timings are noisy under load).
export default async ({ page, log }) => {
  const S = (f, ...a) => page.evaluate(([f, a]) => window.__spike[f](...a), [f, a]);
  const out = {};
  out.initial = await S('stats');
  out.spawned = await S('spawnAI', 50);
  await S('step', 5, { render: false });
  out.ai = await S('aiState');
  // dig a 22-step ramp tunnel like the player does
  await S('teleport', 190, 20, 300, { heading: 0 });
  for (let i = 0; i < 22; i++) {
    await S('dig');
    await S('setInput', { forward: 1, desired: [Math.cos(0.52), -Math.sin(0.52), 0] });
    await S('step', 0.06, { render: false });
    await S('setInput', { forward: 0 });
  }
  const st = await S('stats');
  const d = st.digs;
  const avg = (k) => d.reduce((s, x) => s + x[k], 0) / d.length;
  out.dig = { n: d.length, carveMs: avg('carveMs'), meshMs: avg('meshMs'), chunks: avg('chunks'), navMs: avg('navMs'), changedVoxels: avg('changed'), last: d.slice(-3) };
  out.afterDig = { carveChunks: st.carveChunks, meshedChunks: st.meshedChunks, tris: st.tris, bytes: st.bytes, meshMsPerChunk: st.meshMsPerChunk };
  out.bench = await S('bench');
  // render cost per view (ms per frame, sync with readPixels inside bench())
  const views = {};
  await S('teleport', 316, -52, 316, { heading: -1.4 }); await S('setCamera', 'third'); await S('step', 0.3);
  views.tunnel3p = (await S('bench')).renderMs;
  await S('teleport', 228, 20, 236, { heading: 0.6 }); await S('step', 0.3);
  views.surface3p = (await S('bench')).renderMs;
  await S('setCamera', 'cutaway', { plane: 240, xray: true, yaw: 0.35, pitch: 0.25, dist: 330, target: [300, -60, 330] });
  views.cutawayXray = (await S('bench')).renderMs;
  out.renderMsByView = views;
  log(JSON.stringify(out, null, 1));
  return out;
};
