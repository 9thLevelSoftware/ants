// app-seams-2 fix, item 12(b): which scene objects draw the pale far blocks in the suburban opening? Casts rays from the camera through a few
// screen points and lists every object whose bounding box the ray crosses (name, kind, material, distance), nearest last.
//   node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=low" --script tests/e2e/appSeams2-blocks.mjs \
//        --out test-output/app-seams-2-fix/blocks --timeout 300000 --script-timeout 600000
export default async ({ page, log, out }) => {
  // v3: also the instanced primitives (their size is the per-instance iSize attribute, not the unit geometry): oriented-box test per instance
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
      const test = (obj, bb, extra) => {
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
        list.push({ t: Math.round(t0), name: obj.name, chain: chain.slice(0, 3).join('<'), type: obj.type, mat: m?.type + ':' + (m?.name ?? ''), size: [size.x, size.y, size.z].map(Math.round), ...extra });
      };
      scene.traverse((obj) => {
        if (!obj.geometry || obj.visible === false) return;
        const geo = obj.geometry;
        if (!geo.boundingBox) geo.computeBoundingBox();
        if (obj.isInstancedMesh) {
          const sizeAttr = geo.attributes.iSize;
          if (!sizeAttr) return;
          const M = obj.matrixWorld.constructor, mi = new M(), inv = new M();
          for (let i = 0; i < obj.count; i++) {
            mi.fromArray(obj.instanceMatrix.array, i * 16).premultiply(obj.matrixWorld);
            const hx = sizeAttr.getX(i), hy = sizeAttr.getY(i), hz = sizeAttr.getZ(i);
            if (Math.max(hx, hy, hz) * 2 < 1500) continue;
            inv.copy(mi).invert();
            const lo = o.clone().applyMatrix4(inv), ld = d.clone().transformDirection(inv); // direction only rotated; fine for rigid + uniform scale
            let t0 = 0, t1 = Infinity;
            for (const [a, h] of [['x', hx], ['y', hy], ['z', hz]]) {
              const invd = 1 / (ld[a] || 1e-9);
              let a0 = (-h - lo[a]) * invd, a1 = (h - lo[a]) * invd;
              if (a0 > a1) [a0, a1] = [a1, a0];
              t0 = Math.max(t0, a0); t1 = Math.min(t1, a1);
            }
            if (t1 < t0) continue;
            const c = new V().setFromMatrixPosition(mi);
            const attrs = {};
            for (const k of Object.keys(geo.attributes)) { const at = geo.attributes[k]; if (at.isInstancedBufferAttribute && k !== 'iSize') attrs[k] = Array.from({ length: at.itemSize }, (_, j) => +at.array[i * at.itemSize + j].toFixed(2)); }
            list.push({ t: Math.round(t0), name: obj.name, inst: i, half: [hx, hy, hz].map(Math.round), centre: [c.x, c.y, c.z].map(Math.round), attrs, mat: (Array.isArray(obj.material) ? obj.material[0] : obj.material)?.name });
          }
          return;
        }
        test(obj, geo.boundingBox.clone().applyMatrix4(obj.matrixWorld), {});
      });
      list.sort((a, b) => a.t - b.t);
      res.push({ at: [px, py], hits: list.slice(0, 12) });
    }
    return res;
  }, points);
  for (const r of hits) log('ray', JSON.stringify(r));
  // the nearest triangle along each ray over every plain mesh of the scene (Moller-Trumbore): which mesh, where, which way it faces, its colour
  const tri = await g((pts) => {
    const game = window.__hud.game, cam = game.camera;
    game.scene.updateMatrixWorld(true);
    const V = cam.position.constructor;
    const meshes = [];
    game.scene.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && o.visible !== false && o.name !== 'world:sky' && o.geometry?.attributes?.position) meshes.push(o); });
    const w = window.innerWidth, h = window.innerHeight, out = [];
    const A = new V(), B = new V(), C = new V();
    for (const [px, py] of pts) {
      const o = cam.position.clone(), d = new V((px / w) * 2 - 1, -(py / h) * 2 + 1, 0.5).unproject(cam).sub(o).normalize();
      let best = null;
      for (const mesh of meshes) {
        const geo = mesh.geometry, pos = geo.attributes.position, idx = geo.index, col = geo.attributes.color;
        const n = idx ? idx.count / 3 : pos.count / 3;
        for (let t = 0; t < n; t++) {
          const i0 = idx ? idx.getX(t * 3) : t * 3, i1 = idx ? idx.getX(t * 3 + 1) : t * 3 + 1, i2 = idx ? idx.getX(t * 3 + 2) : t * 3 + 2;
          A.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld); B.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld); C.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
          const e1 = B.clone().sub(A), e2 = C.clone().sub(A), pv = d.clone().cross(e2), det = e1.dot(pv);
          if (Math.abs(det) < 1e-12) continue;
          const tv = o.clone().sub(A), u = tv.dot(pv) / det; if (u < 0 || u > 1) continue;
          const qv = tv.clone().cross(e1), v = d.dot(qv) / det; if (v < 0 || u + v > 1) continue;
          const dist = e2.dot(qv) / det; if (dist <= 0 || (best && dist >= best.dist)) continue;
          const nrm = e1.clone().cross(e2).normalize();
          best = { mesh: mesh.name || mesh.type, dist: Math.round(dist), hit: [o.x + d.x * dist, o.y + d.y * dist, o.z + d.z * dist].map(Math.round), normal: [nrm.x, nrm.y, nrm.z].map((x) => +x.toFixed(2)), color: col ? [col.getX(i0), col.getY(i0), col.getZ(i0)].map((x) => +x.toFixed(2)) : null };
        }
      }
      out.push({ at: [px, py], best });
    }
    return { meshes: meshes.map((m) => m.name || m.type), out };
  }, [[1100, 100], [900, 150], [700, 200], [800, 100], [1250, 60], [300, 150]]);
  log('tri', JSON.stringify(tri));
};
