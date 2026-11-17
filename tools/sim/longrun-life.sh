#!/bin/bash
# Year-two long runs (colony-life direction 6): life.ts from the default start through Winter 1 to day 15 of year 2
# (--until-day 34: start doy 9, winter at game day ~13, spring of year 2 at ~20, its day 15 at ~34), two at a time.
#   tools/sim/longrun-life.sh OUTDIR CACHEDIR "archetype:seed archetype:seed ..."
# Runs the code of the tree this script lives in (a frozen scratch copy runs its own code; give absolute paths).
# Restart-safe: a run whose JSON exists in OUTDIR is skipped. summary.txt: one line per run (exit code, start/end UTC).
# CACHE_ANY=1: start from the CACHEDIR/founded-...-d-any.bin hand-overs (handover-sweep.sh) whatever code founded them.
# UNTIL_DAY: simulated game days from the game start (default 34; with the R20 start, doy 5, 32 reaches year-2 doy 15).
cd "$(dirname "$0")/../.." || exit 1
out=$1; cache=$2; runs=$3; until=${UNTIL_DAY:-34}; any=${CACHE_ANY:+--cache-any}
mkdir -p "$out"
export out cache until any
for r in $runs; do echo "${r%%:*} ${r##*:}"; done |
  xargs -P 2 -L 1 bash -c '
    a=$0; s=$1
    if [ -f "$out/life-lasius-niger-$a-$s.json" ]; then exit 0; fi
    t0=$(date -u +%H:%M)
    node tools/sim/run-ts.mjs tools/sim/life.ts --seed $s --archetype $a --until-day $until --cache "$cache" $any --out "$out" > "$out/$a-$s.log" 2>&1
    echo "$a $s exit $? start $t0 end $(date -u +%H:%M)" >> "$out/summary.txt"'
echo "DONE $(date -u +%H:%M)" >> "$out/summary.txt"
