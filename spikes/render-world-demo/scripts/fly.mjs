// Harness script: terrain LOD fly-through. A camera path over the demo world (ant height -> 2 m high and back down)
// with the haze switched off (?haze=0) so any crack or popping gap between clipmap levels would show as sky.
// node tools/harness/play.mjs --root spikes/render-world-demo --query "quality=high&t=1&hud=1&haze=0&post=0" \
//   --script spikes/render-world-demo/scripts/fly.mjs --script-timeout 1200000 --timeout 180000 --out test-output/rw/fly
export default async ({ page, shot, log }) => {
  const demo = (fn, arg) => page.evaluate(fn, arg);
  const frames = 10;
  const stats = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    const x = 6600 + t * 3600, z = 7600 + Math.sin(t * Math.PI) * 600;
    const up = 8 + Math.sin(t * Math.PI) * 2000; // ant height -> 2 m -> ant height
    const pos = await demo(([x, z, up]) => [x, window.__demo.height(x, z) + up, z], [x, z, up]);
    const look = [x + 400 + up * 0.8, pos[1] - up * 0.7 - 2, z + 200];
    await demo(([p, l]) => window.__demo.setCamera(p, l), [pos, look]);
    const s = await demo(() => window.__demo.render());
    stats.push({ i, up: Math.round(up), draws: s.drawCalls, tris: s.triangles });
    await shot(`fly-${String(i).padStart(2, '0')}`);
    log(JSON.stringify(stats[stats.length - 1]));
  }
  return { stats };
};
