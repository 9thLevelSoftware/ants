#!/usr/bin/env python3
"""Print title, author, licence line(s) and file URLs for OpenGameArt content slugs. usage: oga_page.py slug [slug...]"""
import re, sys, html, urllib.request
for s in sys.argv[1:]:
    u = "https://opengameart.org/content/" + s.replace("/content/", "")
    try:
        h = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "AssetFetch/1.0"}), timeout=40).read().decode("utf8", "replace")
    except Exception as e:
        print("##", s, "ERR", e); continue
    t = re.search(r'<title>([^<]*)</title>', h)
    auth = re.findall(r"username'><a href=\"/users/[^\"]+\">([^<]+)</a>", h)
    lic = re.findall(r'creativecommons\.org/(?:publicdomain/zero/1\.0|licenses/[^"/]+/[^"/]+|publicdomain/mark/1\.0)[^"]*', h)
    licn = re.findall(r"license-name'>([^<]*)<", h)
    files = re.findall(r'href="(https://opengameart\.org/sites/default/files/[^"]+)"', h)
    files = [f for f in dict.fromkeys(files) if "styles/" not in f and "audio_preview" not in f]
    print("##", u); print("  title:", html.unescape(t.group(1) if t else "?")); print("  author:", sorted(set(auth))[:3]); print("  licence:", sorted(set(licn)))
    for f in files[:25]: print("  ", f)
    if len(files) > 25: print("   ... +", len(files) - 25)
