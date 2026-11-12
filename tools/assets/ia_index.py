#!/usr/bin/env python3
"""Dump original audio file names/sizes/lengths of archive.org items to one TSV. usage: ia_index.py OUT.tsv id [id...]"""
import json, sys, urllib.request
out = open(sys.argv[1], "w")
for ident in sys.argv[2:]:
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request("https://archive.org/metadata/" + ident, headers={"User-Agent": "AssetFetch/1.0"}), timeout=90))
    except Exception as e:
        print("ERR", ident, e, file=sys.stderr); continue
    lic = d.get("metadata", {}).get("licenseurl")
    for f in d.get("files", []):
        n = f["name"]
        if f.get("source") == "original" and n.lower().rsplit(".", 1)[-1] in ("wav", "mp3", "flac", "ogg", "aif", "aiff", "m4a"):
            out.write("\t".join([ident, n, str(f.get("size")), str(f.get("length", "")), str(lic)]) + "\n")
