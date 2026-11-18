// app-seams-2 item 12 pictures, taken the same way before and after the render changes (LOOK_TAG=before|after):
//   LOOK_TAG=after node tools/harness/play.mjs --root . --query "test=1&seed=2&autostart=1&quality=high" --script tests/e2e/appSeams2-look.mjs \
//        --out test-output/app-seams-2/look-after --timeout 600000 --script-timeout 1500000
//  1. the founding queen by day, close (crop): cuticle look
//  2. the opening pose looking at the far walls (full frame): wall silhouettes
//  3. the possession camera in a crevice (a natural cavity): the cutaway's earth colour
// Staging: seed 2, the queen at her start, the camera zoomed with `camera.zoom`; the crevice by teleporting the queen into a world cavity.
export default async ({ page, log, out }) => {
  const g = (fn, arg) => page.evaluate(fn, arg);
  const shot = (name, clip) => page.screenshot({ path: `${out}/${name}.png`, timeout: 600000, ...(clip ? { clip } : {}) });
  const render = (s = 1) => g((x) => window.__game.renderFrame({ settle: x }), s);
  await g(() => window.__game.command({ type: 'openingSkipIntro' }));
  await g(() => window.__game.step(150));
  await g(() => window.__hud.game.setSettings({ gameplay: { minimap: 'never', focusLine: 'never' } }));
  await page.keyboard.press('KeyH'); // the HUD off

  // 2. far walls: the start pose, nothing moved
  await render(1);
  await shot('02-far-walls');

  // 1. the queen close: the camera zoomed in, the picture cropped round the queen's screen position
  await g(() => window.__game.camera.zoom(0.3));
  await render(1);
  const at = await g(() => { const gm = window.__game, p = gm.summary().possessed; return gm.views.project({ x: p.pos[0], y: p.pos[1], z: p.pos[2] }); });
  const cx = Math.round(at?.x ?? 640), cy = Math.round(at?.y ?? 560);
  const clip = { x: Math.max(0, Math.min(1280 - 520, cx - 260)), y: Math.max(0, Math.min(720 - 340, cy - 190)), width: 520, height: 340 };
  log('queen at', cx, cy, JSON.stringify(clip));
  await shot('01-queen-close', clip);
  await g(() => window.__game.camera.zoom(1 / 0.3));

  // 3. crevice: teleport into a cavity until the camera says so
  const cav = await g(() => window.__hud.game.session.sim.world.cavities.slice(0, 8).map((c) => ({ id: c.id, kind: c.kind, p: c.min && c.max ? { x: (c.min.x + c.max.x) / 2, y: (c.min.y + c.max.y) / 2, z: (c.min.z + c.max.z) / 2 } : null })));
  log('cavities', JSON.stringify(cav));
  let state = null;
  for (const c of cav) {
    if (!c.p) continue;
    await g((p) => window.__game.teleport('possessed', p), c.p);
    await g(() => window.__game.step(3));
    await render(1);
    state = await g(() => window.__game.camera.state());
    log('cavity', c.id, c.kind, state);
    if (state === 'crevice') break;
  }
  await shot('03-crevice');
  await g(() => window.__game.camera.orbit(0, 45)); // the camera over the ground, looking down through the cutaway
  await render(1);
  await shot('04-crevice-from-above');
  return { state, cav: cav.length };
};
