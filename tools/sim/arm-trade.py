#!/usr/bin/env python3
"""winter-sugar item 6's trade check: what a rule's sugar costs in protein and laying, year two of long runs.

    python3 tools/sim/arm-trade.py LONGDIR [LONGDIR ...]

Per DIR, summed over its runs, year two (doy 1 to the second winter): eggs laid, eclosions, brood deaths, larvae
starved, protein delivered (report.protein days of year two), and the laying gates' summer (doy 5-15) picture: eggs,
summed potential, days with potential > 10 and at most one egg, and the summed gate shares (which gate held it).
"""
import glob
import json
import os
import sys


def main(dirs):
    print('| runs | y2 eggs | y2 eclosions | y2 brood deaths | y2 larvae starved | y2 P delivered | summer eggs / potential | summer days pot > 10, <= 1 egg | p-days gate share (summer) |')
    print('|---|---|---|---|---|---|---|---|---|')
    for d in dirs:
        eggs = ecl = deaths = starved = 0
        pdel = 0.0
        seggs = spot = sdays = 0
        pgate = 0.0
        for f in sorted(glob.glob(os.path.join(d, 'life-*.json'))):
            a = json.load(open(f))
            y2days = [x for x in a['days'] if x['state'].get('year') == 2]
            first = y2days[0]['state']['day'] if y2days else 10 ** 9
            for x in y2days:
                e = x['events']
                eggs += e.get('eggsLaid', 0)
                ecl += e.get('eclosions', 0)
                bd = e.get('broodDeathsByCause', {})
                deaths += sum(bd.values())
                starved += bd.get('larva:starvation', 0)
            pdel += sum(x['deliveredP'] for x in a['protein']['days'] if x['day'] >= first)
            for g in a.get('layingGates', []):
                if g['day'] >= first and 5 <= g['doy'] <= 15:
                    seggs += g['eggs']
                    spot += g['potential']
                    sdays += 1 if g['potential'] > 10 and g['eggs'] <= 1 else 0
                    pgate += g['gates'].get('p-days', 0)
        print(f'| {d} | {eggs} | {ecl} | {deaths} | {starved} | {pdel:.1f} | {seggs} / {spot:.0f} | {sdays} | {pgate:.1f} |')


if __name__ == '__main__':
    main(sys.argv[1:])
