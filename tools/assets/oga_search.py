#!/usr/bin/env python3
"""OpenGameArt CC0 search: prints slug | title for each keyword. usage: oga_search.py arttype kw [kw...] (arttype 13=sfx,12=music)"""
import re, sys, urllib.request, urllib.parse
t = sys.argv[1]
for kw in sys.argv[2:]:
    u = ("https://opengameart.org/art-search-advanced?keys=%s&field_art_type_tid%%5B%%5D=%s&field_art_licenses_tid%%5B%%5D=4&sort_by=count&sort_order=DESC"
         % (urllib.parse.quote(kw), t))
    try:
        h = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "AssetFetch/1.0"}), timeout=40).read().decode("utf8", "replace")
    except Exception as e:
        print("##", kw, "ERR", e); continue
    print("##", kw)
    seen = set()
    for m in re.finditer(r'<span class="art-preview-title"><a href="(/content/[^"]+)">([^<]+)</a>', h):
        if m.group(1) in seen: continue
        seen.add(m.group(1)); print(m.group(1), "|", m.group(2))
