#!/usr/bin/env python3
"""List files of archive.org items with licence. usage: ia_meta.py id [id...] [--grep substr]"""
import json, sys, urllib.request
args = [a for a in sys.argv[1:]]
g = None
if "--grep" in args:
    i = args.index("--grep"); g = args[i+1].lower(); args = args[:i]
for ident in args:
    d = json.load(urllib.request.urlopen(urllib.request.Request("https://archive.org/metadata/" + ident, headers={"User-Agent": "AssetFetch/1.0"}), timeout=60))
    m = d.get("metadata", {})
    print("##", ident, "|", m.get("title"), "|", m.get("creator"), "|", m.get("licenseurl"), "| files:", len(d.get("files", [])), "| size", d.get("item_size"))
    print("   desc:", str(m.get("description"))[:300].replace("\n", " "))
    for f in d.get("files", []):
        n = f["name"]
        if f.get("source") == "original" and n.lower().rsplit(".", 1)[-1] in ("wav", "mp3", "flac", "ogg", "aif", "aiff", "m4a", "zip"):
            if g is None or g in n.lower():
                print("   ", n, f.get("size"), f.get("length", ""))
