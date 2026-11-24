#!/usr/bin/env python3
"""winter-sugar: one arm against its base, item 6's bars (the 15 year-one runs and the five long runs).

    python3 tools/sim/arm-table.py --base Y1DIR LONGDIR --arm Y1DIR LONGDIR [--name ARM] > table.md

Y1DIR: to-winter runs; LONGDIR: long runs to the second winter. A colony whose year one is only in LONGDIR is judged at
its Winter 1 from the run's `winter1` record (life.ts, winter-sugar), or, for runs made before that record existed,
from the last year-one day row (queen alive, workers >= 0.8 x first, no starvation death, C >= the R27 need): marked ~.
Bars (spec item 6): year one viable >= 14 of 15 and workers at winter >= 255; long runs: workers at winter 2 >= 105,
R34 >= 1.0 x in >= 4 of 5, R27 at winter 2 >= 1.0 x in >= 4 of 5. Also shown: what an arm could buy sugar with -
protein intake / need (year one), larvae starved, year-two eggs and eclosions.
"""
import glob
import json
import os
import sys

ARCH = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door']


def load(d, name):
    f = os.path.join(d, f'life-lasius-niger-{name}.json')
    return json.load(open(f)) if os.path.exists(f) else None


def deaths(rows, cause):
    return sum(r['events'].get('deathsByCause', {}).get(cause, 0) for r in rows)


def year1(y1dir, longdir, name):
    r = load(y1dir, name)
    if r:
        last = r['days'][-1]['state']
        return dict(src='y1', viable=r['viable']['viable'], workers=last['workers'], c=last['storesC'],
                    need=last.get('winterStoresNeedC') or 0, first=r['founding']['workers'],
                    pIntake=r['econ']['intakeOverNeedP'], starved=r['econ']['larvaeStarved'],
                    ecl=sum(x['events']['eclosions'] for x in r['days']))
    r = load(longdir, name)
    if not r:
        return None
    rows = [x for x in r['days'] if x['state'].get('year', 1) == 1]
    first = r['founding']['workers']
    if r.get('winter1'):
        st, v, mark = r['winter1']['state'], r['winter1']['viable']['viable'], ''
    else:
        st = rows[-1]['state']
        v = (st['queenAlive'] and st['workers'] >= 0.8 * first and deaths(rows, 'worker:starvation') == 0
             and st['storesC'] >= (st.get('winterStoresNeedC') or 0))
        mark = '~'
    starved = sum(x['events'].get('broodDeathsByCause', {}).get('larva:starvation', 0) for x in rows)
    return dict(src='long' + mark, viable=v, workers=st['workers'], c=st['storesC'], need=st.get('winterStoresNeedC') or 0,
                first=first, pIntake=None, starved=starved, ecl=sum(x['events']['eclosions'] for x in rows))


def year2(longdir, name):
    r = load(longdir, name)
    if not r:
        return None
    rows = [x for x in r['days'] if x['state'].get('year', 1) == 2]
    y1 = [x for x in r['days'] if x['state'].get('year', 1) == 1]
    w1 = r['winter1']['state']['workers'] if r.get('winter1') else y1[-1]['state']['workers']
    w2 = next((x['state'] for x in rows if x['state']['season'] == 'winter'), None)
    w2n = w2['workers'] if w2 else (0 if rows and rows[-1]['state']['workers'] == 0 else None)
    need = (w2.get('winterStoresNeedC') or 0) if w2 else 0
    ratio = (w2['storesC'] / need) if w2 and need > 0 else (0.0 if w2n == 0 else None)
    return dict(w1=w1, w2=w2n, c2=w2['storesC'] if w2 else None, need2=need, r27=ratio,
                queen=w2['queenAlive'] if w2 else False,
                eggs=sum(x['events'].get('eggsLaid', 0) for x in rows), ecl=sum(x['events'].get('eclosions', 0) for x in rows),
                starved=sum(x['events'].get('broodDeathsByCause', {}).get('larva:starvation', 0) for x in rows))


def fmt(v, nd=2):
    return '-' if v is None else (f'{v:.{nd}f}' if isinstance(v, float) else str(v))


def side(y1dir, longdir):
    rows = {}
    for a in ARCH:
        for s in (1, 2, 3):
            n = f'{a}-{s}'
            rows[n] = (year1(y1dir, longdir, n), year2(longdir, n))
    return rows


def main(argv):
    base = argv[argv.index('--base') + 1: argv.index('--base') + 3]
    arm = argv[argv.index('--arm') + 1: argv.index('--arm') + 3]
    name = argv[argv.index('--name') + 1] if '--name' in argv else 'arm'
    B, A = side(*base), side(*arm)
    print(f'### Year one, 15 hand-overs (base / {name})\n')
    print('| colony | viable | workers at winter | C:R27 need at winter | eclosions | larvae starved | P intake / need |')
    print('|---|---|---|---|---|---|---|')
    tot = {'b': [0, 0, 0], 'a': [0, 0, 0]}
    for n in B:
        b, a = B[n][0], A[n][0]
        if not b and not a:
            continue
        def cell(x, f):
            return f(x) if x else 'missing'
        print(f"| {n} | {cell(b, lambda x: ('yes' if x['viable'] else 'NO') + ('' if x['src'] == 'y1' else ' (' + x['src'] + ')'))} / {cell(a, lambda x: ('yes' if x['viable'] else 'NO') + ('' if x['src'] == 'y1' else ' (' + x['src'] + ')'))} | "
              f"{cell(b, lambda x: x['workers'])} / {cell(a, lambda x: x['workers'])} | "
              f"{cell(b, lambda x: fmt(x['c'], 1) + ':' + fmt(x['need'], 1))} / {cell(a, lambda x: fmt(x['c'], 1) + ':' + fmt(x['need'], 1))} | "
              f"{cell(b, lambda x: x['ecl'])} / {cell(a, lambda x: x['ecl'])} | {cell(b, lambda x: x['starved'])} / {cell(a, lambda x: x['starved'])} | "
              f"{cell(b, lambda x: fmt(x['pIntake']))} / {cell(a, lambda x: fmt(x['pIntake']))} |")
        for k, x in (('b', b), ('a', a)):
            if x:
                tot[k][0] += 1 if x['viable'] else 0
                tot[k][1] += x['workers']
                tot[k][2] += 1
    print(f"\nviable: base {tot['b'][0]} of {tot['b'][2]}, {name} {tot['a'][0]} of {tot['a'][2]} (bar >= 14 of 15); "
          f"workers at winter: base {tot['b'][1]}, {name} {tot['a'][1]} (bar >= 255)\n")
    print(f'### Year two, the five long runs (base / {name})\n')
    print('| colony | winter 1 | winter 2 | R34 (w2 / w1) | C:R27 need at winter 2 | ratio | queen at w2 | y2 eggs:eclosed | y2 larvae starved |')
    print('|---|---|---|---|---|---|---|---|---|')
    agg = {'b': [0, 0, 0, 0], 'a': [0, 0, 0, 0]}
    for n in B:
        b, a = B[n][1], A[n][1]
        if not b and not a:
            continue
        def c(x, f):
            return f(x) if x else 'missing'
        print(f"| {n} | {c(b, lambda x: x['w1'])} / {c(a, lambda x: x['w1'])} | {c(b, lambda x: x['w2'])} / {c(a, lambda x: x['w2'])} | "
              f"{c(b, lambda x: fmt(x['w2'] / x['w1']) if x['w2'] is not None else '-')} / {c(a, lambda x: fmt(x['w2'] / x['w1']) if x['w2'] is not None else '-')} | "
              f"{c(b, lambda x: fmt(x['c2'], 1) + ':' + fmt(x['need2'], 1))} / {c(a, lambda x: fmt(x['c2'], 1) + ':' + fmt(x['need2'], 1))} | "
              f"{c(b, lambda x: fmt(x['r27']))} / {c(a, lambda x: fmt(x['r27']))} | {c(b, lambda x: 'alive' if x['queen'] else 'dead')} / {c(a, lambda x: 'alive' if x['queen'] else 'dead')} | "
              f"{c(b, lambda x: str(x['eggs']) + ':' + str(x['ecl']))} / {c(a, lambda x: str(x['eggs']) + ':' + str(x['ecl']))} | {c(b, lambda x: x['starved'])} / {c(a, lambda x: x['starved'])} |")
        for k, x in (('b', b), ('a', a)):
            if x and x['w2'] is not None:
                agg[k][0] += x['w2']
                agg[k][1] += 1 if x['w2'] >= x['w1'] else 0
                agg[k][2] += 1 if (x['r27'] or 0) >= 1.0 else 0
                agg[k][3] += 1
    for k, lab in (('b', 'base'), ('a', name)):
        print(f"\n{lab}: workers at winter 2 {agg[k][0]} (bar >= 105); R34 >= 1.0 x {agg[k][1]} of {agg[k][3]} (bar 4); "
              f"R27 at winter 2 >= 1.0 x {agg[k][2]} of {agg[k][3]} (bar 4)")


if __name__ == '__main__':
    main(sys.argv[1:])
