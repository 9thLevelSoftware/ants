#!/usr/bin/env python3
"""winter-sugar item 4: one row per colony and year from life.ts JSONs with `report.sugar` (tools/sim/lifeSugar.ts).

    python3 tools/sim/sugar-table.py DIR [DIR ...] > table.md

DIRs hold to-winter runs (year one only) and long runs (to the second winter); a colony found in several DIRs is
taken from the first DIR that has it. Columns per colony and year:
  first tender   year 1: ticks from the first open entrance after the hand-over to the first tender (allocation
                 actual), and to the first tender outside; year 2: the first spring day with tender worker-time
  tend gd        tender worker-days in the year (to its winter), and tend's share of tend + forage worker-days
  herds          workable herds at the year's mid-summer day (doy 11) / known herds then
  C in           carbohydrate delivered in the year by source class (herd honeydew, honeydew film, nectar, crumb,
                 sugar, other = with protein loads, unknown), loads
  C out          carbohydrate spent from the pool in the year (workers, queen, larvae, spoiled, rations), loads
  needC>0 days   summer and autumn days of the year whose mean needC was > 0.05 (demand asking for sugar)
  winter         C in store / R27 need at the winter's first row (year 1: the last row before the lapse) and the
                 ratio; workers then
"""
import glob
import json
import os
import sys

CLASSES = ['honeydew-herd', 'honeydew-film', 'nectar', 'crumb', 'sugar', 'fruit', 'other', 'unknown', 'honeydew-unknown']
SHORT = {'honeydew-herd': 'herd', 'honeydew-film': 'film', 'nectar': 'nect', 'crumb': 'crumb', 'sugar': 'sugar',
         'fruit': 'fruit', 'other': 'other', 'unknown': 'unk', 'honeydew-unknown': 'hd?'}


def runs(dirs):
    seen = {}
    for d in dirs:
        for f in sorted(glob.glob(os.path.join(d, 'life-*.json'))):
            name = os.path.basename(f)[len('life-lasius-niger-'):-5]
            if name not in seen:
                seen[name] = f
    return seen


def year_rows(rep):
    """(year, sugar days of that year up to its winter, the state row at the winter)."""
    days = rep['days']
    sugar = rep.get('sugar', {}).get('days', [])
    out = []
    for y in (1, 2):
        sd = [s for s in sugar if s['year'] == y and s['doy'] <= 21]
        st = [r['state'] for r in days if r['state'].get('year', 1) == y]
        if not st:
            continue
        win = next((r for r in st if r['season'] == 'winter'), None)
        if win is None and y == 1:
            win = st[-1]
        out.append((y, sd, win, st))
    return out


def fmt(v, nd=1):
    return '-' if v is None else (f'{v:.{nd}f}' if isinstance(v, float) else str(v))


def main(dirs):
    print('| colony | year | first tender (y1: ticks after open; y2: spring doy) | tend gd (share of tend+forage) | herds workable / known (doy 11) | C in by source | C in | C out | needC>0 days (summer+autumn) | winter C / R27 need (ratio) | workers at winter |')
    print('|---|---|---|---|---|---|---|---|---|---|---|')
    for name, f in runs(dirs).items():
        rep = json.load(open(f))
        s = rep.get('sugar')
        if not s:
            continue
        fi = s['firsts']
        for y, sd, win, st in year_rows(rep):
            if y == 1:
                op, te, to = fi['entranceOpen'], fi['tender'], fi['tenderOutside']
                first = f"{te - op if te >= 0 and op >= 0 else 'never'} / out {to - op if to >= 0 and op >= 0 else 'never'}"
            else:
                d = next((x for x in sd if x['tendGd'] > 0), None)
                first = f"doy {d['doy']}" if d else 'never'
            tend = sum(x['tendGd'] for x in sd)
            forage = sum(x['forageGd'] for x in sd)
            mid = next((x for x in sd if x['doy'] == 11), None)
            cin = {}
            for x in sd:
                for k, v in x['cIn'].items():
                    cin[k] = cin.get(k, 0) + v
            cout = sum(sum(x['cOut'].values()) for x in sd)
            asking = sum(1 for x in sd if x['doy'] >= 8 and x['needC'] > 0.05)
            byc = ', '.join(f"{SHORT.get(k, k)} {v:.1f}" for k, v in sorted(cin.items(), key=lambda kv: -kv[1]) if v >= 0.05)
            if win is not None:
                need = win.get('winterStoresNeedC') or 0
                wtxt = f"{fmt(win['storesC'])} / {fmt(need)} ({fmt(win['storesC'] / need, 2) if need > 0 else '-'})"
                wn = win['workers']
            else:
                wtxt, wn = 'not reached', '-'
            print(f"| {name} | {y} | {first} | {tend:.1f} ({100 * tend / max(1e-9, tend + forage):.0f} %) | "
                  f"{(str(mid['herdsWorkable']) + ' / ' + str(mid['herdsKnown'])) if mid else '-'} | {byc or '-'} | "
                  f"{sum(cin.values()):.1f} | {cout:.1f} | {asking} | {wtxt} | {wn} |")


if __name__ == '__main__':
    main(sys.argv[1:])
