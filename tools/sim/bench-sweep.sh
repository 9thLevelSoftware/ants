#!/bin/bash
# Colony benches over the 15 hand-over snapshots (colony-life round 3), two at a time (xargs -P 2).
#   tools/sim/bench-sweep.sh MODE OUTDIR [CACHEDIR] [RUNS]   MODE nest|forage; RUNS e.g. "woodland-edge:1 kitchen-door:3"
#                                                            (default all 15)
# Restart-safe: a run whose JSON exists in OUTDIR is skipped. summary.txt: one line per run (exit code, start/end UTC,
# hash of src/sim + src/worldgen + src/core at the run's start).
cd "$(dirname "$0")/../.." || exit 1  # the tree this script lives in (a frozen scratch copy runs its own code)
mode=$1; out=$2; cache=${3:-test-output/colony-life/round-3/cache}; runs=$4
mkdir -p "$out"
export mode out cache
if [ -z "$runs" ]; then for s in 1 2 3; do for a in woodland-edge suburban-garden playground-park car-park-verge kitchen-door; do runs="$runs $a:$s"; done; done; fi
for r in $runs; do echo "${r%%:*} ${r##*:}"; done |
  xargs -P 2 -L 1 bash -c '
    a=$0; s=$1
    if [ -f "$out/bench-$mode-$a-$s.json" ]; then exit 0; fi
    tree=$(find src/sim src/worldgen src/core -type f -name "*.ts" ! -name "*.test.ts" | sort | xargs cat | md5sum | cut -c1-8)
    t0=$(date -u +%H:%M)
    node tools/sim/run-ts.mjs tools/sim/bench-colony.ts --mode $mode --archetype $a --seed $s --cache "$cache" --out "$out" > "$out/$a-$s.log" 2>&1
    echo "$a $s exit $? start $t0 end $(date -u +%H:%M) tree $tree" >> "$out/summary.txt"'
echo "DONE $(date -u +%H:%M)" >> "$out/summary.txt"
