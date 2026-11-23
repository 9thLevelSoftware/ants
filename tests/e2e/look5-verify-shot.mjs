// look-pass-5 REVIEW: the founding chamber shot on a REAL (hand-dug, no cheat) founding. Runs firstplay.mjs up to beat 11 (the
// time-lapse), then measures where the cut plane sits against the open space above the queen and renders the frame as the game shows it
// and with the plane put through the open space at the queen (what an app-side fix could show); then skips to the outcome card.
//   FIRSTPLAY_SEED=00000001 FIRSTPLAY_UNTIL=11 node tools/harness/play.mjs --root . --query "test=1&quality=test" \
//        --script tests/e2e/look5-verify-shot.mjs --out test-output/look5-review/shot-s1 --script-timeout 3000000
import firstplay from './firstplay.mjs';

export default async (ctx) => {
  const { page, log, out } = ctx;
  const g = (fn, arg) => page.evaluate(fn, arg);
  const pic = async (name) => { await g(() => window.__game.renderFrame({ settle: 1 })); await page.screenshot({ path: `${out}/${name}.png`, timeout: 600000 }); };
  const result = await firstplay(ctx);
  const probe = () => g(() => {
    const s = window.__hud.game.session, sim = s.sim, col = sim.state.player.colonyId;
    const subj = s.views.shotSource ? s.views.shotSource() : null;
    const q = sim.stores.ants.get(sim.stores.colonies.get(col).queenId);
    if (!subj || !q) return { subj, queen: q?.pos ?? null, phase: sim.state.player.opening?.phase };
    const f = (x, y, z) => sim.field.sampleXYZ(x, y, z);
    // open space straight above the queen: field > 0 is free (design seed). First solid height above her reference point.
    let ceil = null;
    for (let y = q.pos.y; y <= q.pos.y + 30; y += 0.1) if (f(q.pos.x, y, q.pos.z) <= 0) { ceil = y; break; }
    const brood = sim.state.brood.filter((b) => b.alive && b.colony === col && b.carriedBy < 0);
    const buried = brood.filter((b) => f(b.pos.x, subj.cutY, b.pos.z) <= 0).length;
    return {
      phase: sim.state.player.opening?.phase, bu: sim.world.bu, subj: JSON.parse(JSON.stringify(subj)), queen: { ...q.pos },
      fieldAtQueen: f(q.pos.x, q.pos.y, q.pos.z), fieldAtCutAboveQueen: f(q.pos.x, subj.cutY, q.pos.z), ceilingAboveQueenMm: ceil === null ? null : ceil - q.pos.y,
      cutAboveQueenMm: subj.cutY - q.pos.y, brood: brood.length, broodUnderSoilAtCut: buried,
      pose: JSON.parse(JSON.stringify(s.views.pose)),
    };
  });
  const atLapse = await probe();
  log('REVIEW at lapse', JSON.stringify(atLapse));
  await pic('r11-lapse-as-shipped');
  if (atLapse.ceilingAboveQueenMm !== null && atLapse.subj) {
    // the same shot with the plane through the open space over the queen (half way to the soil above her)
    await g((y) => { const v = window.__hud.game.session.views; const src = v.shotSource; v.setFoundingShot(() => ({ ...src(), cutY: y })); }, atLapse.queen.y + atLapse.ceilingAboveQueenMm / 2);
    await g(() => window.__game.renderFrame({ settle: 3 }));
    await pic('r11-lapse-cut-through-open-space');
  }
  return { firstplay: result.beats, atLapse };
};
