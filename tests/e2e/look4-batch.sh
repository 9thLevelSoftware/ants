#!/bin/bash
# look-pass-4: run look4-pose.mjs over archetypes x qualities, one browser at a time.
#   ARCHS="a b" QUALS="high medium" SHOTS=opening OUT=test-output/look4/<dir> SEED=3 bash tests/e2e/look4-batch.sh
cd "$(dirname "$0")/../.."
for q in ${QUALS:-high medium}; do for a in ${ARCHS:-suburban-garden woodland-edge playground-park car-park-verge kitchen-door}; do
  SHOTS=${SHOTS:-opening} node tools/harness/play.mjs --root . --query "test=1&seed=${SEED:-3}&autostart=1&quality=$q&archetype=$a" --script tests/e2e/look4-pose.mjs \
    --out "$OUT/$a-$q" --timeout 600000 --script-timeout 900000 > "$OUT/$a-$q.log" 2>&1
done; done
echo done > "$OUT/batch.done"
