// Smoke test for tools/sim/run-ts.mjs: imports src/core through the @/ alias and prints a few values.
//   node tools/sim/run-ts.mjs tools/sim/hello-core.ts [seed]

import { FOUNDRESS_VERSION, decode, encode, fbm2, rngInt, rngSeed, v3Length, vec3 } from '@/core';

export default function main(args: string[]): void {
  const seed = Number(args[0] ?? 1);
  const rng = rngSeed(seed);
  const rolls = [rngInt(rng, 1, 6), rngInt(rng, 1, 6), rngInt(rng, 1, 6)];
  const roundTrip = decode(encode({ grid: new Float32Array([1.5, -2]) })) as { grid: Float32Array };
  console.log(
    JSON.stringify({
      version: FOUNDRESS_VERSION,
      seed,
      rolls,
      fbm: Number(fbm2(0.5, 0.25, seed).toFixed(6)),
      len: v3Length(vec3(3, 4, 12)),
      typedArrayRoundTrip: roundTrip.grid instanceof Float32Array && roundTrip.grid[1] === -2,
    }),
  );
}
