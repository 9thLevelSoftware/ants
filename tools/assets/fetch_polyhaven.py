#!/usr/bin/env python3
"""Download Poly Haven (CC0) 1k diffuse/normal(GL)/roughness JPGs + info JSON.
usage: fetch_polyhaven.py OUTDIR id [id ...]   (does not execute anything it downloads)"""
import json, os, subprocess, sys, urllib.request
out = sys.argv[1]
def get(u):
    req = urllib.request.Request(u, headers={"User-Agent": "asset-fetch/1.0"})
    return urllib.request.urlopen(req, timeout=60).read()
for aid in sys.argv[2:]:
    d = os.path.join(out, aid); os.makedirs(d, exist_ok=True)
    try:
        info = json.loads(get(f"https://api.polyhaven.com/info/{aid}"))
        files = json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
    except Exception as e:
        print("FAIL meta", aid, e); continue
    json.dump(info, open(os.path.join(d, "info.json"), "w"), indent=1)
    for key, name in (("Diffuse", "diff"), ("nor_gl", "nor"), ("Rough", "rough")):
        try:
            ent = files[key]["1k"]["jpg"]
        except KeyError:
            print("missing", aid, key); continue
        dst = os.path.join(d, f"{name}.jpg")
        if not os.path.exists(dst):
            open(dst, "wb").write(get(ent["url"]))
        print("ok", aid, key, ent["url"])
