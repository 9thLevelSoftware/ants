import { writeFileSync } from 'node:fs';
// Temperature and moisture overlays on a generated garden (real worldgen and environment: lawn, paving, beds, shade).
// Usage: node tools/harness/play.mjs --root spikes/fx-demo --query "test=1&world=garden&ticks=300" \
//          --script spikes/fx-demo/scripts/shots-garden.mjs --out test-output/scent-fx/garden --timeout 180000 --script-timeout 900000
export default async ({ page, log, out }) => {
  const result = {};
  const plan = [
    ['overview', 'none'], ['overview', 'temperature'], ['overview', 'moisture'],
    ['hot-temperature', 'none'], ['hot-temperature', 'temperature'], ['hot-moisture', 'none'], ['hot-moisture', 'moisture'],
  ];
  for (const [v, ov] of plan) {
    {
      const info = await page.evaluate(([view, o]) => {
        const fx = window.__fx;
        fx.clear();
        fx.view(view);
        if (o !== 'none') fx.overlay(o, true);
        fx.render(0);
        const s = fx.stats();
        return [{ ...s.fx, draws: s.frame.drawCalls, tick: s.tick }, document.querySelector('canvas').toDataURL('image/png')];
      }, [v, ov]);
      const name = `garden-${v}-${ov}`;
      log(name, JSON.stringify(info[0]));
      result[name] = info[0];
      writeFileSync(`${out}/${name}.png`, Buffer.from(info[1].split(',')[1], 'base64'));
    }
  }
  // the same overview with something to show: a wet patch (soil moisture cheat) and a hot spell (+12 °C anomaly)
  const extra = await page.evaluate(() => {
    const fx = window.__fx;
    const shots = {};
    fx.clear(); fx.view('overview'); fx.overlay('moisture', true); fx.render(0);
    const r = fx.fx.parts.ground.image.frontRegion;
    const sim = fx.sim(), bu = sim.world.bu;
    const cx = r.x0 + r.size * 0.45, cz = r.z0 + r.size * 0.6;
    // demo fixture (cheat.setSoilMoisture is not implemented by the environment yet): a soaked disc with a puddle
    const m = sim.state.env.moisture;
    for (let iz = 0; iz < m.nz; iz++) for (let ix = 0; ix < m.nx; ix++) {
      const d = Math.hypot((ix + 0.5) * m.cell - cx, (iz + 0.5) * m.cell - cz) / bu;
      if (d < 60) m.theta0[iz * m.nx + ix] = Math.max(m.theta0[iz * m.nx + ix], Math.round(255 * (0.98 - 0.5 * d / 60)));
      if (d < 14) m.puddle[iz * m.nx + ix] = 12;
    }
    fx.overlay('moisture', false); fx.overlay('moisture', true);
    fx.render(0);
    shots['garden-overview-moisture-wet-patch'] = document.querySelector('canvas').toDataURL('image/png');
    fx.clear(); fx.command({ type: 'cheat.setAnomaly', c: 12 }); fx.command({ type: 'cheat.noLag', on: true }); fx.step(20);
    fx.overlay('temperature', true); fx.render(0); fx.render(0);
    shots['garden-overview-temperature-hot-spell'] = document.querySelector('canvas').toDataURL('image/png');
    return shots;
  });
  for (const [name, url] of Object.entries(extra)) {
    log(name);
    writeFileSync(`${out}/${name}.png`, Buffer.from(url.split(',')[1], 'base64'));
  }
  await page.evaluate(() => window.__fx.dispose());
  return result;
};
