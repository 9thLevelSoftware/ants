// Visual sweep of the generated worlds (task int-1B-app, gate 1B step 4): for each Tier 1 archetype (one seed), the
// founding queen in third person at the start, beside the largest object near her, among plants, indoors (when the
// map has an interior), the map edge, the colony view, and one `high`-quality shot. Every frame is looked at by the
// integrator; the script only checks that each beat rendered with the camera clear of solid.
//   node tools/harness/play.mjs --root . --query "test=1&quality=test&title=0" --script tests/e2e/sweep.mjs \
//        --out test-output/sweep --script-timeout 3000000
// SWEEP_ARCH=woodland-edge,kitchen-door picks archetypes; SWEEP_SEED (default 1); SWEEP_SKIP_HIGH=1.

const ARCHETYPES = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];

export default async ({ page, log, out, wait }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const result = { worlds: {} };
  const arches = (process.env.SWEEP_ARCH ?? '').split(',').filter(Boolean);
  const seed = Number(process.env.SWEEP_SEED ?? 1);
  const shot = async (name) => {
    await g(() => window.__game.renderFrame({ settle: 1 }));
    await wait.frames(2);
    await page.screenshot({ path: `${out}/${name}.png`, timeout: 300000 });
    const c = await g(() => ({ clear: window.__game.camera.clearance(), state: window.__game.camera.state(), view: window.__game.camera.view() }));
    log('shot', name, JSON.stringify(c));
    return c;
  };
  const step = (n) => g((k) => window.__game.step(k), n);
  const placeQueen = async (p, toward) => {
    await g(() => { if (window.__game.summary().view !== 'possess') window.__game.possess('queen'); });
    await g((q) => window.__game.teleport('possessed', q), { x: p.x, y: p.y + 1, z: p.z });
    await step(3);
    if (toward) {
      const a = (await g(() => window.__game.summary())).possessed.pos;
      const dx = toward.x - a[0], dz = toward.z - a[2], l = Math.hypot(dx, dz) || 1;
      await g((v) => window.__game.setIntent({ dir: v }), { x: dx / l, y: 0, z: dz / l });
      await step(6);
      await g(() => window.__game.setIntent({}));
    }
    await step(10);
  };

  for (const arch of arches.length ? arches : ARCHETYPES) {
    const t0 = Date.now();
    await g(([s, a]) => window.__game.newGame({ seed: s, archetype: a }), [seed, arch]);
    const genS = Math.round((Date.now() - t0) / 1000);
    await g(() => window.__game.command({ type: 'openingSkipIntro' }));
    await step(90);
    const spots = await g(() => window.__game.query.sweepSpots());
    const w = { genS, shots: {} };
    result.worlds[arch] = w;
    log(arch, 'spots', JSON.stringify(spots));
    w.shots.start = await shot(`${arch}-1-start`);
    if (spots.prop) { await placeQueen(spots.prop, { x: spots.prop.x - spots.propSize.x, z: spots.prop.z }); w.shots.prop = await shot(`${arch}-2-prop`); }
    if (spots.plants) { await placeQueen(spots.plants, { x: spots.plants.x - 3 * spots.bu, z: spots.plants.z - 3 * spots.bu }); w.shots.plants = await shot(`${arch}-3-plants`); }
    if (spots.interior) { await placeQueen(spots.interior, null); w.shots.interior = await shot(`${arch}-4-interior`); }
    if (spots.under) {
      // deep shade under a raised body (the car-park frame the look review found nearly black)
      await placeQueen(spots.under, null);
      w.shots.under = await shot(`${arch}-4b-under`);
      w.shadeEV = await g(() => window.__game.perf().renderers.world['shade.ev'] ?? null);
      if (!process.env.SWEEP_SKIP_HIGH) { await g(() => window.__game.quality('high')); w.shots.underHigh = await shot(`${arch}-4c-under-high`); await g(() => window.__game.quality('test')); }
    }
    // the map edge from an observer just inside it, looking out
    await g(() => window.__game.release());
    await step(2);
    const e = spots.edge, bu = spots.bu;
    await g(([a, l]) => window.__game.camera.setPose(a, l), [{ x: e.x, y: e.y + 8 * bu, z: e.z - 30 * bu }, { x: e.x, y: e.y + 4 * bu, z: spots.size + 60 * bu }]);
    w.shots.edge = await shot(`${arch}-5-edge`);
    // colony view over the start
    await g(() => window.__game.camera.set('colony'));
    await step(1);
    await g((o) => window.__game.views.colonyCamera(o), { x: spots.start.x, z: spots.start.z, distBu: 90, pitchDeg: 55, yawDeg: 30, cutaway: 'slice', planeYBu: spots.start.y / bu - 2, radiusBu: 60 });
    w.shots.colony = await shot(`${arch}-6-colony`);
    await g(() => window.__game.camera.set('observer'));
    // one high-quality shot: the queen at the start
    if (!process.env.SWEEP_SKIP_HIGH) {
      await placeQueen(spots.start, null);
      await g(() => window.__game.quality('high'));
      w.shots.high = await shot(`${arch}-7-high`);
      w.perfHigh = await g(() => { const p = window.__game.perf(); return { drawCalls: p.drawCalls, triangles: p.triangles }; });
      await g(() => window.__game.quality('test'));
    }
    w.perf = await g(() => { const p = window.__game.perf(); return { drawCalls: p.drawCalls, triangles: p.triangles, memory: p.memory }; });
    log(arch, 'done', JSON.stringify(w));
  }
  return result;
};
