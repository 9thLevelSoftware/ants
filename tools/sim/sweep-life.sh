#!/bin/bash
# Independent 15-run sweep (colony-life bars): life.ts --until winter, seeds 1-3 x the five Tier 1 archetypes,
# Naturalist, default start, flooding on, no player; two runs at a time (xargs -P 2).
#   tools/sim/sweep-life.sh OUTDIR [CACHEDIR]
# Restart-safe: a run whose JSON already exists in OUTDIR is skipped (delete it to re-run).
# summary.txt gets one line per run: archetype, seed, exit code, start/end UTC, a hash of src/sim + src/worldgen +
# src/core at the run's start (other engineers edit src/sim during a sweep; runs with different hashes ran on
# different trees), and the viable verdict.
cd /home/user/foundress || exit 1
out=$1
cache=${2:-test-output/viab/cache}
mkdir -p "$out"
export out cache
for s in 1 2 3; do for a in woodland-edge suburban-garden playground-park car-park-verge kitchen-door; do echo "$a $s"; done; done |
  xargs -P 2 -L 1 bash -c '
    a=$0; s=$1
    if [ -f "$out/life-lasius-niger-$a-$s.json" ]; then echo "$a $s skipped (done)" >> "$out/summary.txt"; exit 0; fi
    tree=$(find src/sim src/worldgen src/core -type f -name "*.ts" | sort | xargs cat | md5sum | cut -c1-8)
    t0=$(date -u +%H:%M)
    node tools/sim/run-ts.mjs tools/sim/life.ts --seed $s --archetype $a --until winter --cache "$cache" --out "$out" > "$out/$a-$s.log" 2>&1
    rc=$?
    echo "$a $s exit $rc start $t0 end $(date -u +%H:%M) tree $tree $(grep -o "Viable: \*\*[A-Za-z]*" "$out/life-lasius-niger-$a-$s.md" 2>/dev/null)" >> "$out/summary.txt"'
echo "DONE $(date -u +%H:%M)" >> "$out/summary.txt"
