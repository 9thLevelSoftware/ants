#!/bin/bash
# look-pass-4: cost of the opening pose per quality tier. TAG=before|after OUT=test-output/look4/cost
cd "$(dirname "$0")/../.."
for q in ${QUALS:-test low medium high}; do
  node tools/harness/play.mjs --root . --query "test=1&seed=1&autostart=1&quality=$q" --script tests/e2e/look4-cost.mjs \
    --out "$OUT/$TAG-$q" --timeout 600000 --script-timeout 900000 > "$OUT/$TAG-$q.log" 2>&1
done
echo done > "$OUT/$TAG.done"
