#!/usr/bin/env python3
"""Year-two table of long runs (colony-life direction 8): life.ts JSONs that went through Winter 1.

    python3 tools/sim/longrun-table.py DIR > DIR/longrun-table.md

Per run: first workers, workers at the last row of year 1 (Winter 1 start), at the first row of year 2 (spring),
the R22 checks (spring >= 0.7 x winter; year-2 doy 15 >= 2 x first workers), the stores across the winter, the first
year-2 egg (day of year, from the day rows' eggs laid), year-2 eclosions, and per spring day the royal chamber, the
queen's chamber and the warmest dry chamber temperature (C) with the laying potential.
Reads only the day rows (`days[].state`, `days[].events`); rows before the round-4 metrics have no temperatures.
"""
import glob
import json
import os
import sys


def rows(d):
    return [r['state'] | {'events': r['events']} for r in d['days']]


def fmt(v, nd=1):
    if v is None:
        return '-'
    if isinstance(v, float):
        return f'{v:.{nd}f}'
    return str(v)


def main(folder):
    out = ['| run | first workers | winter 1 (workers, C, P) | spring d1 (workers, C, P) | spring >= 0.7 x winter | first y2 egg (doy) | y2 eggs / eclosed | workers y2 doy 15 | >= 2 x first | deaths after winter |',
           '|---|---|---|---|---|---|---|---|---|---|']
    detail = []
    for f in sorted(glob.glob(os.path.join(folder, 'life-*.json'))):
        d = json.load(open(f))
        rs = rows(d)
        name = os.path.basename(f)[len('life-lasius-niger-'):-5]
        first = d['founding']['workers']
        y1 = [r for r in rs if r.get('year', 1) == 1]
        y2 = [r for r in rs if r.get('year', 1) == 2]
        win = next((r for r in y1 if r['season'] == 'winter'), y1[-1] if y1 else None)
        spr = y2[0] if y2 else None
        eggs_y2 = [r for r in y2 if r['events'].get('eggsLaid', 0) > 0]
        first_egg = eggs_y2[0].get('doy') if eggs_y2 else None
        laid = sum(r['events'].get('eggsLaid', 0) for r in y2)
        ecl = sum(r['events'].get('eclosions', 0) for r in y2)
        d15 = next((r for r in y2 if r.get('doy', 0) >= 15), y2[-1] if y2 else None)
        deaths = {}
        for r in y2:
            for k, n in r['events'].get('deathsByCause', {}).items():
                deaths[k] = deaths.get(k, 0) + n
        ok_spring = spr is not None and win is not None and spr['workers'] >= 0.7 * win['workers']
        ok_d15 = d15 is not None and d15.get('doy', 0) >= 15 and d15['workers'] >= 2 * first
        out.append('| {} | {} | {} | {} | {} | {} | {} | {} | {} | {} |'.format(
            name, first,
            f"{win['workers']}, {fmt(win['storesC'])}, {fmt(win['storesP'])}" if win else '-',
            f"{spr['workers']}, {fmt(spr['storesC'])}, {fmt(spr['storesP'])}" if spr else '-',
            'yes' if ok_spring else 'no', fmt(first_egg), f'{laid} / {ecl}',
            f"{d15['workers']} (doy {d15.get('doy')})" if d15 else '-', 'yes' if ok_d15 else 'no',
            ', '.join(f'{k} {n}' for k, n in sorted(deaths.items())) or '-'))
        detail.append(f'\n### {name}: spring of year 2, by day\n')
        detail.append('| doy | workers | eggs laid | lay potential | royal C | queen chamber C | warmest dry C (type, depth BU) | stores C / P |')
        detail.append('|---|---|---|---|---|---|---|---|')
        for r in y2:
            if r['season'] != 'spring':
                continue
            wd = r.get('warmestDry')
            detail.append('| {} | {} | {} | {} | {} | {} | {} | {} / {} |'.format(
                r.get('doy'), r['workers'], r['events'].get('eggsLaid', 0), fmt(r.get('layPotential')),
                fmt(r.get('royalTempC')), fmt(r.get('queenChamberTempC')),
                f"{fmt(wd['tempC'])} ({wd['type']}, {fmt(wd['depthBu'])})" if wd else '-',
                fmt(r['storesC']), fmt(r['storesP'])))
    print('\n'.join(out + detail))


if __name__ == '__main__':
    main(sys.argv[1])
