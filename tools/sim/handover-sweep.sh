#!/bin/bash
# The 15 hand-over snapshots for the benches (colony-life round 4, after ruling R20 moved the default start day):
# a fresh founding per run at the default start, cached as CACHEDIR/founded-...-d-any.bin (what bench-colony.ts
# reads), then one game day of colony life. Two at a time (PAR=1 for one).
#   tools/sim/handover-sweep.sh CACHEDIR LOGDIR [RUNS]     RUNS e.g. "woodland-edge:1 kitchen-door:3" (default all 15)
# Restart-safe: a run whose snapshot exists is skipped. Runs the tree this script lives in.
cd "$(dirname "$0")/../.." || exit 1
cache=$1; logs=$2; runs=$3
mkdir -p "$cache" "$logs"
export cache logs
if [ -z "$runs" ]; then for s in 1 2 3; do for a in woodland-edge suburban-garden playground-park car-park-verge kitchen-door; do runs="$runs $a:$s"; done; done; fi
for r in $runs; do echo "${r%%:*} ${r##*:}"; done |
  xargs -P "${PAR:-2}" -L 1 bash -c '
    a=$0; s=$1
    [ -f "$cache/founded-lasius-niger-$a-$s-naturalist-d-any.bin" ] && exit 0
    t0=$(date -u +%H:%M)
    node tools/sim/run-ts.mjs tools/sim/life.ts --seed $s --archetype $a --days 1 --cache "$cache" --cache-any --out "$logs" > "$logs/$a-$s.log" 2>&1
    echo "$a $s exit $? start $t0 end $(date -u +%H:%M)" >> "$logs/summary.txt"'
echo "DONE $(date -u +%H:%M)" >> "$logs/summary.txt"
