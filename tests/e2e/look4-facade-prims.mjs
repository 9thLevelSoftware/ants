// Probe: every primitive of the house facade object (material, box extents), to see what overlaps at the wall foot.
export default async ({ page, log }) => {
  const info = await page.evaluate(() => {
    const w = window.__hud.game.session.sim.world;
    const o = w.objects.find((x) => x.tags.includes('facade'));
    return w.prims.slice(o.primStart, o.primStart + o.primCount).map((p) => `${p.material} x${p.pos.x.toFixed(0)}±${p.size.x.toFixed(0)} y${(p.pos.y - p.size.y).toFixed(0)}..${(p.pos.y + p.size.y).toFixed(0)} z${(p.pos.z - p.size.z).toFixed(0)}..${(p.pos.z + p.size.z).toFixed(0)}`);
  });
  for (const l of info) log(l);
  return info.length;
};
