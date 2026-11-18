// app-seams-2 fix, item 12(b): which scene objects draw the pale far blocks in the suburban opening? Casts rays from the camera through a few
// screen points and lists every object whose bounding box the ray crosses (name, kind, material, distance), nearest last.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low" --script tests/e2e/appSeams2-blocks.mjs \
//        --out test-output/app-seams-2-fix/blocks --timeout 300000 --script-timeout 600000
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await g(() => window.__game.renderFrame({ settle: 1 }));
  await page.screenshot({ path: `${out}/opening.png`, timeout: 300000 });
  const points = [[1100, 100], [900, 150], [700, 200], [1200, 300]];
  const hits = await g((pts) => {
    const game = window.__hud.game, scene = game.scene, cam = game.camera;
    scene.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    const V = cam.position.constructor;
    const w = window.innerWidth, h = window.innerHeight;
    const res = [];
    for (const [px, py] of pts) {
      const ndc = new V((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(cam);
      const o = cam.position.clone(), d = ndc.sub(o).normalize();
      const list = [];
      scene.traverse((obj) => {
        if (!obj.geometry || obj.visible === false) return;
        const geo = obj.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        const bb = geo.boundingBox.clone().applyMatrix4(obj.matrixWorld);
        let t0 = 0, t1 = Infinity;
        for (const a of ['x', 'y', 'z']) {
          const inv = 1 / (d[a] || 1e-9);
          let a0 = (bb.min[a] - o[a]) * inv, a1 = (bb.max[a] - o[a]) * inv;
          if (a0 > a1) [a0, a1] = [a1, a0];
          t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
        }
        if (t1 < t0) return;
        const size = bb.getSize(new V());
        const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
        const chain = []; for (let p = obj; p; p = p.parent) if (p.name) chain.push(p.name);
        list.push({ t: Math.round(t0), name: obj.name, chain: chain.slice(0, 3).join('<'), type: obj.type, mat: m?.type + ':' + (m?.name ?? ''), size: [size.x, size.y, size.z].map(Math.round) });
      });
      list.sort((a, b) => a.t - b.t);
      res.push({ at: [px, py], hits: list.slice(0, 12) });
    }
    return res;
  }, points);
  for (const r of hits) log('ray', JSON.stringify(r));
};
