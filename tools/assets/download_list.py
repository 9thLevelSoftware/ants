#!/usr/bin/env python3
"""Download files listed in a TSV (dest_relpath<TAB>url) under a root dir. Data only; nothing is executed.
usage: download_list.py ROOT list.tsv"""
import os, subprocess, sys
root, lst = sys.argv[1], sys.argv[2]
for line in open(lst):
    line = line.rstrip("\n")
    if not line or line.startswith("#"): continue
    dest, url = line.split("\t")
    p = os.path.join(root, dest)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    if os.path.exists(p) and os.path.getsize(p) > 0: continue
    r = subprocess.run(["curl", "-sSL", "--fail", "-m", "300", "-A", "AssetFetch/1.0", "-o", p, url])
    print("ok " if r.returncode == 0 else "FAIL", dest, os.path.getsize(p) if os.path.exists(p) else 0)
    if r.returncode != 0 and os.path.exists(p): os.remove(p)
