// app-seams-4 item 3: ants between the camera and the possessed ant fade out (alpha) and are not drawn; the others stay solid.
// Stages the possessed worker in the entrance tunnel (look2-stage), puts workers on the line from the camera to her (near the camera, near half-way,
// near her), and takes a picture sequence of the fade: frame 0 (they have just appeared), 3, 8 and 40 frames on. APP4_FADE=0 switches the rule off
// (the control: all of them solid). Quality tier from the page's ?quality.
//   node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=medium" --script tests/e2e/app4-fade.mjs --out test-output/app4/fade
import { stage } from './lib/look2-stage.mjs';

export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const tag = process.env.APP4_TAG ?? 'f';
  const S = await stage(page, log, { seed: Number(process.env.APP4_SEED ?? 1) });
  if (process.env.APP4_FADE === '0') await g(async () => { const t = await import('/src/render/ants/tuning.ts'); t.OCCLUDER.nearFraction = -9; });
  await g(() => window.__game.cheat.setTime(8 * 6000 + 3000));
  const where = process.env.APP4_WHERE ?? 'tunnel';
  if (where === 'crowd') await S.crowdWorker(); else await S.tunnelWorker();
  await g(() => window.__game.step(6));
  await S.render(1);
  // camera and subject
  const geo = await g(() => {
    const gm = window.__game, bu = gm.query.world().bu, p = gm.summary().possessed, cam = gm.views.possession().pos;
    return { bu, subj: { x: p.pos[0], y: p.pos[1], z: p.pos[2] }, cam: { x: cam.x ?? cam[0], y: cam.y ?? cam[1], z: cam.z ?? cam[2] } };
  });
  log('geometry', JSON.stringify(geo));
  // workers on the line camera -> subject, at the cavity point nearest each wanted fraction
  const put = await g(({ geo, fr }) => {
    const gm = window.__game, bu = geo.bu, out = [];
    const f = (x, y, z) => { const v = gm.query.field(x, y, z); return typeof v === 'number' ? v : v.f; };
    for (const t of fr) {
      const p = { x: geo.cam.x + (geo.subj.x - geo.cam.x) * t, y: geo.cam.y + (geo.subj.y - geo.cam.y) * t, z: geo.cam.z + (geo.subj.z - geo.cam.z) * t };
      let best = null, bd = Infinity;
      for (let dx = -1.5; dx <= 1.5; dx += 0.25) for (let dy = -1.5; dy <= 1.5; dy += 0.25) for (let dz = -1.5; dz <= 1.5; dz += 0.25) {
        const q = { x: p.x + dx * bu, y: p.y + dy * bu, z: p.z + dz * bu }, v = f(q.x, q.y, q.z), d = dx * dx + dy * dy + dz * dz;
        if (v > 0.15 * bu && d < bd) { bd = d; best = q; }
      }
      if (best) { const who = gm.query.ants().find((a) => a.caste === 'worker' && a.id !== gm.summary().possessed.id && !out.some((o) => o.id === a.id)); if (who) { gm.teleport(who.id, best); out.push({ t, id: who.id, pos: best }); } }
    }
    gm.step(1); // one tick only: the workers must still be where they were put (they walk off in a second or two)
    const near = out.map((o) => { const a = gm.query.ant(o.id); return { id: o.id, want: [o.pos.x, o.pos.y, o.pos.z].map((v) => Math.round(v * 100) / 100), got: [a.pos.x, a.pos.y, a.pos.z].map((v) => Math.round(v * 100) / 100) }; });
    return { out, near };
  }, { geo, fr: [0.1, 0.22, 0.38, 0.7] });
  log('workers placed', JSON.stringify(put.out), 'near the camera', JSON.stringify(put.near));
  const pic = async (name, frames) => {
    for (let i = 0; i < frames; i++) await g(() => window.__game.renderFrame({ dt: 0.033, settle: 0 }));
    const h = await page.addStyleTag({ content: '#ui, #ui *{visibility:hidden !important}' });
    const st = await S.statsNow();
    await page.screenshot({ path: `${out}/${tag}-${where}-${name}.png`, timeout: 300000 });
    await h.evaluate((el) => el.remove());
    log('shot', name, JSON.stringify({ calls: st.drawCalls, tris: st.triangles, ants: st.ants ? { faded: st.ants.faded, hidden: st.ants.hiddenAnts, on: st.ants.fadeOn, maxW: st.ants.fadeMaxWeight, cam: [st.ants.fadeCx, st.ants.fadeCy, st.ants.fadeCz], subj: [st.ants.fadeSx, st.ants.fadeSy, st.ants.fadeSz], L: st.ants.fadeL } : null }));
  };
  await pic('0', 1);
  await pic('3', 3);
  await pic('8', 5);
  await pic('40', 32);
  return { placed: put.out.length };
};
