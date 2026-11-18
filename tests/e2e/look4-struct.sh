#!/bin/bash
# look-pass-4 item 2: structure shots over the archetypes. TAG=before|after QUAL=medium OUT=test-output/look4/item2
cd "$(dirname "$0")/../.."
for a in ${ARCHS:-suburban-garden woodland-edge playground-park car-park-verge kitchen-door}; do
  node tools/harness/play.mjs --root . --query "test=1&seed=3&autostart=1&quality=${QUAL:-medium}&archetype=$a" --script tests/e2e/look4-struct.mjs \
    --out "$OUT/$TAG-$a-${QUAL:-medium}" --timeout 600000 --script-timeout 1200000 > "$OUT/$TAG-$a-${QUAL:-medium}.log" 2>&1
done
echo done > "$OUT/$TAG-${QUAL:-medium}.done"
