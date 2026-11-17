#!/bin/bash
# Start-day nest benches (colony-life round 3, integrator direction 3): fresh foundings at default-year start days
# (--start-doy), then the nest bench (food guaranteed) from each hand-over to winter. One run at a time.
#   tools/sim/bench-startday.sh OUTDIR "7 5" "woodland-edge:1 woodland-edge:3"
# Restart-safe: a founding whose snapshot exists, or a bench whose JSON exists, is skipped.
cd "$(dirname "$0")/../.." || exit 1
out=$1; doys=$2; runs=$3
mkdir -p "$out/cache"
for d in $doys; do for r in $runs; do
  a=${r%%:*}; s=${r##*:}
  snap=$(ls "$out"/cache/founded-lasius-niger-$a-$s-naturalist-doy$d-*.bin 2>/dev/null | head -1)
  if [ -z "$snap" ]; then
    node tools/sim/run-ts.mjs tools/sim/life.ts --seed $s --archetype $a --start-doy $d --days 1 --cache "$out/cache" --out "$out/founding" > "$out/founding-$a-$s-doy$d.log" 2>&1
    snap=$(ls "$out"/cache/founded-lasius-niger-$a-$s-naturalist-doy$d-*.bin 2>/dev/null | head -1)
  fi
  [ -z "$snap" ] && { echo "$a $s doy$d no hand-over" >> "$out/summary.txt"; continue; }
  [ -f "$out/bench-nest-$a-$s-doy$d.json" ] && continue
  node tools/sim/run-ts.mjs tools/sim/bench-colony.ts --mode nest --archetype $a --seed $s --snapshot "$snap" --tag "-doy$d" --out "$out" > "$out/$a-$s-doy$d.log" 2>&1
  echo "$a $s doy$d exit $? end $(date -u +%H:%M)" >> "$out/summary.txt"
done; done
echo "DONE $(date -u +%H:%M)" >> "$out/summary.txt"
