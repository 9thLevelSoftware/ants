#!/bin/bash
# usage: fetch_ambientcg.sh OUTDIR ID [ID...]  -> downloads <ID>_1K-JPG.zip, extracts only image files (data only)
out="$1"; shift
for id in "$@"; do
  d="$out/$id"; mkdir -p "$d"
  [ -f "$d/$id.zip" ] || curl -sSL -m 120 -o "$d/$id.zip" "https://ambientcg.com/get?file=${id}_1K-JPG.zip"
  unzip -o -q -j "$d/$id.zip" '*.jpg' '*.png' -d "$d" 2>&1 | head -3
  curl -sS -m 40 "https://ambientcg.com/api/v2/full_json?id=$id" -o "$d/info.json"
  ls "$d"
done
