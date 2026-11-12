#!/usr/bin/env python3
"""archive.org audio search restricted to CC0 / public-domain licenseurl. usage: ia_search.py kw [kw...]"""
import json, sys, urllib.parse, urllib.request
for kw in sys.argv[1:]:
    q = '(%s) AND mediatype:audio AND (licenseurl:*zero* OR licenseurl:*publicdomain*)' % kw
    u = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode({"q": q, "fl[]": ["identifier", "title", "creator", "licenseurl", "downloads"], "rows": 12, "output": "json", "sort[]": "downloads desc"}, doseq=True)
    try:
        d = json.load(urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "AssetFetch/1.0"}), timeout=40))
    except Exception as e:
        print("##", kw, "ERR", e); continue
    print("##", kw, d["response"]["numFound"])
    for x in d["response"]["docs"]:
        print(" ", x["identifier"], "|", str(x.get("title"))[:70], "|", str(x.get("creator"))[:30], "|", x.get("licenseurl"))
