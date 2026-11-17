#!/usr/bin/env python3
# Viability + growth (R19) table of a 15-run life.ts sweep, the two bars computed from it, and the run-by-run
# comparison with an earlier sweep (colony-life independent sweeps; columns as econ-growth-review/sweep9-table.md
# plus worker:lost and days with no open entrance).
#   python3 tools/sim/sweep-table.py SWEEP_DIR [PREVIOUS_SWEEP_DIR] > table.md
import json, sys, statistics

ARCHETYPES = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door']


def excl_unknown(intake, funnel, nut):
    if not funnel or not funnel.get('delivered'):
        return intake
    tot = sum(v[nut] for v in funnel['delivered'].values())
    unk = funnel['delivered'].get('unknown', {}).get(nut, 0)
    return round(intake * (tot - unk) / tot, 3) if tot > 0 else intake


def load(d):
    rows = {}
    for a in ARCHETYPES:
        for s in (1, 2, 3):
            try:
                r = json.load(open(f'{d}/life-lasius-niger-{a}-{s}.json'))
            except FileNotFoundError:
                continue
            last = r['days'][-1]['state']
            e, v, fs = r['econ'], r['viable'], r['founding']
            deaths = r['economy']['deaths']
            rows[(a, s)] = dict(
                handover=fs['phase'] + (' forced seal' if fs.get('forcedSeal') else ''),
                first=fs['workers'], winter=last['workers'],
                storesC=last['storesC'], storesP=last['storesP'],
                storesGd=round(last['storesC'] / last['adultNeedC'], 1) if last['adultNeedC'] else 0,
                # ruling R27: stores against the winter stores need (lapse C need + 4 gd adult need); '-' before R27
                storesR27=(f"{round(last['storesC'] / last['winterStoresNeedC'], 2)} of {last['winterStoresNeedC']}"
                           if last.get('winterStoresNeedC') else '-'),
                starved=e['larvaeStarved'], tripsShort=e['tripsPerWorkerGdUnderTarget'], shortGd=e['underTargetGd'],
                success=e['tripSuccessShare'], intakeC=e['intakeOverNeedC'], intakeP=e['intakeOverNeedP'],
                eclosions=sum(x['events']['eclosions'] for x in r['days']),
                deaths=deaths, lost=deaths.get('worker:lost', 0),
                # days after the hand-over day whose end-of-day sample has no `open` entrance (`sealing` counts as shut: no exit field)
                shutDays=sum(1 for x in r['days'][1:] if x['state'].get('entrancesOpen', 1) == 0),
                viable=v['viable'],
                fails=[c['name'] + ' (' + c['detail'] + ')' for c in v['checks'] if not c['ok']],
                hash=r.get('finalHash', ''),
                funnel=r.get('funnel'),
                # intake without the deliveries booked as 'unknown' (colony-life round 2, C1: before it, in-nest
                # unloadings were booked as 'unknown' deliveries, so sweeps before round 2 overstate intake)
                intakeCx=excl_unknown(e['intakeOverNeedC'], r.get('funnel'), 'c'),
                intakePx=excl_unknown(e['intakeOverNeedP'], r.get('funnel'), 'p'),
            )
    return rows


def table(rows):
    out = ['| run | hand-over | first workers | workers at winter | stores C / P (gd of adult C need) | stores / R27 winter need | larvae starved '
           '| trips / worker / gd while short (gd short) | trips successful | intake / need C | intake / need P '
           '| eclosions | deaths | worker:lost | days ending with no open entrance (after day 0) | viable | failed checks |',
           '|' + '---|' * 17]
    for (a, s), r in rows.items():
        out.append(f"| {a} #{s} | {r['handover']} | {r['first']} | {r['winter']} | {r['storesC']} / {r['storesP']} ({r['storesGd']}) | {r['storesR27']} "
                   f"| {r['starved']} | {r['tripsShort']} ({r['shortGd']}) | {round(r['success'] * 100)} % | {r['intakeC']} | {r['intakeP']} "
                   f"| {r['eclosions']} | {', '.join(f'{k} {v}' for k, v in r['deaths'].items()) or '-'} | {r['lost']} | {r['shutDays']} "
                   f"| {'viable' if r['viable'] else 'NOT viable'} | {'; '.join(r['fails']) or '-'} |")
    return '\n'.join(out)


def bars(rows):
    n = len(rows)
    vals = list(rows.values())
    med = lambda k: statistics.median([r[k] for r in vals]) if vals else 0
    out = [f'\nRuns: {n} of 15.', '', '**Viability bar** (>= 2 of 3 viable on each archetype):']
    via_ok = True
    for a in ARCHETYPES:
        k = sum(1 for (x, _), r in rows.items() if x == a and r['viable'])
        m = sum(1 for (x, _) in rows if x == a)
        via_ok &= k >= 2
        out.append(f'- {a}: {k} of {m} {"ok" if k >= 2 else "FAIL"}')
    out.append(f'- viable {sum(1 for r in vals if r["viable"])} of {n}; bar **{"met" if via_ok and n == 15 else "NOT met"}**')
    held = sum(1 for r in vals if r['winter'] >= r['first'])
    first9 = sum(1 for r in vals if r['first'] >= 9)
    nolost = sum(1 for r in vals if r['lost'] == 0)
    checks = [
        ('workers at winter >= first workers in >= 10 of 15', f'{held} of {n}', held >= 10),
        ('median eclosions after hand-over >= 4', med('eclosions'), med('eclosions') >= 4),
        ('median intake/need P >= 0.7', med('intakeP'), med('intakeP') >= 0.7),
        ('median intake/need C >= 0.9', med('intakeC'), med('intakeC') >= 0.9),
        ('median trip success >= 50 %', f"{round(med('success') * 100, 1)} %", med('success') >= 0.5),
        ('first workers >= 9 in >= 13 of 15', f'{first9} of {n}', first9 >= 13),
        ('no worker:lost in >= 13 of 15', f'{nolost} of {n}', nolost >= 13),
    ]
    out += ['', '**Growth bar R19:**', '', '| check | value | |', '|---|---|---|']
    out += [f'| {c} | {v} | {"ok" if ok else "FAIL"} |' for c, v, ok in checks]
    grow_ok = all(ok for _, _, ok in checks) and n == 15
    out.append(f'\nGrowth bar **{"met" if grow_ok else "NOT met"}** ({sum(1 for *_, ok in checks if ok)} of {len(checks)} checks).')
    out.append(f"Also: no larva starved in {sum(1 for r in vals if r['starved'] == 0)} of {n}; runs with no eclosion "
               f"{sum(1 for r in vals if r['eclosions'] == 0)} of {n}; runs with a day ending with no open entrance "
               f"{sum(1 for r in vals if r['shutDays'] > 0)} of {n}.")
    return '\n'.join(out), via_ok and n == 15, grow_ok


def compare(rows, prev):
    out = ['\n**Run by run against the previous sweep** (fresh founding in both, so first workers can differ):', '',
           '| run | viable | first workers | workers at winter | eclosions | intake/need C | intake/need P | C / P without `unknown` deliveries | trips successful | worker:lost | regression |',
           '|' + '---|' * 11]
    regs = []
    for key, r in rows.items():
        p = prev.get(key)
        if not p:
            continue
        flags = []
        if p['viable'] and not r['viable']: flags.append('viable -> NOT viable')
        if r['winter'] - r['first'] < p['winter'] - p['first']:
            flags.append(f"net workers {p['winter'] - p['first']:+d} -> {r['winter'] - r['first']:+d}")
        if r['eclosions'] < p['eclosions']: flags.append(f"eclosions {p['eclosions']} -> {r['eclosions']}")
        if r['intakeC'] < p['intakeC'] - 0.1: flags.append(f"intake C {p['intakeC']} -> {r['intakeC']}")
        if r['intakeP'] < p['intakeP'] - 0.05: flags.append(f"intake P {p['intakeP']} -> {r['intakeP']}"
                                                         + (f" (without unknown {p['intakePx']} -> {r['intakePx']})" if p['intakePx'] != p['intakeP'] else ''))
        if r['success'] < p['success'] - 0.05: flags.append(f"trip success {round(p['success'] * 100)} -> {round(r['success'] * 100)} %")
        if r['lost'] > p['lost']: flags.append(f"worker:lost {p['lost']} -> {r['lost']}")
        if r['starved'] > p['starved']: flags.append(f"larvae starved {p['starved']} -> {r['starved']}")
        a, s = key
        if flags: regs.append(f'{a} #{s}: ' + '; '.join(flags))
        f = lambda k, fmt=str: f'{fmt(p[k])} -> {fmt(r[k])}'
        pct = lambda x: f'{round(x * 100)} %'
        yn = lambda x: 'yes' if x else 'no'
        out.append(f"| {a} #{s} | {f('viable', yn)} | {f('first')} | {f('winter')} | {f('eclosions')} | {f('intakeC')} | {f('intakeP')} "
                   f"| {p['intakeCx']} / {p['intakePx']} -> {r['intakeCx']} / {r['intakePx']} | {f('success', pct)} | {f('lost')} | {'; '.join(flags) or '-'} |")
    return '\n'.join(out), regs


def funnel(rows):
    """Brood and queen funnel after the hand-over per run (life.ts report.funnel), and totals over the sweep."""
    out = ['\n**Funnel after the hand-over** (life.ts `funnel`):', '',
           '| run | eggs laid | hatched | pupated | eclosed | brood losses | alive at end (diapause) | queen: potential > 0.5 / laying permitted / winter reserve short (share of time) '
           '| worker time: nest.work / wait / nest.idle / travel | scout trips finding nothing | P fed to larvae | stuck ant-gd |',
           '|' + '---|' * 12]
    tot, eggs = {}, []
    for (a, s), r in rows.items():
        f = r['funnel']
        if not f:
            continue
        b, q, w = f['brood'], f['queen'], f['workerTimeShare']
        for k, v in b['deaths'].items(): tot[k] = tot.get(k, 0) + v
        eggs.append(b['eggsLaid'])
        sn = f['tripsByNutrient'].get('scout:none', {'trips': 0})['trips']
        out.append(f"| {a} #{s} | {b['eggsLaid']} | {b['hatched']} | {b['pupated']} | {b['eclosed']} | "
                   f"{', '.join(f'{k} {v}' for k, v in b['deaths'].items()) or '-'} | "
                   f"{', '.join(f'{k} {v}' for k, v in b['aliveAtEnd'].items()) or '-'} ({b['diapauseAtEnd']}) | "
                   f"{q['potentialOpenShare']} / {q['permittedShare']} / {q['winterReserveShortShare']} | "
                   f"{w.get('nest.work', 0)} / {w.get('wait', 0)} / {w.get('nest.idle', 0)} / {round(w.get('travel.out', 0) + w.get('travel.home', 0), 3)} | "
                   f"{sn} | {f['fedLarvae']['p']} | {f['stuckAntGd']} |")
    out.append('\nBrood losses after the hand-over, all runs: ' + ', '.join(f'{k} {v}' for k, v in sorted(tot.items(), key=lambda x: -x[1])))
    if eggs: out.append(f'Eggs laid after the hand-over: median {statistics.median(eggs)}, total {sum(eggs)} in {len(eggs)} runs.')
    return '\n'.join(out)


if __name__ == '__main__':
    rows = load(sys.argv[1])
    print(table(rows))
    text, _, _ = bars(rows)
    print(text)
    print(funnel(rows))
    if len(sys.argv) > 2:
        prev = load(sys.argv[2])
        ctext, regs = compare(rows, prev)
        print(ctext)
        print('\nRegressions (' + str(len(regs)) + ' runs):')
        for x in regs: print('- ' + x)
        _, pv, pg = bars(prev)
        print(f'\nPrevious sweep ({sys.argv[2]}): viable {sum(1 for r in prev.values() if r["viable"])} of {len(prev)}, '
              f'median eclosions {statistics.median([r["eclosions"] for r in prev.values()])}, '
              f'median intake/need C {statistics.median([r["intakeC"] for r in prev.values()])}, '
              f'P {statistics.median([r["intakeP"] for r in prev.values()])}, '
              f'median trip success {round(statistics.median([r["success"] for r in prev.values()]) * 100, 1)} %.')
