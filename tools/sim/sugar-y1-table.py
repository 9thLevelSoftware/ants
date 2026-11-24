#!/usr/bin/env python3
"""winter-sugar item 4, year one of the 15 hand-overs: the first tender from short reruns with report.sugar, the year's
numbers from the full to-winter runs of the same hand-overs (identical games; the reruns' state hashes match).

    python3 tools/sim/sugar-y1-table.py FULLDIR SHORTDIR [LONGDIR] > table.md

FULLDIR: to-winter runs (opening-fix draftfix15); SHORTDIR: reruns with report.sugar over the first game days;
LONGDIR (optional): long runs with report.sugar, used for the first tender of colonies missing from SHORTDIR.
Columns: first tender after the entrance opened (ticks; and the first workable herd), tend and forage worker-days
(funnel.taskTimeGd), C delivered by kind (funnel.delivered), herds within 300 BU and the game hour the first was found
(report.herds), C spent (C in - change in C stock, loads), winter C / R27 need, workers at winter.
"""
import json
import os
import sys

ARCH = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door']


def load(d, n):
    if not d:
        return None
    f = os.path.join(d, f'life-lasius-niger-{n}.json')
    return json.load(open(f)) if os.path.exists(f) else None


def main(full, short, long=None):
    print('| colony | first tender after open (ticks) | first workable herd after open | tend / forage gd | C delivered by kind | C in | C spent | herds in 300 BU (aphids), first found h | winter C / R27 (ratio) | workers |')
    print('|---|---|---|---|---|---|---|---|---|---|')
    for a in ARCH:
        for s in (1, 2, 3):
            n = f'{a}-{s}'
            r = load(full, n)
            q = load(short, n) or load(long, n)
            if not r:
                continue
            fi = (q or {}).get('sugar', {}).get('firsts')
            def rel(k):
                if not fi or fi['entranceOpen'] < 0 or fi[k] < 0:
                    return 'never' if fi else '-'
                return str(fi[k] - fi['entranceOpen'])
            tt = r['funnel']['taskTimeGd']
            dl = r['funnel']['delivered']
            cin = sum(v['c'] for v in dl.values())
            kinds = ', '.join(f"{k} {v['c']:.1f}" for k, v in sorted(dl.items(), key=lambda kv: -kv[1]['c']) if v['c'] >= 0.1)
            st0 = r['days'][0]['state']['storesC']
            last = r['days'][-1]['state']
            spent = cin - (last['storesC'] - st0)
            herds = r['herds']['herds']
            found = [h['foundHour'] for h in herds if h['foundHour'] >= 0]
            need = last.get('winterStoresNeedC') or 0
            print(f"| {n} | {rel('tender')} | {rel('herdWorkable')} | {tt.get('tend', 0):.1f} / {tt.get('forage', 0):.1f} | {kinds} | "
                  f"{cin:.1f} | {spent:.1f} | {len(herds)} ({', '.join(str(h['aphids']) for h in herds)}), "
                  f"{min(found) if found else 'none'} | {last['storesC']:.1f} / {need:.1f} ({last['storesC'] / need if need else 0:.2f}) | {last['workers']} |")


if __name__ == '__main__':
    main(*sys.argv[1:])
